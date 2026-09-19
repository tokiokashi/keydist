import {
  ADJACENT_PAIRS, ALL_FINGERS, FINGERS, resolveKeyId, THUMB_KEY, THUMB_ROW,
  assignmentWithHomeKeys, type GeometryKind,
} from './geometry.ts';
import { evaluate, type Options, type Trace } from './evaluate.ts';
import { sameChainPolicy } from './analysis-chain.ts';
import { sameArpeggioPolicy } from './analysis-arpeggio.ts';
import {
  analyzeStrokeStructure,
  type AggregatedAnalysisResult,
} from './analysis-aggregate.ts';
import { computeMetrics, type LayerStat, type Metrics } from './metrics.ts';
import { normalizedLayerColors } from './layer-heatmap.ts';
import { nSensitivity } from './sensitivity.ts';
import {
  columnChart, escapeAttr, escapeText, lineChart, barChart, matrixChart, type MatrixSort,
} from './chart.ts';
import { FINGER_LABEL, SHORT_FINGER, SERIES, type AppElements } from './app-dom.ts';
import {
  type LayerColorScale, type LayerView, type MatrixKind, type SensitivityScale, type UiStateV1,
} from './ui-state.ts';
import type { GeometrySettings } from './geometry-settings.ts';
import { resolveConditions } from './condition-resolution.ts';
import { classifyFaces, displayTriggerKeys, faceCells, foldedLayerCells, handOfKey, layerShiftStyles, type Layer, type LayerShiftStyle } from './layers.ts';
import { COMBO_LAYER_ID, SINGLE_LAYER_ID, faceFromEntries } from './layouts/index.ts';
import type { Face, Layout } from './layouts/index.ts';
import { allTriggerKeys, matchCombos, summarizeCandidateMatches } from './combo-picker.ts';
import type { ModeId } from './layout-selection.ts';
import type { PlaybackViewController } from './playback-view.ts';
import { buildGeometry } from './geometry.ts';

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

type AdjacentMatrixKind = 'adjacentMean' | 'adjacentStdDev';

export interface ResultsViewContext {
  el: AppElements;
  getUiState: () => UiStateV1;
  updateUiState: (change: (draft: UiStateV1) => void) => void;
  currentModeId: () => ModeId;
  currentMode: () => { layouts: Layout[] };
  selected: Record<ModeId, Set<string>>;
  romajiRuleIdForLayout: (layout: Layout) => string | null;
  getGeometrySettingsForKind: (kind: GeometryKind) => GeometrySettings;
  playback: PlaybackViewController;
}

export interface ResultsViewController {
  setup: () => void;
  render: () => void;
  syncSensitivityScaleButtons: () => void;
}

export function createResultsView(ctx: ResultsViewContext): ResultsViewController {
  const elements = ctx.el;
  let sensitivityDirty = true;
  const comboDiagramSelection = new Map<string, number>();
  /** 配列図でクリック選択中のトリガー候補キー（物理キーid）。配列ごとに独立して覚える。 */
  const comboPickerSelection = new Map<string, Set<string>>();
  /** ベース配列図で全コンボ・レイヤートリガーの位置を常時ガイド表示するか。 */
  const comboPickerGuideEnabled = new Map<string, boolean>();

  function getPickerSelection(layoutId: string): Set<string> {
    let selection = comboPickerSelection.get(layoutId);
    if (!selection) {
      selection = new Set();
      comboPickerSelection.set(layoutId, selection);
    }
    return selection;
  }

function sortMatrixRows<T extends { cells: { value: number }[] }>(rows: T[], sort: MatrixSort | null): T[] {
  if (!sort) return rows;
  return rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => {
      const delta = a.row.cells[sort.column].value - b.row.cells[sort.column].value;
      return (sort.direction === 'asc' ? delta : -delta) || a.index - b.index;
    })
    .map(({ row }) => row);
}

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
  const text = elements.text.value;
  elements.windowOut.value = String(ctx.getUiState().conditions.defaults.windowSize);

  const set = ctx.selected[ctx.currentModeId()];
  const results: Result[] = ctx.currentMode().layouts
    .map((layout, slot) => ({ layout, slot }))
    .filter((r) => set.has(r.layout.id))
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
          holdStartActionPolicy: conditions.holdStartActionPolicy,
          romajiRuleId: ctx.romajiRuleIdForLayout(layout),
        }),
        geometry,
        options: conditions.options,
        slot,
      };
    });

  if (results.length === 0) {
    ctx.playback.clear();
    elements.textMeta.textContent = '配列を1つ以上選ぶ';
    elements.compareChart.innerHTML = '';
    syncCompareBaselineOptions([]);
    syncCompareChartOptions(false);
    elements.compare.innerHTML = '';
    showSensitivityPlaceholder('配列を1つ以上選ぶ');
    elements.heatmap.innerHTML = '';
    elements.fingerChart.innerHTML = '';
    elements.adjacentChart.innerHTML = '';
    elements.fingerMatrix.innerHTML = '';
    elements.pressMatrix.innerHTML = '';
    elements.adjacentMeanMatrix.innerHTML = '';
    elements.adjacentStdDevMatrix.innerHTML = '';
    elements.errors.hidden = true;
    return;
  }

  // ステップ数と押下数は配列ごとに異なるので表に出す。ここは入力そのものの大きさだけ
  const parts = [`${[...text].length} 文字`];
  const skipped = results.filter((r) => r.trace.skipped > 0);
  if (skipped.length) {
    const worst = Math.max(...skipped.map((r) => r.trace.skipped));
    parts.push(`${skipped.length} 配列で最大 ${worst} 文字が打てない`);
  }
  elements.textMeta.textContent = parts.join(' / ');

  const errors = results.flatMap((r) => r.trace.errors);
  elements.errors.textContent = errors.length ? `配列定義の不備: ${errors.join(' / ')}` : '';
  elements.errors.hidden = errors.length === 0;

  renderCompare(results);
  renderMatrices(results);
  if (elements.sensitivityPanel.open) {
    renderSensitivity(text, results);
  } else {
    showSensitivityPlaceholder();
  }
  renderDetail(results);
}

const COMPARE_HEADERS = [
  'アクション',
  '距離 [u]',
  '距離 [m]',
  '1打鍵 [u]',
  '1文字 [u]',
  'アクション/文字',
  '押下/文字',
  '同指連続',
  '同指連続率',
  '隣接指の平均 [u]',
];

const COMPARE_RELATIVE_HEADERS = [
  'アクション比',
  '距離[u]比',
  '距離[m]比',
  '1打鍵[u]比',
  '1文字[u]比',
  'アクション/文字比',
  '押下/文字比',
  '同指連続比',
  '同指率比',
  '隣接指の平均比',
];

const COMPARE_FORMATS: Array<(value: number) => string> = [
  (value) => `${value}`,
  (value) => value.toFixed(0),
  (value) => value.toFixed(2),
  (value) => value.toFixed(3),
  (value) => value.toFixed(3),
  (value) => value.toFixed(3),
  (value) => value.toFixed(3),
  (value) => `${value}`,
  (value) => `${value.toFixed(1)}%`,
  (value) => value.toFixed(3),
];

interface CompareCell {
  value: number;
  display: string;
}

function compareMetricValues(metrics: Metrics): number[] {
  const adjacentMean = metrics.adjacent.reduce((a, b) => a + b.meanExcess, 0) / metrics.adjacent.length;
  return [
    metrics.actions,
    metrics.totalUnits,
    metrics.totalMm / 1000,
    metrics.meanPerStroke,
    metrics.perCharUnits,
    metrics.perCharSteps,
    metrics.perCharPresses,
    metrics.sameFinger,
    (metrics.sameFinger / Math.max(1, metrics.strokes)) * 100,
    adjacentMean,
  ];
}

