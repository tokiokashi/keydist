import { DEFAULT_ANALYSIS_TARGET, sameAnalysisTarget, type AnalysisTarget } from '#input/setup/index.ts';

/**
 * 個別画面のSingle（対象を1つ見るAnalyzer。Bigram Flow等）が共有する「今選んでいる対象」
 * （`docs/architecture.md`「個別画面どうしで共有する対象」。#663）。Analyzerごとには持たず、
 * Singleの全Analyzerで1つを読み書きする。1つの配列を選んでいろいろな解析を見るため。
 *
 * `target`が`undefined`なのは「Singleでまだ選んでいない」状態。この間にMultiで基準を選ぶと、
 * 同じコマンドで一度だけMultiの基準を書き込む（`setMultiBaselineCommand`）。値を`undefined`そのものではなくobjectに包むのは、
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
 * Singleの画面が実際に使う対象。まだ選んでいなければ既定の配列。
 *
 * Multiの基準で埋めるのは、読む時ではなく基準を選んだ時に一度だけ書く
 * （`engine/commands.ts`の`setMultiBaselineCommand`。#663のオーナー決定）。
 * 読む時に導くと、Singleで選ぶまではMultiの基準を変えるたびにSingleも変わり、
 * 「連動させない」に反するため。
 */
export function effectiveSingleTarget(single: SingleTargetSelection): AnalysisTarget {
  return single.target ?? DEFAULT_ANALYSIS_TARGET;
}

/** 対象を書き換える。値が変わらなければ同じ参照を返す（#544 §8-2）。 */
export function withSingleTarget(current: SingleTargetSelection, target: AnalysisTarget): SingleTargetSelection {
  if (current.target !== undefined && sameAnalysisTarget(current.target, target)) return current;
  return { target };
}
