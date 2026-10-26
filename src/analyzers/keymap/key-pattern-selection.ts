import { matchKeyPatterns, summarizeCandidateMatches } from '#input/layouts/key-pattern-picker.ts';
import type { Layout } from '#input/layouts/types.ts';

/**
 * キーを選んで出る文字を調べる図の選択（キーを1つずつ選んでいき、続けて押せるキーと出る文字をたどる）の純粋な計算。
 *
 * 選んだ順は押す順として照合に渡す。照合そのものは `input/layouts/key-pattern-picker.ts` が持ち、
 * ここでは画面に出す形（キーごとの見た目・結果の文）へ並べるだけにする。
 */

/** 選んだキーの並び。同じキーをもう一度選ぶと外れる。外れたキー以外の順は変えない。 */
export function toggleSelectedKey(selected: readonly string[], keyId: string): readonly string[] {
  return selected.includes(keyId) ? selected.filter((id) => id !== keyId) : [...selected, keyId];
}

/** 選択の結果1つぶん。 */
export interface KeyPatternSelectionView {
  /** 選んだキーで確定した出力。無ければ空 */
  readonly exactOutputs: readonly string[];
  /** あと1キーで出力が決まるキー → そのキーを押すと出る文字 */
  readonly candidateLegends: ReadonlyMap<string, string>;
  /** 出力はまだ決まらないが、続けて押せるキー（候補のキーも含む） */
  readonly continuationKeys: ReadonlySet<string>;
  /** 結果の文 */
  readonly message: string;
}

export const KEY_PATTERN_PROMPT = '選んだキーはありません。';

export function keyPatternSelectionView(layout: Layout, selected: readonly string[]): KeyPatternSelectionView {
  if (selected.length === 0) {
    return { exactOutputs: [], candidateLegends: new Map(), continuationKeys: new Set(), message: KEY_PATTERN_PROMPT };
  }
  const result = matchKeyPatterns(layout, new Set(selected));
  const exactOutputs = [...new Set(result.exact.map((match) => match.output))];
  const candidateLegends = new Map([...result.candidates].map(([key, matches]) => [key, summarizeCandidateMatches(matches)] as const));
  const continuationKeys = new Set(result.continuations.keys());
  const hasNext = continuationKeys.size > 0;
  const message =
    exactOutputs.length > 0
      ? `確定: ${exactOutputs.join(' / ')}${hasNext ? '。続けて押せるキーがあります。' : ''}`
      : hasNext
        ? candidateLegends.size > 0
          ? 'あと1キーで出る文字が決まります。'
          : '続けて押せるキーがあります。'
        : 'このキーの組み合わせで出る文字はありません。';
  return { exactOutputs, candidateLegends, continuationKeys, message };
}

/** 読み上げとhoverに足す説明。あと1キーで出る文字が決まるキーは、続けて押せるキーにも含まれるので、こちらだけを返す。 */
export const KEY_PATTERN_CONTINUATION_DESCRIPTION = '続けて押せるキー';
export const KEY_PATTERN_OUTPUT_DESCRIPTION = '押すと出る文字が決まるキー';

export function keyPatternKeyDescription(view: KeyPatternSelectionView, keyId: string): string | undefined {
  if (view.candidateLegends.has(keyId)) return KEY_PATTERN_OUTPUT_DESCRIPTION;
  if (view.continuationKeys.has(keyId)) return KEY_PATTERN_CONTINUATION_DESCRIPTION;
  return undefined;
}
