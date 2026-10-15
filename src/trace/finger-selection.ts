import {
  ALL_FINGERS,
  fingerDist,
  isThumb,
  type Finger,
  type Geometry,
  type Key,
  type Point,
} from '#input/shapes/geometry.ts';

/**
 * 担当する指が2本以上のキーをどの指で打つかの選択（仕様 §9.1）。
 *
 * 入力を先頭から1つずつ進め、今の入力から `N` 入力先までの打鍵について、
 * 同指連続回数・総移動距離・基本の指で打ったキー数・指の固定の順の順に最小になる指の並びを
 * 動的計画法で厳密に求める。そのうち今の入力の打鍵の指だけを返す。
 */

/** 打鍵の1回分。キーの並びは打鍵の `keys` の順（指の選び方に依存しない） */
export interface PlannedStroke {
  /** 物理配列にあるキー。1つのキーが1つの枠 */
  readonly keys: readonly Key[];
  /** 枠ごとの担当する指（指の固定の順。基本の指を含む） */
  readonly candidates: readonly (readonly Finger[])[];
  /** この打鍵で押さえ続けているキーid（仕様 §10.0） */
  readonly heldKeys: readonly string[];
}

export interface PlannedInput {
  readonly strokes: readonly PlannedStroke[];
  /** 担当する指が2本以上の枠を持つか */
  readonly ambiguous: boolean;
}

export interface FingerSelectionPolicy {
  readonly windowSize: number;
  readonly sfbHomeCost: boolean;
}

/** 指の固定の順（仕様 §9.1）。`ALL_FINGERS` の並びと同じ */
const FINGER_INDEX = new Map<Finger, number>(ALL_FINGERS.map((finger, index) => [finger, index]));
const FINGER_COUNT = ALL_FINGERS.length;

/** 距離を比べる時の丸め単位。10⁻⁶u（仕様 §9.1） */
const DISTANCE_SCALE = 1_000_000;

const isThumbKey = (key: Key): boolean => isThumb(key.finger);

/** 1本の指が押す（または押さえる）キーの目標位置。複数なら重心（仕様 §4.2・§3.1） */
export function targetOf(finger: Finger, keys: readonly Key[]): Point {
  const offThumbKey = isThumb(finger) && keys.some((key) => !isThumbKey(key));
  const base = keys.length === 1
    ? { x: keys[0].x, y: keys[0].y }
    : {
      x: keys.reduce((sum, key) => sum + key.x, 0) / keys.length,
      y: keys.reduce((sum, key) => sum + key.y, 0) / keys.length,
    };
  return offThumbKey ? { ...base, offThumbKey: true } : base;
}

export interface PressDecision {
  distance: number;
  /** d_stayが選ばれたか */
  stay: boolean;
}

/** 仕様 §9の表。`adjacent` はrealized Stroke gap = 0 */
export function decidePress(
  finger: Finger,
  target: Point,
  previous: Point,
  home: Point,
  adjacent: boolean,
  inputDistance: number,
  policy: FingerSelectionPolicy,
): PressDecision {
  const dStay = fingerDist(finger, previous, target);
  const dHome = fingerDist(finger, home, target);
  if (adjacent) {
    const onHome = target.x === home.x && target.y === home.y;
    return { distance: !policy.sfbHomeCost && onHome ? 0 : dStay, stay: true };
  }
  if (inputDistance <= policy.windowSize) {
    // 同値は「残す」側に寄せる
    const stay = dStay <= dHome;
    return { distance: stay ? dStay : dHome, stay };
  }
  return { distance: dHome, stay: false };
}

/** 範囲の先頭の時点の指の状態（仕様 §6） */
export interface FingerSelectionStart {
  readonly prev: Readonly<Record<Finger, Point>>;
  readonly last: Readonly<Record<Finger, number>>;
  readonly lastInputOrdinal: Readonly<Record<Finger, number>>;
  /** 次の打鍵の通し番号 */
  readonly nextStrokeIndex: number;
  /** 今の入力の通し番号 */
  readonly ordinal: number;
  /** 押さえ続けているキーを押した指 */
  readonly holders: ReadonlyMap<string, Finger>;
}

interface Sequence {
  readonly finger: number;
  readonly parent: Sequence | null;
  readonly depth: number;
}

interface State {
  readonly pos: readonly Point[];
  /** 最後に参加した入力からの入力数。`N+1` は `N` を超えたことを表す */
  readonly age: readonly number[];
  /** 直前の打鍵に参加したか */
  readonly adjacent: readonly boolean[];
  /** 押さえ続けているキー → 押した指（キーidの順） */
  readonly holders: readonly (readonly [string, number])[];
  readonly sfb: number;
  readonly distance: number;
  readonly base: number;
  readonly sequence: Sequence | null;
  /** 今の入力の枠ごとの指 */
  readonly first: readonly number[];
}

function sequenceToArray(sequence: Sequence | null): number[] {
  const values = new Array<number>(sequence?.depth ?? 0);
  let node = sequence;
  while (node !== null) {
    values[node.depth - 1] = node.finger;
    node = node.parent;
  }
  return values;
}

