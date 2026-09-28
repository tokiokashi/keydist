import { analysisTargetKey, sameAnalysisTarget, type AnalysisTarget } from '#input/setup/index.ts';

/**
 * 集合対象Analyzer全般（比較表・N感度等）が汎用で持つ「対象の集合」（Analyzer id → 選んだ
 * 対象の列 + 基準）。集合対象Analyzerごとに別の資産を持たせると、同じ概念の正が複数になる
 * ため1つにまとめる。
 *
 * 対象そのものはSetup idではなく`AnalysisTarget`（#578指摘1「対象を配列かSetupにする」）で
 * 持つ。「選択はSetup idではなく対象を保存する」という決定により、集合の各枠が配列でも
 * Setupでも同じ列にそのまま並べられる。
 *
 * `baseline`（比較表だけが使う「基準」）も集合対象Analyzer全般が持てる値としてここに含める:
 * N感度はこれを使わない（`undefined`のまま）だけで、型としてはどの集合対象Analyzerも
 * 同じ形を持つ。基準を独自の値として別の資産に分けるほどの違いではないため、1つの型に
 * 統合した。
 */
export interface SetSelectionState {
  readonly targets: readonly AnalysisTarget[];
  readonly baseline: AnalysisTarget | undefined;
}

/** 未選択時に返す既定値。`analyzerSetSelectionFor`が同じ参照を使い回す（下のコメント参照）。 */
const EMPTY_SELECTION: SetSelectionState = { targets: [], baseline: undefined };

export function initialSetSelection(): SetSelectionState {
  return EMPTY_SELECTION;
}

export type AnalyzerSetSelectionState = Readonly<Record<string, SetSelectionState>>;

export function initialAnalyzerSetSelections(): AnalyzerSetSelectionState {
  return {};
}

/**
 * 1 Analyzerぶんの選択を読む。無ければ`EMPTY_SELECTION`という1つの定数を返す
 * （呼ぶたびに新しいobject/配列を作ると、これを依存配列に含む`useMemo`/`useEffect`
 * （`hosts/standalone`側）が「参照が毎回変わる」ことで無限に再計算・再実行され続ける。
 * Reactの依存比較は`Object.is`で、空集合として値は変わらないのに参照だけ変わり続けるのが
 * 原因。実際にN感度の単体ページでこれが無限レンダーループを起こした）。
 */
export function analyzerSetSelectionFor(
  state: AnalyzerSetSelectionState,
  analyzerId: string,
): SetSelectionState {
  return Object.hasOwn(state, analyzerId) ? state[analyzerId]! : EMPTY_SELECTION;
}

function sameTargets(a: readonly AnalysisTarget[], b: readonly AnalysisTarget[]): boolean {
  return a.length === b.length && a.every((target, index) => sameAnalysisTarget(target, b[index]!));
}

/** 順序を保ったまま重複を1つに畳む。 */
function dedupe(targets: readonly AnalysisTarget[]): readonly AnalysisTarget[] {
  const seen = new Set<string>();
  const result: AnalysisTarget[] = [];
  for (const target of targets) {
    const key = analysisTargetKey(target);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(target);
  }
  return result;
}

/**
 * 選択と並び順をまとめて書き換える（追加・削除・並び替えのどれもこの1本を通す。
 * `targets`の並びがそのまま表示順になる）。
 *
 * **不変条件（基準 ∈ 選択）をここで1箇所に持つ**（レビュー指摘: 基準に選んでいた対象が
 * 選択から外れたら、基準も同時に外す。以前の比較表専用実装は「資産側では外さず、
 * 表示側（`definition.tsx`）が『基準なし』として扱う」形にしていたが、資産の値そのものが
 * 不変条件を満たさない状態を許すと、資産を読む側が毎回「基準が選択に含まれているか」を
 * 確認し直す必要が生じる。書き込みの時点で不変条件を保証しておけば、読む側は`baseline`を
 * そのまま信用してよい）。
 */
export function withSetSelectionTargets(
  current: SetSelectionState,
  targets: readonly AnalysisTarget[],
): SetSelectionState {
  const deduped = dedupe(targets);
  if (sameTargets(current.targets, deduped)) return current;
  const baseline = current.baseline !== undefined && deduped.some((t) => sameAnalysisTarget(t, current.baseline!))
    ? current.baseline
    : undefined;
  return { targets: deduped, baseline };
}

/**
 * 基準を差し替える。`undefined`は「基準なし」。不変条件（基準 ∈ 選択）を守るため、
 * 選択に含まれない対象を基準にしようとした場合は無視する（no-op。
 * `withSetSelectionTargets`のコメント参照）。
 */
export function withSetSelectionBaseline(
  current: SetSelectionState,
  baseline: AnalysisTarget | undefined,
): SetSelectionState {
  if (current.baseline === baseline) return current;
  if (current.baseline !== undefined && baseline !== undefined && sameAnalysisTarget(current.baseline, baseline)) {
    return current;
  }
  if (baseline !== undefined && !current.targets.some((t) => sameAnalysisTarget(t, baseline))) return current;
  return { ...current, baseline };
}

/**
 * 1 Analyzerぶんの選択を書き換える。値が変わらなければ同じ参照を返す
 * （`applyCommand`のObject.is判定に乗せるため。#544 §8-2）。`analyzerId`を計算プロパティで
 * 書き込む理由は`standalone-analyzer-options.ts`のコメントと同じ（ここでの`analyzerId`も
 * このアプリ自身が登録したAnalyzerの`definition.id`）。
 */
export function withAnalyzerSetSelection(
  state: AnalyzerSetSelectionState,
  analyzerId: string,
  selection: SetSelectionState,
): AnalyzerSetSelectionState {
  const existing = analyzerSetSelectionFor(state, analyzerId);
  if (existing === selection) return state;
  const baselineSame = existing.baseline === selection.baseline
    || (existing.baseline !== undefined && selection.baseline !== undefined && sameAnalysisTarget(existing.baseline, selection.baseline));
  if (sameTargets(existing.targets, selection.targets) && baselineSame) {
    return state;
  }
  return { ...state, [analyzerId]: selection };
}
