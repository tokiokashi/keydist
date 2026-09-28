import { DEFAULT_ANALYSIS_TARGET, sameAnalysisTarget, type AnalysisTarget } from '#input/setup/index.ts';
import type { MultiTargetSelection } from './multi-target-selection.ts';

/**
 * 個別画面のSingle（対象を1つ見るAnalyzer。Bigram Flow等）が共有する「今選んでいる対象」
 * （`docs/architecture.md`「個別画面どうしで共有する対象」。#663）。Analyzerごとには持たず、
 * Singleの全Analyzerで1つを読み書きする。1つの配列を選んでいろいろな解析を見るため。
 *
 * `target`が`undefined`なのは「Singleでまだ選んでいない」状態。この時だけMultiの基準で
 * 埋める（`effectiveSingleTarget`）。値を`undefined`そのものではなくobjectに包むのは、
 * 資産の読み込み（`platform/asset-tab-sync.ts`の`load`）が「読めなかった」を`undefined`で
 * 返すため、値としての`undefined`と区別できなくなるのを避けるため。
 */
export interface SingleTargetSelection {
  readonly target: AnalysisTarget | undefined;
}

export function initialSingleTargetSelection(): SingleTargetSelection {
  return { target: undefined };
}

/**
 * Singleの画面が実際に使う対象。Singleで選んでいればそれ、まだ選んでいなければMultiの
 * 集合の基準（#663「Singleの対象がまだ選ばれていない時は、Multiの基準で埋める」）、
 * 基準も無ければ既定の配列。
 *
 * 基準を書き写さずに読む時に導くのは、SingleとMultiを連動させないため（書き写すと
 * 「いつ写すか」の副作用が要り、写した後にSingleで選んだのかどうかが区別できなくなる）。
 * Singleで一度選べば`target`が埋まり、以後Multiの基準は見ない。
 */
export function effectiveSingleTarget(
  single: SingleTargetSelection,
  multi: MultiTargetSelection,
): AnalysisTarget {
  return single.target ?? multi.baseline ?? DEFAULT_ANALYSIS_TARGET;
}

/** 対象を書き換える。値が変わらなければ同じ参照を返す（#544 §8-2）。 */
export function withSingleTarget(current: SingleTargetSelection, target: AnalysisTarget): SingleTargetSelection {
  if (current.target !== undefined && sameAnalysisTarget(current.target, target)) return current;
  return { target };
}
