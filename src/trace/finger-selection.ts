import { ALL_FINGERS, fingerDist, isThumb, type Finger, type Geometry, type Key, type Point } from '#input/shapes/geometry.ts';

/**
 * 担当する指が2本以上のキーをどの指で打つかの選択（仕様 §9.1）。
 *
 * 入力を先頭から1つずつ進め、今の入力と、開始から今の入力の終わりを引いた値が`N`以下の入力の打鍵について、
 * 同指連続回数・指の左右の入れ替わりの数・同じ指が近くに戻る打鍵の数・基本の指で打ったキー数・総移動距離・
 * 指の固定の順の順に最小になる指の並びを動的計画法で厳密に求める。そのうち今の入力の打鍵の指だけを返す。
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
  /** 入力が覆うテキストの最初の文字の位置（仕様 §7 R3） */
  readonly start: number;
  /** 入力が覆うテキストの最後の文字の位置。その文字を含む */
  readonly end: number;
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

/** 横位置が同じとみなす差。キーの中心の座標の和・差で出る浮動小数点の誤差を吸収する */
const SAME_X = 1e-9;

/**
 * 指ごとの、同じ手で並びが1つ隣の親指以外の指の番号。親指は横の並びを持たないので、持たない（仕様 §9.1）。
 * `ALL_FINGERS`の並びは、左手の小指から右手の小指へ、左から右に向かって横の座標が増える順
 */
const NEIGHBORS: readonly (readonly number[])[] = ALL_FINGERS.map((finger, index) => {
  if (isThumb(finger)) return [];
  return [index - 1, index + 1].filter((other) => {
    const neighbor = ALL_FINGERS[other];
    return neighbor !== undefined && !isThumb(neighbor) && neighbor[0] === finger[0];
  });
});

