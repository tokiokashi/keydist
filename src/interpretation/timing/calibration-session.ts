import {
  assignmentWithHomeKeys,
  buildGeometry,
  resolveKeyId,
  type FingerAssignment,
  type Finger,
  type Geometry,
  type PhysicalShape,
} from '#input/shapes/geometry.ts';
import type { Layout } from '#input/layouts/types.ts';
import {
  actionsPerSecondFromIntervals,
  calibrationActionPair,
  calibrationDirectedSameHandPairs,
  calibrationEligibleKeyIds,
  calibrationKeyMatches,
  calibrationKeyPairs,
  calibrationSameHandPairs,
  fallbackFingerSpeedFromSamples,
  fingerSpeedFromSamples,
  playbackCalibrationProblem,
  sameHandDirectedFingerPairKey,
  sameHandFingerPairKey,
  CALIBRATION_ACTION_SAMPLES,
  CALIBRATION_FINGER_SAMPLES,
  CALIBRATION_SAME_HAND_SAMPLES,
  type FingerSpeedSample,
  type HandDirection,
  type PlaybackCalibration,
} from './calibration.ts';

/**
 * 個人速度の測定の進行（測るキーの組・打鍵の照合・測った値の保存値への反映）。
 * 時刻とキーの押下は呼び出し側が渡すので、描画にもタイマーにも依存しない。
 * 保存値の形と範囲は `calibration.ts`、測定の規則は `spec/playback-timing.md` §6。
 */

/** 測る1項目。保存値の1つの値に対応する。 */
export type CalibrationItem =
  | { readonly kind: 'actions' }
  | { readonly kind: 'direction'; readonly direction: HandDirection }
  | { readonly kind: 'finger'; readonly finger: Finger }
  /** 同じ手の別指の順序なしの組。`pair`は`LM:LI`の形。 */
  | { readonly kind: 'same-hand-pair'; readonly pair: string }
  /** 同じ手の別指の方向つきの組。`pair`は`LM>LI`の形。 */
  | { readonly kind: 'directed-pair'; readonly pair: string };

/** 項目の識別子。画面の行や`Map`のキーに使う。 */
export function calibrationItemId(item: CalibrationItem): string {
  switch (item.kind) {
    case 'actions': return 'actions';
    case 'direction': return `direction:${item.direction}`;
    case 'finger': return `finger:${item.finger}`;
    case 'same-hand-pair': return `same-hand-pair:${item.pair}`;
    case 'directed-pair': return `directed-pair:${item.pair}`;
  }
}

/** 1項目を測るために打つキーと、必要な間隔の数。 */
export interface CalibrationTask {
  readonly item: CalibrationItem;
  /** 打つ2つのキー。`keys[0]`から打ち始め、2つを交互に打つ。 */
  readonly keys: readonly [string, string];
  /** 数える間隔の数。 */
  readonly required: number;
  /** `keys[0]`→`keys[1]`の片道だけを数える（戻りは手を戻す間隔として捨てる）。 */
  readonly oneWay: boolean;
  /** 指の移動速度を測る項目の、2つのキーの距離[u]。 */
  readonly distance?: number;
}

/** 測定の範囲。 */
export type CalibrationScope =
  /** 通常速度・各指の移動速度・同手・別指の全組合せ。 */
  | 'normal'
  /** 異手の方向別・同手・別指の方向別の全組合せ。 */
  | 'directional'
  /** 1項目の測り直し。 */
  | 'item';

/** 選んだ配列・物理配列・指の割り当てで測れる項目の一覧。 */
export interface CalibrationPlan {
  /** 通常速度・移動速度の測定。測るキーを作れない時は無い。 */
  readonly normal: readonly CalibrationTask[] | undefined;
  /** 方向別の測定。測るキーを作れない時は無い。 */
  readonly directional: readonly CalibrationTask[] | undefined;
  /** 項目ごとの測定。キーは`calibrationItemId`。 */
  readonly byItem: ReadonlyMap<string, CalibrationTask>;
}

/** 測定に使うキーの土台。選んだ配列・物理配列・指の割り当てから決まる。 */
export interface CalibrationBasis {
  readonly geometry: Geometry;
  /** キーidごとの刻印。 */
  readonly legends: ReadonlyMap<string, string>;
}

export type CalibrationBasisResult =
  | { readonly ok: true; readonly basis: CalibrationBasis }
  | { readonly ok: false; readonly message: string };

