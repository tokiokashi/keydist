import { useEffect, useMemo, useState } from 'react';
import { needsReading } from '#input/text/reading.ts';
import type { ResolvedText } from '#input/text/resolve.ts';
import {
  analyzeForEvaluation,
  evaluationText,
  outcomeFor,
  textIdentity,
  type ReadingEvaluation,
  type ReadingSource,
  type StoredReadingOutcome,
} from './reading-evaluation.ts';

/**
 * 解決済みのテキストを、漢字を読みに直した評価用のテキストにする（仕様 §4.6の1段目）。
 * 漢字を含む日本語のテキストだけが `source` を呼び、他のテキストは辞書にも解析にも触れない。
 *
 * 同じテキストの編集で読み直している間は、前の結果を残す（ペインが前の数値を出し続ける状態と同じ）。
 * 別のテキストへ切り替えた時は、前のテキストの結果を引き継がず、そのテキストの変換が済むまで `loading` になる。
 * `resolved` がundefinedの間（Workspaceの読み込み前）は、何も返さない。
 */
export function useReadingEvaluation(resolved: ResolvedText, source: ReadingSource): ReadingEvaluation;
export function useReadingEvaluation(resolved: ResolvedText | undefined, source: ReadingSource): ReadingEvaluation | undefined;
export function useReadingEvaluation(resolved: ResolvedText | undefined, source: ReadingSource): ReadingEvaluation | undefined {
  const text = resolved?.text;
  const identity = resolved === undefined ? undefined : textIdentity(resolved);
  const needs = resolved !== undefined && needsReading(resolved.text, resolved.language);
  const [outcome, setOutcome] = useState<StoredReadingOutcome | undefined>(undefined);

  useEffect(() => {
    if (!needs || text === undefined || identity === undefined) {
      setOutcome(undefined);
      return undefined;
    }
    let cancelled = false;
    void analyzeForEvaluation(source, text).then((next) => {
      if (!cancelled) setOutcome({ identity, outcome: next });
    });
    return () => {
      cancelled = true;
    };
  }, [needs, text, identity, source]);

  return useMemo(
    () => (resolved === undefined ? undefined : evaluationText(resolved, source, outcomeFor(resolved, outcome))),
    [resolved, source, outcome],
  );
}
