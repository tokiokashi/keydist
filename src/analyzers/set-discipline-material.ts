import {
  noRemember,
  type AnalyzerSetMember,
  type AnalyzerSetMemberFailure,
  type SetAnalyzerExtractContext,
  type TraceRequester,
} from '#analyzers/contract.ts';
import { builtinDisciplineLayout } from './discipline-material.ts';
import { LAYOUT_MISSING_REASON, type AnalysisTarget } from '#input/setup/index.ts';
import { ALL_FINGERS, buildGeometry, type Finger, type Geometry, type Key } from '#input/shapes/geometry.ts';
import { DEFAULT_METRIC_CONDITIONS, type Metrics } from '#interpretation/metrics.ts';
import { generateTrace, type Press, type Stroke, type StrokeParticipation, type Trace, type TracePolicy } from '#trace/generate.ts';
import type { Layout } from '#input/layouts/types.ts';

/**
 * 集合のAnalyzerの入れ忘れ防止テスト（`options.ts`の`checkOptionsDiscipline`）が、定義の`extract`へ
 * 渡す材料のうち、Analyzerによらない部分。
 *
 * 各Analyzerは、自分の抽出が読む項目の差分だけを、ここの部品へ重ねて書く。
 * `Metrics`や`Stroke`の項目が増えた時は、ここだけを直す。
 */

export const DISCIPLINE_TARGET_A: AnalysisTarget = { kind: 'setup', setupId: 'fixture-a' };
export const DISCIPLINE_TARGET_B: AnalysisTarget = { kind: 'setup', setupId: 'fixture-b' };
const DISCIPLINE_TARGET_MISSING: AnalysisTarget = { kind: 'setup', setupId: 'fixture-missing' };

/** 解決に失敗したメンバー1件（配列が見つからない）。 */
export const DISCIPLINE_FAILURES: readonly AnalyzerSetMemberFailure[] = [
  { target: DISCIPLINE_TARGET_MISSING, kind: 'reference', message: LAYOUT_MISSING_REASON },
];

/** `extract`へ渡す`options`以外の引数を、メンバーから組む。 */
export function disciplineSetContext(members: readonly AnalyzerSetMember[]): Omit<SetAnalyzerExtractContext<unknown>, 'options'> {
  return { members, failures: DISCIPLINE_FAILURES };
}

/** `TraceRequester`を使わない抽出の材料。呼ばれたら投げる。 */
export const UNUSED_REQUEST_TRACE: TraceRequester = {
  requestTrace: () => {
    throw new Error('unused');
  },
};

/** メンバーの`requestTrace`・`analysis`・`remember`の既定を持つ。`trace`と`metrics`は抽出ごとに渡す。 */
export function disciplineMember(
  target: AnalysisTarget,
  parts: Pick<AnalyzerSetMember, 'trace' | 'metrics'> & Partial<AnalyzerSetMember>,
): AnalyzerSetMember {
  return {
    target,
    analysis: { chains: [], arpeggios: [] } as unknown as AnalyzerSetMember['analysis'],
    requestTrace: UNUSED_REQUEST_TRACE,
    remember: noRemember,
    ...parts,
  };
}

// ---------------------------------------------------------------------------
// 手で組むTrace
// ---------------------------------------------------------------------------

function disciplineKey(id: string, finger: Finger, x: number, y: number): Key {
  return { id, finger, x, y, row: 2, col: 0 };
}

export function disciplinePress(finger: Finger, id: string, x: number, y = 2, distance = 0): Press {
  return { finger, keys: [disciplineKey(id, finger, x, y)], target: { x, y }, origin: { at: { x, y }, from: 'home' }, gap: 1, distance, sfb: false };
}

function disciplineParticipation(p: Press): StrokeParticipation {
  return { hand: p.finger.startsWith('L') ? 'left' : 'right', finger: p.finger, keys: p.keys, roles: ['output'] };
}

export function disciplineStroke(index: number, presses: Press[], overrides: Partial<Stroke> = {}): Stroke {
  return {
    index,
    char: String(index),
    inputChar: String(index),
    inputIndex: index,
    selectionIndex: index,
    kanaStart: index,
    kanaEnd: index,
    aggregationGroupId: 'single',
    classifications: [],
    triggerKeys: [],
    pairedTriggerKeys: [],
    participations: presses.map(disciplineParticipation),
    presses,
    distance: 0,
    positions: {} as Stroke['positions'],
    ...overrides,
  };
}

