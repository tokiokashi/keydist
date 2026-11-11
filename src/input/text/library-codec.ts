import * as v from 'valibot';
import {
  decodeDroppingInvalid,
  decodeField,
  defineAssetCodec,
  isRecord,
  type AssetCodec,
  type CodecDiagnostic,
  droppedDuplicateId,
  droppedNotArray,
} from '#input/codec/index.ts';
import { isCorrectableSurface, isCorrectionReading, type ReadingCorrections } from './reading.ts';
import type { TextLibrary, UserText } from './library.ts';
import { isWordCorrection, sameWordAnchor, sortedWordCorrections, type WordReadingCorrection, type WordReadingCorrections } from './word-reading.ts';

/**
 * `TextLibrary`（ユーザーテキストの手持ち）のcodec。`setup/codec.ts`の
 * `setupSchema`と同じ形: idが無いと機能しない・要素単位で寛容に読む（`decodeDroppingInvalid`）。
 * `Setup`と違いカスケードの上書きを伴わない（テキストはSetupのような他資産との整合を
 * 持たない、`selection.ts`冒頭コメント参照）ので、`setupLibraryCodec`のような
 * ジェネリックな`ItemSchemaMap`受け取りは要らない。
 *
 * `languageOverride`だけは要素本体（id/name/text）と分けて別々にdecodeする:
 * 1つの`strictObject`で丸ごと検証すると、`languageOverride`だけが壊れている時でも
 * バリデーション全体が失敗し、本文ごとテキストを1件失ってしまう。壊れているのは
 * その1フィールドだけなので、要素本体は`requiredFieldsSchema`（`languageOverride`を
 * 型的には受け入れつつ検証しない）で読み、`languageOverride`は`decodeField`で
 * 個別に検証して診断を積む（「捨てた値には必ず診断」を保ちつつ要素は残す）。
 */
const textLanguageSchema = v.union([v.literal('en'), v.literal('ja')]);
const optionalTextLanguageSchema = v.optional(textLanguageSchema);
const optionalUnseenSchema = v.optional(v.literal(true));

// `languageOverride`を持つ入力も構造としては受け入れる必要があるので`v.looseObject`にする
// （`v.strictObject`は未知のキーがあると要素ごと弾いてしまう）。値の中身は見ず、
// 個別のフィールド検証（下の`decodeField`呼び出し）に任せる。
const requiredFieldsSchema = v.looseObject({
  id: v.pipe(v.string(), v.minLength(1)),
  name: v.pipe(v.string(), v.minLength(1)),
  text: v.string(),
});

const KNOWN_USER_TEXT_KEYS: ReadonlySet<string> = new Set([
  'id',
  'name',
  'text',
  'languageOverride',
  'unseen',
  'readingCorrections',
  'wordReadingCorrections',
]);

/**
 * 読みの直しを1項目ずつ読む。表記が漢字を含まない・読みが打てる文字（ひらがなと長音）でない項目は、
 * 項目だけを診断付きで捨てる（本文と他の直しは残す）。
 */
function decodeReadingCorrections(raw: unknown, path: string, diagnostics: CodecDiagnostic[]): ReadingCorrections | undefined {
  if (raw === undefined) return undefined;
  if (!isRecord(raw)) {
    diagnostics.push({ path, message: '読みの直しの形が違うため捨てました' });
    return undefined;
  }
  const corrections: Record<string, string> = {};
  for (const [surface, reading] of Object.entries(raw)) {
    if (!isCorrectableSurface(surface) || typeof reading !== 'string' || !isCorrectionReading(reading)) {
      diagnostics.push({ path: `${path}.${surface}`, message: '読みの直しとして読めない項目を捨てました' });
      continue;
    }
    corrections[surface] = reading;
  }
  return Object.keys(corrections).length === 0 ? undefined : corrections;
}

/**
 * 語ごとの読みの直しを1項目ずつ読む。形の違う項目・表記が漢字を含まない項目・読みが打てる文字でない項目・前後の文字が長すぎる項目は、
 * 項目だけを診断付きで捨てる。同じ語の指定の項目が重なる時は、先に読んだ項目を残す。
 */
export function decodeWordReadingCorrections(raw: unknown, path: string, diagnostics: CodecDiagnostic[]): WordReadingCorrections | undefined {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw)) {
    diagnostics.push({ path, message: '語ごとの読みの直しの形が違うため捨てました' });
    return undefined;
  }
  const kept: WordReadingCorrection[] = [];
  raw.forEach((candidate, index) => {
    if (!isWordCorrection(candidate)) {
      diagnostics.push({ path: `${path}[${index}]`, message: '語ごとの読みの直しとして読めない項目を捨てました' });
      return;
    }
    const entry: WordReadingCorrection = {
      surface: candidate.surface,
      order: candidate.order,
      before: candidate.before,
      after: candidate.after,
      reading: candidate.reading,
    };
    if (kept.some((other) => sameWordAnchor(other, entry))) {
      diagnostics.push({ path: `${path}[${index}]`, message: '同じ語を指す語ごとの読みの直しが重なるため、後の項目を捨てました' });
      return;
    }
    kept.push(entry);
  });
  return kept.length === 0 ? undefined : sortedWordCorrections(kept);
}

