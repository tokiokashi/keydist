import { defineAssetCodec, isRecord, type AssetCodec, type CodecDiagnostic } from '#input/codec/index.ts';
import { decodeLevelOverrides, type ItemSchemaMap, type LevelOverrides } from '#input/settings/index.ts';
import type { Preset, PresetLibrary } from './types.ts';

/**
 * プリセットの手持ち（`PresetLibrary<V>`）のcodec。項目のschemaは呼び出し側（engine層）から渡す
 * （`setupLibraryCodec`と同じ形）。
 *
 * 要素単位の扱い（壊れた要素だけ捨てて残りを読み、捨てたものには必ず診断を積む）:
 * - id・nameが無い、または空（nameはtrimして空）、`values`がオブジェクトでない → プリセットごと捨てる
 * - idが重複 → 後のものを捨てる
 * - `values`の項目 → `decodeLevelOverrides`が、不正な値・未知の項目・予約名を捨てる。
 *   すべて捨てて空になっても**プリセットは残す**（空は「すべて既定値」という有効な値）
 *
 * レベルの許可（`allowedLevels`）は検査しない。流し込む時に先のレベルで絞る
 * （`decodeCascadeOverrides`と同じ方針。判断を1箇所に置く）。
 */
function decodePresets<V>(
  itemSchemas: ItemSchemaMap<V>,
  raw: unknown,
  path: string,
  diagnostics: CodecDiagnostic[],
): Preset<V>[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const presets: Preset<V>[] = [];
  raw.forEach((candidate, index) => {
    const at = `${path}[${index}]`;
    if (!isRecord(candidate)) {
      diagnostics.push({ path: at, message: 'プリセットの形が正しくないため捨てた' });
      return;
    }
    const { id, name, values } = candidate;
    if (typeof id !== 'string' || id === '') {
      diagnostics.push({ path: `${at}.id`, message: 'idが無い、または空のプリセットを捨てた' });
      return;
    }
    if (typeof name !== 'string' || name.trim() === '') {
      diagnostics.push({ path: `${at}.name`, message: '名前が無い、または空のプリセットを捨てた' });
      return;
    }
    if (!isRecord(values)) {
      diagnostics.push({ path: `${at}.values`, message: '値の形が正しくないプリセットを捨てた' });
      return;
    }
    if (seen.has(id)) {
      diagnostics.push({ path: at, message: `id「${id}」が重複しているため捨てた` });
      return;
    }
    seen.add(id);
    const decoded: LevelOverrides<V> = decodeLevelOverrides(itemSchemas, values, `${at}.values`, diagnostics) ?? {};
    presets.push({ id, name: name.trim(), values: decoded });
  });
  return presets;
}

export function presetLibraryCodec<V>(
  itemSchemas: ItemSchemaMap<V>,
  currentVersion: number,
): AssetCodec<PresetLibrary<V>> {
  return defineAssetCodec<PresetLibrary<V>>({
    currentVersion,
    decodePayload: (payload, diagnostics) => {
      if (!isRecord(payload)) return undefined;
      return { presets: decodePresets(itemSchemas, payload.presets, 'presets', diagnostics) };
    },
    encodePayload: (value) => ({
      presets: value.presets.map((preset) => ({
        id: preset.id,
        name: preset.name,
        values: JSON.parse(JSON.stringify(preset.values)) as Record<string, unknown>,
      })),
    }),
  });
}