/** aがbより良いか（小さいほど良い）。目的の順は仕様 §9.1 */
function better(a: State, b: State): boolean {
  if (a.sfb !== b.sfb) return a.sfb < b.sfb;
  if (a.distance !== b.distance) return a.distance < b.distance;
  if (a.base !== b.base) return a.base > b.base;
  const left = sequenceToArray(a.sequence);
  const right = sequenceToArray(b.sequence);
  for (let i = 0; i < left.length && i < right.length; i++) {
    if (left[i] !== right[i]) return left[i] < right[i];
  }
  return false;
}

/** 組み合わせを順に作る。枠ごとの候補の直積 */
function* products(candidates: readonly (readonly number[])[]): Generator<number[]> {
  const choice = new Array<number>(candidates.length).fill(0);
  const pick = new Array<number>(candidates.length);
  while (true) {
    for (let i = 0; i < candidates.length; i++) pick[i] = candidates[i][choice[i]];
    yield pick.slice();
    let slot = candidates.length - 1;
    while (slot >= 0 && ++choice[slot] >= candidates[slot].length) {
      choice[slot] = 0;
      slot--;
    }
    if (slot < 0) return;
  }
}

/**
 * 打鍵ごとの指の選び方。状態（§6）を進める時に使う。
 * 押さえ続けている指を除いた候補と、1本の指が複数のキーを打つ選び方の除外を含む。
 */
export function strokeFingerChoices(
  stroke: PlannedStroke,
  holders: ReadonlyMap<string, Finger>,
): Finger[][] {
  const inKeys = new Set(stroke.keys.map((key) => key.id));
  const excluded = new Set<Finger>();
  for (const id of stroke.heldKeys) {
    if (inKeys.has(id)) continue;
    const holder = holders.get(id);
    if (holder !== undefined) excluded.add(holder);
  }
  const options = stroke.candidates.map((fingers, slot) => {
    const allowed = fingers.filter((finger) => !excluded.has(finger));
    return allowed.length > 0 ? allowed : [stroke.keys[slot].finger];
  });
  return conflictFree(options);
}

/**
 * 枠ごとの候補から、組み合わせを列挙する。1本の指が複数の枠を打つ組み合わせは、
 * 他の組み合わせがある時は外す（仕様 §9.1）。
 */
function conflictFree(options: readonly (readonly Finger[])[]): Finger[][] {
  const all: Finger[][] = [];
  const indexed = options.map((fingers) => fingers.map((finger) => FINGER_INDEX.get(finger)!));
  for (const combo of products(indexed)) all.push(combo.map((index) => ALL_FINGERS[index]));
  if (all.length <= 1) return all;
  const free = all.filter((combo) => new Set(combo).size === combo.length);
  return free.length > 0 ? free : all;
}

export interface SelectedFingers {
  /** 今の入力の打鍵ごと、枠ごとの指 */
  readonly strokes: readonly (readonly Finger[])[];
}

/**
 * `inputs[from]` の打鍵の指を選ぶ。範囲は `inputs[from]` から `from + windowSize` まで。
 */
