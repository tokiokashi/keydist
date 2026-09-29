import { LAYOUT_BY_ID } from '#input/layouts/index.ts';
import { PHYSICAL_SHAPES, type PhysicalShape } from '#input/shapes/geometry.ts';
import type { StandalonePaneCatalog } from '#hosts/standalone/index.ts';

/**
 * 単体ページが`resolveEngineInput`へ渡すカタログ（#544 §1「配列 × 物理配列」）の組み立て。
 *
 * 自作配列・自作物理配列・自作ローマ字規則はこの作業単位の範囲外（指示書「範囲外」に
 * 明示は無いが、単体ページの最初の縦切りに要らない機能はここでも先回りして足さない。
 * AGENTS.md「設定項目を足すか決める」の3つ目と同じ判断）。組み込みの配列・物理配列だけを
 * 対象にする。自作配列・物理配列のエディタ（`src/editors/`）ができた時に、その手持ちを
 * ここへ合流させる。
 */
export function builtinStandaloneCatalog(): StandalonePaneCatalog {
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