function metricConditionText(metrics: Metrics, layout: Layout): string {
  const hasLayoutHomeKeys = layout.homeKeys !== undefined && Object.keys(layout.homeKeys).length > 0;
  const defaults = ctx.getUiState().conditions.defaults;
  const override = ctx.getUiState().conditions.perLayout[layout.id];
  const defaultGeometryId = ctx.getGeometrySettingsForKind(defaults.geometry).shape.id;
  const differences = [
    metrics.geometryId !== defaultGeometryId ? `形状: ${metrics.geometryName}` : '',
    metrics.fingerAssignmentId !== 'default' ? `運指: ${metrics.fingerAssignmentName}` : '',
    hasLayoutHomeKeys ? 'ホーム: 配列指定' : '',
    metrics.conditions.windowSize !== defaults.windowSize ? `N=${metrics.conditions.windowSize}` : '',
    metrics.conditions.sfbHomeCost !== defaults.sfbHomeCost ? 'SFBホーム設定変更' : '',
    metrics.conditions.preferOppositeThumb !== defaults.preferOppositeThumb ? '逆側親指設定変更' : '',
    !sameChainPolicy(metrics.conditions.chainPolicy, defaults.chain) ? 'Chain境界設定変更' : '',
    !sameArpeggioPolicy(metrics.conditions.arpeggioPolicy, defaults.arpeggioPolicy)
      ? 'Arpeggio構造Policy変更'
      : '',
    override?.romajiRule !== undefined ? `ローマ字: ${override.romajiRule}` : '',
  ].filter(Boolean);
  return `形状: ${metrics.geometryName} / 運指: ${metrics.fingerAssignmentName}`
    + ` / ホーム: ${hasLayoutHomeKeys ? '配列指定' : '形状既定'}`
    + (differences.length > 0 ? ` / 条件差分: ${differences.join('、')}` : ' / 既定条件');
}

function relativePercent(value: number, baseline: number): number | null {
  if (baseline === 0) return value === 0 ? 100 : null;
  return (value / baseline) * 100;
}

function compareCell(
  value: number,
  baseline: number | null,
  format: (value: number) => string,
): CompareCell {
  if (baseline === null) return { value, display: format(value) };
  const ratio = relativePercent(value, baseline);
  return ratio === null
    ? { value: 0, display: '—' }
    : { value: ratio, display: `${ratio.toFixed(1)}%` };
}

function renderCompare(results: Result[]) {
  syncCompareBaselineOptions(results);
  const best = Math.min(...results.map((r) => r.metrics.totalUnits));
  const baseline = results.find((r) => r.layout.id === elements.compareBaseline.value);
  const baselineValues = baseline ? compareMetricValues(baseline.metrics) : null;

  const compareRows = results.map((r) => {
    const values = compareMetricValues(r.metrics);
    const cells = values.map((value, column) => compareCell(
      value,
      baselineValues ? baselineValues[column] : null,
      COMPARE_FORMATS[column],
    ));
    return { result: r, cells };
  });

  const sortedRows = sortMatrixRows(compareRows, ctx.getUiState().ui.comparison.sort);
  syncCompareChartOptions(baseline !== undefined);
  const chartBest = Math.min(...sortedRows.map((row) => row.cells[ctx.getUiState().ui.comparison.chartColumn].value));
  const chartRelative = baseline !== undefined;
  const chartLabel = compareLabel(
    COMPARE_HEADERS[ctx.getUiState().ui.comparison.chartColumn],
    chartRelative,
    ctx.getUiState().ui.comparison.chartColumn,
  );
  elements.compareChart.innerHTML = barChart(
    sortedRows.map(({ result: r, cells }) => ({
      label: r.layout.name,
      value: cells[ctx.getUiState().ui.comparison.chartColumn].value,
      valueLabel: cells[ctx.getUiState().ui.comparison.chartColumn].display,
      color: SERIES(r.slot),
      emphasise: cells[ctx.getUiState().ui.comparison.chartColumn].value === chartBest,
      tip: `${escapeText(r.layout.name)}<br>${escapeText(chartLabel)} <b>${cells[ctx.getUiState().ui.comparison.chartColumn].display}</b>`,
    })),
    {
      format: chartRelative
        ? (value) => `${value.toFixed(1)}%`
        : COMPARE_FORMATS[ctx.getUiState().ui.comparison.chartColumn],
      labelWidth: 150,
    },
  );

  const rows = sortedRows
    .map(({ result: r, cells }) => `<tr${r.metrics.totalUnits === best ? ' class="best"' : ''}>
      <td><span class="swatch" style="background:${SERIES(r.slot)}"></span>${escapeText(r.layout.name)}<small class="metric-conditions">${escapeText(metricConditionText(r.metrics, r.layout))}</small></td>
      ${cells.map((cell) => `<td class="num">${cell.display}</td>`).join('')}
    </tr>`)
    .join('');

  elements.compare.innerHTML = `
    <thead><tr>
      <th>配列</th>${COMPARE_HEADERS.map((label, column) => compareHeader(label, column, baseline !== undefined)).join('')}
    </tr></thead><tbody>${rows}</tbody>`;
}

function syncCompareBaselineOptions(results: Result[]) {
  const current = ctx.getUiState().ui.comparison.baselineByMode[ctx.currentModeId()]
    || elements.compareBaseline.value
    || '';
  elements.compareBaseline.replaceChildren(new Option('比較なし', ''));
  for (const result of results) {
    elements.compareBaseline.add(new Option(result.layout.name, result.layout.id));
  }
  elements.compareBaseline.value = results.some((r) => r.layout.id === current) ? current : '';
}

function compareLabel(label: string, relative: boolean, column: number): string {
  return relative ? COMPARE_RELATIVE_HEADERS[column] : label;
}

function syncCompareChartOptions(relative: boolean) {
  if (ctx.getUiState().ui.comparison.chartColumn < 0 || ctx.getUiState().ui.comparison.chartColumn >= COMPARE_HEADERS.length) {
    ctx.updateUiState((draft) => { draft.ui.comparison.chartColumn = 1; });
  }
  elements.compareChartMetric.replaceChildren();
  for (let column = 0; column < COMPARE_HEADERS.length; column++) {
    elements.compareChartMetric.add(new Option(
      compareLabel(COMPARE_HEADERS[column], relative, column),
      String(column),
    ));
  }
  elements.compareChartMetric.value = String(ctx.getUiState().ui.comparison.chartColumn);
}

/** data-tipを持つ補足ボタン。tipが無い列では何も出さない */
function infoButton(tip: string | undefined): string {
  if (!tip) return '';
  const attr = escapeAttr(tip);
  return `<button type="button" class="info" data-tip="${attr}" aria-label="${attr}">i</button>`;
}

/** 列ごとの補足。指標の定義だけを書き、良し悪しの解釈は書かない */
const COMPARE_HEADER_TIPS: Record<number, string> = {
  7: '同じ指で違うキーを続けて打った回数。',
};

function compareHeader(label: string, column: number, relative: boolean): string {
  const sort = ctx.getUiState().ui.comparison.sort;
  const active = sort?.column === column
    ? sort.direction
    : undefined;
  const marker = active === 'asc' ? ' ↑' : active === 'desc' ? ' ↓' : '';
  const ariaSort = active === 'asc' ? 'ascending' : active === 'desc' ? 'descending' : 'none';
  const shownLabel = compareLabel(label, relative, column);
  return `<th><span class="table-sort" data-compare-sort="${column}" role="button" tabindex="0"
    aria-label="${escapeAttr(`${shownLabel}で配列を並べ替え`)}" aria-sort="${ariaSort}"
    title="クリックごとに昇順・降順・選択順へ切り替える">${escapeText(shownLabel)}${marker}</span>${infoButton(COMPARE_HEADER_TIPS[column])}</th>`;
}