/** 選んだ配列・物理配列・指の割り当てから、測定に使うキーの土台を作る。 */
export function calibrationBasis(
  layout: Pick<Layout, 'legends' | 'homeKeys'>,
  shape: PhysicalShape,
  assignment: FingerAssignment,
): CalibrationBasisResult {
  try {
    const geometry = buildGeometry(shape, assignmentWithHomeKeys(assignment, layout.homeKeys));
    return { ok: true, basis: { geometry, legends: layout.legends } };
  } catch {
    return { ok: false, message: 'この物理配列と指の割り当ての組では測定用のキーを作れません。' };
  }
}

/** 測定の案内に出すキーの名前。配列の刻印が無いキーはキーidで出す。英字は大文字にする。 */
export function calibrationKeyLabel(legends: ReadonlyMap<string, string>, keyId: string): string {
  const legend = legends.get(resolveKeyId(keyId));
  const label = legend !== undefined && legend.trim().length > 0 ? legend : keyId;
  return /^[a-z]$/i.test(label) ? label.toUpperCase() : label;
}

function fingerOf(geometry: Geometry, keyId: string): Finger | undefined {
  return geometry.keys.get(keyId)?.finger;
}

/** 選んだ土台で測れる項目を、測定の範囲ごとに組む。 */
export function planCalibration(basis: CalibrationBasis): CalibrationPlan {
  const { geometry, legends } = basis;
  const eligible = calibrationEligibleKeyIds(geometry, legends);
  const actionKeys = calibrationActionPair(geometry, eligible);

  const fingerTasks: CalibrationTask[] = calibrationKeyPairs(geometry, eligible).map((pair) => ({
    item: { kind: 'finger', finger: pair.finger },
    keys: [pair.fromKey, pair.toKey],
    required: CALIBRATION_FINGER_SAMPLES,
    oneWay: false,
    distance: pair.distance,
  }));

  const sameHandTasks: CalibrationTask[] = [];
  for (const keys of calibrationSameHandPairs(geometry, eligible)) {
    const first = fingerOf(geometry, keys[0]);
    const second = fingerOf(geometry, keys[1]);
    const pair = first !== undefined && second !== undefined ? sameHandFingerPairKey(first, second) : undefined;
    if (pair === undefined) continue;
    sameHandTasks.push({
      item: { kind: 'same-hand-pair', pair },
      keys,
      required: CALIBRATION_SAME_HAND_SAMPLES * 2,
      oneWay: false,
    });
  }

  const directedTasks: CalibrationTask[] = [];
  for (const keys of calibrationDirectedSameHandPairs(geometry, eligible)) {
    const from = fingerOf(geometry, keys[0]);
    const to = fingerOf(geometry, keys[1]);
    const pair = from !== undefined && to !== undefined ? sameHandDirectedFingerPairKey(from, to) : undefined;
    if (pair === undefined) continue;
    directedTasks.push({
      item: { kind: 'directed-pair', pair },
      keys,
      required: CALIBRATION_SAME_HAND_SAMPLES,
      oneWay: true,
    });
  }

  const actionsTask: CalibrationTask | undefined = actionKeys === undefined
    ? undefined
    : { item: { kind: 'actions' }, keys: actionKeys, required: CALIBRATION_ACTION_SAMPLES, oneWay: false };
  const directionTasks: CalibrationTask[] = actionKeys === undefined ? [] : [
    { item: { kind: 'direction', direction: 'L→R' }, keys: actionKeys, required: CALIBRATION_ACTION_SAMPLES, oneWay: true },
    { item: { kind: 'direction', direction: 'R→L' }, keys: [actionKeys[1], actionKeys[0]], required: CALIBRATION_ACTION_SAMPLES, oneWay: true },
  ];

  const normal = actionsTask !== undefined && fingerTasks.length > 0 && sameHandTasks.length > 0
    ? [actionsTask, ...fingerTasks, ...sameHandTasks]
    : undefined;
  const directional = directionTasks.length > 0 && directedTasks.length > 0
    ? [...directionTasks, ...directedTasks]
    : undefined;

  const byItem = new Map<string, CalibrationTask>();
  for (const task of [...(normal ?? []), ...(directional ?? [])]) byItem.set(calibrationItemId(task.item), task);
  return { normal, directional, byItem };
}

/** 測った間隔1項目ぶん。 */
export interface CalibrationTaskResult {
  readonly task: CalibrationTask;
  /** 数えた間隔[ms]。 */
  readonly intervalsMs: readonly number[];
}

