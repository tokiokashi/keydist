import type { ParticipationRole, Trace } from '#trace/generate.ts';

/**
 * キーの詳細（仕様§11.11）。キーボード図のキーごとに、使われ方を整数の回数で集計する。
 *
 * 集計の単位は「面 × 物理キーid」。面はTraceの `aggregationGroupId` の値で、コンボの面
 * （`COMBO_LAYER_ID`）も1つの面に含める。用語集の「レイヤー」はコンボを含まないので別の語。
 * 面をまたいで物理キーidごとに合算した値も出す。値は1つの対象（配列 × 物理配列 × テキスト × 条件）の
 * Traceから出るので、対象ごとに別の値になる。
 *
 * どの量も、`Press.keys` の1キーを1回として数える。1つのPressが複数のキーを持つ時は、
 * 各キーに1回ずつ数え、距離などを按分しない。割合は表示側で求める。
 */

/** 起点の位置と距離を丸める単位（小数第3位）。 */
const ROUND_FACTOR = 1000;
const round3 = (value: number): number => Math.round(value * ROUND_FACTOR) / ROUND_FACTOR;

/** 押し方の内訳で、役が1つも無い押下を数える値。 */
export const NO_ROLE = 'none';

const ROLE_ORDER: readonly ParticipationRole[] = ['output', 'trigger', 'held-trigger'];

/**
 * 役の組を並べ替えて1つの文字列にする（例: `output`、`output+trigger`）。
 * 役が1つも無ければ `NO_ROLE`。
 */
export function roleSetId(roles: readonly ParticipationRole[]): string {
  const sorted = ROLE_ORDER.filter((role) => roles.includes(role));
  return sorted.length === 0 ? NO_ROLE : sorted.join('+');
}

/** 移動の起点1か所ぶんの回数。 */
export interface KeyOriginCount {
  /** 起点の位置（小数第3位で丸めた値） */
  readonly x: number;
  readonly y: number;
  /**
   * 位置が一致する物理キーのid（Traceに現れたキーのうち、丸めた座標が同じもの。昇順）。
   * 同じ座標に複数のキーがあれば全部を持つ。一致するキーが無ければ空。
   */
  readonly keyIds: readonly string[];
  /** 直前の位置から来た回数 */
  readonly fromPrevious: number;
  /** ホームから来た回数 */
  readonly fromHome: number;
}

/** 1つの対象（面 × 物理キー、または物理キー合算）の詳細。 */
export interface KeyDetail {
  /** 押下数 */
  readonly presses: number;
  /** 押し方（役の組。`roleSetId` の値）→ 回数 */
  readonly roles: ReadonlyMap<string, number>;
  /** 前の文字（直前の入力単位の `inputChar`）→ 回数 */
  readonly previousChars: ReadonlyMap<string, number>;
  /** 先頭の入力単位で、前の文字が無い押下の回数 */
  readonly noPreviousChar: number;
  /** 移動の起点（位置ごと） */
  readonly origins: readonly KeyOriginCount[];
  /** 距離（小数第3位で丸めた値）→ 回数 */
  readonly distances: ReadonlyMap<number, number>;
}

export interface KeyDetails {
  /** 面のid → 物理キーid → 詳細。面はTraceに現れた順 */
  readonly faces: ReadonlyMap<string, ReadonlyMap<string, KeyDetail>>;
  /** 面をまたいで合算した、物理キーid → 詳細 */
  readonly merged: ReadonlyMap<string, KeyDetail>;
}

interface OriginEntry {
  x: number;
  y: number;
  fromPrevious: number;
  fromHome: number;
}

interface Accumulator {
  presses: number;
  roles: Map<string, number>;
  previousChars: Map<string, number>;
  noPreviousChar: number;
  origins: Map<string, OriginEntry>;
  distances: Map<number, number>;
}

const newAccumulator = (): Accumulator => ({
  presses: 0,
  roles: new Map(),
  previousChars: new Map(),
  noPreviousChar: 0,
  origins: new Map(),
  distances: new Map(),
});

