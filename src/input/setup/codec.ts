import * as v from 'valibot';
import { decodeDroppingInvalid, defineAssetCodec, isRecord, type AssetCodec, type CodecDiagnostic } from '#input/codec/index.ts';
import { decodeCascadeOverrides, encodeCascadeOverrides, type CascadeOverrides, type ItemSchemaMap } from '#input/settings/index.ts';
import { dropSetupOverrides } from './overrides.ts';
import type { Setup } from './types.ts';
import type { SetupLibrary } from './collection.ts';

/**
 * Setupの手持ち（`SetupLibrary<V>`）のcodec（#544 §8-3・§4）。
 * `Setup`本体（id・配列id・物理配列id・ラベル）と、カスケードの`setup`レベルを
 * 含む全レベルの上書きをまとめて1つの資産として運ぶ（overrides.ts「Setup固有の上書きは
 * カスケードのsetupレベルに置く」）。
 *
 * 項目のschemaは`ItemSchemaMap<V>`として呼び出し側（engine層。#544 §8-3の判断で
 * カスケード項目のschemaはengineが持つ）から渡してもらう。ここは`Setup`自体の形だけを知る。
 */

/**
 * `Setup`の各fieldの寛容さ:
 * - id / layoutId / shapeId: この3つが無いとSetupとして機能しない（`resolveSetup`が
 *   参照できない・Setupを一覧に出せない）。1つでも欠けたり型が違えば**Setup全体を
 *   捨てる**（`decodeDroppingInvalid`を要素単位で使う。既存の`sanitizeUserLayouts`と
 *   同じ「壊れた要素だけ捨てて残りを読む」方針）
 * - label: 無くても自動命名（naming.ts）に落ちるだけなので、無効なら**フィールドだけ
 *   落として省略**（Setup自体は残す）
 */
const setupSchema = v.strictObject({
  id: v.pipe(v.string(), v.minLength(1)),
  layoutId: v.pipe(v.string(), v.minLength(1)),
  shapeId: v.pipe(v.string(), v.minLength(1)),
  label: v.optional(v.pipe(v.string(), v.minLength(1))),
});

function decodeSetups(raw: unknown, path: string, diagnostics: CodecDiagnostic[]): Setup[] {
  if (!Array.isArray(raw)) {
    // 値があって配列でない時は、全件が消えることを診断で示す（無い時は空の手持ちで正しい）
    if (raw !== undefined) diagnostics.push({ path, message: '配列形式でないためSetupを捨てた' });
    return [];
  }
  const seen = new Set<string>();
  const setups: Setup[] = [];
  raw.forEach((candidate, index) => {
    const decoded = decodeDroppingInvalid(setupSchema, candidate, `${path}[${index}]`, diagnostics);
    if (decoded === undefined) return;
    if (seen.has(decoded.id)) {
      diagnostics.push({ path: `${path}[${index}]`, message: `id「${decoded.id}」が重複しているため捨てた` });
      return;
    }
    seen.add(decoded.id);
    setups.push(decoded);
  });
  return setups;
}

/**
 * decodeSetups側で捨てた（壊れていた・idが重複していた）、あるいは元々setups配列に
 * 存在しないSetup idの`overrides.setup[id]`は孤児になる（`resolveSetup`から二度と
 * 参照されない上書き）。`deleteSetup`（collection.ts）が生きているSetupを消す時に
 * `dropSetupOverrides`で一緒に消しているのと同じ理由で、decode時にも同じ整合を取る
 * （#544 §4の判断: Setup固有の上書きはカスケードのsetupレベルに置くので、Setup本体と
 * 上書きの対応が取れていないと`resolveSetup`後の解決やUIの一覧表示が食い違う）。
 * 捨てる時は必ず診断を積む（「捨てた値には必ず診断」）。
 */
function dropOrphanSetupOverrides<V>(
  overrides: CascadeOverrides<V>,
  survivingSetupIds: ReadonlySet<string>,
  diagnostics: CodecDiagnostic[],
): CascadeOverrides<V> {
  let result = overrides;
  for (const setupId of Object.keys(overrides.setup ?? {})) {
    if (survivingSetupIds.has(setupId)) continue;
    diagnostics.push({
      path: `overrides.setup.${setupId}`,
      message: `Setup「${setupId}」の手持ちが無いため、対応する上書きを孤児として捨てた`,
    });
    result = dropSetupOverrides(result, setupId);
  }
  return result;
}

export function setupLibraryCodec<V>(
  itemSchemas: ItemSchemaMap<V>,
  currentVersion: number,
): AssetCodec<SetupLibrary<V>> {
  return defineAssetCodec<SetupLibrary<V>>({
    currentVersion,
    decodePayload: (payload, diagnostics) => {
      if (!isRecord(payload)) return undefined;
      const setups = decodeSetups(payload.setups, 'setups', diagnostics);
      const overrides = decodeCascadeOverrides(itemSchemas, payload.overrides, 'overrides', diagnostics);
      const survivingSetupIds = new Set(setups.map((setup) => setup.id));
      return {
        setups,
        overrides: dropOrphanSetupOverrides(overrides, survivingSetupIds, diagnostics),
      };
    },
    encodePayload: (value) => ({
      setups: value.setups.map((setup) => ({ ...setup })),
      overrides: encodeCascadeOverrides(value.overrides),
    }),
  });
}
