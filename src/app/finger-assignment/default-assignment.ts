import { defaultFingerAssignmentId, FINGER_ASSIGNMENT_REGISTRY } from '#engine/finger-assignment.ts';
import { DEFAULT_FINGER_ASSIGNMENT, type FingerAssignment, type PhysicalShape } from '#input/shapes/geometry.ts';

/** 物理配列の規格の既定の指の割り当て（`defaultFingerAssignmentId`が引くもの）。物理配列が見つからなければ列固定の既定。 */
export function defaultFingerAssignmentOf(shapeId: string, shapes: readonly PhysicalShape[]): FingerAssignment {
  const shape = shapes.find((candidate) => candidate.id === shapeId);
  if (shape === undefined) return DEFAULT_FINGER_ASSIGNMENT;
  return FINGER_ASSIGNMENT_REGISTRY[defaultFingerAssignmentId(shape)] ?? DEFAULT_FINGER_ASSIGNMENT;
}
