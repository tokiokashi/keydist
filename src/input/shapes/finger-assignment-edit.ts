import {
  FINGERS,
  keyId,
  type Finger,
  type FingerAssignment,
  type NonThumb,
  type PhysicalShape,
} from './geometry.ts';

/**
 * 指割り当ての編集の純関数。編集できるのは、物理配列の格子のキー（`rowWidths`が決める段と列）だけ。
 * 親指のキーとShiftは物理配列が指を決めるので、割り当てには入らない。
 *
 * どの関数も元の割り当てを書き換えず、変化が無ければ同じ参照を返す。
 * 選んだ物理配列に無いキーの割り当ては消さずに残す（別の物理配列で作った割り当てを直しても、
 * その物理配列の分が失われないようにするため）。
 */

/** 物理配列の格子のキーid。段ごとに左から並べる。 */
export function shapeKeyIds(shape: PhysicalShape): readonly string[] {
  return shape.rowWidths.flatMap((width, row) => Array.from({ length: width }, (_, col) => keyId(row, col)));
}

/** 物理配列の列ごとのキーid（上の段から）。段によって列数が違う時は、最も長い段に合わせた列数になる。 */
export function shapeColumns(shape: PhysicalShape): readonly (readonly string[])[] {
  const count = Math.max(0, ...shape.rowWidths);
  return Array.from({ length: count }, (_, col) =>
    shape.rowWidths.flatMap((width, row) => col < width ? [keyId(row, col)] : []));
}

/** 1つのキーの指を決める。 */
export function assignKeyFinger(assignment: FingerAssignment, keyIdToSet: string, finger: NonThumb): FingerAssignment {
  if (assignment.keyFinger[keyIdToSet] === finger) return assignment;
  return { ...assignment, keyFinger: { ...assignment.keyFinger, [keyIdToSet]: finger } };
}

/** 物理配列の1列のキーすべてに、同じ指を決める。 */
export function assignColumnFinger(
  assignment: FingerAssignment,
  shape: PhysicalShape,
  column: number,
  finger: NonThumb,
): FingerAssignment {
  const keyIds = shapeColumns(shape)[column] ?? [];
  if (keyIds.every((id) => assignment.keyFinger[id] === finger)) return assignment;
  const keyFinger = { ...assignment.keyFinger };
  for (const id of keyIds) keyFinger[id] = finger;
  return { ...assignment, keyFinger };
}

/** 指のホームキーを決める。 */
export function assignHomeKey(assignment: FingerAssignment, finger: NonThumb, keyIdToSet: string): FingerAssignment {
  if (assignment.homeKey[finger] === keyIdToSet) return assignment;
  return { ...assignment, homeKey: { ...assignment.homeKey, [finger]: keyIdToSet } };
}

/**
 * 既定の割り当ての中身で丸ごと置き換える。既定に無いキーの割り当ても消える。
 * idと名前は編集中の割り当てのまま。
 */
export function resetToDefaultAssignment(assignment: FingerAssignment, defaults: FingerAssignment): FingerAssignment {
  return { ...assignment, keyFinger: { ...defaults.keyFinger }, homeKey: { ...defaults.homeKey } };
}

/** 選んだ物理配列でこの割り当てを使う時に、測れなくなる・意図と違う可能性のある点。 */
export type AssignmentProblem =
  | { readonly kind: 'unassigned'; readonly keyIds: readonly string[] }
  | { readonly kind: 'home-missing'; readonly finger: NonThumb; readonly keyId: string }
  | { readonly kind: 'home-other-finger'; readonly finger: NonThumb; readonly keyId: string; readonly keyFinger: Finger };

export function assignmentProblems(assignment: FingerAssignment, shape: PhysicalShape): readonly AssignmentProblem[] {
  const keyIds = shapeKeyIds(shape);
  const problems: AssignmentProblem[] = [];
  const unassigned = keyIds.filter((id) => assignment.keyFinger[id] === undefined);
  if (unassigned.length > 0) problems.push({ kind: 'unassigned', keyIds: unassigned });
  const known = new Set(keyIds);
  for (const finger of FINGERS) {
    const home = assignment.homeKey[finger];
    if (!known.has(home)) {
      problems.push({ kind: 'home-missing', finger, keyId: home });
      continue;
    }
    const owner = assignment.keyFinger[home];
    if (owner !== undefined && owner !== finger) problems.push({ kind: 'home-other-finger', finger, keyId: home, keyFinger: owner });
  }
  return problems;
}
