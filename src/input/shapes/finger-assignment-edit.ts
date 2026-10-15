import {
  ALL_FINGERS,
  FINGERS,
  isThumb,
  keyId,
  makeFingerAssignment,
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

/**
 * 複数のキーの指を1本に決める。各キーの基本の指をその指にし、そのキーの追加の担当は外す
 * （そのキーを担当する指は1本になる）。他のキーの担当は変えない。
 */
export function assignKeysToFinger(
  assignment: FingerAssignment,
  keyIds: readonly string[],
  finger: NonThumb,
): FingerAssignment {
  const changed = keyIds.filter((id) =>
    assignment.baseFinger[id] !== finger
    || ALL_FINGERS.some((other) => other !== finger && assignment.fingerKeys[other].includes(id)));
  if (changed.length === 0) return assignment;
  const targets = new Set(changed);
  const baseFinger = { ...assignment.baseFinger };
  for (const id of changed) baseFinger[id] = finger;
  // 編集していないキーの追加の担当は保つ
  const extra: Record<string, Finger[]> = {};
  for (const owner of ALL_FINGERS) {
    for (const id of assignment.fingerKeys[owner]) {
      if (targets.has(id) || assignment.baseFinger[id] === owner) continue;
      (extra[id] ??= []).push(owner);
    }
  }
  return makeFingerAssignment(assignment.id, assignment.name, baseFinger, assignment.homeKey, extra);
}

/** 1つのキーの指を決める。基本の指をその指にし、そのキーの追加の担当は外す。 */
export function assignKeyFinger(assignment: FingerAssignment, keyIdToSet: string, finger: NonThumb): FingerAssignment {
  return assignKeysToFinger(assignment, [keyIdToSet], finger);
}

/** 物理配列の1列のキーすべてに、同じ指を決める。 */
export function assignColumnFinger(
  assignment: FingerAssignment,
  shape: PhysicalShape,
  column: number,
  finger: NonThumb,
): FingerAssignment {
  return assignKeysToFinger(assignment, shapeColumns(shape)[column] ?? [], finger);
}

/** 担当と基本の指から割り当てを組み直す。担当の並びは意味を持たないので、集合から作る。 */
function rebuildAssignment(
  assignment: FingerAssignment,
  baseFinger: Record<string, NonThumb>,
  owners: Readonly<Record<string, ReadonlySet<Finger>>>,
): FingerAssignment {
  const extra: Record<string, Finger[]> = {};
  for (const [id, fingers] of Object.entries(owners)) {
    const rest = [...fingers].filter((finger) => baseFinger[id] !== finger);
    if (rest.length > 0) extra[id] = rest;
  }
  return makeFingerAssignment(assignment.id, assignment.name, baseFinger, assignment.homeKey, extra);
}

/** 全てのキーの担当する指の集合（指の固定の順）。 */
function ownersOfAll(assignment: FingerAssignment): Record<string, Set<Finger>> {
  const owners: Record<string, Set<Finger>> = {};
  for (const finger of ALL_FINGERS) {
    for (const id of assignment.fingerKeys[finger]) (owners[id] ??= new Set()).add(finger);
  }
  return owners;
}

/**
 * キーの基本の指を決める。その指を担当に加え、前の基本の指は担当に残す
 * （担当を外すかどうかは別の操作で決める）。
 */
export function setBaseFinger(assignment: FingerAssignment, keyIdToSet: string, finger: NonThumb): FingerAssignment {
  if (assignment.baseFinger[keyIdToSet] === finger) return assignment;
  const owners = ownersOfAll(assignment);
  (owners[keyIdToSet] ??= new Set()).add(finger);
  return rebuildAssignment(assignment, { ...assignment.baseFinger, [keyIdToSet]: finger }, owners);
}

/**
 * 指にキーを担当させる。基本の指が無いキーは、親指以外の指ならその指を基本の指にする。
 * 親指は、基本の指を持つキーだけを追加で担当できる（基本の指は親指以外の指）。
 */
export function addKeyToFinger(assignment: FingerAssignment, keyIdToSet: string, finger: Finger): FingerAssignment {
  if (assignment.fingerKeys[finger].includes(keyIdToSet)) return assignment;
  const owners = ownersOfAll(assignment);
  (owners[keyIdToSet] ??= new Set()).add(finger);
  let baseFinger = assignment.baseFinger;
  if (baseFinger[keyIdToSet] === undefined) {
    if (isThumb(finger)) return assignment;
    baseFinger = { ...baseFinger, [keyIdToSet]: finger as NonThumb };
  }
  return rebuildAssignment(assignment, baseFinger, owners);
}

/** 指のキーの担当を外す。基本の指の担当は外せない（先に基本の指を別の指にする）。 */
export function removeKeyFromFinger(assignment: FingerAssignment, keyIdToSet: string, finger: Finger): FingerAssignment {
  if (!assignment.fingerKeys[finger].includes(keyIdToSet) || assignment.baseFinger[keyIdToSet] === finger) return assignment;
  const owners = ownersOfAll(assignment);
  owners[keyIdToSet]?.delete(finger);
  return rebuildAssignment(assignment, assignment.baseFinger, owners);
}

/** 担当を足す・外すのうち、今の状態から見て逆の側を行う。 */
export function toggleKeyOfFinger(assignment: FingerAssignment, keyIdToSet: string, finger: Finger): FingerAssignment {
  return assignment.fingerKeys[finger].includes(keyIdToSet)
    ? removeKeyFromFinger(assignment, keyIdToSet, finger)
    : addKeyToFinger(assignment, keyIdToSet, finger);
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
  return {
    ...assignment,
    baseFinger: { ...defaults.baseFinger },
    fingerKeys: Object.fromEntries(ALL_FINGERS.map((finger) => [finger, [...defaults.fingerKeys[finger]]])) as unknown as Record<Finger, readonly string[]>,
    homeKey: { ...defaults.homeKey },
  };
}

/** 選んだ物理配列でこの割り当てを使う時に、測れなくなる・意図と違う可能性のある点。 */
export type AssignmentProblem =
  | { readonly kind: 'unassigned'; readonly keyIds: readonly string[] }
  | { readonly kind: 'home-missing'; readonly finger: NonThumb; readonly keyId: string }
  | { readonly kind: 'home-other-finger'; readonly finger: NonThumb; readonly keyId: string; readonly keyFinger: Finger };

export function assignmentProblems(assignment: FingerAssignment, shape: PhysicalShape): readonly AssignmentProblem[] {
  const keyIds = shapeKeyIds(shape);
  const problems: AssignmentProblem[] = [];
  const unassigned = keyIds.filter((id) => assignment.baseFinger[id] === undefined);
  if (unassigned.length > 0) problems.push({ kind: 'unassigned', keyIds: unassigned });
  const known = new Set(keyIds);
  for (const finger of FINGERS) {
    const home = assignment.homeKey[finger];
    if (!known.has(home)) {
      problems.push({ kind: 'home-missing', finger, keyId: home });
      continue;
    }
    const owner = assignment.baseFinger[home];
    if (owner !== undefined && !assignment.fingerKeys[finger].includes(home)) {
      problems.push({ kind: 'home-other-finger', finger, keyId: home, keyFinger: owner });
    }
  }
  return problems;
}
