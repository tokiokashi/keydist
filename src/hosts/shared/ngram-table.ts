import { useEffect, useState } from 'react';
import { DEFAULT_BUILTIN_TEXT_ID } from '#input/text/builtin.ts';
import { NO_READING_CORRECTIONS } from '#input/text/reading.ts';
import { NO_WORD_READING_CORRECTIONS } from '#input/text/word-reading.ts';
import type { EngineComputer } from '#engine/computer.ts';
import type { SegmentationInput } from '#input/text/segmentation.ts';
import type { NgramTableFile, NgramTableSet } from '#interpretation/ngram-table-asset.ts';
import type { UserNgramTableRequest } from '#interpretation/user-ngram-table.ts';
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

/**
 * 選んだテキストから表を作る入力。テキストは、利用者の読みの直しを当てた読みのテキストで、
 * 区切りは、その読みのテキストの位置へ写した分割器の出力（`docs/corpus-ngram.md`の「入力」）。
 */
export function userTableRequestOf(text: PaneText, segmentation: SegmentationInput): UserNgramTableRequest {
  const { reading } = text;
  return {
    name: text.name,
    readingText: text.text,
    boundaries: segmentation.boundaries,
    splitter: segmentation.splitter,
    reading: reading?.status === 'converted' ? { library: reading.library, dictionary: reading.dictionary } : null,
  };
}

/** 選んだテキストから作る表の用意の状態。`idle` は求められていない。 */
export type UserNgramTableState =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | { readonly status: 'failed' }
  | { readonly status: 'ready'; readonly set: NgramTableSet };

/**
 * 選んだテキストから表を作る。数え上げは計算の窓口（Workerへ逃がす実装ではWorkerの中）で行い、メインスレッドを止めない。
 * `request`が`undefined`の間は作らない。入力が変わると、新しい表ができるまで`loading`にする。
 * 作り終えた入力へ戻った時は、窓口が結果を引ければ`loading`を挟まない。
 */
export function useUserNgramTable(computer: EngineComputer, request: UserNgramTableRequest | undefined): UserNgramTableState {
  const [stored, setStored] = useState<
    { readonly computer: EngineComputer; readonly request: UserNgramTableRequest; readonly state: UserNgramTableState } | undefined
  >(undefined);
  const known = request === undefined ? undefined : computer.peekNgramTable?.(request);

  useEffect(() => {
    if (request === undefined || known !== undefined) return undefined;
    const controller = new AbortController();
    let cancelled = false;
    Promise.resolve()
      .then(() => computer.getNgramTable(request, controller.signal))
      .then(
        (set) => {
          if (!cancelled) setStored({ computer, request, state: { status: 'ready', set } });
        },
        () => {
          if (!cancelled) setStored({ computer, request, state: { status: 'failed' } });
        },
      );
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [computer, request, known]);

  if (request === undefined) return { status: 'idle' };
  if (known !== undefined) return { status: 'ready', set: known };
  return stored !== undefined && stored.computer === computer && stored.request === request ? stored.state : { status: 'loading' };
}