/** 1本の指が押す（または押さえる）キーの目標位置。複数なら重心（仕様 §4.2・§3.1） */
export function targetOf(finger: Finger, keys: readonly Key[]): Point {
  const offThumbKey = isThumb(finger) && keys.some((key) => !isThumbKey(key));
  const base =
    keys.length === 1
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
  /** 指が最後に参加した入力の終わりの位置 */
  readonly lastInputEnd: Readonly<Record<Finger, number>>;
  /** 次の打鍵の通し番号 */
  readonly nextStrokeIndex: number;
  /** 今の入力の開始の位置 */
  readonly position: number;
  /** 押さえ続けているキーを押した指 */
  readonly holders: ReadonlyMap<string, Finger>;
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
export function strokeFingerChoices(stroke: PlannedStroke, holders: ReadonlyMap<string, Finger>): Finger[][] {
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
/** 番号ごとの座標。同じ番号の点は座標も親指キー以外の印も同じなので、最初に見た点で代表させる */
const registry: Point[] = [];
const pointX: number[] = [];
const pointY: number[] = [];
function positionId(point: Point): number {
  let id = pointIds.get(point);
  if (id === undefined) {
    const key = `${point.x},${point.y},${point.offThumbKey === true ? 1 : 0}`;
    id = coordinateIds.get(key);
    if (id === undefined) {
      id = coordinateIds.size;
      coordinateIds.set(key, id);
      registry.push(point);
      pointX.push(point.x);
      pointY.push(point.y);
    }
    pointIds.set(point, id);
  }
  return id;
}

/** 押さえ続けているキー → 押した指の組。同じ内容は同じ番号を持つ */
interface HolderSet {
  readonly byKey: ReadonlyMap<string, number>;
}
const holderSets: HolderSet[] = [];
const holderIds = new Map<string, number>();

function holderIdOf(entries: readonly (readonly [string, number])[]): number {
  const sorted = entries.slice().sort((a, b) => (a[0] < b[0] ? -1 : 1));
  const key = sorted.map(([id, finger]) => `${id}:${finger};`).join('');
  let id = holderIds.get(key);
  if (id === undefined) {
    id = holderSets.length;
    holderSets.push({ byKey: new Map(sorted) });
    holderIds.set(key, id);
  }
  return id;
}

/** 1回の押下。指の選び方1通りの中の、1本の指が押すキー */
interface PressOption {
  readonly finger: Finger;
  readonly index: number;
  readonly target: Point;
  readonly targetId: number;
  readonly x: number;
  readonly y: number;
  /** その指のホームから目標位置までの距離 */
  readonly dHome: number;
  /** 目標位置がその指のホームと同じ座標か */
  readonly onHome: boolean;
}

/** 1つの打鍵での、指の選び方1通り分の結果。状態に依らず、押さえ続けている指の組だけで決まる */
interface StrokeOption {
  readonly fingerIndexes: readonly number[];
  /** 指ごとの押下。指は最初に出たキーの順 */
  readonly presses: readonly PressOption[];
  /** 押下しないが押さえ続けている指の位置 */
  readonly held: readonly { readonly index: number; readonly pointId: number }[];
  readonly holdersId: number;
  /** 基本の指で打ったキー数 */
  readonly base: number;
}

interface PreparedStroke {
  /** この打鍵のキーに含まれず、押さえ続けているキーのid。指の選び方は、この押し手だけに依存する */
  readonly outside: readonly string[];
  /** 押さえ続けているキーが無い時の選び方 */
  single: readonly StrokeOption[] | undefined;
  /** 押さえ続けている指の組（番号）ごとの選び方 */
  readonly options: Map<number, readonly StrokeOption[]>;
  /** 状態を読む可能性のある指（候補の指と、候補が全て除かれた時の基本の指） */
  readonly readFingers: readonly number[];
  /** 位置とかな数だけを読む可能性のある指（読む指の隣の指。指の左右の入れ替わりの判定が読む） */
  readonly neighborFingers: readonly number[];
}

interface GeometryCache {
  readonly targets: Map<string, Point>;
  readonly strokes: WeakMap<PlannedStroke, PreparedStroke>;
  /** 指ごとのホームの位置の番号 */
  readonly homeIds: readonly number[];
}

const geometryCaches = new WeakMap<Geometry, GeometryCache>();

function cacheOf(geometry: Geometry): GeometryCache {
  let cache = geometryCaches.get(geometry);
  if (cache === undefined) {
    cache = {
      targets: new Map(),
      strokes: new WeakMap(),
      homeIds: ALL_FINGERS.map((finger) => positionId(geometry.homes[finger])),
    };
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
  const neighbors = new Set<number>();
  for (const f of read) for (const other of NEIGHBORS[f]) neighbors.add(other);
  return {
    outside: [...new Set(stroke.heldKeys.filter((id) => !inKeys.has(id)))],
    single: undefined,
    options: new Map(),
    readFingers: [...read],
    neighborFingers: [...neighbors],
  };
}

function buildOptions(geometry: Geometry, cache: GeometryCache, stroke: PlannedStroke, holders: ReadonlyMap<string, Finger>): StrokeOption[] {
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
    const presses = [...groups].map(([finger, keys]): PressOption => {
      const point = target(finger, keys);
      const home = geometry.homes[finger];
      return {
        finger,
        index: FINGER_INDEX.get(finger)!,
        target: point,
        targetId: positionId(point),
        x: point.x,
        y: point.y,
        dHome: fingerDist(finger, home, point),
        onHome: point.x === home.x && point.y === home.y,
      };
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
      .map(([finger, keys]) => ({
        index: FINGER_INDEX.get(finger)!,
        pointId: positionId(target(finger, keys)),
      }));
    return {
      fingerIndexes: combo.map((finger) => FINGER_INDEX.get(finger)!),
      presses,
      held,
      holdersId: holderIdOf(nextHolders),
      base: combo.reduce((count, finger, slot) => count + (finger === stroke.keys[slot].finger ? 1 : 0), 0),
    };
  });
}

// ---- 探索の作業領域 ----
// 状態の数が多いので、状態を1つずつオブジェクトにせず、層ごとの型付き配列に詰める。
// 呼び出しをまたいで使い回すので、`selectFingers`は同時に2回動かさない（同期の関数なので起きない）。

/** 指の並びの節。根から葉へ向かって、打鍵の指を指の固定の順の番号で並べる */
let seqFinger = new Uint8Array(4096);
let seqParent = new Int32Array(4096);
let seqTop = 0;

function pushSequence(parent: number, finger: number): number {
  if (seqTop === seqFinger.length) {
    const finger2 = new Uint8Array(seqTop * 2);
    finger2.set(seqFinger);
    seqFinger = finger2;
    const parent2 = new Int32Array(seqTop * 2);
    parent2.set(seqParent);
    seqParent = parent2;
  }
  seqFinger[seqTop] = finger;
  seqParent[seqTop] = parent;
  return seqTop++;
}

/**
 * aがbより後の指の固定の順か。同じ層の2つの並びは長さが等しいので、後ろから比べ、
 * 共通の祖先に着くまでに最後に見つかった違い（先頭に最も近い違い）で決める。
 */
function sequenceCompare(a: number, b: number): number {
  let result = 0;
  while (a !== b && a >= 0 && b >= 0) {
    const fa = seqFinger[a];
    const fb = seqFinger[b];
    if (fa !== fb) result = fa < fb ? -1 : 1;
    a = seqParent[a];
    b = seqParent[b];
  }
  return result;
}

/** 層。状態ごとに、指の位置・最後に参加してからのかな数・直前の打鍵への参加と、目的の値を持つ */
class Layer {
  count = 0;
  capacity = 0;
  pos = new Int32Array(0);
  age = new Int32Array(0);
  adj = new Uint8Array(0);
  holders = new Int32Array(0);
  sfb = new Int32Array(0);
  swaps = new Int32Array(0);
  returns = new Int32Array(0);
  base = new Int32Array(0);
  distance = new Float64Array(0);
  sequence = new Int32Array(0);
  hash = new Int32Array(0);
  /** 状態を作った選び方（指を1手ずつ選ぶ探索だけが読む） */
  via: (StrokeOption | undefined)[] = [];
  table = new Int32Array(16);
  mask = 15;

  constructor() {
    this.ensure(64);
  }

  private ensure(capacity: number): void {
    if (capacity <= this.capacity) return;
    const grow = <T extends Int32Array | Uint8Array | Float64Array>(old: T, size: number, ctor: new (n: number) => T): T => {
      const next = new ctor(size);
      next.set(old);
      return next;
    };
    this.pos = grow(this.pos, capacity * FINGER_COUNT, Int32Array);
    this.age = grow(this.age, capacity * FINGER_COUNT, Int32Array);
    this.adj = grow(this.adj, capacity * FINGER_COUNT, Uint8Array);
    this.holders = grow(this.holders, capacity, Int32Array);
    this.sfb = grow(this.sfb, capacity, Int32Array);
    this.swaps = grow(this.swaps, capacity, Int32Array);
    this.returns = grow(this.returns, capacity, Int32Array);
    this.base = grow(this.base, capacity, Int32Array);
    this.distance = grow(this.distance, capacity, Float64Array);
    this.sequence = grow(this.sequence, capacity, Int32Array);
    this.hash = grow(this.hash, capacity, Int32Array);
    this.capacity = capacity;
  }

  /** 空にする。`expected`は入る状態の数の見込み */
  reset(expected: number): void {
    this.count = 0;
    let size = 16;
    while (size < expected * 2) size *= 2;
    if (this.table.length < size) this.table = new Int32Array(size);
    this.mask = size - 1;
    this.table.fill(-1, 0, size);
  }

  private rehash(): void {
    const size = (this.mask + 1) * 2;
    if (this.table.length < size) this.table = new Int32Array(size);
    this.mask = size - 1;
    this.table.fill(-1, 0, size);
    for (let i = 0; i < this.count; i++) {
      let slot = this.hash[i] & this.mask;
      while (this.table[slot] >= 0) slot = (slot + 1) & this.mask;
      this.table[slot] = i;
    }
  }

  /** 状態を末尾に足す。`slot`は探して見つかった空きの位置で、直前に`prepare`を呼んでいる */
  append(hash: number, slot: number): number {
    if (this.count === this.capacity) this.ensure(this.capacity * 2);
    const index = this.count++;
    this.hash[index] = hash;
    this.table[slot] = index;
    return index;
  }

  /** 次の`append`の前に呼び、表に余裕を作る。`find`の返す位置を`append`まで有効に保つため */
  prepare(): void {
    if ((this.count + 1) * 2 > this.mask + 1) this.rehash();
  }
}

const layerA = new Layer();
const layerB = new Layer();
const scratchPos = new Int32Array(FINGER_COUNT);
const scratchAge = new Int32Array(FINGER_COUNT);
const scratchAdj = new Uint8Array(FINGER_COUNT);

/** 指ごとに、前の呼び出しで見た位置の点とその番号 */
const lastPoints: (Point | undefined)[] = new Array(FINGER_COUNT).fill(undefined);
const lastPointIds: number[] = new Array(FINGER_COUNT).fill(0);

/** 前に解いた結果の指の選び方。同じ打鍵を含む次の範囲で、探索の上限を作る時に使う */
const previousChoice = new WeakMap<PlannedStroke, readonly number[]>();

/** 比べる順の先頭の3つ（同指連続・指の左右の入れ替わり・同じ指が近くに戻る） */
interface Bound {
  readonly sfb: number;
  readonly swaps: number;
  readonly returns: number;
}

interface SearchContext {
  readonly policy: FingerSelectionPolicy;
  readonly geometry: Geometry;
  readonly cache: GeometryCache;
  readonly cap: number;
  readonly total: number;
  readonly flat: readonly { readonly stroke: PlannedStroke; readonly input: number }[];
  readonly prepared: readonly PreparedStroke[];
  readonly inputs: readonly PlannedInput[];
  /** 打鍵ごとの、その入力の開始の位置。末尾に1つ余分に持つ */
  readonly startAt: Float64Array;
  readonly nextRead: Int32Array;
  readonly nextReadAny: Int32Array;
  readonly homeIds: readonly number[];
  readonly initialPos: Int32Array;
  readonly initialAge: Int32Array;
  readonly initialAdj: Uint8Array;
  readonly initialHolders: number;
}

interface SearchResult {
  readonly bound: Bound;
  /** 範囲の全打鍵の指（打鍵の順、打鍵の中はキーの順） */
  readonly fingers: readonly number[];
}

/**
 * 打鍵`t`の前の状態のうち、`t`以降が読まない部分を区別しない値にそろえる。
 * `scratch*`を書き換える。
 */
function fold(c: SearchContext, t: number): void {
  const { nextRead, nextReadAny, startAt, cap, homeIds } = c;
  for (let f = 0; f < FINGER_COUNT; f++) {
    const u = nextRead[t * FINGER_COUNT + f];
    const w = nextReadAny[t * FINGER_COUNT + f];
    let reset = w < 0;
    if (!reset && !(u === t && scratchAdj[f] !== 0)) {
      scratchAdj[f] = 0;
      reset = Math.min(cap, scratchAge[f] + startAt[w] - startAt[t]) >= cap;
    }
    if (reset) {
      scratchPos[f] = homeIds[f];
      scratchAge[f] = cap;
      scratchAdj[f] = 0;
    }
  }
}

/** 候補が層の状態`j`より良いかを返す。負なら候補が良く、0なら目的の値が同じ */
function compareCost(layer: Layer, j: number, sfb: number, swaps: number, returns: number, base: number, distance: number): number {
  if (sfb !== layer.sfb[j]) return sfb < layer.sfb[j] ? -1 : 1;
  if (swaps !== layer.swaps[j]) return swaps < layer.swaps[j] ? -1 : 1;
  if (returns !== layer.returns[j]) return returns < layer.returns[j] ? -1 : 1;
  if (base !== layer.base[j]) return base > layer.base[j] ? -1 : 1;
  if (distance !== layer.distance[j]) return distance < layer.distance[j] ? -1 : 1;
  return 0;
}

/**
 * 範囲の全打鍵の指を厳密に求める。比べる順は仕様 §9.1。
 *
 * - `bound`が無ければ、状態を全て残す
 * - `bound`があれば、同指連続・指の左右の入れ替わり・同じ指が近くに戻る打鍵の数が、上限より大きくなった状態を捨てる。
 *   この3つは打鍵を進めても減らず、比べる順の先頭の3つなので、上限より大きくなった状態は最小にならない
 * - `guide`なら、層ごとに状態を1つだけ残す。前に解いた結果と同じ選び方があればそれを、無ければその時点で最も良い選び方を採る。
 *   厳密な最小ではないが、範囲の全打鍵に通じる1通りの指の並びなので、その3つの数を上限に使える
 */
function search(c: SearchContext, bound: Bound | null, guide: boolean): SearchResult {
  const { policy, geometry, cache, cap, total, flat, prepared, inputs, startAt } = c;
  const windowSize = policy.windowSize;
  const sfbHomeCost = policy.sfbHomeCost;
  const bSfb = bound?.sfb ?? 0;
  const bSwaps = bound?.swaps ?? 0;
  const bReturns = bound?.returns ?? 0;
  const bounded = bound !== null;
  const F = FINGER_COUNT;

  seqTop = 0;
  let cur = layerA;
  let nxt = layerB;
  cur.reset(1);
  cur.count = 1;
  cur.pos.set(c.initialPos);
  cur.age.set(c.initialAge);
  cur.adj.set(c.initialAdj);
  cur.holders[0] = c.initialHolders;
  cur.sfb[0] = 0;
  cur.swaps[0] = 0;
  cur.returns[0] = 0;
  cur.base[0] = 0;
  cur.distance[0] = 0;
  cur.sequence[0] = -1;

  let bestFound = false;
  let bestSfb = 0;
  let bestSwaps = 0;
  let bestReturns = 0;
  let bestBase = 0;
  let bestDistance = 0;
  let bestSequence = -1;

  for (let t = 0; t < total; t++) {
    const { stroke, input } = flat[t];
    const entry = prepared[t];
    // 今の入力に参加した指の値。開始から終わりを引くので、複数のかなを覆う入力では負になる
    const joined = inputs[input].start - inputs[input].end;
    const isLast = t === total - 1;
    const advances = !isLast && flat[t + 1].input !== input;
    const step = advances ? startAt[t + 1] - inputs[input].start : 0;
    nxt.reset(cur.count * 2);
    const keyCount = stroke.keys.length;

    for (let i = 0; i < cur.count; i++) {
      const sBase = i * F;
      let options: readonly StrokeOption[];
      if (entry.outside.length === 0) {
        options = entry.single ??= buildOptions(geometry, cache, stroke, new Map());
      } else {
        const holdersId = cur.holders[i];
        let found = entry.options.get(holdersId);
        if (found === undefined) {
          const holders = new Map<string, Finger>();
          for (const id of entry.outside) {
            const holder = holderSets[holdersId].byKey.get(id);
            if (holder !== undefined) holders.set(id, ALL_FINGERS[holder]);
          }
          found = buildOptions(geometry, cache, stroke, holders);
          entry.options.set(holdersId, found);
        }
        options = found;
      }

      for (let oi = 0; oi < options.length; oi++) {
        const option = options[oi];
        const presses = option.presses;

        // 同指連続・指の左右の入れ替わり・同じ指が近くに戻る打鍵
        let sfb = 0;
        let swapped = false;
        let returned = false;
        for (let p = 0; p < presses.length; p++) {
          const press = presses[p];
          const index = press.index;
          const previousId = cur.pos[sBase + index];
          const moved = pointX[previousId] !== press.x || pointY[previousId] !== press.y;
          const adjacent = cur.adj[sBase + index] !== 0;
          // 同じ指が、同じかなかすぐ前のかなで別のキーを打っていた
          if (!adjacent && cur.age[sBase + index] <= 1 && moved) returned = true;
          // 隣の指が、同じかなかすぐ前のかなで打ったキーに対して、左右が逆か同じ横位置になる
          const neighbors = NEIGHBORS[index];
          for (let k = 0; k < neighbors.length; k++) {
            const other = neighbors[k];
            if (cur.age[sBase + other] <= 1 && (other - index) * (press.x - pointX[cur.pos[sBase + other]]) > -SAME_X) swapped = true;
          }
          if (adjacent && moved) sfb++;
        }
        const nSfb = cur.sfb[i] + sfb;
        const nSwaps = cur.swaps[i] + (swapped ? 1 : 0);
        const nReturns = cur.returns[i] + (returned ? 1 : 0);
        if (bounded && (nSfb > bSfb || (nSfb === bSfb && (nSwaps > bSwaps || (nSwaps === bSwaps && nReturns > bReturns))))) {
          continue;
        }

        let strokeDistance = 0;
        for (let p = 0; p < presses.length; p++) {
          const press = presses[p];
          const index = press.index;
          const age = cur.age[sBase + index];
          if (cur.adj[sBase + index] !== 0) {
            strokeDistance += !sfbHomeCost && press.onHome ? 0 : fingerDist(press.finger, registry[cur.pos[sBase + index]], press.target);
          } else if (age <= windowSize) {
            const dStay = fingerDist(press.finger, registry[cur.pos[sBase + index]], press.target);
            strokeDistance += dStay <= press.dHome ? dStay : press.dHome;
          } else {
            strokeDistance += press.dHome;
          }
        }
        const nBase = cur.base[i] + option.base;
        const nDistance = cur.distance[i] + Math.round(strokeDistance * DISTANCE_SCALE);

        if (isLast) {
          // 最後の打鍵は、状態をまとめず最も良い並びだけを残す
          let wins = !bestFound;
          let tie = false;
          if (!wins) {
            if (nSfb !== bestSfb) wins = nSfb < bestSfb;
            else if (nSwaps !== bestSwaps) wins = nSwaps < bestSwaps;
            else if (nReturns !== bestReturns) wins = nReturns < bestReturns;
            else if (nBase !== bestBase) wins = nBase > bestBase;
            else if (nDistance !== bestDistance) wins = nDistance < bestDistance;
            else tie = true;
          }
          const mark = seqTop;
          if (wins || tie) {
            let leaf = cur.sequence[i];
            for (let k = 0; k < keyCount; k++) leaf = pushSequence(leaf, option.fingerIndexes[k]);
            if (tie) wins = sequenceCompare(leaf, bestSequence) < 0;
            if (wins) {
              bestFound = true;
              bestSfb = nSfb;
              bestSwaps = nSwaps;
              bestReturns = nReturns;
              bestBase = nBase;
              bestDistance = nDistance;
              bestSequence = leaf;
            } else {
              seqTop = mark;
            }
          }
          continue;
        }

        // 次の状態。押した指と押さえ続けている指を書き換え、読まない部分をそろえる
        for (let f = 0; f < F; f++) {
          scratchPos[f] = cur.pos[sBase + f];
          scratchAge[f] = cur.age[sBase + f];
          scratchAdj[f] = 0;
        }
        for (let p = 0; p < presses.length; p++) {
          const press = presses[p];
          scratchPos[press.index] = press.targetId;
          scratchAge[press.index] = joined;
          scratchAdj[press.index] = 1;
        }
        for (let h = 0; h < option.held.length; h++) {
          const held = option.held[h];
          scratchPos[held.index] = held.pointId;
          scratchAge[held.index] = joined;
          scratchAdj[held.index] = 1;
        }
        if (advances) {
          // 入力が進むと、全指の最後に参加した入力の終わりからのかな数が、開始の差だけ増える。
          // 打鍵の無い入力（読み飛ばした文字だけの区間を含む）の分も、開始の差に入っている
          for (let f = 0; f < F; f++) scratchAge[f] = Math.min(cap, scratchAge[f] + step);
        }
        fold(c, t + 1);

        let hash = option.holdersId | 0;
        for (let f = 0; f < F; f++) {
          hash = Math.imul(hash ^ scratchPos[f], 0x01000193);
          hash = Math.imul(hash ^ ((scratchAge[f] << 1) | scratchAdj[f]), 0x01000193);
        }
        hash ^= hash >>> 15;

        nxt.prepare();
        let slot = hash & nxt.mask;
        let existing = -1;
        while (true) {
          const j = nxt.table[slot];
          if (j < 0) break;
          if (nxt.hash[j] === hash && nxt.holders[j] === option.holdersId) {
            const jBase = j * F;
            let same = true;
            for (let f = 0; f < F; f++) {
              if (nxt.pos[jBase + f] !== scratchPos[f] || nxt.age[jBase + f] !== scratchAge[f] || nxt.adj[jBase + f] !== scratchAdj[f]) {
                same = false;
                break;
              }
            }
            if (same) {
              existing = j;
              break;
            }
          }
          slot = (slot + 1) & nxt.mask;
        }

        let target = existing;
        const mark = seqTop;
        let leaf = -1;
        if (existing < 0) {
          target = nxt.append(hash, slot);
          const tBase = target * F;
          for (let f = 0; f < F; f++) {
            nxt.pos[tBase + f] = scratchPos[f];
            nxt.age[tBase + f] = scratchAge[f];
            nxt.adj[tBase + f] = scratchAdj[f];
          }
          nxt.holders[target] = option.holdersId;
        } else {
          const order = compareCost(nxt, existing, nSfb, nSwaps, nReturns, nBase, nDistance);
          if (order > 0) continue;
          if (order === 0) {
            leaf = cur.sequence[i];
            for (let k = 0; k < keyCount; k++) leaf = pushSequence(leaf, option.fingerIndexes[k]);
            if (sequenceCompare(leaf, nxt.sequence[existing]) >= 0) {
              seqTop = mark;
              continue;
            }
          }
        }
        if (leaf < 0) {
          leaf = cur.sequence[i];
          for (let k = 0; k < keyCount; k++) leaf = pushSequence(leaf, option.fingerIndexes[k]);
        }
        nxt.sfb[target] = nSfb;
        nxt.swaps[target] = nSwaps;
        nxt.returns[target] = nReturns;
        nxt.base[target] = nBase;
        nxt.distance[target] = nDistance;
        nxt.sequence[target] = leaf;
        if (guide) nxt.via[target] = option;
      }
    }

    if (isLast) break;
    if (guide) keepOne(nxt, previousChoice.get(stroke));
    const swap = cur;
    cur = nxt;
    nxt = swap;
  }

  if (!bestFound) throw new Error('指の選び方の候補が空');
  const fingers: number[] = [];
  for (let node = bestSequence; node >= 0; node = seqParent[node]) fingers.push(seqFinger[node]);
  fingers.reverse();
  return { bound: { sfb: bestSfb, swaps: bestSwaps, returns: bestReturns }, fingers };
}

/** 層の状態を1つだけ残す。`preferred`と同じ選び方で作った状態があればそれを、無ければ最も良い状態を残す */
function keepOne(layer: Layer, preferred: readonly number[] | undefined): void {
  const F = FINGER_COUNT;
  let chosen = -1;
  if (preferred !== undefined) {
    for (let j = 0; j < layer.count && chosen < 0; j++) {
      const fingers = layer.via[j]!.fingerIndexes;
      if (fingers.length !== preferred.length) continue;
      let same = true;
      for (let k = 0; k < fingers.length; k++) {
        if (fingers[k] !== preferred[k]) {
          same = false;
          break;
        }
      }
      if (same) chosen = j;
    }
  }
  if (chosen < 0) {
    chosen = 0;
    for (let j = 1; j < layer.count; j++) {
      const order = compareCost(layer, chosen, layer.sfb[j], layer.swaps[j], layer.returns[j], layer.base[j], layer.distance[j]);
      if (order < 0 || (order === 0 && sequenceCompare(layer.sequence[j], layer.sequence[chosen]) < 0)) chosen = j;
    }
  }
  if (chosen !== 0) {
    for (let f = 0; f < F; f++) {
      layer.pos[f] = layer.pos[chosen * F + f];
      layer.age[f] = layer.age[chosen * F + f];
      layer.adj[f] = layer.adj[chosen * F + f];
    }
    layer.holders[0] = layer.holders[chosen];
    layer.sfb[0] = layer.sfb[chosen];
    layer.swaps[0] = layer.swaps[chosen];
    layer.returns[0] = layer.returns[chosen];
    layer.base[0] = layer.base[chosen];
    layer.distance[0] = layer.distance[chosen];
    layer.sequence[0] = layer.sequence[chosen];
  }
  layer.count = 1;
}

/**
 * `inputs[from]`の打鍵の指を選ぶ。範囲は`inputs[from]`と、開始から`inputs[from]`の終わりを引いた値が`windowSize`以下の入力。
 *
 * 打鍵を1つ進めるたびに、状態のうち後の打鍵が読まない部分は区別せず、同じ状態として扱う。
 * 区別しなくても、後の打鍵の距離・同指連続は変わらないので、求める最小は変わらない。
 * - その指が範囲の最後まで打つ候補に入らない: 位置・かな数・直前の打鍵への参加を持たない
 * - 次に打つ候補に入るのが後の打鍵: 直前の打鍵への参加は持たない
 * - 次に読む時点で最後の参加の終わりから`max(N, 1)`かなを超える: 距離の計算も、指の左右の入れ替わりも、
 *   同じ指が近くに戻る打鍵も、その指の位置を読まないので、位置を持たない
 *
 * 状態を全て残すと数が膨らむので、まず層ごとに1つだけ残して範囲の全打鍵に通じる指の並びを1通り作り、
 * その同指連続・指の左右の入れ替わり・同じ指が近くに戻る打鍵の数を上限にして厳密に解く。
 * 上限より多い状態は最小にならないので、求める最小は変わらない。
 */
export function selectFingers(
  geometry: Geometry,
  policy: FingerSelectionPolicy,
  start: FingerSelectionStart,
  inputs: readonly PlannedInput[],
  from: number,
): SelectedFingers {
  // 距離の計算は`ΔI ≤ N`の指の位置を読み、指の左右の入れ替わりと同じ指が近くに戻る打鍵は`ΔI ≤ 1`の指の位置を読む
  const cap = Math.max(policy.windowSize, 1) + 1;
  let last = from;
  while (last + 1 < inputs.length && inputs[last + 1].start - inputs[from].end <= policy.windowSize) last++;
  const cache = cacheOf(geometry);
  const homeIds = cache.homeIds;

  // 範囲の打鍵を通しで並べる
  const flat: { stroke: PlannedStroke; input: number }[] = [];
  for (let inputIndex = from; inputIndex <= last; inputIndex++) {
    inputs[inputIndex].strokes.forEach((stroke) => {
      flat.push({ stroke, input: inputIndex });
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
  const startAt = new Float64Array(total + 1);
  for (let t = 0; t < total; t++) startAt[t] = inputs[flat[t].input].start;
  // nextRead[t * 指数 + f]: 打鍵t以降で、指fが最初に候補に入る打鍵。無ければ-1
  // nextReadAny: 候補に入る隣の指の位置を読む打鍵も含めた、最初の打鍵
  const nextRead = new Int32Array((total + 1) * FINGER_COUNT).fill(-1);
  const nextReadAny = new Int32Array((total + 1) * FINGER_COUNT).fill(-1);
  for (let t = total - 1; t >= 0; t--) {
    for (let f = 0; f < FINGER_COUNT; f++) {
      nextRead[t * FINGER_COUNT + f] = nextRead[(t + 1) * FINGER_COUNT + f];
      nextReadAny[t * FINGER_COUNT + f] = nextReadAny[(t + 1) * FINGER_COUNT + f];
    }
    for (const f of prepared[t].readFingers) {
      nextRead[t * FINGER_COUNT + f] = t;
      nextReadAny[t * FINGER_COUNT + f] = t;
    }
    for (const f of prepared[t].neighborFingers) nextReadAny[t * FINGER_COUNT + f] = t;
  }

  const initialPos = new Int32Array(FINGER_COUNT);
  const initialAge = new Int32Array(FINGER_COUNT);
  const initialAdj = new Uint8Array(FINGER_COUNT);
  for (let f = 0; f < FINGER_COUNT; f++) {
    const finger = ALL_FINGERS[f];
    const point = start.prev[finger];
    // 指の位置は押した指の分だけが前の呼び出しから変わるので、同じ点なら番号を引き直さない
    if (lastPoints[f] !== point) {
      lastPoints[f] = point;
      lastPointIds[f] = positionId(point);
    }
    initialPos[f] = lastPointIds[f];
    initialAge[f] = Math.min(cap, start.position - start.lastInputEnd[finger]);
    initialAdj[f] = start.last[finger] === start.nextStrokeIndex - 1 ? 1 : 0;
  }
  const initialHolders = holderIdOf([...start.holders].map(([id, finger]) => [id, FINGER_INDEX.get(finger)!] as const));
  const context: SearchContext = {
    policy,
    geometry,
    cache,
    cap,
    total,
    flat,
    prepared,
    inputs,
    startAt,
    nextRead,
    nextReadAny,
    homeIds,
    initialPos,
    initialAge,
    initialAdj,
    initialHolders,
  };
  scratchPos.set(initialPos);
  scratchAge.set(initialAge);
  scratchAdj.set(initialAdj);
  fold(context, 0);
  initialPos.set(scratchPos);
  initialAge.set(scratchAge);
  initialAdj.set(scratchAdj);

  const guided = search(context, null, true);
  const exact = search(context, guided.bound, false);

  let offset = 0;
  for (const { stroke } of flat) {
    previousChoice.set(stroke, exact.fingers.slice(offset, offset + stroke.keys.length));
    offset += stroke.keys.length;
  }

  const result: Finger[][] = [];
  offset = 0;
  for (const stroke of inputs[from].strokes) {
    result.push(exact.fingers.slice(offset, offset + stroke.keys.length).map((index) => ALL_FINGERS[index]));
    offset += stroke.keys.length;
  }
  return { strokes: result };
}
