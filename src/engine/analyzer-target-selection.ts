import { sameAnalysisTarget, type AnalysisTarget } from '#input/setup/index.ts';

/**
 * 単一対象Analyzer全般（Bigram Flow等）が汎用で持つ「今選んでいる対象」
 * （Analyzer id → `AnalysisTarget`。#578指摘1）。`analyzer-set-selection.ts`の単一対象版。
 *
 * 旧実装は`use-ensure-setup.ts`が「手持ちのSetupが空なら初期値を1件作る」という
 * ローカルstate + 副作用でこれを代替していたが、#578指摘1の決定（初期Setupの自動生成を
 * やめ、対象を配列かSetupのどちらかにする）によりその仕掛けごと不要になった。
 * 配列は常に選べる（`SetupCatalog`に最初から入っている）ため、既定対象
 * （`DEFAULT_ANALYSIS_TARGET`）を返すだけで「手持ちが空でも選べる」が成り立つ。
 */
export type AnalyzerTargetSelectionState = Readonly<Record<string, AnalysisTarget>>;

export function initialAnalyzerTargetSelections(): AnalyzerTargetSelectionState {
  return {};
}

/** 1 Analyzerぶんの選択を読む。無ければ`fallback`（呼び出し側が既定対象を渡す）。 */
export function analyzerTargetSelectionFor(
  state: AnalyzerTargetSelectionState,
  analyzerId: string,
  fallback: AnalysisTarget,
): AnalysisTarget {
  return Object.hasOwn(state, analyzerId) ? state[analyzerId]! : fallback;
}

/** 1 Analyzerぶんの選択を書き換える。値が変わらなければ同じ参照を返す（#544 §8-2）。 */
export function withAnalyzerTargetSelection(
  state: AnalyzerTargetSelectionState,
  analyzerId: string,
  target: AnalysisTarget,
): AnalyzerTargetSelectionState {
  const existing = state[analyzerId];
  if (existing !== undefined && sameAnalysisTarget(existing, target)) return state;
  return { ...state, [analyzerId]: target };
}