/**
 * 配列 × 指の粒度でマトリックスに並べる。行は総移動距離の表と同じ選択順
 * （色のスロットが他の図と揃うことを優先し、総距離順の並べ替えはしない）。
 *
 * 指ごとの移動距離は入力文字数で正規化する（u/文字）。生のuは評価テキストの
 * 長さに引きずられるため、テキストを変えても配列間の比較が揺れないようにする。
 * 隣接指の統計はもともと打鍵ごとの値なので文字数に依存しない。選択中の指標を
 * そのまま表示し、詳細チャートと同じ指標を使う。
 */
function renderMatrices(results: Result[]) {
  const fingerRows = sortMatrixRows(results.map((r) => ({
    label: r.layout.name,
    color: SERIES(r.slot),
    cells: FINGERS.map((f) => {
      const perChar = r.metrics.perFinger[f] / Math.max(1, r.metrics.inputChars);
      const share = (r.metrics.perFinger[f] / Math.max(1e-9, r.metrics.totalUnits)) * 100;
      return {
        value: perChar,
        tip:
          `${escapeText(r.layout.name)} / ${FINGER_LABEL[f]}<br>` +
          `<b>${perChar.toFixed(3)} u/文字</b> (全体の ${share.toFixed(1)}%)`,
      };
    }),
  })), ctx.getUiState().ui.comparison.matrixSorts.finger);

  elements.fingerMatrix.innerHTML = matrixChart(
    fingerRows,
    FINGERS.map((f) => SHORT_FINGER[f]),
    {
      format: (v) => v.toFixed(3),
      labelWidth: 190,
      columnSplit: 4,
      columnGroupLabels: ['左手', '右手'],
      sort: ctx.getUiState().ui.comparison.matrixSorts.finger ?? undefined,
    },
  );

  // 押下数は親指も含めた10本で出す。親指の移動距離は定義上0なので距離の面からは
  // 省いてあるが、押下は現に起きている（薙刀式の右親指など）。距離の面だけを見て
  // 「この指を使っていない」と読まれるのを防ぐため、ここは0の列も含めて全部並べる。
  const pressRows = sortMatrixRows(results.map((r) => ({
    label: r.layout.name,
    color: SERIES(r.slot),
    cells: ALL_FINGERS.map((f) => {
      const perChar = r.metrics.perFingerPresses[f] / Math.max(1, r.metrics.inputChars);
      return {
        value: perChar,
        tip:
          `${escapeText(r.layout.name)} / ${FINGER_LABEL[f]}<br>` +
          `<b>${perChar.toFixed(3)} 押下/文字</b><br>` +
          `押下 <b>${r.metrics.perFingerPresses[f]}</b> 回`,
      };
    }),
  })), ctx.getUiState().ui.comparison.matrixSorts.press);

  elements.pressMatrix.innerHTML = matrixChart(
    pressRows,
    ALL_FINGERS.map((f) => SHORT_FINGER[f]),
    {
      format: (v) => v.toFixed(3),
      labelWidth: 190,
      columnSplit: 5,
      columnGroupLabels: ['左手', '右手'],
      sort: ctx.getUiState().ui.comparison.matrixSorts.press ?? undefined,
    },
  );

  const adjacentColumns = ADJACENT_PAIRS.map((p) => `${SHORT_FINGER[p[0]]}–${SHORT_FINGER[p[1]]}`);
  const adjacentChartOptions = {
    format: (v: number) => v.toFixed(3),
    labelWidth: 190,
    columnSplit: 3,
    columnGroupLabels: ['左手', '右手'] as [string, string],
    // 隣接指の指標は0.02〜0.6の狭い帯に固まる。0起点だと全セルが薄くなって差が読めない
    colorBase: 'min' as const,
  };
  elements.adjacentMeanMatrix.innerHTML = matrixChart(
    adjacentRows(results, 'adjacentMean'),
    adjacentColumns,
    { ...adjacentChartOptions, sort: ctx.getUiState().ui.comparison.matrixSorts.adjacentMean ?? undefined },
  );
  elements.adjacentStdDevMatrix.innerHTML = matrixChart(
    adjacentRows(results, 'adjacentStdDev'),
    adjacentColumns,
    { ...adjacentChartOptions, sort: ctx.getUiState().ui.comparison.matrixSorts.adjacentStdDev ?? undefined },
  );
}

function adjacentRows(results: Result[], kind: AdjacentMatrixKind) {
  return sortMatrixRows(results.map((r) => ({
    label: r.layout.name,
    color: SERIES(r.slot),
    cells: r.metrics.adjacent.map((s) => ({
      value: kind === 'adjacentStdDev' ? s.stdDev : s.meanExcess,
      tip:
        `${escapeText(r.layout.name)} / ${FINGER_LABEL[s.pair[0]]}–${FINGER_LABEL[s.pair[1]]}<br>` +
        `超過の平均 <b>${s.meanExcess.toFixed(3)} u</b><br>` +
        `超過の実測最大 <b>${s.maxExcess.toFixed(3)} u</b><br>` +
        `標準偏差 <b>${s.stdDev.toFixed(3)} u</b>`,
    })),
  })), ctx.getUiState().ui.comparison.matrixSorts[kind]);
}

function cycleMatrixSort(kind: MatrixKind, column: number) {
  ctx.updateUiState((draft) => {
    const current = draft.ui.comparison.matrixSorts[kind];
    draft.ui.comparison.matrixSorts[kind] =
      !current || current.column !== column
        ? { column, direction: 'asc' }
        : current.direction === 'asc'
          ? { column, direction: 'desc' }
          : null;
  });
  render();
}

function bindMatrixSort(root: HTMLElement, kind: MatrixKind) {
  root.addEventListener('click', (e) => {
    const target = (e.target as Element).closest('[data-matrix-sort]');
    if (target) cycleMatrixSort(kind, Number(target.getAttribute('data-matrix-sort')));
  });
  root.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const target = (e.target as Element).closest('[data-matrix-sort]');
    if (!target) return;
    e.preventDefault();
    cycleMatrixSort(kind, Number(target.getAttribute('data-matrix-sort')));
  });
}

function cycleCompareSort(column: number) {
  ctx.updateUiState((draft) => {
    draft.ui.comparison.chartColumn = column;
    const current = draft.ui.comparison.sort;
    draft.ui.comparison.sort =
      !current || current.column !== column
        ? { column, direction: 'asc' }
        : current.direction === 'asc'
          ? { column, direction: 'desc' }
          : null;
  });
  render();
}

function bindCompareSort(root: HTMLElement) {
  root.addEventListener('click', (e) => {
    const target = (e.target as Element).closest('[data-compare-sort]');
    if (target) cycleCompareSort(Number(target.getAttribute('data-compare-sort')));
  });
  root.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const target = (e.target as Element).closest('[data-compare-sort]');
    if (!target) return;
    e.preventDefault();
    cycleCompareSort(Number(target.getAttribute('data-compare-sort')));
  });
}

/**
 * 相対はN=0を100%とした減り方、絶対はそのままの総移動距離。
 * 相対は傾きの比較に、絶対は配列間の差の比較に効く。
 */
function showSensitivityPlaceholder(message = 'N感度はパネルを開くと計算します') {
  elements.sensitivity.innerHTML = `<p class="note">${message}</p>`;
  sensitivityDirty = true;
}

