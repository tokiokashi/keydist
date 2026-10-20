import { useEffect, useMemo, useState } from 'react';
import { needsReading } from '#input/text/reading.ts';
import type { ResolvedText } from '#input/text/resolve.ts';
import { convertForEvaluation, evaluationText, type ReadingEvaluation, type ReadingOutcome, type ReadingSource } from './reading-evaluation.ts';

/**
 * 解決済みのテキストを、漢字を読みに直した評価用のテキストにする（仕様 §4.6の1段目）。
 * 漢字を含む日本語のテキストだけが `source` を呼び、他のテキストは辞書にも解析にも触れない。
 *
 * テキストが変わって読み直している間は、前の結果を残す（ペインが前の数値を出し続ける状態と同じ）。
 * 結果がまだ1つも無い間（辞書の最初の読み込み中）だけ `loading` になる。
 * `resolved` がundefinedの間（Workspaceの読み込み前）は、何も返さない。
 */
export function useReadingEvaluation(resolved: ResolvedText, source: ReadingSource): ReadingEvaluation;
export function useReadingEvaluation(resolved: ResolvedText | undefined, source: ReadingSource): ReadingEvaluation | undefined;
export function useReadingEvaluation(resolved: ResolvedText | undefined, source: ReadingSource): ReadingEvaluation | undefined {
  const text = resolved?.text;
  const needs = resolved !== undefined && needsReading(resolved.text, resolved.language);
  const [outcome, setOutcome] = useState<ReadingOutcome | undefined>(undefined);

  useEffect(() => {
    if (!needs || text === undefined) {
      setOutcome(undefined);
      return undefined;
    }
    let cancelled = false;
    void convertForEvaluation(source, text).then((next) => {
      if (!cancelled) setOutcome(next);
    });
    return () => {
      cancelled = true;
    };
  }, [needs, text, source]);

  return useMemo(() => (resolved === undefined ? undefined : evaluationText(resolved, source, outcome)), [resolved, source, outcome]);
}
