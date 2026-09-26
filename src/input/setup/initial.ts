import { LAYOUT_BY_ID } from '#input/layouts/index.ts';
import type { Setup, SetupIdGenerator } from './types.ts';

/**
 * 初期Setupで使う既定の物理形状。3形状（`PHYSICAL_SHAPES`）のうち最初から選ばれている
 * 既定（`src/input/shapes/geometry.ts` の `row-staggered`）に合わせる。ここでは
 * `PHYSICAL_SHAPES` の実体をimportせず、idの文字列だけを持つ（初期Setupの定義は
 * 「どの形状idを使うか」だけを決めればよく、形状の解決自体はresolve.tsが行うため）。
 */
const INITIAL_SETUP_SHAPE_ID = 'row-staggered';

/**
 * 初期Setup（#544 §4「Setupは資産で、単体ページやWorkspaceはそこから選ぶ。簡単な初期値は
 * 用意する」）。「組み込み配列 × 既定の物理形状」を配列ごとに1つずつ用意する。
 *
 * 組み込み配列の一覧は `LAYOUT_BY_ID`（英字配列 `LAYOUTS` とかな/ローマ字配列
 * `LAYOUTS_JA` を合わせた、配列idの唯一の正）をそのまま使う。
 *
 * 却下した案:
 * - 配列・形状の全組み合わせ — 組み合わせが掛け算で増える。最初からSetup一覧が
 *   埋まってしまうと「ユーザーが選んで作る資産」という性質が薄れる
 * - 少数の厳選セット（QWERTY・ローマ字配列1つ・かな配列1つ等） — 選定基準を
 *   このモジュールが持つことになる。組み込み配列の集合はすでに `src/input/layouts/`
 *   が選定済みなので、そこへ選定基準を二重に持たない。1配列1形状なら数も少なく保てる
 *   （#544時点で18個）
 * - 形状ごとに1セット（配列は固定でQWERTYのみ等） — このツールの主眼は配列の比較
 *   （AGENTS.md冒頭）なので、まず配列を横に並べられる初期値のほうが最初の一覧として役立つ
 */
export function initialSetups(generateId: SetupIdGenerator): readonly Setup[] {
  return [...LAYOUT_BY_ID.keys()].map((layoutId) => ({
    id: generateId(),
    layoutId,
    shapeId: INITIAL_SETUP_SHAPE_ID,
  }));
}