function renderSensitivity(text: string, results: readonly Result[]) {
  const range = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const relative = ctx.getUiState().ui.sensitivity.scale === 'relative';
  const series = results.map(({ layout, slot, geometry, options, analysis }) => {
    const points = nSensitivity(
      text,
      layout,
      geometry,
      options,
      range,
      ctx.romajiRuleIdForLayout(layout),
      analysis.chainPolicy,
      analysis.arpeggioPolicy,
    );
    const base = points[0].totalUnits || 1;
    return {
      name: sensitivityLabel(layout, options, geometry),
      color: SERIES(slot),
      points: points.map((p) => ({
        x: p.windowSize,
        y: relative ? (p.totalUnits / base) * 100 : p.totalUnits,
        // 絶対表示ではy自身が生値なので併記しない
        raw: relative ? p.totalUnits : undefined,
      })),
    };
  });
  // Nを増やしても候補集合が広がるだけで距離は減る一方なので、相対値は100%を超えない。
  // 上端を100%に固定して、自動調整で105%のような目盛りが出るのを防ぐ
  elements.sensitivity.innerHTML = relative
    ? lineChart(series, range, (v) => `${v.toFixed(0)}%`, { yMax: 100 })
    : lineChart(series, range, (v) => `${v.toFixed(0)} u`);
  sensitivityDirty = false;
}

function sensitivityLabel(
  layout: Layout,
  options: Options,
  geometry: ReturnType<typeof buildGeometry>,
): string {
  const defaults = ctx.getUiState().conditions.defaults;
  const override = ctx.getUiState().conditions.perLayout[layout.id];
  const differences = [
    geometry.id !== ctx.getGeometrySettingsForKind(defaults.geometry).shape.id ? `形状=${geometry.name}` : '',
    options.windowSize !== defaults.windowSize ? `N=${options.windowSize}` : '',
    options.sfbHomeCost !== defaults.sfbHomeCost ? 'SFBホーム設定変更' : '',
    options.preferOppositeThumb !== defaults.preferOppositeThumb ? '逆側親指設定変更' : '',
    override?.romajiRule !== undefined ? 'ローマ字個別設定' : '',
    override?.chain !== undefined && !sameChainPolicy(override.chain, defaults.chain)
      ? 'Chain境界個別設定'
      : '',
    override?.arpeggioPolicy !== undefined
      && !sameArpeggioPolicy(override.arpeggioPolicy, defaults.arpeggioPolicy)
      ? 'ArpeggioPolicy個別設定'
      : '',
  ].filter(Boolean);
  return differences.length === 0 ? layout.name : `${layout.name}（${differences.join('・')}）`;
}

function renderDetail(results: Result[]) {
  const found = results.find((r) => r.layout.id === elements.detailLayout.value) ?? results[0];
  const { metrics, layout, geometry, options } = found;

  elements.detailConditions.textContent = metricConditionText(metrics, layout);

  ctx.playback.render(found.trace, layout, geometry, options, found.analysis);
  renderHeatmap(metrics, layout, geometry);

  const total = metrics.totalUnits || 1;
  // 並び順が手の左右と一致するよう、左小指から右小指へ横に並べる
  elements.fingerChart.innerHTML = columnChart(
    FINGERS.map((f) => ({
      label: SHORT_FINGER[f],
      group: f[0] === 'L' ? '左手' : '右手',
      value: metrics.perFinger[f],
      tip: `${FINGER_LABEL[f]}<br>移動 <b>${metrics.perFinger[f].toFixed(1)} u</b>` +
        ` (全体の ${((metrics.perFinger[f] / total) * 100).toFixed(1)}%)<br>` +
        `押下 <b>${metrics.perFingerPresses[f]}</b> 回` +
        ` (${((metrics.perFingerPresses[f] / Math.max(1, metrics.presses)) * 100).toFixed(1)}%)`,
    })),
    { format: (v) => v.toFixed(0) },
  );

  elements.adjacentChart.innerHTML = columnChart(
    metrics.adjacent.map((s) => ({
      label: `${SHORT_FINGER[s.pair[0]]}–${SHORT_FINGER[s.pair[1]]}`,
      group: s.pair[0][0] === 'L' ? '左手' : '右手',
      value: s.stdDev,
      tip: `${FINGER_LABEL[s.pair[0]]}–${FINGER_LABEL[s.pair[1]]}<br>` +
        `超過の平均 <b>${s.meanExcess.toFixed(3)} u</b><br>` +
        `超過の実測最大 <b>${s.maxExcess.toFixed(3)} u</b><br>` +
        `標準偏差 <b>${s.stdDev.toFixed(3)} u</b>`,
    })),
    { format: (v) => v.toFixed(3) },
  );
}

function triggerKeyText(key: string, legends: Map<string, string>): string {
  const resolved = resolveKeyId(key);
  return resolved === THUMB_KEY.LT || resolved === THUMB_KEY.RT
    ? legends.get(resolved) ?? resolved
    : resolved;
}

function triggerText(face: Layer['faces'][number], legends: Map<string, string>): string {
  return face.trigger.map((key) => triggerKeyText(key, legends)).join(' + ');
}

function isNaginataCenterShift(layout: Layout, face: Layer['faces'][number]): boolean {
  return layout.id === 'naginata-v18' && displayTriggerKeys(layout, face).length === 2;
}

function displayTriggerText(layout: Layout, face: Layer['faces'][number]): string {
  if (isNaginataCenterShift(layout, face)) return '左右のSpace';
  return displayTriggerKeys(layout, face)
    .map((key) => triggerKeyText(key, layout.legends))
    .join(' + ');
}

function triggerHandText(face: Layer['faces'][number]): string {
  const hands = new Set(face.trigger.map(handOfKey).filter((hand): hand is NonNullable<typeof hand> => hand !== undefined));
  if (hands.size !== 1) return '両手';
  return hands.has('left') ? '左手' : '右手';
}

function displayTriggerAnnotation(layout: Layout, face: Layer['faces'][number]): string {
  if (isNaginataCenterShift(layout, face)) return 'SandS';
  return `${triggerHandText(face)} ${displayTriggerText(layout, face)}を押す`;
}

function displayLayerLegend(layout: Layout, key: string, label: string): string {
  const resolved = resolveKeyId(key);
  return layout.id === 'naginata-v18' && (resolved === THUMB_KEY.LT || resolved === THUMB_KEY.RT)
    ? 'Space'
    : label;
}

function layerTitle(layer: Layer, index: number, layout: Layout): string {
  if (layer.faces.length === 0) return `レイヤー ${index + 1}: 単打`;
  const triggers = layer.faces
    .filter((face) => face.trigger.length > 0)
    .map((face) => displayTriggerText(layout, face));
  if (triggers.length === 0) return `レイヤー ${index + 1}: 単打`;
  const names = [...new Set(layer.faces.map((face) => face.layer).filter((name): name is string => name !== undefined))];
  const name = names.length === 1
    ? names[0]
    : layer.faces.some((face) => isNaginataCenterShift(layout, face)) ? 'SandS' : 'シフト';
  const modes = [...new Set(layer.faces.map((face) => face.mode))]
    .map((mode) => mode === 'simultaneous' ? '同時' : mode === 'prefix' ? '前置' : '後置')
    .join(' / ');
  return `レイヤー ${index + 1}: ${name} [${triggers.join(' / ')}]・${modes}`;
}

interface LayerCell {
  label: string;
  annotation?: string;
}

function layerCells(layer: Layer, layout: Layout): Map<string, LayerCell> {
  if (layer.faces.length === 0) {
    return new Map([...layout.legends].map(([key, label]) => [key, {
      label: displayLayerLegend(layout, key, label),
    }]));
  }

  const cells = new Map<string, LayerCell>();
  const labels = foldedLayerCells(layer, layout.faces ?? []);
  for (const face of layer.faces) {
    const annotation = face.trigger.length > 0
      ? displayTriggerAnnotation(layout, face)
      : undefined;
    for (const [key, label] of faceCells(face)) {
      const previous = cells.get(key);
      cells.set(key, previous
        ? { label: `${previous.label} / ${label}`, annotation: previous.annotation ?? annotation }
        : { label, annotation });
    }
  }
  for (const [key, label] of labels) {
    if (!cells.has(key)) cells.set(key, { label });
  }
  return cells;
}

/**
 * 配列図のキーをクリックしてコンボトリガーを選び、相方候補を探すための表示情報。
 * 選択状態そのものは呼び出し側（createResultsViewのクロージャ）が持つ。
 */
