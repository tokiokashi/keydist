import * as v from 'valibot';
import { decodeField, defineAssetCodec, isRecord, type AssetCodec } from '#input/codec/index.ts';
import { initialStandaloneText, type StandaloneTextState } from './standalone-text.ts';

/**
 * `StandaloneTextState`（#544 §5「最後に使ったテキスト」）のcodec（#544 §8-3）。
 * 資産としては小さく、Setupの手持ちのような他資産との整合（孤児の上書き等）が無いので
 * `setup/codec.ts`より単純にできる。
 *
 * - `text`: 空文字列も含め文字列ならそのまま受け入れる。無効なら**資産全体**を
 *   既定値へ戻す（`text`が無いと`language`も意味を持たないため、フィールド単位で
 *   落とすと「テキストが空なのに言語だけ指定がある」という中途半端な状態が残る）
 * - `language.detected` / `language.override`: `'en' | 'ja'`のUnion。壊れていれば
 *   診断を積んで`initialStandaloneText()`の判定へ戻す
 */
const textLanguageSchema = v.union([v.literal('en'), v.literal('ja')]);

const standaloneTextSchema = v.strictObject({
  text: v.string(),
  language: v.strictObject({
    detected: textLanguageSchema,
    override: v.optional(textLanguageSchema),
  }),
});

export const STANDALONE_TEXT_CODEC: AssetCodec<StandaloneTextState> = defineAssetCodec<StandaloneTextState>({
  currentVersion: 1,
  decodePayload: (payload, diagnostics) => {
    if (!isRecord(payload)) return undefined;
    const fallback = initialStandaloneText();
    const decoded = decodeField(standaloneTextSchema, payload, fallback, 'payload', diagnostics);
    return {
      text: decoded.text,
      language: decoded.language.override === undefined
        ? { detected: decoded.language.detected }
        : { detected: decoded.language.detected, override: decoded.language.override },
    };
  },
  encodePayload: (value) => ({
    text: value.text,
    language: value.language.override === undefined
      ? { detected: value.language.detected }
      : { detected: value.language.detected, override: value.language.override },
  }),
});
