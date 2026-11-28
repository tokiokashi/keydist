import { useEffect, useState } from 'react';
import { DEFAULT_BUILTIN_TEXT_ID } from '#input/text/builtin.ts';
import { NO_READING_CORRECTIONS } from '#input/text/reading.ts';
import { NO_WORD_READING_CORRECTIONS } from '#input/text/word-reading.ts';
import type { NgramTableFile } from '#interpretation/ngram-table-asset.ts';
import type { PaneText } from './reading-evaluation.ts';

/**
 * 同梱する文節の読みの表の入口。`app` が組み立てて注入する（`BunsetsuSource` と同じ形）。
 * 表のファイルは、表を使う解析のペインが最初に求めるまで取得しない。
 */
export interface NgramTableSource {
  /** 表のファイルを取得して読む。取得できなければ例外を投げる。 */
  load(): Promise<NgramTableFile>;
}

/** 表の用意の状態。`idle` は求められていない。 */
export type NgramTableState =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | { readonly status: 'failed' }
  | { readonly status: 'ready'; readonly file: NgramTableFile };

/** 表のファイルを求める。`enabled` の間だけ取得する。取得できなかった時は、`enabled` を入れ直すまで試し直さない。 */
export function useNgramTable(source: NgramTableSource | undefined, enabled: boolean): NgramTableState {
  const [stored, setStored] = useState<{ readonly source: NgramTableSource; readonly state: NgramTableState } | undefined>(undefined);
  const active = enabled && source !== undefined;

  useEffect(() => {
    if (!active) return undefined;
    let cancelled = false;
    source.load().then(
      (file) => {
        if (!cancelled) setStored({ source, state: { status: 'ready', file } });
      },
      () => {
        if (!cancelled) setStored({ source, state: { status: 'failed' } });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [active, source]);

  if (!active) return { status: 'idle' };
  return stored !== undefined && stored.source === source ? stored.state : { status: 'loading' };
}

/**
 * 表を入力にする解析が、対象（配列・Setup）を解決する時に使うテキスト。
 * 表の項目を打つ解析は評価に渡すテキストを読まないので、対象の解決（打ち方の選択・条件の要約）に要る最小の日本語のテキストを使う。
 * 利用者が選んだテキストの長さや言語で、解決が失敗したり、使わないTraceの計算が重くなったりしない。
 */
export const NGRAM_TABLE_PANE_TEXT: PaneText = {
  ref: { kind: 'builtin', id: DEFAULT_BUILTIN_TEXT_ID },
  name: '表による解析',
  text: 'あ',
  language: 'ja',
  languageOverride: undefined,
  isBuiltin: true,
  readingCorrections: NO_READING_CORRECTIONS,
  wordReadingCorrections: NO_WORD_READING_CORRECTIONS,
};