interface ComboPickerValues {
  layoutId: string;
  /** このSVGでクリックによる選択操作を受け付けるか。 */
  clickable: boolean;
  selected: ReadonlySet<string>;
  /** 相方候補キーごとの要約ラベル（少数なら出力そのもの、多数ならグループ件数）。 */
  candidateLabels: ReadonlyMap<string, string>;
  /** ガイド表示ON時、常時トリガーとして薄く示す物理キー集合。 */
  guideKeys?: ReadonlySet<string>;
}

interface HeatmapValues {
  keyCounts: ReadonlyMap<string, number>;
  /** 色の濃淡専用。ツールチップにはkeyCountsの実測値を使う。 */
  colorCounts: ReadonlyMap<string, number>;
  keyDistance: ReadonlyMap<string, number>;
  maxCount: number;
  colorScale: LayerColorScale;
  showHeat: boolean;
  ariaSuffix: string;
  /** レイヤー図以外でtriggerを強調表示する場合のツールチップ文言。 */
  triggerTipLabel?: string;
  picker?: ComboPickerValues;
}

function heatIntensity(count: number, maxCount: number, scale: LayerColorScale): number {
  if (scale === 'log') {
    return Math.log1p(count) / Math.log1p(Math.max(1, maxCount));
  }
  return count / Math.max(1, maxCount);
}

function renderLayerSvg(
  metrics: Metrics,
  layout: Layout,
  geometry: ReturnType<typeof buildGeometry>,
  layer: Layer,
  title: string,
  allLayerFaces: readonly Face[],
  faceShiftStyles: ReadonlyMap<Face, LayerShiftStyle>,
  values: HeatmapValues,
): string {
  const labels = layerCells(layer, layout);
  const showHeat = values.showHeat;
  const triggerFaces = layer.faces.length === 0 ? allLayerFaces : layer.faces;
  const shiftStyles = new Map<string, LayerShiftStyle>();
  for (const face of triggerFaces) {
    const style = faceShiftStyles.get(face);
    if (!style) continue;
    for (const trigger of displayTriggerKeys(layout, face)) {
      if (handOfKey(trigger)) shiftStyles.set(resolveKeyId(trigger), style);
    }
  }
  const max = values.maxCount;
  // 隣に並ぶマトリックス（セル54×24）と同じくらいの密度に合わせる。
  // 図は実寸で置くので、この値がそのまま画面上のキーの大きさになる
  const KEY = 30;
  const PAD = 6;
  const THUMB_W = 1.9;
  let maxX = 0;
  let maxY = 0;

  const keys = [...geometry.keys.values()].map((key) => {
    const count = values.keyCounts.get(key.id) ?? 0;
    const colorCount = values.colorCounts.get(key.id) ?? 0;
    const t = heatIntensity(colorCount, max, values.colorScale);
    const thumb = key.row === THUMB_ROW;
    const w = (thumb ? THUMB_W : 1) * KEY;
    const x = (key.x - (thumb ? (THUMB_W - 1) / 2 : 0)) * KEY;
    const y = key.y * KEY;
    maxX = Math.max(maxX, x + w);
    maxY = Math.max(maxY, y + KEY);
    const cell = labels.get(key.id);
    const label = cell?.label ?? '';
    const annotation = cell?.annotation;
    const shiftStyle = shiftStyles.get(key.id);
    const share = ((count / Math.max(1, metrics.presses)) * 100).toFixed(1);
    const distance = values.keyDistance.get(key.id) ?? 0;
    const shiftTip = shiftStyle
      ? `<br><b>${values.triggerTipLabel
        ?? (layout.id === 'naginata-v18' && (key.id === THUMB_KEY.LT || key.id === THUMB_KEY.RT)
          ? `SandS（レイヤー ${shiftStyle.layerIndex}）`
          : `レイヤー ${shiftStyle.layerIndex} のシフトトリガー`)}</b>`
      : '';
    const picker = values.picker;
    const isSelected = picker?.selected.has(key.id) ?? false;
    const candidateLabel = picker?.candidateLabels.get(key.id);
    const isGuide = !isSelected && !candidateLabel && (picker?.guideKeys?.has(key.id) ?? false);
    const pickerTip = isSelected
      ? '<br><b>選択中のトリガー</b>'
      : candidateLabel
        ? `<br><b>相方候補:</b> ${escapeText(candidateLabel)}`
        : isGuide
          ? '<br><span style="color:var(--muted)">コンボ/レイヤーのトリガー</span>'
          : '';
    const annotationText = annotation ? `<br>${escapeText(annotation)}` : '';
    const tip = showHeat
      ? `${escapeText(label || key.id)} <span style="color:var(--muted)">(${key.id})</span><br>` +
        `<b>${count}</b> 打 (${share}%)<br>移動 <b>${distance.toFixed(1)} u</b>` +
        annotationText + shiftTip + pickerTip
      : `${escapeText(label || key.id)} <span style="color:var(--muted)">(${key.id})</span>` +
        annotationText + shiftTip + pickerTip;
    const fontSize = thumb ? 10 : label.length > 3 ? 9 : 12;
    const text = `<text x="${x + w / 2}" y="${y + KEY / 2 + 4}" text-anchor="middle"
        font-size="${fontSize}" fill="${showHeat && t > 0.5 ? 'var(--on-heat)' : 'var(--fg)'}"
        pointer-events="none">${escapeText(label)}</text>`;
    // 隣り合う面が地色で2px離れるよう、キー矩形は内側に1px詰める
    const fill = showHeat
      ? `color-mix(in oklab, var(--heat-1) ${(t * 100).toFixed(1)}%, var(--heat-0))`
      : 'var(--panel)';
    const stroke = isSelected
      ? 'var(--series-2)'
      : candidateLabel
        ? 'var(--series-3)'
        : isGuide
          ? 'var(--series-4)'
          : shiftStyle
            ? `var(--series-${shiftStyle.colorSlot})`
            : 'var(--line)';
    const strokeWidth = isSelected || candidateLabel ? 3 : shiftStyle ? 3 : isGuide ? 2 : 1;
    const pickerAttrs = picker?.clickable
      ? ` class="picker-key tip-wrap" data-picker-key="${escapeAttr(key.id)}" data-layout-id="${escapeAttr(picker.layoutId)}"`
      : '';
    return `<g data-tip="${escapeAttr(tip)}"${pickerAttrs}>
      <rect x="${x + 1}" y="${y + 1}" width="${w - 2}" height="${KEY - 2}" rx="5"
        fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/>
      ${text}
    </g>`;
  });

  // 実寸を属性で持たせ、CSS側（.fig-fixed）で引き伸ばさずに置く
  const W = maxX + PAD;
  const H = maxY + PAD;
  const caption = showHeat ? `${title}・打鍵頻度` : title;
  const ariaLabel = `${caption}${values.ariaSuffix}`;
  return `<figure class="layer-diagram" style="width:${W}px">
    <figcaption>${escapeText(caption)}</figcaption>
    <svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img"
      aria-label="${escapeAttr(ariaLabel)}">${keys.join('')}</svg>
  </figure>`;
}

