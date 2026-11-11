import {
  defineSetAnalyzer,
  noRemember,
  type AnalyzerSetMember,
  type AnalyzerSetMemberFailure,
  type SetAnalyzerDefinition,
  type SetAnalyzerExtractContext,
  type SetAnalyzerWarmup,
} from '#analyzers/contract.ts';
import { LAYOUT_BY_ID } from '#input/layouts/index.ts';
import { analysisTargetKey, LAYOUT_MISSING_REASON, type AnalysisTarget } from '#input/setup/index.ts';
import { buildGeometry } from '#input/shapes/geometry.ts';
import { DEFAULT_METRIC_CONDITIONS } from '#interpretation/metrics.ts';
import { CONTROL_CONDITIONS, controlSeeds, meanDeviation, type ControlConditions, type MeanDeviation } from '#interpretation/control-comparison.ts';
import { shuffledText, uniformText, type ControlTextKind } from '#interpretation/control-texts.ts';
import { generateTrace } from '#trace/generate.ts';
import { CONTROL_COLUMN_IDS, computeControlColumnValues, type ControlColumnId, type ControlColumnValues } from '../comparison-column-values.ts';
import { controlTextsOptions, DEFAULT_CONTROL_TEXTS_OPTIONS, type ControlTextsOptions } from './options.ts';

/**
 * 対照テキストとの比較の抽出（定義は`docs/kana-chain-comparison.md`「対照テキストとの比較」）。
 *
 * 距離モデルは変えない。メンバーの評価に渡したテキストから、順序破壊と一様ランダムの対照テキストを種ごとに作り、
 * メンバー自身の入力（配列・物理配列・指の割り当て・条件）のままTraceを生成して、実文と同じ関数（`computeControlColumnValues`）で測る。
 * 対照テキストのTraceは`TraceRequester`で頼む。追加のTraceは、種の数 × 2種類（40本）になる。
 */

/** 対照テキストを作る種類。画面の並びと同じ順。 */
export const CONTROL_KINDS = ['shuffled', 'uniform'] as const satisfies readonly ControlTextKind[];

/** 列ごとの、種ごとの値の平均と標準偏差。 */
export type ControlSummary = Readonly<Record<ControlColumnId, MeanDeviation>>;

/** 解決できた1行（1配列）。 */
export interface ControlTextsOkRow {
  readonly kind: 'ok';
  readonly targetKey: string;
  /** 評価に渡したテキストを、そのまま測った値 */
  readonly actual: ControlColumnValues;
  /** 対照テキストの種ごとの値の平均と標準偏差 */
  readonly controls: Readonly<Record<ControlTextKind, ControlSummary>>;
}

export interface ControlTextsFailedRow {
  readonly kind: 'failed';
  readonly targetKey: string;
  readonly failureKind: AnalyzerSetMemberFailure['kind'];
  readonly message: string;
}

export type ControlTextsRow = ControlTextsOkRow | ControlTextsFailedRow;

export interface ControlTextsExtracted {
  /** 対照テキストの値に付随する条件。値と一緒に持ち出す */
  readonly conditions: ControlConditions;
  /** 集合の各枠（配列かSetup）ぶんの行。並び順に表示上の意味は無い。 */
  readonly rows: readonly ControlTextsRow[];
}

const SEEDS = controlSeeds();

function textOf(member: AnalyzerSetMember): string {
  if (member.text === undefined) throw new Error('対照テキストとの比較の抽出に、評価に渡したテキストが渡されていない');
  return member.text;
}

/** 種1つ・種類1つの対照テキストを測った値。メンバーに覚えさせ、先に`controlTextsWarmup`で求めてあれば作り直さない。 */
function controlValuesOf(member: AnalyzerSetMember, kind: ControlTextKind, seed: number): ControlColumnValues {
  return member.remember(`control:${kind}:${seed}`, () => {
    const text = textOf(member);
    const control = kind === 'shuffled' ? shuffledText(text, seed) : uniformText(text, seed);
    const trace = member.requestTrace.requestTrace({ text: control.text });
    return computeControlColumnValues(trace, member.metrics.conditions);
  });
}