export function disciplineTrace(strokes: Stroke[], inputChars: number = strokes.length): Trace {
  return {
    strokes,
    errors: [],
    skipped: 0,
    skippedPositions: [],
    skippedByKind: { kanji: 0, symbol: 0, other: 0 },
    inputChars,
    comboHits: [],
    comboDefinitions: 0,
    layerDefinitions: [],
  };
}

/** 左人差し指・左中指・右人差し指を1打ずつ打つ3ストロークのTrace。 */
export const DISCIPLINE_TRACE: Trace = disciplineTrace([
  disciplineStroke(0, [disciplinePress('LI', 'f', 4)]),
  disciplineStroke(1, [disciplinePress('LM', 'd', 3)]),
  disciplineStroke(2, [disciplinePress('RI', 'j', 7)]),
]);

// ---------------------------------------------------------------------------
// 手で組むMetrics
// ---------------------------------------------------------------------------

export function zeroFingerRecord(): Record<Finger, number> {
  return Object.fromEntries(ALL_FINGERS.map((finger) => [finger, 0])) as Record<Finger, number>;
}

/** 3ストロークぶんの`Metrics`。抽出が読む項目が違う時は`overrides`で差し替える。 */
export function disciplineMetrics(totalUnits: number, overrides: Partial<Metrics> = {}): Metrics {
  return {
    geometryId: 'row-staggered',
    geometryName: 'Row-staggered',
    fingerAssignmentId: 'default',
    fingerAssignmentName: '既定',
    fingerAssignmentHasMultiFingerKeys: false,
    conditions: DEFAULT_METRIC_CONDITIONS,
    strokes: 3,
    actions: 3,
    presses: 3,
    skipped: 0,
    inputChars: 3,
    perFinger: zeroFingerRecord(),
    perFingerPresses: zeroFingerRecord(),
    perFingerPressEvents: zeroFingerRecord(),
    totalUnits,
    totalMm: totalUnits * 19,
    meanPerStroke: totalUnits / 3,
    perCharUnits: totalUnits / 3,
    perCharSteps: 1,
    perCharPresses: 1,
    perActionPresses: 1,
    perPressUnits: totalUnits / 3,
    movedPressShare: 100,
    perMovedPressUnits: totalUnits / 3,
    textChars: 3,
    textCharsPerAction: 1,
    actionsPerTextChar: 1,
    actionsPerUnit: 3 / (totalUnits || 1),
    textCharsPerUnit: 3 / (totalUnits || 1),
    unitsPerTextChar: totalUnits / 3,
    singleTapLayerRate: 100,
    singleTapRate: 100,
    singleKeyRate: 100,
    adjacent: [],
    adjacentHomeSpacings: [],
    adjacentDistribution: [],
    sameFinger: 0,
    perFingerSameFinger: zeroFingerRecord(),
    combos: { definitions: 0, matched: 0, hits: 0 },
    layers: [],
    comboPresses: 0,
    comboKeyCounts: new Map(),
    comboKeyDistance: new Map(),
    keyCounts: new Map(),
    keyDistance: new Map(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// 実際の配列から作るTrace
// ---------------------------------------------------------------------------

export interface GeneratedDisciplineTrace {
  readonly layout: Layout;
  readonly geometry: Geometry;
  readonly policy: TracePolicy;
  readonly trace: Trace;
}

/** QWERTYとrow-staggeredで`text`を打ったTraceと、その作り方。 */
export function generateDisciplineTrace(text: string): GeneratedDisciplineTrace {
  const layout = builtinDisciplineLayout('qwerty');
  const geometry = buildGeometry('row-staggered');
  const policy: TracePolicy = { windowSize: 3, sfbHomeCost: true };
  return { layout, geometry, policy, trace: generateTrace(text, layout, geometry, policy) };
}

/**
 * `generateDisciplineTrace`のTraceを持つメンバー。`analysis`と`metrics`は持たず、
 * 読む抽出は`parts`で渡す。`requestTrace`は同じTraceを返す。
 */
export function generatedDisciplineMember(text: string, parts: Partial<AnalyzerSetMember> = {}): AnalyzerSetMember {
  const { trace } = generateDisciplineTrace(text);
  return {
    target: DISCIPLINE_TARGET_A,
    trace,
    analysis: undefined as never,
    metrics: undefined as never,
    requestTrace: { requestTrace: () => trace },
    remember: noRemember,
    ...parts,
  };
}