function renderComboTable(
  metrics: Metrics,
  combos: readonly Face[],
  layout: Layout,
  geometry: ReturnType<typeof buildGeometry>,
  picker: ComboPickerValues,
): string {
  const resolvedCombos = layout.resolvedComboDefinitions ?? [];
  if (combos.length === 0 && resolvedCombos.length === 0) return '';

  type ComboDiagramItem = {
    face: Face;
    trigger: string;
    optionLabel: string;
  };

  const faceItems: ComboDiagramItem[] = combos.map((face) => {
    const trigger = triggerText(face, layout.legends);
    return { face, trigger, optionLabel: trigger };
  });

  const foldedResolved = new Map<string, {
    group: string;
    triggerInputs: readonly string[];
    triggerKeys: readonly string[];
    entries: Record<string, string>;
  }>();
  for (const combo of resolvedCombos) {
    if (
      combo.foldTriggerInputs === undefined
      || combo.foldTriggerKeys === undefined
      || combo.foldTargetKey === undefined
    ) continue;

    const group = combo.group ?? 'コンボ';
    const key = `${group}\0${combo.foldTriggerKeys.join('\0')}`;
    const folded = foldedResolved.get(key) ?? {
      group,
      triggerInputs: combo.foldTriggerInputs,
      triggerKeys: combo.foldTriggerKeys,
      entries: {},
    };
    folded.entries[combo.foldTargetKey] = combo.output;
    foldedResolved.set(key, folded);
  }

  const resolvedItems: ComboDiagramItem[] = [...foldedResolved.values()].map((folded) => {
    const trigger = folded.triggerInputs.join(' + ');
    return {
      face: {
        ...faceFromEntries(folded.triggerKeys, 'simultaneous', folded.entries),
        inputRole: 'composition',
        triggerPersistence: 'single',
      },
      trigger,
      optionLabel: `${folded.group}: ${trigger}`,
    };
  });

  const items = [...faceItems, ...resolvedItems];
  const selected = items.length === 0
    ? 0
    : Math.min(comboDiagramSelection.get(layout.id) ?? 0, items.length - 1);
  const comboStyles = new Map<Face, LayerShiftStyle>(
    items.map(({ face }) => [face, { layerIndex: 1, colorSlot: 4 }]),
  );
  const emptyCounts = new Map<string, number>();
  const diagrams = items.map((item, index) => {
    const diagram = renderLayerSvg(
      metrics,
      layout,
      geometry,
      { faces: [item.face] },
      item.optionLabel,
      [item.face],
      comboStyles,
      {
        keyCounts: emptyCounts,
        colorCounts: emptyCounts,
        keyDistance: emptyCounts,
        maxCount: 1,
        colorScale: 'linear',
        showHeat: false,
        ariaSuffix: '（コンボ配列図）',
        triggerTipLabel: `コンボ: ${item.trigger}`,
        picker: { ...picker, guideKeys: undefined },
      },
    );
    return diagram.replace(
      '<figure class="layer-diagram"',
      `<figure class="layer-diagram combo-diagram" data-combo-diagram="${index}"${index === selected ? '' : ' hidden'}`,
    );
  }).join('');

  const options = items.map((item, index) =>
    `<option value="${index}"${index === selected ? ' selected' : ''}>${escapeText(item.optionLabel)}</option>`
  ).join('');

  const faceRows = combos.map((face) => {
    const outputs = [...faceCells(face).values()].join(' / ');
    return `<tr><td>${escapeText(triggerText(face, layout.legends))}</td><td>${escapeText(outputs)}</td></tr>`;
  });
  const resolvedRows = resolvedCombos.map((combo) => {
    const trigger = combo.inputs.join(' + ');
    const prefix = combo.group ? `${combo.group}: ` : '';
    return `<tr><td>${escapeText(prefix + trigger)}</td><td>${escapeText(combo.output)}</td></tr>`;
  });
  const rows = [...faceRows, ...resolvedRows].join('');

  const diagramBlock = items.length === 0 ? '' : `
    <div class="combo-diagram-controls">
      <label>配列図
        <select data-combo-face-select data-layout-id="${escapeAttr(layout.id)}">${options}</select>
      </label>
    </div>
    <div class="combo-diagram-panel">${diagrams}</div>`;

  const count = combos.length + resolvedCombos.length;
  return `<section class="combo-section">
    <h3>コンボ（${count}）</h3>
    ${diagramBlock}
    <details class="combo-table collapsible-list"${ctx.getUiState().ui.panels.comboTable ? ' open' : ''}>
      <summary>コンボ表</summary>
      <div class="scroll-x"><table>
        <thead><tr><th>トリガー</th><th>出力</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>
    </details>
  </section>`;
}

function renderModifierList(modifiers: readonly Layer[], legends: Map<string, string>): string {
  if (modifiers.length === 0) return '';
  const rows = modifiers.map((layer) => {
    const names = [...new Set(layer.faces.map((face) => face.layer).filter((name): name is string => name !== undefined))];
    const triggers = layer.faces.map((face) => triggerText(face, legends)).join(' / ');
    const title = names.length === 1 ? `${names[0]}: ${triggers}` : triggers;
    const outputs = layer.faces.flatMap((face) => [...faceCells(face).values()]).join(' / ');
    return `<tr><td>${escapeText(title)}</td><td>${escapeText(outputs)}</td></tr>`;
  }).join('');
  return `<details class="modifier-list collapsible-list"${ctx.getUiState().ui.panels.modifierList ? ' open' : ''}>
    <summary>修飾（${modifiers.length}）</summary>
    <div class="scroll-x"><table>
      <thead><tr><th>トリガー</th><th>出力</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
  </details>`;
}

function layerIdForFace(layout: Layout, face: Face): string {
  const known = layout.faceLayerIds?.get(face);
  if (known) return known;
  const index = layout.faces?.indexOf(face) ?? -1;
  if (face.trigger.length > 1) return COMBO_LAYER_ID;
  return face.layer === undefined ? `face:${index}` : `layer:${face.layer}`;
}

function orderedLayers(groups: ReturnType<typeof classifyFaces>, layout: Layout): Layer[] {
  return [...groups.layers, ...groups.modifiers]
    .sort((first, second) => {
      const firstIndex = Math.min(...first.faces.map((face) => layout.faces?.indexOf(face) ?? Number.MAX_SAFE_INTEGER));
      const secondIndex = Math.min(...second.faces.map((face) => layout.faces?.indexOf(face) ?? Number.MAX_SAFE_INTEGER));
      return firstIndex - secondIndex;
    });
}

interface LayerViewEntry {
  layer: Layer;
  title: string;
  stat: LayerStat;
}

function emptyLayerStat(id: string, label: string): LayerStat {
  return {
    id,
    label,
    presses: 0,
    keyCounts: new Map(),
    keyDistance: new Map(),
    triggerKeyCounts: new Map(),
    pairedTriggerKeyCounts: new Map(),
  };
}

function mergeLayerStats(id: string, label: string, stats: readonly LayerStat[]): LayerStat {
  const keyCounts = new Map<string, number>();
  const keyDistance = new Map<string, number>();
  const triggerKeyCounts = new Map<string, number>();
  const pairedTriggerKeyCounts = new Map<string, number>();
  let presses = 0;
  for (const stat of stats) {
    presses += stat.presses;
    for (const [key, count] of stat.keyCounts) {
      keyCounts.set(key, (keyCounts.get(key) ?? 0) + count);
    }
    for (const [key, distance] of stat.keyDistance) {
      keyDistance.set(key, (keyDistance.get(key) ?? 0) + distance);
    }
    for (const [key, count] of stat.triggerKeyCounts) {
      triggerKeyCounts.set(key, (triggerKeyCounts.get(key) ?? 0) + count);
    }
    for (const [key, count] of stat.pairedTriggerKeyCounts) {
      pairedTriggerKeyCounts.set(key, (pairedTriggerKeyCounts.get(key) ?? 0) + count);
    }
  }
  return { id, label, presses, keyCounts, keyDistance, triggerKeyCounts, pairedTriggerKeyCounts };
}