function summarize(samples: readonly ControlColumnValues[]): ControlSummary {
  return Object.fromEntries(CONTROL_COLUMN_IDS.map((id) => [id, meanDeviation(samples.map((sample) => sample[id]))])) as ControlSummary;
}

/** 1行ぶんの値。 */
export function computeControlTextsRow(member: AnalyzerSetMember): ControlTextsOkRow {
  const controls = Object.fromEntries(CONTROL_KINDS.map((kind) => [kind, summarize(SEEDS.map((seed) => controlValuesOf(member, kind, seed)))])) as Record<
    ControlTextKind,
    ControlSummary
  >;
  return {
    kind: 'ok',
    targetKey: analysisTargetKey(member.target),
    actual: computeControlColumnValues(member.trace, member.metrics.conditions),
    controls,
  };
}

/**
 * 対照テキストのTraceを1本ずつの段に分けて先に求める。1段は種類1つ・種1つの対照テキストの生成とTraceの計算で、
 * 抽出全体（配列の数 × 40本）をひと息に計算しないための分け目になる。
 */
export const controlTextsWarmup: SetAnalyzerWarmup = {
  steps: CONTROL_KINDS.length * SEEDS.length,
  run(member, step) {
    const kind = CONTROL_KINDS[Math.floor(step / SEEDS.length)];
    const seed = SEEDS[step % SEEDS.length];
    if (kind !== undefined && seed !== undefined) controlValuesOf(member, kind, seed);
  },
};

export function computeControlTextsExtraction(
  members: readonly AnalyzerSetMember[],
  failures: readonly AnalyzerSetMemberFailure[],
): ControlTextsExtracted {
  const rows: ControlTextsRow[] = members.map(computeControlTextsRow);
  for (const failure of failures) {
    rows.push({ kind: 'failed', targetKey: analysisTargetKey(failure.target), failureKind: failure.kind, message: failure.message });
  }
  return { conditions: CONTROL_CONDITIONS, rows };
}

// ---------------------------------------------------------------------------
// 入れ忘れ防止テストの材料
// ---------------------------------------------------------------------------

const FIXTURE_TEXT = 'たちつてとなにぬねのはひふへほ';
const FIXTURE_TARGET: AnalysisTarget = { kind: 'setup', setupId: 'fixture-a' };
const FIXTURE_TARGET_MISSING: AnalysisTarget = { kind: 'setup', setupId: 'fixture-missing' };

function fixtureMembers(): readonly AnalyzerSetMember[] {
  const layout = LAYOUT_BY_ID.get('qwerty')!;
  const geometry = buildGeometry('row-staggered');
  const policy = { windowSize: 3, sfbHomeCost: true };
  const trace = generateTrace(FIXTURE_TEXT, layout, geometry, policy);
  return [
    {
      target: FIXTURE_TARGET,
      text: FIXTURE_TEXT,
      trace,
      // この抽出が読まない値は材料に含めない
      analysis: undefined as never,
      metrics: { conditions: DEFAULT_METRIC_CONDITIONS } as never,
      requestTrace: { requestTrace: (request) => generateTrace(request.text ?? FIXTURE_TEXT, layout, geometry, policy) },
      remember: noRemember,
    },
  ];
}

const FIXTURE_FAILURES: readonly AnalyzerSetMemberFailure[] = [{ target: FIXTURE_TARGET_MISSING, kind: 'reference', message: LAYOUT_MISSING_REASON }];

/** engine（`engine/cache.ts`の`getSetExtraction`）が呼ぶ、Analyzer契約の実体。 */
export const controlTextsDefinition: SetAnalyzerDefinition<ControlTextsOptions, ControlTextsExtracted> = defineSetAnalyzer({
  id: 'control-texts',
  options: controlTextsOptions,
  extract(context: SetAnalyzerExtractContext<ControlTextsOptions>): ControlTextsExtracted {
    return computeControlTextsExtraction(context.members, context.failures);
  },
  warmup: controlTextsWarmup,
  optionsDiscipline: {
    sample: DEFAULT_CONTROL_TEXTS_OPTIONS,
    alternates: DEFAULT_CONTROL_TEXTS_OPTIONS,
    context: () => ({ members: fixtureMembers(), failures: FIXTURE_FAILURES }),
  },
});