/** 測定の進行。打鍵のたびに`pressCalibrationKey`が新しい値を返す。 */
export interface CalibrationRun {
  readonly scope: CalibrationScope;
  readonly tasks: readonly CalibrationTask[];
  /** 今測っている項目の位置。`tasks.length`なら全項目が済んでいる。 */
  readonly index: number;
  /** 次に打つ`keys`の位置。 */
  readonly expected: 0 | 1;
  /** 直前に正しく打った時刻[ms]。項目の最初の打鍵の前は無い。 */
  readonly lastAtMs: number | undefined;
  /** 今の項目で数えた間隔[ms]。 */
  readonly intervalsMs: readonly number[];
  /** 済んだ項目の間隔。 */
  readonly results: readonly CalibrationTaskResult[];
}

export function startCalibrationRun(scope: CalibrationScope, tasks: readonly CalibrationTask[]): CalibrationRun {
  return { scope, tasks, index: 0, expected: 0, lastAtMs: undefined, intervalsMs: [], results: [] };
}

export function calibrationRunFinished(run: CalibrationRun): boolean {
  return run.index >= run.tasks.length;
}

export function currentCalibrationTask(run: CalibrationRun): CalibrationTask | undefined {
  return run.tasks[run.index];
}

/** 次に打つキーのid。済んでいれば無い。 */
export function expectedCalibrationKey(run: CalibrationRun): string | undefined {
  return currentCalibrationTask(run)?.keys[run.expected];
}

/** 今の項目で、あと数える間隔の数。 */
export function remainingCalibrationIntervals(run: CalibrationRun): number {
  const task = currentCalibrationTask(run);
  return task === undefined ? 0 : Math.max(0, task.required - run.intervalsMs.length);
}

export interface CalibrationKeyEvent {
  readonly key: string;
  readonly code: string;
}

export type CalibrationPressOutcome =
  /** 次に打つキーではない。進行は変わらない。 */
  | { readonly kind: 'wrong-key'; readonly expectedKey: string }
  /** 時刻が戻った、または同時刻だった。進行は変わらない。 */
  | { readonly kind: 'ignored' }
  | { readonly kind: 'counted' }
  | { readonly kind: 'task-finished' }
  | { readonly kind: 'run-finished' };

/**
 * 打鍵1つを進行に反映する。次に打つキーと違えば進行は変わらない。
 * `atMs`は単調に増える時刻[ms]で、直前の正しい打鍵より後でなければ無視する。
 */
export function pressCalibrationKey(
  run: CalibrationRun,
  event: CalibrationKeyEvent,
  atMs: number,
  keyLabel: (keyId: string) => string,
): { readonly run: CalibrationRun; readonly outcome: CalibrationPressOutcome } {
  const task = currentCalibrationTask(run);
  if (task === undefined) return { run, outcome: { kind: 'ignored' } };
  const expectedKey = task.keys[run.expected];
  if (!calibrationKeyMatches(event, expectedKey, keyLabel(expectedKey))) {
    return { run, outcome: { kind: 'wrong-key', expectedKey } };
  }
  if (run.lastAtMs !== undefined && atMs <= run.lastAtMs) return { run, outcome: { kind: 'ignored' } };

  const counted = run.lastAtMs !== undefined && (!task.oneWay || run.expected === 1);
  const intervalsMs = counted ? [...run.intervalsMs, atMs - run.lastAtMs!] : run.intervalsMs;
  const expected: 0 | 1 = run.expected === 0 ? 1 : 0;

  if (intervalsMs.length < task.required) {
    return {
      run: { ...run, expected, lastAtMs: atMs, intervalsMs },
      outcome: { kind: 'counted' },
    };
  }
  const next: CalibrationRun = {
    ...run,
    index: run.index + 1,
    expected: 0,
    lastAtMs: undefined,
    intervalsMs: [],
    results: [...run.results, { task, intervalsMs }],
  };
  return { run: next, outcome: { kind: calibrationRunFinished(next) ? 'run-finished' : 'task-finished' } };
}

export type ApplyCalibrationResult =
  | { readonly ok: true; readonly calibration: PlaybackCalibration }
  /** 方向別・1項目の測定は、保存値が無いと反映先が無い。 */
  | { readonly ok: false; readonly reason: 'no-saved-value' }
  /** 測った値が足りない、または保存できる範囲を外れた。 */
  | { readonly ok: false; readonly reason: 'invalid-measurement' };

function rateOf(result: CalibrationTaskResult): number | undefined {
  return actionsPerSecondFromIntervals(result.intervalsMs);
}

function fingerSamplesOf(results: readonly CalibrationTaskResult[]): FingerSpeedSample[] {
  const samples: FingerSpeedSample[] = [];
  for (const result of results) {
    if (result.task.item.kind !== 'finger' || result.task.distance === undefined) continue;
    for (const durationMs of result.intervalsMs) {
      samples.push({ finger: result.task.item.finger, distance: result.task.distance, durationMs });
    }
  }
  return samples;
}

