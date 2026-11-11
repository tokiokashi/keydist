import { katakanaToHiragana, type ReadingToken } from '#input/text/reading.ts';
import type { DictionaryFiles } from './dictionary-files.ts';

export type { ReadingToken };

/** `lindera-wasm` の `Tokenizer.tokenize` が返す1語のうち、使う欄。 */
interface RawToken {
  surface: string;
  byteStart: number;
  byteEnd: number;
  isUnknown: boolean;
  details: string[];
}

/** IPADICの`details`で読みが入る位置（品詞・品詞細分類1〜3・活用型・活用形・原形・読み・発音の順）。 */
const READING_INDEX = 7;

/** `details`の品詞・活用形・原形の位置。 */
const POS_INDEX = 0;
const CONJUGATION_FORM_INDEX = 5;
const BASE_FORM_INDEX = 6;

/** 辞書の読みが無い印。 */
const NO_READING = '*';

/** 語幹と活用語尾に分ける、活用する品詞。形容動詞はIPADICが語幹（名詞）と後ろの助詞に分けるので入らない。助動詞は、`ました`・`でした`のコンボが助動詞の連なりを前提にしているので入らない。 */
const CONJUGATING_POS: ReadonlySet<string> = new Set(['動詞', '形容詞']);

/** 活用語尾として受け取る文字（かなと長音）。 */
const KANA_ENDING = /^[ぁ-ゖァ-ヶー]+$/u;

/**
 * 活用する語の語幹の長さ（表記のコードポイント数）。表記と原形の共通の先頭部分を語幹とし、残りを活用語尾とする。
 * 次の時は語幹を出さない（undefined）。
 * - 未知語、活用しない品詞、活用形が無い語（`details`が活用形と原形を持たない）
 * - 語幹が空（`し`の原形`する`、`き`の原形`くる`のように、語幹と原形が先頭から食い違う語）
 * - 活用語尾が無い（基本形）か、活用語尾にかなと長音以外が混ざる
 * - 読みが無い、または読みが活用語尾の読みで終わらない（読みを語幹と語尾に割れない）
 */
function stemLengthOf(raw: RawToken, reading: string | null): number | undefined {
  const { details } = raw;
  if (raw.isUnknown || !CONJUGATING_POS.has(details[POS_INDEX] ?? '')) return undefined;
  const form = details[CONJUGATION_FORM_INDEX];
  const base = details[BASE_FORM_INDEX];
  if (form === undefined || form === NO_READING || base === undefined || base === NO_READING) return undefined;
  const surface = [...raw.surface];
  const baseChars = [...base];
  let stem = 0;
  while (stem < surface.length && stem < baseChars.length && surface[stem] === baseChars[stem]) stem++;
  const ending = surface.slice(stem).join('');
  if (stem === 0 || ending === '' || !KANA_ENDING.test(ending)) return undefined;
  if (reading === null || !katakanaToHiragana(reading).endsWith(katakanaToHiragana(ending))) return undefined;
  return stem;
}

export function toReadingToken(raw: RawToken): ReadingToken {
  const readingField = raw.details[READING_INDEX];
  const reading = readingField === undefined || readingField === NO_READING || readingField === '' ? null : readingField;
  const stemLength = stemLengthOf(raw, reading);
  return {
    surface: raw.surface,
    byteStart: raw.byteStart,
    byteEnd: raw.byteEnd,
    reading,
    isUnknown: raw.isUnknown,
    ...(stemLength === undefined ? {} : { stemLength }),
  };
}

/** `lindera-wasm` のうち使う部分。Nodeのテストで差し替えられるように狭くしてある。 */
export interface LinderaModule {
  loadDictionaryFromBytes(...files: Uint8Array[]): unknown;
  TokenizerBuilder: new () => {
    setDictionaryInstance(dictionary: never): unknown;
    setMode(mode: string): unknown;
    build(): { tokenize(text: string): RawToken[] };
  };
}

export interface ReadingAnalyzer {
  /** テキストを語に分ける。半角の空白・改行・タブは語として返らない（`byteStart` の隙間になる）。 */
  tokenize(text: string): ReadingToken[];
}

/**
 * 辞書の9ファイルから解析器を作る。
 * 読み込んだ辞書は解析器を1つ作る時に消費され、同じ辞書で2つ目は作れない。作った解析器を使い回す。
 */
export function createReadingAnalyzer(lindera: LinderaModule, files: DictionaryFiles): ReadingAnalyzer {
  const builder = new lindera.TokenizerBuilder();
  builder.setDictionaryInstance(lindera.loadDictionaryFromBytes(...files) as never);
  builder.setMode('normal');
  const tokenizer = builder.build();
  return { tokenize: (text) => tokenizer.tokenize(text).map(toReadingToken) };
}
