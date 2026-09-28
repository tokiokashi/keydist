import * as v from 'valibot';
import { decodeDroppingInvalid, defineAssetCodec, isRecord, type AssetCodec, type CodecDiagnostic } from '#input/codec/index.ts';
import type { TextLibrary, UserText } from './library.ts';

/**
 * `TextLibrary`（ユーザーテキストの手持ち）のcodec（#544 §8-3）。`setup/codec.ts`の
 * `setupSchema`と同じ形: idが無いと機能しない・要素単位で寛容に読む（`decodeDroppingInvalid`）。
 * `Setup`と違いカスケードの上書きを伴わない（テキストはSetupのような他資産との整合を
 * 持たない、`selection.ts`冒頭コメント参照）ので、`setupLibraryCodec`のような
 * ジェネリックな`ItemSchemaMap`受け取りは要らない。
 */
const textLanguageSchema = v.union([v.literal('en'), v.literal('ja')]);

const userTextSchema = v.strictObject({
  id: v.pipe(v.string(), v.minLength(1)),
  name: v.pipe(v.string(), v.minLength(1)),
  text: v.string(),
  languageOverride: v.optional(textLanguageSchema),
});

function decodeUserTexts(raw: unknown, path: string, diagnostics: CodecDiagnostic[]): UserText[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const texts: UserText[] = [];
  raw.forEach((candidate, index) => {
    const decoded = decodeDroppingInvalid(userTextSchema, candidate, `${path}[${index}]`, diagnostics);
    if (decoded === undefined) return;
    if (seen.has(decoded.id)) {
      diagnostics.push({ path: `${path}[${index}]`, message: `id「${decoded.id}」が重複しているため捨てた` });
      return;
    }
    seen.add(decoded.id);
    texts.push(decoded);
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
