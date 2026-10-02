/**
 * 配列が組み込みで持つ物理配列の推奨（`defaultShapeId` の配列のレベルの組み込みの既定）。
 * ローマ字規則の推奨（`input/romaji/rules.ts` の `recommendedRomajiRuleId`）と同じ扱いで、
 * 優先は 配列の上書き ＞ 配列の推奨 ＞ 全体の値 ＞ 既定。推奨を持つ配列は、全体を変えても推奨のまま測る。
 *
 * 持たせてよいのは、配列の作者が特定の物理配列を前提に配列を設計したと、配列の公式資料で確かめられた場合だけ。
 * 確かめられた配列は今は無いので、表は空（どの配列も全体の値に従う）。
 * 配列を足す時は、物理配列のidと根拠の資料を一緒にここへ書く。
 */
const RECOMMENDED_SHAPE_BY_LAYOUT: ReadonlyMap<string, string> = new Map();

/** 配列の推奨の物理配列のid。無ければ`undefined`（全体の値に従う）。 */
export function recommendedShapeId(layoutId: string): string | undefined {
  return RECOMMENDED_SHAPE_BY_LAYOUT.get(layoutId);
}