export function decodeBuiltinWordReadingCorrections(
  raw: unknown,
  path: string,
  diagnostics: CodecDiagnostic[],
): Record<string, WordReadingCorrections> | undefined {
  if (raw === undefined) return undefined;
  if (!isRecord(raw)) {
    diagnostics.push({ path, message: '組み込みのテキストの語ごとの読みの直しの形が違うため捨てました' });
    return undefined;
  }
  const result: Record<string, WordReadingCorrections> = {};
  for (const [id, entry] of Object.entries(raw)) {
    const corrections = decodeWordReadingCorrections(entry, `${path}.${id}`, diagnostics);
    if (corrections !== undefined) result[id] = corrections;
  }
  return Object.keys(result).length === 0 ? undefined : result;
}

export function decodeBuiltinReadingCorrections(
  raw: unknown,
  path: string,
  diagnostics: CodecDiagnostic[],
): Record<string, ReadingCorrections> | undefined {
  if (raw === undefined) return undefined;
  if (!isRecord(raw)) {
    diagnostics.push({ path, message: '組み込みのテキストの読みの直しの形が違うため捨てました' });
    return undefined;
  }
  const result: Record<string, ReadingCorrections> = {};
  for (const [id, entry] of Object.entries(raw)) {
    const corrections = decodeReadingCorrections(entry, `${path}.${id}`, diagnostics);
    if (corrections !== undefined) result[id] = corrections;
  }
  return Object.keys(result).length === 0 ? undefined : result;
}

export function decodeUserTexts(raw: unknown, path: string, diagnostics: CodecDiagnostic[]): UserText[] {
  if (!Array.isArray(raw)) {
    // 値があって配列でない時は、全件が消えることを診断で示す（無い時は空の手持ちで正しい）
    if (raw !== undefined) diagnostics.push({ path, message: droppedNotArray('テキスト') });
    return [];
  }
  const seen = new Set<string>();
  const texts: UserText[] = [];
  raw.forEach((candidate, index) => {
    const elementPath = `${path}[${index}]`;
    const decoded = decodeDroppingInvalid(requiredFieldsSchema, candidate, elementPath, diagnostics);
    if (decoded === undefined) return;
    if (seen.has(decoded.id)) {
      diagnostics.push({ path: elementPath, message: droppedDuplicateId(decoded.id) });
      return;
    }
    seen.add(decoded.id);
    // `looseObject`は未知のキーを黙って通すので、捨てる前に診断を積む（「捨てた値には必ず診断」）
    for (const extraKey of Object.keys(decoded)) {
      if (!KNOWN_USER_TEXT_KEYS.has(extraKey)) {
        diagnostics.push({ path: `${elementPath}.${extraKey}`, message: `未知の項目「${extraKey}」を捨てました` });
      }
    }

    const rawLanguageOverride = isRecord(candidate) ? candidate.languageOverride : undefined;
    const languageOverride = decodeField(optionalTextLanguageSchema, rawLanguageOverride, undefined, `${elementPath}.languageOverride`, diagnostics);

    // 印は壊れていても要素は残す（印が消えるだけで本文は失わない）
    const unseen = decodeField(optionalUnseenSchema, isRecord(candidate) ? candidate.unseen : undefined, undefined, `${elementPath}.unseen`, diagnostics);

    const readingCorrections = decodeReadingCorrections(
      isRecord(candidate) ? candidate.readingCorrections : undefined,
      `${elementPath}.readingCorrections`,
      diagnostics,
    );

    const wordReadingCorrections = decodeWordReadingCorrections(
      isRecord(candidate) ? candidate.wordReadingCorrections : undefined,
      `${elementPath}.wordReadingCorrections`,
      diagnostics,
    );

    texts.push({
      id: decoded.id,
      name: decoded.name,
      text: decoded.text,
      ...(languageOverride === undefined ? {} : { languageOverride }),
      ...(unseen === undefined ? {} : { unseen }),
      ...(readingCorrections === undefined ? {} : { readingCorrections }),
      ...(wordReadingCorrections === undefined ? {} : { wordReadingCorrections }),
    });
  });
  return texts;
}

export const TEXT_LIBRARY_CODEC: AssetCodec<TextLibrary> = defineAssetCodec<TextLibrary>({
  currentVersion: 1,
  decodePayload: (payload, diagnostics) => {
    if (!isRecord(payload)) return undefined;
    const builtinReadingCorrections = decodeBuiltinReadingCorrections(payload.builtinReadingCorrections, 'builtinReadingCorrections', diagnostics);
    const builtinWordReadingCorrections = decodeBuiltinWordReadingCorrections(
      payload.builtinWordReadingCorrections,
      'builtinWordReadingCorrections',
      diagnostics,
    );
    return {
      texts: decodeUserTexts(payload.texts, 'texts', diagnostics),
      ...(builtinReadingCorrections === undefined ? {} : { builtinReadingCorrections }),
      ...(builtinWordReadingCorrections === undefined ? {} : { builtinWordReadingCorrections }),
    };
  },
  encodePayload: (value) => ({
    texts: value.texts.map((text) => ({ ...text })),
    ...(value.builtinReadingCorrections === undefined ? {} : { builtinReadingCorrections: value.builtinReadingCorrections }),
    ...(value.builtinWordReadingCorrections === undefined ? {} : { builtinWordReadingCorrections: value.builtinWordReadingCorrections }),
  }),
});
