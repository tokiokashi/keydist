import * as v from 'valibot';
import { decodeDroppingInvalid, decodeField, defineAssetCodec, isRecord, type AssetCodec, type CodecDiagnostic } from '#input/codec/index.ts';
import type { TextLibrary, UserText } from './library.ts';

/**
 * `TextLibrary`（ユーザーテキストの手持ち）のcodec（#544 §8-3）。`setup/codec.ts`の
 * `setupSchema`と同じ形: idが無いと機能しない・要素単位で寛容に読む（`decodeDroppingInvalid`）。
 * `Setup`と違いカスケードの上書きを伴わない（テキストはSetupのような他資産との整合を
 * 持たない、`selection.ts`冒頭コメント参照）ので、`setupLibraryCodec`のような
 * ジェネリックな`ItemSchemaMap`受け取りは要らない。
 *
 * `languageOverride`だけは要素本体（id/name/text）と分けて別々にdecodeする（レビュー指摘）:
 * 1つの`strictObject`で丸ごと検証すると、`languageOverride`だけが壊れている時でも
 * バリデーション全体が失敗し、本文ごとテキストを1件失ってしまう。壊れているのは
 * その1フィールドだけなので、要素本体は`requiredFieldsSchema`（`languageOverride`を
 * 型的には受け入れつつ検証しない）で読み、`languageOverride`は`decodeField`で
 * 個別に検証して診断を積む（「捨てた値には必ず診断」を保ちつつ要素は残す）。
 */
const textLanguageSchema = v.union([v.literal('en'), v.literal('ja')]);
const optionalTextLanguageSchema = v.optional(textLanguageSchema);

// `languageOverride`を持つ入力も構造としては受け入れる必要があるので`v.looseObject`にする
// （`v.strictObject`は未知のキーがあると要素ごと弾いてしまう）。値の中身は見ず、
// 個別のフィールド検証（下の`decodeField`呼び出し）に任せる。
const requiredFieldsSchema = v.looseObject({
  id: v.pipe(v.string(), v.minLength(1)),
  name: v.pipe(v.string(), v.minLength(1)),
  text: v.string(),
});

function decodeUserTexts(raw: unknown, path: string, diagnostics: CodecDiagnostic[]): UserText[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const texts: UserText[] = [];
  raw.forEach((candidate, index) => {
    const elementPath = `${path}[${index}]`;
    const decoded = decodeDroppingInvalid(requiredFieldsSchema, candidate, elementPath, diagnostics);
    if (decoded === undefined) return;
    if (seen.has(decoded.id)) {
      diagnostics.push({ path: elementPath, message: `id「${decoded.id}」が重複しているため捨てた` });
      return;
    }
    seen.add(decoded.id);

    const rawLanguageOverride = isRecord(candidate) ? candidate.languageOverride : undefined;
    const languageOverride = decodeField(
      optionalTextLanguageSchema,
      rawLanguageOverride,
      undefined,
      `${elementPath}.languageOverride`,
      diagnostics,
    );

    texts.push(languageOverride === undefined
      ? { id: decoded.id, name: decoded.name, text: decoded.text }
      : { id: decoded.id, name: decoded.name, text: decoded.text, languageOverride });
  });
  return texts;
}

export const TEXT_LIBRARY_CODEC: AssetCodec<TextLibrary> = defineAssetCodec<TextLibrary>({
  currentVersion: 1,
  decodePayload: (payload, diagnostics) => {
    if (!isRecord(payload)) return undefined;
    return { texts: decodeUserTexts(payload.texts, 'texts', diagnostics) };
  },
  encodePayload: (value) => ({
    texts: value.texts.map((text) => ({ ...text })),
  }),
});
