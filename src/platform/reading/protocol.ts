import type { ReadingToken } from './analyzer.ts';

/** 辞書の取得元。 */
export interface DictionaryLocation {
  /** 辞書のzipのURL */
  url: string;
  /** 辞書の版。保存の名前に含める */
  version: string;
}

export type ReadingWorkerRequest = { id: number; op: 'load'; dictionary: DictionaryLocation } | { id: number; op: 'tokenize'; text: string };

export type ReadingWorkerResponse =
  | { id: number; ok: true; op: 'load'; source: 'cache' | 'network'; stored: boolean }
  | { id: number; ok: true; op: 'tokenize'; tokens: ReadingToken[] }
  | { id: number; ok: false; message: string };
