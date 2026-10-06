import { LAYOUT_BY_ID } from '#input/layouts/index.ts';
import { PHYSICAL_SHAPES, type PhysicalShape } from '#input/shapes/geometry.ts';
import type { PaneCatalog } from '#hosts/shared/resolve-pane-input.ts';

/**
 * ペイン（個別画面・Workspace）が`resolveEngineInput`へ渡すカタログの組み立て。
 *
 * 自作配列・自作物理配列・自作ローマ字規則は扱わない（単体ページに要らない機能は
 * ここでも先回りして足さない。
 * AGENTS.md「設定項目を足すか決める」の3つ目と同じ判断）。組み込みの配列・物理配列だけを
 * 対象にする。自作配列・物理配列のエディタ（`src/editors/`）ができた時に、その手持ちを
 * ここへ合流させる。
 */
export function builtinPaneCatalog(): PaneCatalog {
  return {
    setupCatalog: {
      layouts: LAYOUT_BY_ID,
      shapes: new Map<string, PhysicalShape>(
        Object.values(PHYSICAL_SHAPES).map((shape) => [shape.id, shape]),
      ),
    },
    userLayouts: new Map(),
  };
}
