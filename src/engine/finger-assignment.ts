import type { Diagnostic } from '#input/settings/index.ts';
import {
  DEFAULT_FINGER_ASSIGNMENT,
  isPresetGeometryKind,
  JIS_FINGER_ASSIGNMENT,
  presetGeometryStandard,
  type FingerAssignment,
  type PhysicalShape,
} from '#input/shapes/geometry.ts';

/**
 * 指割り当てid → 実体（#544 Phase 2「engine」/「自作の指割当を資産として engine に入れる」）。
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
 * 自作の指割り当て（`input/shapes/user-finger-assignments.ts`）はSetupCatalogのような
 * 固定のカタログを持たない。romajiRuleId ＋ `customRomajiRules`（`resolved-input.ts`）と同じ
 * 理由: 呼び出し側（`resolveEngineInput`）がその時点の手持ちを都度渡す形にし、
 * `engine/finger-assignment.ts` 自身は組み込みの2つだけを知っていればよい。
 */
export const FINGER_ASSIGNMENT_REGISTRY: Readonly<Record<string, FingerAssignment>> = {
  [DEFAULT_FINGER_ASSIGNMENT.id]: DEFAULT_FINGER_ASSIGNMENT,
  [JIS_FINGER_ASSIGNMENT.id]: JIS_FINGER_ASSIGNMENT,
};

export interface ResolvedFingerAssignment {
  readonly assignment: FingerAssignment;
  /**
   * idが組み込み・自作のどちらにも見つからず、`assignment`をfallbackへ差し替えた時だけ
   * 持つ。カスケードの他項目と同じ`Diagnostic`型（`invalid-fallback`）を使い、呼び出し側
   * （`resolveEngineInput`）がこれを`ResolvedInput.cascade.fingerAssignmentId.diagnostics`へ
   * 合流させることで、ペインの表示が他の実現可能性エラーと同じ経路に乗る。
   */
  readonly diagnostic?: Diagnostic;
}

/**
 * idから指割り当ての実体を引く。組み込み → `customAssignments`（自作の手持ち）の順で探し、
 * どちらにも無ければ`fallback`（既定は`DEFAULT_FINGER_ASSIGNMENT`）へ戻す。
 *
 * 診断なしで黙って`default`へ落としていた旧実装（#567）と違い、fallbackした事実を
 * 診断として返す。**未知のidは「存在しない自作割り当てを参照している」という壊れた状態を
 * 表しうる**（自作割り当てを削除した後、それを指すカスケードの上書きが残るケース。
 * `engine/commands.ts`の`deleteFingerAssignmentCommand`のコメント参照）ので、
 * 黙って解決してしまうと利用者が気づけない。
 */
export function resolveFingerAssignment(
  id: string,
  customAssignments: ReadonlyMap<string, FingerAssignment> = EMPTY_CUSTOM_ASSIGNMENTS,
  fallback: FingerAssignment = DEFAULT_FINGER_ASSIGNMENT,
): ResolvedFingerAssignment {
  const builtin = FINGER_ASSIGNMENT_REGISTRY[id];
  if (builtin) return { assignment: builtin };
  const custom = customAssignments.get(id);
  if (custom) return { assignment: custom };
  return {
    assignment: fallback,
    diagnostic: {
      kind: 'invalid-fallback',
      message: `選んでいた指の割当が見つからないため、既定の「${fallback.name}」で測った`,
    },
  };
}

const EMPTY_CUSTOM_ASSIGNMENTS: ReadonlyMap<string, FingerAssignment> = new Map();

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
