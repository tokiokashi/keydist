import type { PhysicalShape } from '#input/shapes/geometry.ts';
import type { Layout } from '#input/layouts/types.ts';
import type { InputMethod } from './levels.ts';

/**
 * ある1つのSetupを解決するのに要る情報。
 * `validate` / `isApplicable`（項目定義側）はこれだけを見て判断する
 * （形状・配列そのものを渡すことで、項目ごとに個別の判定材料を足さずに済む）。
 *
 * `setupId` は省略可能: Setupがまだ確定していない段階（配列・形状だけを選んだ時の
 * プレビュー等）でも、global〜layoutレベルまでの解決は行えるようにするため。
 * 省略時はSetupレベルの上書きを一切見ない。
 */
export interface CascadeContext {
  readonly shapeId: string;
  readonly shape: PhysicalShape;
  readonly inputMethod: InputMethod;
  readonly layoutId: string;
  readonly layout: Layout;
  readonly setupId?: string;
}
