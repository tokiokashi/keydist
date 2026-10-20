import type { DictionaryFiles } from './dictionary-files.ts';

/** 解析の結果の1語。 */
export interface ReadingToken {
  /** 原文での表記 */
  surface: string;
  /** 原文（UTF-8）でのバイト位置。`byteStart` 以上 `byteEnd` 未満 */
  byteStart: number;
  byteEnd: number;
  /** 辞書の読み（カタカナ）。辞書に読みが無い語はnull */
  reading: string | null;
  /** 辞書に無い語（未知語）か */
  isUnknown: boolean;
}

/** `lindera-wasm` の `Tokenizer.tokenize` が返す1語のうち、使う欄。 */
interface RawToken {
  surface: string;
  byteStart: number;
  byteEnd: number;
  isUnknown: boolean;
  details: string[];
}

/** IPADICの `details` で読みが入る位置（品詞・品詞細分類1〜3・活用型・活用形・原形・読み・発音の順）。 */
const READING_INDEX = 7;

/** 辞書の読みが無い印。 */
const NO_READING = '*';

export function toReadingToken(raw: RawToken): ReadingToken {
  const reading = raw.details[READING_INDEX];
  return {
    surface: raw.surface,
    byteStart: raw.byteStart,
    byteEnd: raw.byteEnd,
    reading: reading === undefined || reading === NO_READING || reading === '' ? null : reading,
    isUnknown: raw.isUnknown,
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
