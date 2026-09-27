/**
 * 集合対象Analyzerの単体ページが持つ、汎用の「対象の集合」（Analyzer id → 選んだSetup id列）。
 *
 * `comparison-selection.ts`（比較表単体ページの`comparisonSelection`資産）を作った時点の
 * コメント（`engine/commands.ts`の`KeydistAssets.comparisonSelection`）が
 * 「複数の単体ページが集合を持つようになったら、Analyzer idごとの集合を持つ形へ広げる」と
 * 書いていた条件が、2つ目の集合対象Analyzer（N感度、#544 Phase 3）でちょうど成立した。
 * ここではその条件どおり、Analyzer idで引く`Record`にする（`standalone-analyzer-options.ts`の
 * 「Analyzer id → 値」という形をそのまま踏襲）。
 *
 * **`comparisonSelection`は移行しない**（#544 Phase 3「決めきれなかった点」としてPR本文へ
 * 残す）。比較表は`baselineSetupId`という集合対象Analyzer全般には無い専用フィールドを
 * 持つ形で先に固まっており、ここへ合流させるには「基準の持ち方を集合対象Analyzer共通の
 * 概念にするか、比較表だけの特別枠として残すか」を決め直す必要がある。今回はN感度という
 * 新しい集合対象Analyzerを1つ足すだけなので、既存の比較表の資産・codec・テストには触れず、
 * 「今後増える集合対象Analyzerはこちらを使う」という形にとどめる。
 */
export type AnalyzerSetSelectionState = Readonly<Record<string, readonly string[]>>;

export function initialAnalyzerSetSelections(): AnalyzerSetSelectionState {
  return {};
}

/**
 * 未選択時に返す空配列。呼ぶたびに新しい配列を作ると、これを依存配列に含む
 * `useMemo`/`useEffect`（`hosts/standalone`側）が「参照が毎回変わる」ことで無限に
 * 再計算・再実行され続ける（Reactの依存比較は`Object.is`。空配列は空集合として値は
 * 変わらないのに参照だけ変わり続けるのが原因）。1つの定数を使い回すことで、未選択の
 * 間はどの呼び出しからも同じ参照が返るようにする。
 */
const EMPTY_SETUP_IDS: readonly string[] = [];

/** 1 Analyzerぶんの選択（Setup idの列。表示順そのもの）を読む。無ければ空集合。 */
export function analyzerSetSelectionFor(
  state: AnalyzerSetSelectionState,
  analyzerId: string,
): readonly string[] {
  return Object.hasOwn(state, analyzerId) ? state[analyzerId]! : EMPTY_SETUP_IDS;
}

function sameIds(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id, index) => id === b[index]);
}

/**
 * 1 Analyzerぶんの選択を書き換える。値が変わらなければ同じ参照を返す
 * （`applyCommand`のObject.is判定に乗せるため。#544 §8-2。`withStandaloneAnalyzerOptions`と
 * 同じ形）。`analyzerId`を計算プロパティで書き込む理由も同じ（`standalone-analyzer-options.ts`
 * のコメント参照。ここでの`analyzerId`もこのアプリ自身が登録したAnalyzerの`definition.id`）。
 */
export function withAnalyzerSetSelection(
  state: AnalyzerSetSelectionState,
  analyzerId: string,
  setupIds: readonly string[],
): AnalyzerSetSelectionState {
  const existing = analyzerSetSelectionFor(state, analyzerId);
  if (sameIds(existing, setupIds)) return state;
  return { ...state, [analyzerId]: [...setupIds] };
}
