import { DEFAULT_FINGER_ASSIGNMENT } from '#input/shapes/geometry.ts';
import type { KeydistAssets } from '#engine/commands.ts';
import { defaultFingerAssignmentId, FINGER_ASSIGNMENT_REGISTRY } from '#engine/finger-assignment.ts';
import { DEFAULT_SHAPE_ID, readGlobalFingerAssignmentId, resolveGlobalDefaultShapeId } from '#engine/settings-items.ts';
import { effectiveSingleTarget } from '#engine/single-target-selection.ts';
import type { PersonalSpeedCatalog, PersonalSpeedSelection } from '#editors/personal-speed/PersonalSpeedEditor.tsx';
import { paneCatalog } from '../standalone/catalog.ts';

const FALLBACK_LAYOUT_ID = 'qwerty';

/** 測るキーを選ぶ候補。組み込みに、自作の配列と指の割り当てを足す。 */
export function personalSpeedCatalog(assets: Pick<KeydistAssets, 'userLayouts' | 'userRomajiRules' | 'fingerAssignments'>): PersonalSpeedCatalog {
  const { setupCatalog } = paneCatalog(assets);
  return {
    layouts: [...setupCatalog.layouts.values()],
    shapes: [...setupCatalog.shapes.values()],
    fingerAssignments: [...Object.values(FINGER_ASSIGNMENT_REGISTRY), ...assets.fingerAssignments],
  };
}

/**
 * 画面を開いた時の選択。配列はSingleの対象（Setupなら、そのSetupの配列）、物理配列と指の割り当ては
 * 条件の全体の値。選択肢に無ければ、既定の配列・物理配列と、その物理配列の既定の指の割り当てにする。
 */
export function initialPersonalSpeedSelection(
  assets: Pick<KeydistAssets, 'singleTargetSelection' | 'setupLibrary'>,
  catalog: PersonalSpeedCatalog,
): PersonalSpeedSelection {
  const target = effectiveSingleTarget(assets.singleTargetSelection);
  const targetLayoutId = target.kind === 'layout' ? target.layoutId : assets.setupLibrary.setups.find((setup) => setup.id === target.setupId)?.layoutId;
  const layoutId = catalog.layouts.some((layout) => layout.id === targetLayoutId)
    ? targetLayoutId!
    : ((catalog.layouts.find((layout) => layout.id === FALLBACK_LAYOUT_ID) ?? catalog.layouts[0])?.id ?? FALLBACK_LAYOUT_ID);

  const overrides = assets.setupLibrary.overrides;
  const globalShapeId = resolveGlobalDefaultShapeId(overrides);
  const shapeId = catalog.shapes.some((shape) => shape.id === globalShapeId) ? globalShapeId : DEFAULT_SHAPE_ID;

  const globalAssignmentId = readGlobalFingerAssignmentId(overrides);
  const fingerAssignmentId =
    globalAssignmentId !== undefined && catalog.fingerAssignments.some((assignment) => assignment.id === globalAssignmentId)
      ? globalAssignmentId
      : defaultFingerAssignmentIdOf(shapeId, catalog);
  return { layoutId, shapeId, fingerAssignmentId };
}

/** 物理配列の既定の指の割り当てのid。 */
export function defaultFingerAssignmentIdOf(shapeId: string, catalog: PersonalSpeedCatalog): string {
  const shape = catalog.shapes.find((candidate) => candidate.id === shapeId);
  return shape === undefined ? DEFAULT_FINGER_ASSIGNMENT.id : defaultFingerAssignmentId(shape);
}
