/**
 * 比較表単体ページが持つ「対象の集合」（#544 §6「集合を見るAnalyzerはSetupの集合を
 * 対象にし、集合もそのページ自身が持つ」・指示書「ページ自身がSetupの集合（手持ちからの
 * 選択・並び順・基準）を持つ」）。
 *
 * `setupIds`は表示順そのもの（並び替えUIがこの配列の並びを直接動かす）。同じidを
 * 2回含めることは想定しない（ホスト側のUIが選択済みidの再選択を弾く）が、資産の
 * codec（`comparison-selection-codec.ts`）は重複を無害な形で許容する（配列の順序を
 * 信頼できる形に保つのはUI側の責務で、codecは外側の形だけを保証する）。
 *
 * `baselineSetupId`は`comparisonOptions`（`analyzers/comparison/options.ts`）ではなく
 * ここに置く: 基準は「対象の集合」の一部（どれと比べるか）であって、Analyzerの
 * 個人的な見た目設定（列の表示・比率表示の可否）とは別の軸という判断（同ファイルの
 * コメント参照）。
 */
export interface ComparisonSelectionState {
  readonly setupIds: readonly string[];
  readonly baselineSetupId: string | undefined;
}

export function initialComparisonSelection(): ComparisonSelectionState {
  return { setupIds: [], baselineSetupId: undefined };
}

function sameIds(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id, index) => id === b[index]);
}

/**
 * 選択と並び順をまとめて書き換える（追加・削除・並び替えのどれもこの1本を通す。
 * `setupIds`の並びがそのまま表示順になる）。基準（`baselineSetupId`）が新しい集合に
 * 含まれなくなっても、ここでは自動で外さない（#544指示書「基準に選んだSetupが
 * 集合から外れた場合の扱い」は表示側（`definition.tsx`）が「基準なし」として扱う形で
 * 吸収する。資産側で強制的に消すと、一時的に集合から外して戻す操作（並び替えの
 * 途中等）で基準の指定が失われる事故になりうるため、資産はユーザーの最後の指定を
 * そのまま保持する）。
 */
export function withComparisonSetupIds(
  current: ComparisonSelectionState,
  setupIds: readonly string[],
): ComparisonSelectionState {
  if (sameIds(current.setupIds, setupIds)) return current;
  return { ...current, setupIds: [...setupIds] };
}

export function withComparisonBaselineSetupId(
  current: ComparisonSelectionState,
  baselineSetupId: string | undefined,
): ComparisonSelectionState {
  if (current.baselineSetupId === baselineSetupId) return current;
  return { ...current, baselineSetupId };
}
