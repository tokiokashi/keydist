import type { PhysicalShape } from '#input/shapes/geometry.ts';
import type { Layout } from '#input/layouts/types.ts';
import type { InputMethod } from './levels.ts';

interface CascadeContextBase {
  readonly shapeId: string;
  readonly shape: PhysicalShape;
  readonly inputMethod: InputMethod;
  readonly layoutId: string;
  readonly layout: Layout;
}

/**
 * ある1つの対象を解決するのに要る情報。
 * `validate` / `isApplicable`（項目定義側）はこれだけを見て判断する
 * （物理配列・配列そのものを渡すことで、項目ごとに個別の判定材料を足さずに済む）。
 *
 * `targetKind` は対象が配列かSetupか（docs/architecture.md 用語表「対象」）。
 * `setupId` の有無からは推測しない: Setupがまだ確定していない段階（配列・物理配列だけを選んだ時の
 * プレビュー等）は「Setup対象だがidがまだ無い」で、`setupId` 省略は配列対象を意味しない。
 * 物理配列の決まり方が対象の種類で変わる項目（`defaultShapeId`）が、この区別を必要とする。
 *
 * `setupId` 省略時はSetupレベルの上書きを一切見ない。配列対象はSetupレベルを持たないので、
 * 型の上でも `setupId` を持てない。
 */
export type CascadeContext = CascadeContextBase & (
  | { readonly targetKind: 'layout'; readonly setupId?: undefined }
  | { readonly targetKind: 'setup'; readonly setupId?: string }
);
