import {
  DEFAULT_FINGER_ASSIGNMENT,
  isPresetGeometryKind,
  JIS_FINGER_ASSIGNMENT,
  presetGeometryStandard,
  type FingerAssignment,
  type PhysicalShape,
} from '#input/shapes/geometry.ts';

/**
 * 指割り当てid → 実体（#544 Phase 2「engine」）。
 *
 * 旧実装（`test/fixtures/analyzer-regression.json`）は fingerAssignmentId を
 * geometryShapeId とは独立した条件として記録している（同じ `row-staggered` 形状のまま
 * `jis-default` へ差し替える分岐が実在する）。しかし今のSetup / SetupCatalogは
 * `shapeId → PhysicalShape` までしか持たず、指割り当てはその型に無い軸になっている。
 *
 * この差を埋めるため、指割り当てidをカスケードの項目にする（`settings-items.ts` の
 * `fingerAssignmentId`）。「その配列に無い機能」ではなく「その形状に無い機能」でもないので
 * shape/layout/setupレベルでの上書きを許す（形状を変えずに運指だけ比べたい・組み込みJIS運指を
 * 既定にしたい、の両方を表現できる）。
 *
 * 自作の指割り当て編集はまだ無い（AGENTS.md「設定項目を足すか決める」の3つ目:
 * 先回りして足さない）。未知のidは`default`へfallbackする。
 */
export const FINGER_ASSIGNMENT_REGISTRY: Readonly<Record<string, FingerAssignment>> = {
  [DEFAULT_FINGER_ASSIGNMENT.id]: DEFAULT_FINGER_ASSIGNMENT,
  [JIS_FINGER_ASSIGNMENT.id]: JIS_FINGER_ASSIGNMENT,
};

/** idから指割り当ての実体を引く。未登録のidは`default`にfallbackする。 */
export function resolveFingerAssignment(id: string): FingerAssignment {
  return FINGER_ASSIGNMENT_REGISTRY[id] ?? DEFAULT_FINGER_ASSIGNMENT;
}

/**
 * 形状から既定の指割り当てidを決める。プリセットのJIS系形状（`jis-`接頭辞）はJIS既定、
 * それ以外（ANSIプリセット・自作形状）は列固定の既定を使う。
 */
export function defaultFingerAssignmentId(shape: PhysicalShape): string {
  if (isPresetGeometryKind(shape.id) && presetGeometryStandard(shape.id) === 'jis') {
    return JIS_FINGER_ASSIGNMENT.id;
  }
  return DEFAULT_FINGER_ASSIGNMENT.id;
}