const increment = <K>(map: Map<K, number>, key: K): void => {
  map.set(key, (map.get(key) ?? 0) + 1);
};

const pointId = (x: number, y: number): string => `${x},${y}`;

interface RoundedOrigin {
  x: number;
  y: number;
  from: 'previous' | 'home';
}

function accumulate(
  target: Accumulator,
  role: string,
  previousChar: string | undefined,
  origin: RoundedOrigin | undefined,
  distance: number,
): void {
  target.presses++;
  increment(target.roles, role);
  if (previousChar === undefined) target.noPreviousChar++;
  else increment(target.previousChars, previousChar);
  if (origin) {
    const id = pointId(origin.x, origin.y);
    const entry = target.origins.get(id) ?? { x: origin.x, y: origin.y, fromPrevious: 0, fromHome: 0 };
    if (origin.from === 'previous') entry.fromPrevious++;
    else entry.fromHome++;
    target.origins.set(id, entry);
  }
  increment(target.distances, distance);
}

export function computeKeyDetails(trace: Trace): KeyDetails {
  // 起点の位置が物理キーに当たるかの判定に使う、Traceに現れたキーの座標 → キーid
  const keyIdsByPoint = new Map<string, Set<string>>();
  for (const stroke of trace.strokes) {
    for (const press of stroke.presses) {
      for (const key of press.keys) {
        const id = pointId(round3(key.x), round3(key.y));
        const ids = keyIdsByPoint.get(id);
        if (ids) ids.add(key.id);
        else keyIdsByPoint.set(id, new Set([key.id]));
      }
    }
  }

  const faces = new Map<string, Map<string, Accumulator>>();
  const merged = new Map<string, Accumulator>();
  const entryOf = (map: Map<string, Accumulator>, key: string): Accumulator => {
    const existing = map.get(key);
    if (existing) return existing;
    const created = newAccumulator();
    map.set(key, created);
    return created;
  };

  // 入力単位は `inputIndex` が同じStrokeのまとまり。直前の単位の最後のStrokeの `inputChar` が前の文字
  let currentInputIndex: number | undefined;
  let currentInputChar: string | undefined;
  let previousChar: string | undefined;
  for (const stroke of trace.strokes) {
    if (stroke.inputIndex !== currentInputIndex) {
      previousChar = currentInputChar;
      currentInputIndex = stroke.inputIndex;
    }
    currentInputChar = stroke.inputChar;

    let faceMap = faces.get(stroke.aggregationGroupId);
    if (!faceMap) {
      faceMap = new Map();
      faces.set(stroke.aggregationGroupId, faceMap);
    }
    for (const press of stroke.presses) {
      const participation = stroke.participations.find((candidate) => candidate.finger === press.finger);
      const role = roleSetId(participation?.roles ?? []);
      const origin: RoundedOrigin | undefined = press.origin
        ? { x: round3(press.origin.at.x), y: round3(press.origin.at.y), from: press.origin.from }
        : undefined;
      const distance = round3(press.distance);
      for (const key of press.keys) {
        accumulate(entryOf(faceMap, key.id), role, previousChar, origin, distance);
        accumulate(entryOf(merged, key.id), role, previousChar, origin, distance);
      }
    }
  }

  const freeze = (value: Accumulator): KeyDetail => ({
    presses: value.presses,
    roles: value.roles,
    previousChars: value.previousChars,
    noPreviousChar: value.noPreviousChar,
    origins: [...value.origins.values()].map((entry) => ({
      ...entry,
      keyIds: [...(keyIdsByPoint.get(pointId(entry.x, entry.y)) ?? [])].sort(),
    })),
    distances: value.distances,
  });
  const freezeAll = (map: Map<string, Accumulator>): Map<string, KeyDetail> =>
    new Map([...map].map(([id, value]) => [id, freeze(value)]));

  return {
    faces: new Map([...faces].map(([face, map]) => [face, freezeAll(map)])),
    merged: freezeAll(merged),
  };
}
