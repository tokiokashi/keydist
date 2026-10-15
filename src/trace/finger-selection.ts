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
 * 入力を先頭から1つずつ進め、今の入力から`N`入力先までの打鍵について、
 * 同指連続回数・総移動距離・基本の指で打ったキー数・指の固定の順の順に最小になる指の並びを
 * 動的計画法で厳密に求める。そのうち今の入力の打鍵の指だけを返す。
 */

/** 打鍵の1回分。キーの並びは打鍵の`keys`の順（指の選び方に依存しない） */
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

/** 指の固定の順（仕様 §9.1）。`ALL_FINGERS`の並びと同じ */
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

/** 仕様 §9の表。`adjacent`はrealized Stroke gap = 0 */
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
  /** `pos`の座標ごとの番号。同じ座標なら同じ番号 */
  readonly posId: readonly number[];
  /** 最後に参加した入力からの入力数。`N+1`は`N`を超えたことを表す */
  readonly age: readonly number[];
  /** 直前の打鍵に参加したか */
  readonly adjacent: readonly boolean[];
  /** 押さえ続けているキー → 押した指（キーidの順） */
  readonly holders: HolderSet;
  readonly sfb: number;
  readonly distance: number;
  readonly base: number;
  readonly sequence: Sequence | null;
  /** 今の入力の枠ごとの指 */
  readonly first: readonly number[];
}

/** 押さえ続けているキーと、それを押した指の組。同じ内容は同じ`key`を持つ */
interface HolderSet {
  readonly entries: readonly (readonly [string, number])[];
  readonly byKey: ReadonlyMap<string, number>;
  readonly key: string;
}

function holderSetOf(entries: readonly (readonly [string, number])[]): HolderSet {
  const sorted = entries.slice().sort((a, b) => a[0] < b[0] ? -1 : 1);
  return {
    entries: sorted,
    byKey: new Map(sorted),
    key: sorted.map(([id, finger]) => `${id}:${finger};`).join(''),
  };
}

/**
 * aがbより後の指の固定の順か。同じ層の2つの並びは長さが等しいので、後ろから比べ、
 * 共通の祖先に着くまでに最後に見つかった違い（先頭に最も近い違い）で決める。
 */
function sequenceCompare(a: Sequence | null, b: Sequence | null): number {
  let result = 0;
  while (a !== b && a !== null && b !== null) {
    if (a.finger !== b.finger) result = a.finger < b.finger ? -1 : 1;
    a = a.parent;
    b = b.parent;
  }
  return result;
}