export function selectFingers(
  geometry: Geometry,
  policy: FingerSelectionPolicy,
  start: FingerSelectionStart,
  inputs: readonly PlannedInput[],
  from: number,
): SelectedFingers {
  const cap = policy.windowSize + 1;
  const last = Math.min(inputs.length - 1, from + policy.windowSize);
  const positionIds = new WeakMap<Point, number>();
  let nextPositionId = 0;
  const positionId = (point: Point): number => {
    let id = positionIds.get(point);
    if (id === undefined) {
      id = nextPositionId++;
      positionIds.set(point, id);
    }
    return id;
  };
  const homeIds = ALL_FINGERS.map((finger) => positionId(geometry.homes[finger]));
  const targetCache = new Map<string, Point>();
  const target = (finger: Finger, keys: readonly Key[]): Point => {
    const cacheKey = `${finger}|${keys.map((key) => key.id).join(',')}`;
    let point = targetCache.get(cacheKey);
    if (point === undefined) {
      point = targetOf(finger, keys);
      targetCache.set(cacheKey, point);
    }
    return point;
  };

  const initial: State = {
    pos: ALL_FINGERS.map((finger) => start.prev[finger]),
    age: ALL_FINGERS.map((finger) => Math.min(cap, start.ordinal - start.lastInputOrdinal[finger])),
    adjacent: ALL_FINGERS.map((finger) => start.last[finger] === start.nextStrokeIndex - 1),
    holders: [...start.holders].map(([id, finger]) => [id, FINGER_INDEX.get(finger)!] as const)
      .sort((a, b) => a[0] < b[0] ? -1 : 1),
    sfb: 0,
    distance: 0,
    base: 0,
    sequence: null,
    first: [],
  };

  const signature = (state: State): string => {
    let text = '';
    for (let i = 0; i < FINGER_COUNT; i++) {
      // 長く使っていない指の位置は、次の打鍵の距離に影響しないので区別しない
      const irrelevant = state.age[i] >= cap && !state.adjacent[i];
      text += `${irrelevant ? homeIds[i] : positionId(state.pos[i])}.${state.age[i]}${state.adjacent[i] ? 'a' : ''},`;
    }
    for (const [id, finger] of state.holders) text += `${id}:${finger};`;
    return text;
  };

  let layer = new Map<string, State>([[signature(initial), initial]]);

  for (let inputIndex = from; inputIndex <= last; inputIndex++) {
    const input = inputs[inputIndex];
    const isFirst = inputIndex === from;
    if (!isFirst) {
      // 入力が進むと、全指の最後に参加した入力からの入力数が1増える
      const next = new Map<string, State>();
      for (const state of layer.values()) {
        const advanced: State = { ...state, age: state.age.map((age) => Math.min(cap, age + 1)) };
        merge(next, signature(advanced), advanced);
      }
      layer = next;
    }
    for (const stroke of input.strokes) {
      const next = new Map<string, State>();
      for (const state of layer.values()) {
        for (const successor of transitions(state, stroke, isFirst)) {
          merge(next, signature(successor), successor);
        }
      }
      layer = next;
    }
  }

  let best: State | undefined;
  for (const state of layer.values()) {
    if (best === undefined || better(state, best)) best = state;
  }
  if (best === undefined) throw new Error('指の選び方の候補が空');

  const result: Finger[][] = [];
  let offset = 0;
  for (const stroke of inputs[from].strokes) {
    result.push(best.first.slice(offset, offset + stroke.keys.length).map((index) => ALL_FINGERS[index]));
    offset += stroke.keys.length;
  }
  return { strokes: result };

  function merge(target: Map<string, State>, key: string, state: State): void {
    const existing = target.get(key);
    if (existing === undefined || better(state, existing)) target.set(key, state);
  }

  function transitions(state: State, stroke: PlannedStroke, isFirst: boolean): State[] {
    const holders = new Map(state.holders.map(([id, finger]) => [id, ALL_FINGERS[finger]] as const));
    const choices = strokeFingerChoices(stroke, holders);
    const keyIds = stroke.keys.map((key) => key.id);
    const inKeys = new Set(keyIds);
    const out: State[] = [];

    for (const combo of choices) {
      // 指ごとの押下。指は最初に出たキーの順
      const groups = new Map<Finger, Key[]>();
      combo.forEach((finger, slot) => {
        const keys = groups.get(finger);
        if (keys) keys.push(stroke.keys[slot]);
        else groups.set(finger, [stroke.keys[slot]]);
      });

      const pos = state.pos.slice();
      const age = state.age.slice();
      const adjacent = new Array<boolean>(FINGER_COUNT).fill(false);
      let sfb = 0;
      let strokeDistance = 0;
      for (const [finger, keys] of groups) {
        const index = FINGER_INDEX.get(finger)!;
        const point = target(finger, keys);
        const previous = state.pos[index];
        const decision = decidePress(
          finger,
          point,
          previous,
          geometry.homes[finger],
          state.adjacent[index],
          state.age[index],
          policy,
        );
        if (state.adjacent[index] && (previous.x !== point.x || previous.y !== point.y)) sfb++;
        strokeDistance += decision.distance;
        pos[index] = point;
        age[index] = 0;
        adjacent[index] = true;
      }

      // 押さえ続けているキー。押した指は、この打鍵で押す指か、前に押した指
      const heldFinger = (id: string): Finger | undefined => {
        if (inKeys.has(id)) return combo[keyIds.indexOf(id)];
        const holder = holders.get(id);
        if (holder !== undefined) return holder;
        return geometry.keys.get(id)?.finger;
      };
      const heldByFinger = new Map<Finger, Key[]>();
      const nextHolders: (readonly [string, number])[] = [];
      for (const id of stroke.heldKeys) {
        const finger = heldFinger(id);
        const key = geometry.keys.get(id);
        if (finger === undefined || key === undefined) continue;
        nextHolders.push([id, FINGER_INDEX.get(finger)!]);
        const keys = heldByFinger.get(finger);
        if (keys) keys.push(key);
        else heldByFinger.set(finger, [key]);
      }
      for (const [finger, keys] of heldByFinger) {
        if (groups.has(finger)) continue;
        const index = FINGER_INDEX.get(finger)!;
        pos[index] = target(finger, keys);
        age[index] = 0;
        adjacent[index] = true;
      }
      nextHolders.sort((a, b) => a[0] < b[0] ? -1 : 1);

      const fingerIndexes = combo.map((finger) => FINGER_INDEX.get(finger)!);
      let sequence = state.sequence;
      for (const index of fingerIndexes) {
        sequence = { finger: index, parent: sequence, depth: (sequence?.depth ?? 0) + 1 };
      }
      out.push({
        pos,
        age,
        adjacent,
        holders: nextHolders,
        sfb: state.sfb + sfb,
        distance: state.distance + Math.round(strokeDistance * DISTANCE_SCALE),
        base: state.base + combo.reduce((count, finger, slot) => count + (finger === stroke.keys[slot].finger ? 1 : 0), 0),
        sequence,
        first: isFirst ? [...state.first, ...fingerIndexes] : state.first,
      });
    }
    return out;
  }
}
