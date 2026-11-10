import { createContext, useContext, useEffect, useMemo, useSyncExternalStore } from 'react';
import { builtinTextById } from '#input/text/builtin.ts';
import { corpusBodiesVersion, corpusBodyStatus, requestCorpusBody, subscribeCorpusBodies, type CorpusBodyLoader } from '#input/text/corpus-bodies.ts';
import { resolveTextSelection, type ResolvedText } from '#input/text/resolve.ts';
import type { TextLibrary } from '#input/text/library.ts';
import type { TextSelectionState } from '#input/text/selection.ts';
import type { ReadingEvaluation } from './reading-evaluation.ts';

/**
 * 組み込みテキストの本文を読み込む手段。hostsは`platform/`を直接importできないので、
 * `app`がブラウザ実装を`CorpusBodyLoaderContext`で渡す（他の注入物と同じ向き）。
 * 渡されなければ（テスト等）、選んだ時に読み込むテキストは本文が空のままになる。
 */
export const CorpusBodyLoaderContext = createContext<CorpusBodyLoader | undefined>(undefined);

export type BodyState = 'ready' | 'loading' | 'failed';

export interface ResolvedTextWithBody<Resolved extends ResolvedText | undefined = ResolvedText> {
  readonly resolved: Resolved;
  /**
   * 選んだテキストの本文が使える状態か。選んだ時に読み込む組み込みテキストは、読み込むまで `loading`。
   * 読み込めなかった時は `failed`（本文は空のまま）。
   */
  readonly body: BodyState;
  /** 読み込みに失敗した本文を、もう一度読み込む。本文が使える時・読み込み中の時は何もしない。 */
  readonly retry: () => void;
}

/**
 * `resolveTextSelection`に、選んだ時に読み込む組み込みテキストの本文の読み込みを足したもの。
 * 選択が読み込み前の組み込みテキストを指す間は、読み込みを始め、終わったら解決し直す。
 * 読み込みを始めるのは選択が変わった時だけで、読み込みに失敗した後は、`retry`を呼ぶまで試し直さない（同じテキストを選び直しても読み込み直さない）。
 */
export function useResolvedTextSelection(selection: TextSelectionState, library: TextLibrary): ResolvedTextWithBody;
export function useResolvedTextSelection(selection: TextSelectionState | undefined, library: TextLibrary): ResolvedTextWithBody<ResolvedText | undefined>;
export function useResolvedTextSelection(
  selection: TextSelectionState | undefined,
  library: TextLibrary,
): ResolvedTextWithBody<ResolvedText | undefined> {
  const loader = useContext(CorpusBodyLoaderContext);
  const version = useSyncExternalStore(subscribeCorpusBodies, corpusBodiesVersion, corpusBodiesVersion);
  // biome-ignore lint/correctness/useExhaustiveDependencies: 読み込んだ本文は外部の置き場（`corpus-bodies.ts`）にあり、読み込みが済んだら解決し直すため、`version`を依存に入れる
  const resolved = useMemo(() => (selection === undefined ? undefined : resolveTextSelection(selection, library)), [selection, library, version]);
  const lazyBody = resolved?.isBuiltin === true ? builtinTextById(resolved.ref.id)?.lazyBody : undefined;
  const sampleId = lazyBody?.sampleId;
  const fileName = lazyBody?.fileName;

  useEffect(() => {
    if (sampleId === undefined || fileName === undefined || loader === undefined) return;
    if (corpusBodyStatus(sampleId) === 'loaded') return;
    void requestCorpusBody(sampleId, fileName, loader);
  }, [sampleId, fileName, loader]);

  const retry = () => {
    if (sampleId === undefined || fileName === undefined || loader === undefined) return;
    if (corpusBodyStatus(sampleId) !== 'failed') return;
    void requestCorpusBody(sampleId, fileName, loader);
  };
  if (sampleId === undefined) return { resolved, body: 'ready', retry };
  const status = corpusBodyStatus(sampleId);
  if (status === 'loaded') return { resolved, body: 'ready', retry };
  if (status === 'failed') return { resolved, body: 'failed', retry };
  return { resolved, body: 'loading', retry };
}

/**
 * 本文が使えるようになるまで、ペインは計算を依頼しない。評価に渡すテキストが空のまま、数値を出させないため。
 * 読み込み中は `loading`（読みの変換の待ちと同じ状態）、読み込みに失敗した時は `bodyFailed` に置き換える。
 */
export function useHeldEvaluation(evaluation: ReadingEvaluation, body: BodyState): ReadingEvaluation;
export function useHeldEvaluation(evaluation: ReadingEvaluation | undefined, body: BodyState): ReadingEvaluation | undefined;
export function useHeldEvaluation(evaluation: ReadingEvaluation | undefined, body: BodyState): ReadingEvaluation | undefined {
  return useMemo(() => holdEvaluation(evaluation, body), [evaluation, body]);
}

/** `useHeldEvaluation`の中身。本文が使えない間は、ペインが計算を依頼しない状態に置き換える。 */
export function holdEvaluation(evaluation: ReadingEvaluation | undefined, body: BodyState): ReadingEvaluation | undefined {
  if (evaluation === undefined || body === 'ready') return evaluation;
  return { ...evaluation, state: body === 'loading' ? ({ kind: 'loading' } as const) : ({ kind: 'bodyFailed' } as const) };
}
