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
  return Array.from({ length: count }, (_, col) => shape.rowWidths.flatMap((width, row) => (col < width ? [keyId(row, col)] : [])));
}

/**
 * 複数のキーの指を1本に決める。各キーの基本の指をその指にし、そのキーの追加の担当は外す
 * （そのキーを担当する指は1本になる）。他のキーの担当は変えない。
 */
export function assignKeysToFinger(assignment: FingerAssignment, keyIds: readonly string[], finger: NonThumb): FingerAssignment {
  const changed = keyIds.filter(
    (id) => assignment.baseFinger[id] !== finger || ALL_FINGERS.some((other) => other !== finger && assignment.fingerKeys[other].includes(id)),
  );
  if (changed.length === 0) return assignment;
  const targets = new Set(changed);
  const baseFinger = { ...assignment.baseFinger };
  for (const id of changed) baseFinger[id] = finger;
  // 編集していないキーの追加の担当は保つ
  const extra: Record<string, Finger[]> = {};
  for (const owner of ALL_FINGERS) {
    for (const id of assignment.fingerKeys[owner]) {
      if (targets.has(id) || assignment.baseFinger[id] === owner) continue;
      const list = extra[id] ?? [];
      extra[id] = list;
      list.push(owner);
    }
  }
  return makeFingerAssignment(assignment.id, assignment.name, baseFinger, assignment.homeKey, extra);
}

/** 1つのキーの指を決める。基本の指をその指にし、そのキーの追加の担当は外す。 */
export function assignKeyFinger(assignment: FingerAssignment, keyIdToSet: string, finger: NonThumb): FingerAssignment {
  return assignKeysToFinger(assignment, [keyIdToSet], finger);
}

/** 物理配列の1列のキーすべてに、同じ指を決める。 */
export function assignColumnFinger(assignment: FingerAssignment, shape: PhysicalShape, column: number, finger: NonThumb): FingerAssignment {
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
    for (const id of assignment.fingerKeys[finger]) {
      const set = owners[id] ?? new Set<Finger>();
      owners[id] = set;
      set.add(finger);
    }
  }
  return owners;
}

/** キーを担当する親指以外の指（指の固定の順）。 */
export function nonThumbOwnersOf(assignment: FingerAssignment, keyIdToCheck: string): NonThumb[] {
  return FINGERS.filter((finger) => assignment.fingerKeys[finger].includes(keyIdToCheck));
}

/** 担当の足し外しができない理由。親指以外の最後の担当は外せず、親指は基本の指のあるキーだけを担当できる。 */
export type OwnerChangeBlock = 'last-non-thumb' | 'thumb-needs-base';

/** 指の担当を足す・外す操作が、今の状態でできない理由。できる時はundefined。編集の関数を呼ぶ前の判定に使う。 */
export function ownerChangeBlock(assignment: FingerAssignment, keyIdToCheck: string, finger: Finger): OwnerChangeBlock | undefined {
  if (assignment.fingerKeys[finger].includes(keyIdToCheck)) {
    if (isThumb(finger)) return undefined;
    return nonThumbOwnersOf(assignment, keyIdToCheck).length <= 1 ? 'last-non-thumb' : undefined;
  }
  return isThumb(finger) && assignment.baseFinger[keyIdToCheck] === undefined ? 'thumb-needs-base' : undefined;
}

/** 手の中での親指からの並び（人差し指が1、小指が4）。 */
function rankFromThumb(finger: NonThumb): number {
  return { I: 1, M: 2, R: 3, P: 4 }[finger[1] as 'I' | 'M' | 'R' | 'P'];
}

/**
 * 基本の指を外した時の、新しい基本の指。外した指と同じ手の指を先にし、同じ手の中では外した指に近い指
 * （親指からの並びの差が小さい指）を先にする。同じ近さの指は指の固定の順で決める。
 * 基本の指の手はShiftや親指シフトの選び方に入るので、手が入れ替わらない指を先にする。
 */
function nextBaseFinger(removed: NonThumb, candidates: readonly NonThumb[]): NonThumb | undefined {
  const order = (finger: NonThumb) =>
    (finger[0] === removed[0] ? 0 : 1) * 1000 + Math.abs(rankFromThumb(finger) - rankFromThumb(removed)) * 100 + ALL_FINGERS.indexOf(finger);
  return [...candidates].sort((a, b) => order(a) - order(b))[0];
}

/**
 * キーの基本の指を、担当する親指以外の指の中から選び直す。担当は足しも外しもしない。
 * 担当していない指を渡した時は、割り当てを変えずに返す。
 */
export function setBaseFinger(assignment: FingerAssignment, keyIdToSet: string, finger: NonThumb): FingerAssignment {
  if (assignment.baseFinger[keyIdToSet] === finger || !assignment.fingerKeys[finger].includes(keyIdToSet)) return assignment;
  return rebuildAssignment(assignment, { ...assignment.baseFinger, [keyIdToSet]: finger }, ownersOfAll(assignment));
}

/**
 * 指にキーを担当させる。基本の指が無いキーは、親指以外の指ならその指を基本の指にする。
 * 親指は、基本の指を持つキーだけを追加で担当できる（基本の指は親指以外の指）。
 */
export function addKeyToFinger(assignment: FingerAssignment, keyIdToSet: string, finger: Finger): FingerAssignment {
  if (assignment.fingerKeys[finger].includes(keyIdToSet)) return assignment;
  const owners = ownersOfAll(assignment);
  const ownerSet = owners[keyIdToSet] ?? new Set<Finger>();
  owners[keyIdToSet] = ownerSet;
  ownerSet.add(finger);
  let baseFinger = assignment.baseFinger;
  if (baseFinger[keyIdToSet] === undefined) {
    if (isThumb(finger)) return assignment;
    baseFinger = { ...baseFinger, [keyIdToSet]: finger as NonThumb };
  }
  return rebuildAssignment(assignment, baseFinger, owners);
}

/**
 * 指のキーの担当を外す。基本の指を外した時は、残った親指以外の担当から新しい基本の指を決める。
 * 外すとそのキーの親指以外の担当が無くなる時は外せない。
 */
export function removeKeyFromFinger(assignment: FingerAssignment, keyIdToSet: string, finger: Finger): FingerAssignment {
  if (!assignment.fingerKeys[finger].includes(keyIdToSet) || ownerChangeBlock(assignment, keyIdToSet, finger) !== undefined) return assignment;
  const owners = ownersOfAll(assignment);
  owners[keyIdToSet]?.delete(finger);
  let baseFinger = assignment.baseFinger;
  if (baseFinger[keyIdToSet] === finger) {
    const next = nextBaseFinger(
      finger as NonThumb,
      nonThumbOwnersOf(assignment, keyIdToSet).filter((other) => other !== finger),
    );
    if (next === undefined) return assignment;
    baseFinger = { ...baseFinger, [keyIdToSet]: next };
  }
  return rebuildAssignment(assignment, baseFinger, owners);
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
    fingerKeys: Object.fromEntries(ALL_FINGERS.map((finger) => [finger, [...defaults.fingerKeys[finger]]])) as unknown as Record<
      Finger,
      readonly string[]
    >,
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