/** 保存値の1項目を、測った間隔で置き換える。測れていなければ`undefined`。 */
function withMeasuredItem(base: PlaybackCalibration, result: CalibrationTaskResult): PlaybackCalibration | undefined {
  const item = result.task.item;
  if (item.kind === 'finger') {
    const speed = fingerSpeedFromSamples(fingerSamplesOf([result])).get(item.finger);
    return speed === undefined
      ? undefined
      : { ...base, fingerSpeedUnitsPerSecond: { ...base.fingerSpeedUnitsPerSecond, [item.finger]: speed } };
  }
  const rate = rateOf(result);
  if (rate === undefined) return undefined;
  switch (item.kind) {
    case 'actions':
      return { ...base, actionsPerSecond: rate };
    case 'direction':
      return { ...base, actionsPerSecondByDirection: { ...base.actionsPerSecondByDirection, [item.direction]: rate } };
    case 'same-hand-pair':
      return {
        ...base,
        sameHandDifferentFingerActionsPerSecondByPair: { ...base.sameHandDifferentFingerActionsPerSecondByPair, [item.pair]: rate },
      };
    case 'directed-pair':
      return {
        ...base,
        sameHandDifferentFingerActionsPerDirectedPair: { ...base.sameHandDifferentFingerActionsPerDirectedPair, [item.pair]: rate },
      };
  }
}

/** 通常速度・移動速度の測定を丸ごと反映する。方向別の値は`base`のまま残す。 */
function applyNormal(base: PlaybackCalibration | undefined, run: CalibrationRun, nowMs: number): PlaybackCalibration | undefined {
  const actions = run.results.find((result) => result.task.item.kind === 'actions');
  const pairResults = run.results.filter((result) => result.task.item.kind === 'same-hand-pair');
  const samples = fingerSamplesOf(run.results);
  const fingerSpeeds = fingerSpeedFromSamples(samples);
  const fallback = fallbackFingerSpeedFromSamples(samples);
  const actionsPerSecond = actions === undefined ? undefined : rateOf(actions);
  const sameHand = actionsPerSecondFromIntervals(pairResults.flatMap((result) => result.intervalsMs));
  if (actionsPerSecond === undefined || sameHand === undefined || fallback === undefined || fingerSpeeds.size === 0) {
    return undefined;
  }
  const byPair: Record<string, number> = {};
  for (const result of pairResults) {
    const rate = rateOf(result);
    if (rate === undefined || result.task.item.kind !== 'same-hand-pair') return undefined;
    byPair[result.task.item.pair] = rate;
  }
  return {
    actionsPerSecond,
    ...(base?.actionsPerSecondByDirection === undefined ? {} : { actionsPerSecondByDirection: base.actionsPerSecondByDirection }),
    sameHandDifferentFingerActionsPerSecond: sameHand,
    sameHandDifferentFingerActionsPerSecondByPair: byPair,
    ...(base?.sameHandDifferentFingerActionsPerDirectedPair === undefined
      ? {}
      : { sameHandDifferentFingerActionsPerDirectedPair: base.sameHandDifferentFingerActionsPerDirectedPair }),
    fingerSpeedUnitsPerSecond: Object.fromEntries(fingerSpeeds),
    fallbackFingerSpeedUnitsPerSecond: fallback,
    measuredAt: nowMs,
  };
}

/**
 * 済んだ測定を保存値へ反映する（`spec/playback-timing.md` §6.3）。
 * 反映した値が保存できる範囲を外れていれば、保存値は作らない。
 */
export function applyCalibrationRun(
  base: PlaybackCalibration | undefined,
  run: CalibrationRun,
  nowMs: number,
): ApplyCalibrationResult {
  let next: PlaybackCalibration | undefined;
  if (run.scope === 'normal') {
    next = applyNormal(base, run, nowMs);
  } else {
    if (base === undefined) return { ok: false, reason: 'no-saved-value' };
    let current: PlaybackCalibration = { ...base, measuredAt: nowMs };
    for (const result of run.results) {
      const updated = withMeasuredItem(current, result);
      if (updated === undefined) return { ok: false, reason: 'invalid-measurement' };
      current = updated;
    }
    next = current;
  }
  if (next === undefined || playbackCalibrationProblem(next) !== undefined) {
    return { ok: false, reason: 'invalid-measurement' };
  }
  return { ok: true, calibration: next };
}
