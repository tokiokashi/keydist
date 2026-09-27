/**
 * 集合対象Analyzerの単体ページが持つ、汎用の「対象の集合」（Analyzer id → 選んだSetup id列 +
 * 基準）。集合対象Analyzerごとに別の資産を持たせると、同じ概念の正が複数になるため1つにまとめる。
 *
 * `baselineSetupId`（比較表だけが使う「基準」）も集合対象Analyzer全般が持てる値として
 * ここに含める: N感度はこれを使わない（`undefined`のまま）だけで、型としては
 * どの集合対象Analyzerも同じ形を持つ。基準を独自の値として別の資産に分けるほどの
 * 違いではないため、1つの型に統合した。
 */
export interface SetSelectionState {
  readonly setupIds: readonly string[];
  readonly baselineSetupId: string | undefined;
}

/** 未選択時に返す既定値。`analyzerSetSelectionFor`が同じ参照を使い回す（下のコメント参照）。 */
const EMPTY_SELECTION: SetSelectionState = { setupIds: [], baselineSetupId: undefined };

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

function sameIds(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id, index) => id === b[index]);
}

/** 順序を保ったまま重複を1つに畳む（`Set`は挿入順を保つので、そのままfilterに使える）。 */
function dedupe(ids: readonly string[]): readonly string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    result.push(id);
  }
  return result;
}

/**
 * 選択と並び順をまとめて書き換える（追加・削除・並び替えのどれもこの1本を通す。
 * `setupIds`の並びがそのまま表示順になる）。
 *
 * **不変条件（基準 ∈ 選択）をここで1箇所に持つ**（レビュー指摘: 基準に選んでいた
 * Setupが選択から外れたら、基準も同時に外す。以前の比較表専用実装は「資産側では
 * 外さず、表示側（`definition.tsx`）が『基準なし』として扱う」形にしていたが、
 * 資産の値そのものが不変条件を満たさない状態を許すと、資産を読む側が毎回
 * 「基準が選択に含まれているか」を確認し直す必要が生じる。書き込みの時点で
 * 不変条件を保証しておけば、読む側は`baselineSetupId`をそのまま信用してよい）。
 */
export function withSetSelectionSetupIds(
  current: SetSelectionState,
  setupIds: readonly string[],
): SetSelectionState {
  const deduped = dedupe(setupIds);
  if (sameIds(current.setupIds, deduped)) return current;
  const baselineSetupId = current.baselineSetupId !== undefined && deduped.includes(current.baselineSetupId)
    ? current.baselineSetupId
    : undefined;
  return { setupIds: deduped, baselineSetupId };
}

/**
 * 基準を差し替える。`undefined`は「基準なし」。不変条件（基準 ∈ 選択）を守るため、
 * 選択に含まれないSetup idを基準にしようとした場合は無視する（no-op。
 * `withSetSelectionSetupIds`のコメント参照）。
 */
export function withSetSelectionBaseline(
  current: SetSelectionState,
  baselineSetupId: string | undefined,
): SetSelectionState {
  if (current.baselineSetupId === baselineSetupId) return current;
  if (baselineSetupId !== undefined && !current.setupIds.includes(baselineSetupId)) return current;
  return { ...current, baselineSetupId };
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
  if (sameIds(existing.setupIds, selection.setupIds) && existing.baselineSetupId === selection.baselineSetupId) {
    return state;
  }
  return { ...state, [analyzerId]: selection };
}
