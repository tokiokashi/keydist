/**
 * 読みの辞書（IPADIC）の版と取得元。
 *
 * ビルドは `upstreamUrl` から取り、`sha256` が合わなければ止まる。ブラウザは公開物の
 * `fileName` を取り、保存のキーに `version` を含める。版を上げる時は、この欄と
 * `package.json` の `lindera-wasm` の版を一緒に変える（テストが版の一致を確かめる）。
 */
export const DICTIONARY_SPEC = {
  /** 画面に出す辞書の名前 */
  name: 'IPADIC',
  /** 辞書の版。`lindera-wasm` の版と同じ */
  version: '6.2.0',
  /** 公開物に置くzipのファイル名 */
  fileName: 'lindera-ipadic-6.2.0.zip',
  /** 公開物に置く告知文のファイル名 */
  noticeFileName: 'lindera-ipadic-NOTICE.txt',
  upstreamUrl: 'https://github.com/lindera/lindera/releases/download/v6.2.0/lindera-ipadic-6.2.0.zip',
  sha256: '5ed4bba6b429030b0387df67d40d5751d35dedef0306f4bac6d957cad5f04b72',
} as const;

/** 辞書を読んで解析する解析器。数値の条件には名前と版を記録する（画面には出さない）。 */
export const LIBRARY_SPEC = {
  name: 'lindera-wasm',
  /** `package.json` の `lindera-wasm` の版と同じ */
  version: '6.2.0',
} as const;

/** zipの中の告知文のファイル名（ディレクトリを除いた名前） */
export const DICTIONARY_NOTICE_ENTRY = 'NOTICE.txt';

/** `lindera-wasm` の `loadDictionaryFromBytes` が受け取る9ファイル（引数の順） */
export const DICTIONARY_ENTRY_NAMES = [
  'metadata.json',
  'dict.trie',
  'dict.valsidx',
  'dict.vals',
  'dict.wordsidx',
  'dict.words',
  'matrix.mtx',
  'char_def.bin',
  'unk.bin',
] as const;