/** aがbより良いか（小さいほど良い）。目的の順は仕様 §9.1 */
function better(a: State, b: State): boolean {
  if (a.sfb !== b.sfb) return a.sfb < b.sfb;
  if (a.distance !== b.distance) return a.distance < b.distance;
  if (a.base !== b.base) return a.base > b.base;
  return sequenceCompare(a.sequence, b.sequence) < 0;
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

/** 座標（と親指キー以外の印）が同じ位置に同じ番号を振る。距離の計算は座標だけで決まるため */
const coordinateIds = new Map<string, number>();
const pointIds = new WeakMap<Point, number>();
function positionId(point: Point): number {
  let id = pointIds.get(point);
  if (id === undefined) {
    const key = `${point.x},${point.y},${point.offThumbKey === true ? 1 : 0}`;
    id = coordinateIds.get(key);
    if (id === undefined) {
      id = coordinateIds.size;
      coordinateIds.set(key, id);
    }
    pointIds.set(point, id);
  }
  return id;
}

/** 1つの打鍵での、指の選び方1通り分の結果。状態に依らず、押さえ続けている指の組だけで決まる */
interface StrokeOption {
  readonly fingerIndexes: readonly number[];
  /** 指ごとの押下。指は最初に出たキーの順 */
  readonly presses: readonly {
    readonly finger: Finger;
    readonly index: number;
    readonly target: Point;
    readonly targetId: number;
  }[];
  /** 押下しないが押さえ続けている指の位置 */
  readonly held: readonly { readonly index: number; readonly point: Point; readonly pointId: number }[];
  readonly holders: HolderSet;
  /** 基本の指で打ったキー数 */
  readonly base: number;
}

interface PreparedStroke {
  /** この打鍵のキーに含まれず、押さえ続けているキーのid。指の選び方は、この押し手だけに依存する */
  readonly outside: readonly string[];
  readonly options: Map<string, readonly StrokeOption[]>;
  /** 状態を読む可能性のある指（候補の指と、候補が全て除かれた時の基本の指） */
  readonly readFingers: readonly number[];
}

interface GeometryCache {
  readonly targets: Map<string, Point>;
  readonly strokes: WeakMap<PlannedStroke, PreparedStroke>;
}

const geometryCaches = new WeakMap<Geometry, GeometryCache>();

function cacheOf(geometry: Geometry): GeometryCache {
  let cache = geometryCaches.get(geometry);
  if (cache === undefined) {
    cache = { targets: new Map(), strokes: new WeakMap() };
    geometryCaches.set(geometry, cache);
  }
  return cache;
}

function prepareStroke(stroke: PlannedStroke): PreparedStroke {
  const inKeys = new Set(stroke.keys.map((key) => key.id));
  const read = new Set<number>();
  stroke.candidates.forEach((fingers, slot) => {
    for (const finger of fingers) read.add(FINGER_INDEX.get(finger)!);
    read.add(FINGER_INDEX.get(stroke.keys[slot].finger)!);
  });
  return {
    outside: [...new Set(stroke.heldKeys.filter((id) => !inKeys.has(id)))],
    options: new Map(),
    readFingers: [...read],
  };
}

function buildOptions(
  geometry: Geometry,
  cache: GeometryCache,
  stroke: PlannedStroke,
  holders: ReadonlyMap<string, Finger>,
): StrokeOption[] {
  const target = (finger: Finger, keys: readonly Key[]): Point => {
    const cacheKey = `${finger}|${keys.map((key) => key.id).join(',')}`;
    let point = cache.targets.get(cacheKey);
    if (point === undefined) {
      point = targetOf(finger, keys);
      cache.targets.set(cacheKey, point);
    }
    return point;
  };
  const keyIds = stroke.keys.map((key) => key.id);
  const inKeys = new Set(keyIds);
  return strokeFingerChoices(stroke, holders).map((combo) => {
    const groups = new Map<Finger, Key[]>();
    combo.forEach((finger, slot) => {
      const keys = groups.get(finger);
      if (keys) keys.push(stroke.keys[slot]);
      else groups.set(finger, [stroke.keys[slot]]);
    });
    const presses = [...groups].map(([finger, keys]) => {
      const point = target(finger, keys);
      return { finger, index: FINGER_INDEX.get(finger)!, target: point, targetId: positionId(point) };
    });

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
    const held = [...heldByFinger]
      .filter(([finger]) => !groups.has(finger))
      .map(([finger, keys]) => {
        const point = target(finger, keys);
        return { index: FINGER_INDEX.get(finger)!, point, pointId: positionId(point) };
      });
    return {
      fingerIndexes: combo.map((finger) => FINGER_INDEX.get(finger)!),
      presses,
      held,
      holders: holderSetOf(nextHolders),
      base: combo.reduce((count, finger, slot) => count + (finger === stroke.keys[slot].finger ? 1 : 0), 0),
    };
  });
}

/**
 * `inputs[from]`の打鍵の指を選ぶ。範囲は`inputs[from]`から`from + windowSize`まで。
 *
 * 打鍵を1つ進めるたびに、状態のうち後の打鍵が読まない部分は同じものとして畳む。
 * 畳んでも、後の打鍵の距離・同指連続は変わらないので、求める最小は変わらない。
 * - その指が範囲の最後まで打つ候補に入らない: 位置・入力数・直前の打鍵への参加を持たない
 * - 次に打つ候補に入るのが後の打鍵: 直前の打鍵への参加は持たない
 * - 次に打つ時点で最後の参加から`N`入力を超える: ホームから動くので、位置を持たない
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
  const cache = cacheOf(geometry);
  const homeIds = ALL_FINGERS.map((finger) => positionId(geometry.homes[finger]));

  // 範囲の打鍵を通しで並べる
  const flat: { stroke: PlannedStroke; input: number; startsInput: boolean }[] = [];
  for (let inputIndex = from; inputIndex <= last; inputIndex++) {
    inputs[inputIndex].strokes.forEach((stroke, position) => {
      flat.push({ stroke, input: inputIndex, startsInput: position === 0 && inputIndex !== from });
    });
  }
  const total = flat.length;
  const prepared = flat.map(({ stroke }) => {
    let entry = cache.strokes.get(stroke);
    if (entry === undefined) {
      entry = prepareStroke(stroke);
      cache.strokes.set(stroke, entry);
    }
    return entry;
  });
  // nextRead[t * 指数 + f]: 打鍵t以降で、指fが最初に候補に入る打鍵。無ければ-1
  const nextRead = new Int32Array((total + 1) * FINGER_COUNT).fill(-1);
  for (let t = total - 1; t >= 0; t--) {
    for (let f = 0; f < FINGER_COUNT; f++) nextRead[t * FINGER_COUNT + f] = nextRead[(t + 1) * FINGER_COUNT + f];
    for (const f of prepared[t].readFingers) nextRead[t * FINGER_COUNT + f] = t;
  }

  /** 打鍵`t`の前の状態のうち、`t`以降が読まない部分を畳む。配列は呼び出し側が作ったものを書き換える */
  const fold = (pos: Point[], posId: number[], age: number[], adjacent: boolean[], t: number): void => {
    for (let f = 0; f < FINGER_COUNT; f++) {
      const u = nextRead[t * FINGER_COUNT + f];
      let reset = u < 0;
      if (!reset && !(u === t && adjacent[f])) {
        adjacent[f] = false;
        reset = Math.min(cap, age[f] + flat[u].input - flat[t].input) >= cap;
      }
      if (reset) {
        pos[f] = geometry.homes[ALL_FINGERS[f]];
        posId[f] = homeIds[f];
        age[f] = cap;
        adjacent[f] = false;
      }
    }
  };

  const signature = (state: State): string => {
    let text = state.holders.key;
    for (let i = 0; i < FINGER_COUNT; i++) {
      text += `|${state.posId[i]}.${state.age[i]}${state.adjacent[i] ? 'a' : ''}`;
    }
    return text;
  };

  const initialPos = ALL_FINGERS.map((finger) => start.prev[finger]);
  const initialPosId = initialPos.map(positionId);
  const initialAge = ALL_FINGERS.map((finger) => Math.min(cap, start.ordinal - start.lastInputOrdinal[finger]));
  const initialAdjacent = ALL_FINGERS.map((finger) => start.last[finger] === start.nextStrokeIndex - 1);
  fold(initialPos, initialPosId, initialAge, initialAdjacent, 0);
  const initial: State = {
    pos: initialPos,
    posId: initialPosId,
    age: initialAge,
    adjacent: initialAdjacent,
    holders: holderSetOf([...start.holders].map(([id, finger]) => [id, FINGER_INDEX.get(finger)!] as const)),
    sfb: 0,
    distance: 0,
    base: 0,
    sequence: null,
    first: [],
  };

  let layer = new Map<string, State>([[signature(initial), initial]]);
  let best: State | undefined;

  for (let t = 0; t < total; t++) {
    const { stroke, input } = flat[t];
    const entry = prepared[t];
    const isFirst = input === from;
    const isLast = t === total - 1;
    const advances = !isLast && flat[t + 1].startsInput;
    const next = new Map<string, State>();
    for (const state of layer.values()) {
      let optionKey = '';
      for (const id of entry.outside) optionKey += `${state.holders.byKey.get(id) ?? -1},`;
      let options = entry.options.get(optionKey);
      if (options === undefined) {
        const holders = new Map<string, Finger>();
        for (const id of entry.outside) {
          const holder = state.holders.byKey.get(id);
          if (holder !== undefined) holders.set(id, ALL_FINGERS[holder]);
        }
        options = buildOptions(geometry, cache, stroke, holders);
        entry.options.set(optionKey, options);
      }

      for (const option of options) {
        const pos = state.pos.slice();
        const posId = state.posId.slice();
        const age = state.age.slice();
        const adjacent = new Array<boolean>(FINGER_COUNT).fill(false);
        let sfb = 0;
        let strokeDistance = 0;
        for (const press of option.presses) {
          const { index, finger, target } = press;
          const previous = state.pos[index];
          const decision = decidePress(
            finger,
            target,
            previous,
            geometry.homes[finger],
            state.adjacent[index],
            state.age[index],
            policy,
          );
          if (state.adjacent[index] && (previous.x !== target.x || previous.y !== target.y)) sfb++;
          strokeDistance += decision.distance;
          pos[index] = target;
          posId[index] = press.targetId;
          age[index] = 0;
          adjacent[index] = true;
        }
        for (const held of option.held) {
          pos[held.index] = held.point;
          posId[held.index] = held.pointId;
          age[held.index] = 0;
          adjacent[held.index] = true;
        }

        let sequence = state.sequence;
        for (const index of option.fingerIndexes) {
          sequence = { finger: index, parent: sequence, depth: (sequence?.depth ?? 0) + 1 };
        }
        if (advances) {
          // 入力が進むと、全指の最後に参加した入力からの入力数が1増える
          for (let i = 0; i < FINGER_COUNT; i++) age[i] = Math.min(cap, age[i] + 1);
        }
        if (!isLast) fold(pos, posId, age, adjacent, t + 1);
        const successor: State = {
          pos,
          posId,
          age,
          adjacent,
          holders: option.holders,
          sfb: state.sfb + sfb,
          distance: state.distance + Math.round(strokeDistance * DISTANCE_SCALE),
          base: state.base + option.base,
          sequence,
          first: isFirst ? [...state.first, ...option.fingerIndexes] : state.first,
        };
        if (isLast) {
          if (best === undefined || better(successor, best)) best = successor;
        } else {
          const key = signature(successor);
          const existing = next.get(key);
          if (existing === undefined || better(successor, existing)) next.set(key, successor);
        }
      }
    }
    layer = next;
  }

  if (best === undefined) throw new Error('指の選び方の候補が空');

  const result: Finger[][] = [];
  let offset = 0;
  for (const stroke of inputs[from].strokes) {
    result.push(best.first.slice(offset, offset + stroke.keys.length).map((index) => ALL_FINGERS[index]));
    offset += stroke.keys.length;
  }
  return { strokes: result };
}
