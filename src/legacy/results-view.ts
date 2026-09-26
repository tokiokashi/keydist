import {
  assignmentWithHomeKeys,
  buildGeometry,
  type GeometryKind,
} from '../geometry.ts';
import { evaluate, type Options, type Trace } from '../evaluate.ts';
import {
  analyzeStrokeStructure,
  type AggregatedAnalysisResult,
} from '../analysis-aggregate.ts';
import { computeMetrics, type Metrics } from '../metrics.ts';
import type { AnalyzerComparisonModel } from './analyzer-comparison-model.ts';
import type { AnalyzerBigramFlowModel } from './analyzer-bigram-flow-model.ts';
import type { AnalyzerMetricsModel } from './analyzer-metrics-model.ts';
import type { UiStateV1 } from './ui-state.ts';
import type { GeometrySettings } from '../geometry-settings.ts';
import { resolveConditions } from '#engine/condition-resolution.ts';
import type { Layout } from '../layouts/types.ts';
import type { ModeId } from './layout-selection.ts';
import type { PlaybackViewController } from './playback-view.ts';

export interface Result {
  layout: Layout;
  trace: Trace;
  analysis: AggregatedAnalysisResult;
  metrics: Metrics;
  geometry: ReturnType<typeof buildGeometry>;
  options: Options;
  /** 一覧での位置。色はこれで決まるので、選択を外しても他の色は動かない */
  slot: number;
}


export interface ResultsViewContext {
  getText: () => string;
  getUiState: () => UiStateV1;
  updateUiState: (change: (draft: UiStateV1) => void) => void;
  currentModeId: () => ModeId;
  currentMode: () => { layouts: Layout[] };
  getSelectedLayoutIds: (mode: ModeId) => ReadonlySet<string>;
  romajiRuleIdForLayout: (layout: Layout) => string | null;
  getGeometrySettingsForKind: (kind: GeometryKind) => GeometrySettings;
  playback: PlaybackViewController;
  comparisonModel: AnalyzerComparisonModel;
  bigramFlowModel: AnalyzerBigramFlowModel;
  metricsModel: AnalyzerMetricsModel;
  getDetailLayoutId: () => string | undefined;
}

export interface ResultsViewController {
  setup: () => void;
  render: () => void;
}

export function createResultsView(ctx: ResultsViewContext): ResultsViewController {
  function render() {
  const geometryCache = new Map<string, ReturnType<typeof buildGeometry>>();
  const geometryFor = (kind: GeometryKind, layout: Layout) => {
    const settings = ctx.getGeometrySettingsForKind(kind);
    const cacheKey = `${kind}|${settings.shape.id}|${settings.assignment.id}|${JSON.stringify(layout.homeKeys ?? {})}`;
    const cached = geometryCache.get(cacheKey);
    if (cached) return cached;
    const assignment = assignmentWithHomeKeys(settings.assignment, layout.homeKeys);
    const geometry = buildGeometry(settings.shape, assignment);
    geometryCache.set(cacheKey, geometry);
    return geometry;
  };
  const text = ctx.getText();
  const selected = ctx.getSelectedLayoutIds(ctx.currentModeId());
  const results: Result[] = ctx.currentMode().layouts
    .map((layout, slot) => ({ layout, slot }))
    .filter((r) => selected.has(r.layout.id))
    .map(({ layout, slot }) => {
      const conditions = resolveConditions(
        ctx.getUiState().conditions.defaults,
        ctx.getUiState().conditions.perLayout[layout.id],
      );
      const geometry = geometryFor(conditions.geometry, layout);
      const trace = evaluate(text, layout, geometry, conditions.options);
      const analysis = analyzeStrokeStructure(
        trace.strokes,
        conditions.chainPolicy,
        conditions.arpeggioPolicy,
        conditions.triggerRealizationPolicy,
        conditions.actionRealizationPolicy,
      );
      return {
        layout,
        trace,
        analysis,
        metrics: computeMetrics(trace, geometry, {
          windowSize: conditions.options.windowSize,
          sfbHomeCost: conditions.options.sfbHomeCost,
          preferOppositeThumb: conditions.options.preferOppositeThumb ?? false,
          chainPolicy: conditions.chainPolicy,
          arpeggioPolicy: conditions.arpeggioPolicy,
          triggerRealizationPolicy: conditions.triggerRealizationPolicy,
          actionRealizationPolicy: conditions.actionRealizationPolicy,
          romajiRuleId: ctx.romajiRuleIdForLayout(layout),
        }),
        geometry,
        options: conditions.options,
        slot,
      };
    });

  if (results.length === 0) {

    ctx.playback.clear();
    ctx.bigramFlowModel.clear();
    ctx.metricsModel.clear('配列を1つ以上選ぶ');
    syncCompareOptions([], false);
    return;
  }

  // ステップ数と押下数は配列ごとに異なるので表に出す。ここは入力そのものの大きさだけ
  const parts = [`${[...text].length} 文字`];
  const skipped = results.filter((r) => r.trace.skipped > 0);
  if (skipped.length) {
    const worst = Math.max(...skipped.map((r) => r.trace.skipped));
    parts.push(`${skipped.length} 配列で最大 ${worst} 文字が打てない`);
  }
  const errors = results.flatMap((r) => r.trace.errors);
  const baselineId = ctx.getUiState().ui.comparison.baselineByMode[ctx.currentModeId()] ?? '';
  syncCompareOptions(results, results.some((result) => result.layout.id === baselineId));
  const detail = renderDetail(results);
  ctx.metricsModel.setResults({
    results,
    text,
    textMeta: parts.join(' / '),
    errors,
    detailLayoutId: detail.layout.id,
  });
}

const COMPARE_HEADERS = [
  '動作数',
  '距離',
  'u/打鍵',
  'u/文字',
  '動作数/文字',
  '押下/文字',
  '単打面率',
  '単打率',
  '1キー率',
  '同指',
  '同指率',
  '指間mean',
  '指間σ',
] as const;

const COMPARE_RELATIVE_HEADERS = [
  '動作数比',
  '距離比',
  'u/打鍵比',
  'u/文字比',
  '動作数/文字比',
  '押下/文字比',
  '単打面率比',
  '単打率比',
  '1キー率比',
  '同指比',
  '同指率比',
  '指間mean比',
  '指間σ比',
] as const;

function compareLabel(label: string, relative: boolean, column: number): string {
  return relative ? COMPARE_RELATIVE_HEADERS[column] ?? label : label;
}

function syncCompareOptions(results: Result[], relative: boolean): void {
  if (
    ctx.getUiState().ui.comparison.chartColumn < 0
    || ctx.getUiState().ui.comparison.chartColumn >= COMPARE_HEADERS.length
  ) {
    ctx.updateUiState((draft) => {
      draft.ui.comparison.chartColumn = 1;
    });
  }
  ctx.comparisonModel.setOptions(
    [
      { value: '', label: '比較なし' },
      ...results.map((result) => ({
        value: result.layout.id,
        label: result.layout.name,
      })),
    ],
    COMPARE_HEADERS.map((label, column) => ({
      value: String(column),
      label: compareLabel(label, relative, column),
    })),
  );
}

function renderDetail(results: Result[]): Result {
  const found = results.find((result) => result.layout.id === ctx.getDetailLayoutId())
    ?? results[0]!;
  const { layout, geometry, options } = found;
  ctx.playback.render(found.trace, layout, geometry, options, found.analysis);
  ctx.bigramFlowModel.setData({ layout, trace: found.trace, geometry });
  return found;
}

  return { setup: () => {}, render };
}
