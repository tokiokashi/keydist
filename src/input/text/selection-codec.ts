import * as v from 'valibot';
import { decodeField, defineAssetCodec, isRecord, type AssetCodec } from '#input/codec/index.ts';
import { builtinTextById } from './builtin.ts';
import { DEFAULT_TEXT_REF, type TextRef, type TextSelectionState } from './selection.ts';

/**
 * `TextSelectionState`のcodec（#544 §8-3）。`standalone-text-codec.ts`（旧資産、削除済み）と
 * 同じ「小さく、他資産との整合が無い」規模の資産。`ref`が壊れていれば**選択全体**を
 * 既定（`DEFAULT_TEXT_REF`）へ戻す（`ref`が無いと何を指しているか決められないため。
 * 旧`STANDALONE_TEXT_CODEC`の`text`と同じ判断）。
 *
 * 参照先のユーザーテキストが手持ちに無い場合のフォールバックは、decode時ではなく
 * `resolve.ts`の`resolveTextSelection`が担う（`TextLibrary`と`TextSelectionState`は
 * 別資産で、このcodecは`TextLibrary`を知らないため。#544指示書のコメント参照）。
 * 一方、組み込み（`BUILTIN_TEXTS`）はこのファイルと同じ`input/text`層にあり、
 * コード変更で組み込みidが変わる・消える可能性がある値なので、ここでも検査する
 * （レビュー指摘: 存在しない組み込みidを黙って通すと、`resolveTextSelection`側で
 * 静かにフォールバックするだけになり、壊れたデータが読めていたことに気づけない）。
 */
const textRefSchema = v.variant('kind', [
  v.strictObject({ kind: v.literal('builtin'), id: v.pipe(v.string(), v.minLength(1)) }),
  v.strictObject({ kind: v.literal('user'), id: v.pipe(v.string(), v.minLength(1)) }),
]);

export const STANDALONE_TEXT_SELECTION_CODEC: AssetCodec<TextSelectionState> = defineAssetCodec<TextSelectionState>({
  currentVersion: 1,
  decodePayload: (payload, diagnostics) => {
    if (!isRecord(payload)) return undefined;
    const ref = decodeField<TextRef>(textRefSchema, payload.ref, DEFAULT_TEXT_REF, 'ref', diagnostics);
    if (ref.kind === 'builtin' && builtinTextById(ref.id) === undefined) {
      diagnostics.push({ path: 'ref', message: `組み込みテキスト「${ref.id}」が存在しないため既定へ戻した` });
      return { ref: DEFAULT_TEXT_REF };
    }
    return { ref };
  },
  encodePayload: (value) => ({ ref: { ...value.ref } }),
});