function layerViewEntries(metrics: Metrics, layout: Layout, layers: readonly Layer[]): LayerViewEntry[] {
  const stats = new Map(metrics.layers.map((stat) => [stat.id, stat]));
  const entries = layers.map((layer, index) => {
    const id = layer.faces.length > 0 ? layerIdForFace(layout, layer.faces[0]) : SINGLE_LAYER_ID;
    const title = layerTitle(layer, index, layout);
    return {
      layer,
      title,
      stat: stats.get(id) ?? emptyLayerStat(id, title),
    };
  });
  if (layout.id !== 'naginata-v18' || ctx.getUiState().ui.layers.naginataDetail || entries.length <= 2) return entries;

  const base = entries[0];
  const center = entries[1];
  const rest = entries.slice(2);
  return [
    {
      ...base,
      title: `${base.title}（レイヤー3以降を合算）`,
      stat: mergeLayerStats('naginata-default', `${base.title}（レイヤー3以降を合算）`, [
        base.stat,
        ...rest.map((entry) => entry.stat),
      ]),
    },
    center,
  ];
}

function renderLayerStats(
  metrics: Metrics,
  entries: readonly LayerViewEntry[],
  hasCombos: boolean,
): string {
  const total = metrics.presses;
  const rows = entries.map(({ title, stat }) => {
    const presses = stat.presses;
    const share = total ? (presses / total) * 100 : 0;
    return `<tr><th scope="row">${escapeText(title)}</th>` +
      `<td class="num">${presses}</td><td class="num">${share.toFixed(1)}%</td></tr>`;
  }).join('');
  const comboRow = hasCombos
    ? `<tr><th scope="row">コンボ計</th><td class="num">${metrics.comboPresses}</td>` +
      `<td class="num">${total ? ((metrics.comboPresses / total) * 100).toFixed(1) : '0.0'}%</td></tr>`
    : '';
  return `<details class="layer-stats collapsible-list"${ctx.getUiState().ui.panels.layerStats ? ' open' : ''}>
    <summary>帰属先（${entries.length + (hasCombos ? 1 : 0)}）</summary>
    <div class="scroll-x"><table><thead><tr><th>帰属先</th><th>押下数</th><th>割合</th></tr></thead>
    <tbody>${rows}${comboRow}</tbody></table></div>
    <p class="note">層とコンボの押下数の合計: ${metrics.layers.reduce((sum, stat) => sum + stat.presses, 0) + metrics.comboPresses} / 総押下数: ${metrics.presses}</p>
  </details>`;
}

function renderHeatmap(
  metrics: Metrics,
  layout: Layout,
  geometry: ReturnType<typeof buildGeometry>,
) {
  const faces = layout.faces ?? [];
  const groups = classifyFaces(faces);
  const layers = orderedLayers(groups, layout);
  if (layers.length === 0) layers.push({ faces: [] });
  const entries = layerViewEntries(metrics, layout, layers);
  if (ctx.getUiState().ui.layers.activeTab >= entries.length) {
    ctx.updateUiState((draft) => { draft.ui.layers.activeTab = 0; });
  }
  const titles = entries.map((entry) => entry.title);
  const allLayerFaces = layers.flatMap((layer) => layer.faces);
  const displayLayers = entries.map((entry) => entry.layer);
  const faceShiftStyles = layerShiftStyles(displayLayers);
  const shiftLayers = entries
    .map((entry, index) => ({
      layer: entry.layer,
      index,
      style: entry.layer.faces
        .map((face) => faceShiftStyles.get(face))
        .find((style): style is LayerShiftStyle => style !== undefined),
    }))
    .filter((entry): entry is { layer: Layer; index: number; style: LayerShiftStyle } => entry.style !== undefined);
  const shiftLegend = shiftLayers.length > 0
    ? `<div class="shift-key-legend" aria-label="シフトキーの枠色">
        ${shiftLayers.map(({ layer, index, style }) => {
          const label = layer.faces.some((face) => isNaginataCenterShift(layout, face))
            ? 'SandS'
            : 'シフト';
          return `<span class="shift-key-swatch" style="--shift-color:var(--series-${style.colorSlot})">レイヤー ${index + 1} の${label}</span>`;
        }).join('')}
      </div>`
    : '';
  const selectedLayerView = ctx.getUiState().ui.layers.view === 'auto'
    ? (entries.length <= 5 ? 'side-by-side' : 'tabs')
    : ctx.getUiState().ui.layers.view;
  const colorScaleControls = `<div class="layer-view-controls" role="group" aria-label="層別ヒートマップの色の尺度">
      <span>色の尺度</span>
      <button type="button" class="ghost" data-layer-color-scale="linear" aria-pressed="${ctx.getUiState().ui.layers.colorScale === 'linear'}">線形</button>
      <button type="button" class="ghost" data-layer-color-scale="log" aria-pressed="${ctx.getUiState().ui.layers.colorScale === 'log'}">対数</button>
    </div>`;
  const naginataControls = layout.id === 'naginata-v18' && layers.length > 2
    ? `<div class="layer-view-controls" role="group" aria-label="薙刀式のレイヤー表示">
        <span>薙刀式の表示</span>
        <button type="button" class="ghost" data-naginata-layer-detail="false" aria-pressed="${!ctx.getUiState().ui.layers.naginataDetail}">2面にまとめる</button>
        <button type="button" class="ghost" data-naginata-layer-detail="true" aria-pressed="${ctx.getUiState().ui.layers.naginataDetail}">全レイヤー詳細</button>
      </div>`
    : '';
  const controls = entries.length > 1
    ? `<div class="layer-view-controls" role="group" aria-label="レイヤーの表示方法">
        <span>レイヤーの表示</span>
        <button type="button" class="ghost" data-layer-view="side-by-side" aria-pressed="${selectedLayerView === 'side-by-side'}">並置</button>
        <button type="button" class="ghost" data-layer-view="tabs" aria-pressed="${selectedLayerView === 'tabs'}">タブ</button>
      </div>`
    : '';
  const commonMax = Math.max(1, ...metrics.keyCounts.values());
  const baseLayer = layers.find((layer) => layer.faces.some((face) => face.trigger.length === 0)) ?? layers[0];

  const pickerSelection = getPickerSelection(layout.id);
  const pickerMatch = matchCombos(layout, pickerSelection);
  const pickerCandidateLabels = new Map(
    [...pickerMatch.candidates].map(([key, matches]) => [key, summarizeCandidateMatches(matches)]),
  );
  const pickerGuideEnabled = comboPickerGuideEnabled.get(layout.id) ?? false;
  const pickerGuideKeys = pickerGuideEnabled ? allTriggerKeys(layout) : undefined;
  const pickerBase: ComboPickerValues = {
    layoutId: layout.id,
    clickable: true,
    selected: pickerSelection,
    candidateLabels: pickerCandidateLabels,
    guideKeys: pickerGuideKeys,
  };

  const integrated = renderLayerSvg(
    metrics,
    layout,
    geometry,
    baseLayer,
    '統合',
    allLayerFaces,
    faceShiftStyles,
    {
      keyCounts: metrics.keyCounts,
      colorCounts: metrics.keyCounts,
      keyDistance: metrics.keyDistance,
      maxCount: commonMax,
      colorScale: 'linear',
      showHeat: true,
      ariaSuffix: '（全レイヤー合算・物理位置）',
      picker: pickerBase,
    },
  );
  const colorCounts = entries.map((entry) => normalizedLayerColors(entry.layer, entry.stat));
  const layerMax = Math.max(1, ...colorCounts.flatMap((counts) => [...counts.values()]));
  const diagrams = entries.map((entry, index) => {
    return renderLayerSvg(
      metrics,
      layout,
      geometry,
      entry.layer,
      titles[index],
      allLayerFaces,
      faceShiftStyles,
      {
        keyCounts: entry.stat.keyCounts,
        colorCounts: colorCounts[index],
        keyDistance: entry.stat.keyDistance,
        maxCount: layerMax,
        colorScale: ctx.getUiState().ui.layers.colorScale,
        showHeat: true,
        ariaSuffix: `（層別・${ctx.getUiState().ui.layers.colorScale === 'log' ? '対数' : '線形'}・共通スケール）`,
        picker: { ...pickerBase, guideKeys: undefined },
      },
    );
  });
  const pickerResultText = pickerSelection.size === 0
    ? '配列図のキーをクリックすると、コンボのトリガーとして選べる。'
    : pickerMatch.exact.length > 0
      ? `選択中のキーで確定: <b>${pickerMatch.exact.map((match) => escapeText(match.output)).join(' / ')}</b>`
      : pickerMatch.candidates.size > 0
        ? '緑の枠が相方候補。もう1キー選ぶとコンボが確定する。'
        : 'このキーの組み合わせに一致するコンボは無い。';
  const pickerControls = `<div class="combo-picker-controls">
      <p class="combo-picker-result">${pickerResultText}</p>
      <label><input type="checkbox" data-picker-guide data-layout-id="${escapeAttr(layout.id)}"${pickerGuideEnabled ? ' checked' : ''}> コンボ・レイヤートリガーをガイド表示</label>
      <button type="button" class="ghost" data-picker-clear data-layout-id="${escapeAttr(layout.id)}"${pickerSelection.size === 0 ? ' disabled' : ''}>選択をクリア</button>
    </div>`;
  const content = selectedLayerView === 'tabs' && entries.length > 1
    ? `<div class="layer-tabs" role="tablist" aria-label="レイヤー">
        ${titles.map((_, index) => `<button type="button" class="ghost" role="tab"
          aria-selected="${ctx.getUiState().ui.layers.activeTab === index}" data-layer-tab="${index}">${escapeText(`レイヤー ${index + 1}`)}</button>`).join('')}
      </div>
      <div class="layer-tab-panel">${diagrams.map((diagram, index) =>
        diagram.replace('<figure class="layer-diagram"', `<figure class="layer-diagram"${ctx.getUiState().ui.layers.activeTab === index ? '' : ' hidden'}`),
      ).join('')}</div>`
    : `<div class="layer-diagrams">${diagrams.join('')}</div>`;
  const hasCombos = groups.combos.length > 0 || layout.layerDefinitions?.some((definition) => definition.kind === 'combo') === true;
  const colorScaleLabel = ctx.getUiState().ui.layers.colorScale === 'log' ? '対数' : '線形';
  const layerSection = `<section class="layer-section">
    <h3>統合ヒートマップ</h3>
    ${pickerControls}
    <div class="layer-diagrams">${integrated}</div>
  </section>
  <section class="layer-section">
    <h3>層別ヒートマップ（${entries.length}）</h3>
    <p class="note">層別図の色は層操作のための押下を除いたキー押下数で正規化し、表示中の全層で共通の最大値にしている。相互同時シフトと薙刀式の合算表示では、出力として扱うトリガー押下を色に残す。色の尺度は${colorScaleLabel}。実際の押下数はツールチップと帰属先表に残る。</p>
    ${colorScaleControls}${shiftLegend}${naginataControls}${controls}${content}
    ${renderLayerStats(metrics, entries, hasCombos)}
  </section>`;
  elements.heatmap.innerHTML = layerSection + renderModifierList(groups.modifiers, layout.legends) +
    renderComboTable(metrics, groups.combos, layout, geometry, pickerBase);
}

