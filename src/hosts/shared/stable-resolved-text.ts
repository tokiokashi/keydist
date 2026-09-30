import { useRef } from 'react';
import type { ResolvedText } from '#input/text/resolve.ts';

/**
 * 2つの解決済みテキストが、値として同じか。`resolveTextSelection`は呼ぶたびに新しい
 * オブジェクトを返すので、参照ではなく中身で比べる。
 */
export function sameResolvedText(a: ResolvedText, b: ResolvedText): boolean {
  return a.text === b.text
    && a.language === b.language
    && a.languageOverride === b.languageOverride
    && a.name === b.name
    && a.isBuiltin === b.isBuiltin
    && a.ref.kind === b.ref.kind
    && a.ref.id === b.ref.id;
}

/**
 * 値が変わっていなければ前回と同じ参照を返す。
 *
 * Workspaceの保存（並び・アクティブなタブ・連動の組の対象）はどれもWorkspaceオブジェクトを
 * 作り直し、テキストの解決結果の参照を変える。この参照はペインの入力の解決の依存に入っているので、
 * 中身が同じでも全ペインが解決し直して、Workerへ依頼を出し直す（配列を1つ選び直すだけで
 * 連動していないペインまで「計算中」になる）。中身が同じ間は参照を保って、これを止める。
 */
export function useStableResolvedText<T extends ResolvedText | undefined>(next: T): T {
  const ref = useRef(next);
  const previous = ref.current;
  if (next !== previous && !(next !== undefined && previous !== undefined && sameResolvedText(next, previous))) {
    ref.current = next;
  }
  return ref.current;
}
