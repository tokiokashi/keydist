import * as v from 'valibot';
import { decodeDroppingInvalid, defineAssetCodec, isRecord, type AssetCodec, type CodecDiagnostic } from '#input/codec/index.ts';
import { decodeCascadeOverrides, encodeCascadeOverrides, type ItemSchemaMap } from '#input/settings/index.ts';
import type { Setup } from './types.ts';
import type { SetupLibrary } from './collection.ts';

/**
 * Setupの手持ち（`SetupLibrary<V>`）のcodec（#544 §8-3・§4）。
 * `Setup`本体（id・配列id・形状id・ラベル・色index）と、カスケードの`setup`レベルを
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
 * - colorIndex: ユーザーが選ぶ値ではなく表示専用（color.tsの先頭コメント）。壊れていても
 *   実害は「違う色に見える」だけなので、Setup全体を捨てるほどの重みが無い。
 *   ここだけ**素の`v.fallback`**を使う（診断は出さない）。壊れたcolorIndexのために
 *   診断を1件残しても利用者が取れるアクションが無く、Setup自体は正しく残るため
 *   （`input/codec/index.ts`先頭コメントの「診断を要らない場合」の例）
 */
const setupSchema = v.strictObject({
  id: v.pipe(v.string(), v.minLength(1)),
  layoutId: v.pipe(v.string(), v.minLength(1)),
  shapeId: v.pipe(v.string(), v.minLength(1)),
  label: v.optional(v.pipe(v.string(), v.minLength(1))),
  colorIndex: v.fallback(v.pipe(v.number(), v.integer(), v.minValue(0)), 0),
});

function decodeSetups(raw: unknown, path: string, diagnostics: CodecDiagnostic[]): Setup[] {
  if (!Array.isArray(raw)) return [];
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

export function setupLibraryCodec<V>(
  itemSchemas: ItemSchemaMap<V>,
  currentVersion: number,
): AssetCodec<SetupLibrary<V>> {
  return defineAssetCodec<SetupLibrary<V>>({
    currentVersion,
    decodePayload: (payload, diagnostics) => {
      if (!isRecord(payload)) return undefined;
      return {
        setups: decodeSetups(payload.setups, 'setups', diagnostics),
        overrides: decodeCascadeOverrides(itemSchemas, payload.overrides, 'overrides', diagnostics),
      };
    },
    encodePayload: (value) => ({
      setups: value.setups.map((setup) => ({ ...setup })),
      overrides: encodeCascadeOverrides(value.overrides),
    }),
  });
}