function syncSensitivityScaleButtons(): void {
  for (const button of elements.sensitivityScale.querySelectorAll('button')) {
    button.setAttribute('aria-pressed', String(button.dataset.scale === ctx.getUiState().ui.sensitivity.scale));
  }
}

function setSensitivityScale(scale: SensitivityScale) {
  ctx.updateUiState((draft) => { draft.ui.sensitivity.scale = scale; });
  syncSensitivityScaleButtons();
  render();
}
  function setup(): void {
    elements.sensitivityPanel.addEventListener('toggle', () => {
      ctx.updateUiState((draft) => { draft.ui.panels.sensitivity = elements.sensitivityPanel.open; });
      if (!elements.sensitivityPanel.open) {
        showSensitivityPlaceholder();
        return;
      }
      if (sensitivityDirty) render();
    });
    elements.sensitivityScale.addEventListener('click', (e) => {
      const button = (e.target as Element).closest<HTMLButtonElement>('button[data-scale]');
      if (!button) return;
      e.preventDefault();
      setSensitivityScale(button.dataset.scale as SensitivityScale);
    });
    elements.heatmap.addEventListener('change', (e) => {
      const guideCheckbox = (e.target as Element).closest<HTMLInputElement>('input[data-picker-guide]');
      if (guideCheckbox) {
        const layoutId = guideCheckbox.dataset.layoutId;
        if (layoutId) comboPickerGuideEnabled.set(layoutId, guideCheckbox.checked);
        render();
        return;
      }
      const select = (e.target as Element).closest<HTMLSelectElement>('select[data-combo-face-select]');
      if (!select) return;
      const index = Number(select.value);
      const layoutId = select.dataset.layoutId;
      if (layoutId) comboDiagramSelection.set(layoutId, index);
      const container = select.closest('.combo-section');
      if (!container) return;
      for (const diagram of container.querySelectorAll<HTMLElement>('[data-combo-diagram]')) {
        diagram.hidden = Number(diagram.dataset.comboDiagram) !== index;
      }
    });
    elements.heatmap.addEventListener('click', (e) => {
      const pickerKey = (e.target as Element).closest<SVGGElement>('[data-picker-key]');
      if (pickerKey) {
        const keyId = pickerKey.dataset.pickerKey;
        const layoutId = pickerKey.dataset.layoutId;
        if (keyId && layoutId) {
          const selection = getPickerSelection(layoutId);
          if (selection.has(keyId)) selection.delete(keyId);
          else selection.add(keyId);
          render();
        }
        return;
      }
      const target = (e.target as Element).closest<HTMLButtonElement>('button');
      if (!target) return;
      if (target.dataset.pickerClear !== undefined) {
        const layoutId = target.dataset.layoutId;
        if (layoutId) getPickerSelection(layoutId).clear();
        render();
        return;
      }
      if (target.dataset.naginataLayerDetail !== undefined) {
        ctx.updateUiState((draft) => {
          draft.ui.layers.naginataDetail = target.dataset.naginataLayerDetail === 'true';
          draft.ui.layers.activeTab = 0;
        });
        render();
        return;
      }
      if (target.dataset.layerColorScale === 'linear' || target.dataset.layerColorScale === 'log') {
        ctx.updateUiState((draft) => { draft.ui.layers.colorScale = target.dataset.layerColorScale as LayerColorScale; });
        render();
        return;
      }
      if (target.dataset.layerView === 'side-by-side' || target.dataset.layerView === 'tabs') {
        ctx.updateUiState((draft) => { draft.ui.layers.view = target.dataset.layerView as LayerView; });
        render();
        return;
      }
      if (target.dataset.layerTab !== undefined) {
        ctx.updateUiState((draft) => { draft.ui.layers.activeTab = Number(target.dataset.layerTab); });
        render();
      }
    });
    elements.heatmap.addEventListener('toggle', (e) => {
      const details = e.target as HTMLDetailsElement;
      if (!(details instanceof HTMLDetailsElement)) return;
      if (details.classList.contains('layer-stats')) {
        ctx.updateUiState((draft) => { draft.ui.panels.layerStats = details.open; });
      } else if (details.classList.contains('modifier-list')) {
        ctx.updateUiState((draft) => { draft.ui.panels.modifierList = details.open; });
      } else if (details.classList.contains('combo-table')) {
        ctx.updateUiState((draft) => { draft.ui.panels.comboTable = details.open; });
      }
    }, true);
    bindMatrixSort(elements.pressMatrix, 'press');
    bindMatrixSort(elements.fingerMatrix, 'finger');
    bindMatrixSort(elements.adjacentMeanMatrix, 'adjacentMean');
    bindMatrixSort(elements.adjacentStdDevMatrix, 'adjacentStdDev');
    bindCompareSort(elements.compare);
    syncSensitivityScaleButtons();
  }

  return { setup, render, syncSensitivityScaleButtons };
}
