import { useSyncExternalStore } from 'react';
import {
  ADJACENT_PAIRS,
  ALL_FINGERS,
  FINGERS,
  PHYSICAL_SHAPES,
  isPresetGeometryKind,
} from '../geometry.ts';
import { sameArpeggioPolicy } from '../analysis-arpeggio.ts';
import { sameChainPolicy } from '../analysis-chain.ts';
import { nSensitivity } from '../sensitivity.ts';
import {
  escapeText,
  type MatrixRow,
  type MatrixSort,
} from './chart.ts';
import { FINGER_LABEL, SERIES, SHORT_FINGER } from './app-dom.ts';
import type { AnalyzerMetricsModel } from './analyzer-metrics-model.ts';
import type { AnalyzerUiStateOwner } from './analyzer-ui-state-owner.ts';
import type { Result } from './results-view.ts';
import type { MatrixKind } from './ui-state.ts';
import {
  AnalyzerBarChart,
  AnalyzerColumnChart,
  AnalyzerLineChart,
  AnalyzerMatrixChart,
} from './analyzer-chart-components.tsx';

type AdjacentMatrixKind = 'adjacentMean' | 'adjacentStdDev';

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

const COMPARE_FORMATS: Array<(value: number) => string> = [
  (value) => `${value}`,
  (value) => value.toFixed(0),
  (value) => value.toFixed(3),
  (value) => value.toFixed(3),
  (value) => value.toFixed(3),
  (value) => value.toFixed(3),
  (value) => `${value.toFixed(1)}%`,
  (value) => `${value.toFixed(1)}%`,
  (value) => `${value.toFixed(1)}%`,
  (value) => `${value}`,
  (value) => `${value.toFixed(1)}%`,
  (value) => value.toFixed(3),
  (value) => value.toFixed(3),
];

const COMPARE_HEADER_TIPS: Record<number, string> = {
  0: 'Policy適用後の総アクション数',
  1: '全指の総移動距離 (u)',
  2: '1打鍵あたりの平均移動距離 (u/打鍵)',
  3: '入力1文字あたりの総移動距離 (u/文字)',
  4: '入力1文字あたりのアクション数 (1/文字)',
  5: '入力1文字あたりの物理キー押下数 (押下/文字)',
  6: '単打面に配置されている出力文字数 / 全出力文字数 (%)',
  7: '単打面の文字を出力するアクション数 / 全アクション数 (%)',
  8: 'freshに押す物理キーが1つだけのアクション数 / 全アクション数 (%)',
  9: '同じ指で違うキーを続けて打った回数',
  10: '同指連続回数をphysical Stroke数で割った割合 (%)',
  11: '隣接指間距離のホーム間隔からの平均超過を6ペアで平均した値 (u)',
  12: '隣接指間距離の標準偏差を6ペアで平均した値 (u)',
};

interface CompareCell {
  value: number;
  display: string;
}

function compareMetricValues(result: Result): number[] {
  const metrics = result.metrics;
  const adjacentMean = metrics.adjacent.reduce(
    (sum, item) => sum + item.meanExcess,
    0,
  ) / metrics.adjacent.length;
  const adjacentStdDev = metrics.adjacent.reduce(
    (sum, item) => sum + item.stdDev,
    0,
  ) / metrics.adjacent.length;
  return [
    metrics.actions,
    metrics.totalUnits,
    metrics.meanPerStroke,
    metrics.perCharUnits,
    metrics.perCharSteps,
    metrics.perCharPresses,
    metrics.singleTapLayerRate,
    metrics.singleTapRate,
    metrics.singleKeyRate,
    metrics.sameFinger,
    (metrics.sameFinger / Math.max(1, metrics.strokes)) * 100,
    adjacentMean,
    adjacentStdDev,
  ];
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

function sortRows<T extends { cells: readonly { value: number }[] }>(
  rows: readonly T[],
  sort: MatrixSort | null,
): T[] {
  if (!sort) return [...rows];
  return rows
    .map((row, index) => ({ row, index }))
    .sort((left, right) => {
      const leftValue = left.row.cells[sort.column]?.value ?? 0;
      const rightValue = right.row.cells[sort.column]?.value ?? 0;
      const delta = leftValue - rightValue;
      return (sort.direction === 'asc' ? delta : -delta) || left.index - right.index;
    })
    .map(({ row }) => row);
}

function nextSort(current: MatrixSort | null, column: number): MatrixSort | null {
  if (!current || current.column !== column) return { column, direction: 'asc' };
  return current.direction === 'asc'
    ? { column, direction: 'desc' }
    : null;
}

function compareLabel(label: string, relative: boolean, column: number): string {
  return relative ? COMPARE_RELATIVE_HEADERS[column]! : label;
}

function defaultGeometryId(
  state: ReturnType<AnalyzerUiStateOwner['getSnapshot']>,
): string {
  const kind = state.conditions.defaults.geometry;
  return isPresetGeometryKind(kind)
    ? PHYSICAL_SHAPES[kind].id
    : state.conditions.geometrySettings.shape.id;
}

function metricConditionText(
  result: Result,
  state: ReturnType<AnalyzerUiStateOwner['getSnapshot']>,
): string {
  const metrics = result.metrics;
  const layout = result.layout;
  const hasLayoutHomeKeys =
    layout.homeKeys !== undefined && Object.keys(layout.homeKeys).length > 0;
  const defaults = state.conditions.defaults;
  const override = state.conditions.perLayout[layout.id];
  const differences = [
    metrics.geometryId !== defaultGeometryId(state) ? `形状: ${metrics.geometryName}` : '',
    metrics.fingerAssignmentId !== 'default'
      ? `運指: ${metrics.fingerAssignmentName}`
      : '',
    hasLayoutHomeKeys ? 'ホーム: 配列指定' : '',
    metrics.conditions.windowSize !== defaults.windowSize
      ? `N=${metrics.conditions.windowSize}`
      : '',
    metrics.conditions.sfbHomeCost !== defaults.sfbHomeCost ? 'SFBホーム設定変更' : '',
    metrics.conditions.preferOppositeThumb !== defaults.preferOppositeThumb
      ? '逆側親指設定変更'
      : '',
    !sameChainPolicy(metrics.conditions.chainPolicy, defaults.chain)
      ? 'Chain境界設定変更'
      : '',
    !sameArpeggioPolicy(metrics.conditions.arpeggioPolicy, defaults.arpeggioPolicy)
      ? 'Arpeggio構造Policy変更'
      : '',
    override?.romajiRule !== undefined ? `ローマ字: ${override.romajiRule}` : '',
  ].filter(Boolean);
  return `形状: ${metrics.geometryName} / 運指: ${metrics.fingerAssignmentName}`
    + ` / ホーム: ${hasLayoutHomeKeys ? '配列指定' : '形状既定'}`
    + (differences.length > 0
      ? ` / 条件差分: ${differences.join('、')}`
      : ' / 既定条件');
}

function useMetrics(
  model: AnalyzerMetricsModel,
  stateOwner: AnalyzerUiStateOwner,
) {
  const metrics = useSyncExternalStore(
    model.subscribe,
    model.getSnapshot,
    model.getSnapshot,
  );
  const state = useSyncExternalStore(
    stateOwner.subscribe,
    stateOwner.getSnapshot,
    stateOwner.getSnapshot,
  );
  return { metrics, state };
}

export function AnalyzerTextMetricsStatus({
  model,
}: {
  model: AnalyzerMetricsModel;
}) {
  const snapshot = useSyncExternalStore(
    model.subscribe,
    model.getSnapshot,
    model.getSnapshot,
  );
  return (
    <>
      <span className="meta" id="text-meta">{snapshot.textMeta}</span>
      <span className="error" id="errors" hidden={snapshot.errors.length === 0}>
        {snapshot.errors.length > 0
          ? `配列定義の不備: ${snapshot.errors.join(' / ')}`
          : ''}
      </span>
    </>
  );
}

export function AnalyzerComparisonChart({
  model,
  stateOwner,
}: {
  model: AnalyzerMetricsModel;
  stateOwner: AnalyzerUiStateOwner;
}) {
  const { metrics: snapshot, state } = useMetrics(model, stateOwner);
  const results = snapshot.results;
  if (results.length === 0) return null;

  const baselineId = state.ui.comparison.baselineByMode[state.ui.input.mode] ?? '';
  const baseline = results.find((result) => result.layout.id === baselineId);
  const baselineValues = baseline ? compareMetricValues(baseline) : null;
  const rows = sortRows(
    results.map((result) => {
      const values = compareMetricValues(result);
      return {
        result,
        cells: values.map((value, column) => compareCell(
          value,
          baselineValues?.[column] ?? null,
          COMPARE_FORMATS[column]!,
        )),
      };
    }),
    state.ui.comparison.sort,
  );
  const column = state.ui.comparison.chartColumn;
  const chartBest = Math.min(...rows.map((row) => row.cells[column]?.value ?? 0));
  const relative = baseline !== undefined;
  const label = compareLabel(COMPARE_HEADERS[column] ?? '', relative, column);

  return (
    <AnalyzerBarChart
      data={rows.map(({ result, cells }) => {
        const cell = cells[column]!;
        return {
          label: result.layout.name,
          value: cell.value,
          valueLabel: cell.display,
          color: SERIES(result.slot),
          emphasise: column !== 6 && column !== 7 && column !== 8
            && cell.value === chartBest,
          tip: `${escapeText(result.layout.name)}<br>${escapeText(label)} <b>${cell.display}</b>`,
        };
      })}
      options={{
        format: relative
          ? (value) => `${value.toFixed(1)}%`
          : COMPARE_FORMATS[column],
        labelWidth: 150,
      }}
    />
  );
}

export function AnalyzerComparisonTable({
  model,
  stateOwner,
}: {
  model: AnalyzerMetricsModel;
  stateOwner: AnalyzerUiStateOwner;
}) {
  const { metrics: snapshot, state } = useMetrics(model, stateOwner);
  const results = snapshot.results;
  if (results.length === 0) return null;

  const baselineId = state.ui.comparison.baselineByMode[state.ui.input.mode] ?? '';
  const baseline = results.find((result) => result.layout.id === baselineId);
  const baselineValues = baseline ? compareMetricValues(baseline) : null;
  const best = Math.min(...results.map((result) => result.metrics.totalUnits));
  const rows = sortRows(
    results.map((result) => ({
      result,
      cells: compareMetricValues(result).map((value, column) => compareCell(
        value,
        baselineValues?.[column] ?? null,
        COMPARE_FORMATS[column]!,
      )),
    })),
    state.ui.comparison.sort,
  );
  const relative = baseline !== undefined;

  return (
    <>
      <thead>
        <tr>
          <th>配列</th>
          {COMPARE_HEADERS.map((label, column) => {
            const active = state.ui.comparison.sort?.column === column
              ? state.ui.comparison.sort.direction
              : undefined;
            const marker = active === 'asc' ? ' ↑' : active === 'desc' ? ' ↓' : '';
            const shownLabel = compareLabel(label, relative, column);
            const metricTip = COMPARE_HEADER_TIPS[column] ?? '';
            const tip = relative
              ? `比較元を100%とした比率。表示単位: %。元指標: ${metricTip}`
              : metricTip;
            const title = `${tip} クリックごとに昇順・降順・選択順へ切り替える。`;
            return (
              <th key={label}>
                <span
                  className="table-sort"
                  role="button"
                  tabIndex={0}
                  aria-label={`${shownLabel}。 ${title}`}
                  aria-sort={
                    active === 'asc'
                      ? 'ascending'
                      : active === 'desc'
                        ? 'descending'
                        : 'none'
                  }
                  title={title}
                  onClick={() => {
                    stateOwner.update((draft) => {
                      draft.ui.comparison.chartColumn = column;
                      draft.ui.comparison.sort = nextSort(
                        draft.ui.comparison.sort,
                        column,
                      );
                    });
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter' && event.key !== ' ') return;
                    event.preventDefault();
                    stateOwner.update((draft) => {
                      draft.ui.comparison.chartColumn = column;
                      draft.ui.comparison.sort = nextSort(
                        draft.ui.comparison.sort,
                        column,
                      );
                    });
                  }}
                >
                  {shownLabel}{marker}
                </span>
              </th>
            );
          })}
        </tr>
      </thead>
      <tbody>
        {rows.map(({ result, cells }) => (
          <tr
            key={result.layout.id}
            className={result.metrics.totalUnits === best ? 'best' : undefined}
          >
            <td>
              <span
                className="swatch"
                style={{ background: SERIES(result.slot) }}
              />
              {result.layout.name}
              <small className="metric-conditions">
                {metricConditionText(result, state)}
              </small>
            </td>
            {cells.map((cell, index) => (
              <td className="num" key={index}>{cell.display}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </>
  );
}

function matrixRows(
  results: readonly Result[],
  kind: MatrixKind,
  sort: MatrixSort | null,
): MatrixRow[] {
  if (kind === 'finger') {
    return sortRows(results.map((result) => ({
      label: result.layout.name,
      color: SERIES(result.slot),
      cells: FINGERS.map((finger) => {
        const perChar = result.metrics.perFinger[finger]
          / Math.max(1, result.metrics.inputChars);
        const share = (
          result.metrics.perFinger[finger]
          / Math.max(1e-9, result.metrics.totalUnits)
        ) * 100;
        return {
          value: perChar,
          tip: `${escapeText(result.layout.name)} / ${FINGER_LABEL[finger]}<br>`
            + `<b>${perChar.toFixed(3)} u/文字</b> (全体の ${share.toFixed(1)}%)`,
        };
      }),
    })), sort);
  }
  if (kind === 'press') {
    return sortRows(results.map((result) => ({
      label: result.layout.name,
      color: SERIES(result.slot),
      cells: ALL_FINGERS.map((finger) => {
        const perChar = result.metrics.perFingerPresses[finger]
          / Math.max(1, result.metrics.inputChars);
        return {
          value: perChar,
          tip: `${escapeText(result.layout.name)} / ${FINGER_LABEL[finger]}<br>`
            + `<b>${perChar.toFixed(3)} 押下/文字</b><br>`
            + `押下 <b>${result.metrics.perFingerPresses[finger]}</b> 回`,
        };
      }),
    })), sort);
  }

  const adjacentKind = kind as AdjacentMatrixKind;
  return sortRows(results.map((result) => ({
    label: result.layout.name,
    color: SERIES(result.slot),
    cells: result.metrics.adjacent.map((item) => ({
      value: adjacentKind === 'adjacentStdDev' ? item.stdDev : item.meanExcess,
      tip: `${escapeText(result.layout.name)} / ${FINGER_LABEL[item.pair[0]]}–${FINGER_LABEL[item.pair[1]]}<br>`
        + `超過の平均 <b>${item.meanExcess.toFixed(3)} u</b><br>`
        + `超過の実測最大 <b>${item.maxExcess.toFixed(3)} u</b><br>`
        + `標準偏差 <b>${item.stdDev.toFixed(3)} u</b>`,
    })),
  })), sort);
}

export function AnalyzerMatrixResult({
  model,
  stateOwner,
  kind,
}: {
  model: AnalyzerMetricsModel;
  stateOwner: AnalyzerUiStateOwner;
  kind: MatrixKind;
}) {
  const { metrics: snapshot, state } = useMetrics(model, stateOwner);
  const results = snapshot.results;
  if (results.length === 0) return null;
  const sort = state.ui.comparison.matrixSorts[kind];
  const rows = matrixRows(results, kind, sort);
  const isFinger = kind === 'finger';
  const isPress = kind === 'press';
  const columns = isFinger
    ? FINGERS.map((finger) => SHORT_FINGER[finger])
    : isPress
      ? ALL_FINGERS.map((finger) => SHORT_FINGER[finger])
      : ADJACENT_PAIRS.map(
        (pair) => `${SHORT_FINGER[pair[0]]}–${SHORT_FINGER[pair[1]]}`,
      );
  const split = isFinger ? 4 : isPress ? 5 : 3;

  return (
    <AnalyzerMatrixChart
      rows={rows}
      columns={columns}
      options={{
        format: (value) => value.toFixed(3),
        labelWidth: 190,
        columnSplit: split,
        columnGroupLabels: ['左手', '右手'],
        ...(isFinger || isPress ? {} : { colorBase: 'min' as const }),
        sort: sort ?? undefined,
      }}
      onSort={(column) => {
        stateOwner.update((draft) => {
          const current = draft.ui.comparison.matrixSorts[kind];
          draft.ui.comparison.matrixSorts[kind] = nextSort(current, column);
        });
      }}
    />
  );
}

function detailResult(
  results: readonly Result[],
  detailLayoutId: string | undefined,
): Result | undefined {
  return results.find((result) => result.layout.id === detailLayoutId) ?? results[0];
}

export function AnalyzerDetailConditions({
  model,
  stateOwner,
}: {
  model: AnalyzerMetricsModel;
  stateOwner: AnalyzerUiStateOwner;
}) {
  const { metrics: snapshot, state } = useMetrics(model, stateOwner);
  const result = detailResult(snapshot.results, snapshot.detailLayoutId);
  return <>{result ? metricConditionText(result, state) : ''}</>;
}

export function AnalyzerFingerChart({
  model,
}: {
  model: AnalyzerMetricsModel;
}) {
  const snapshot = useSyncExternalStore(
    model.subscribe,
    model.getSnapshot,
    model.getSnapshot,
  );
  const result = detailResult(snapshot.results, snapshot.detailLayoutId);
  if (!result) return null;
  const total = result.metrics.totalUnits || 1;
  return (
    <AnalyzerColumnChart
      data={FINGERS.map((finger) => ({
        label: SHORT_FINGER[finger],
        group: finger[0] === 'L' ? '左手' : '右手',
        value: result.metrics.perFinger[finger],
        tip: `${FINGER_LABEL[finger]}<br>移動 <b>${result.metrics.perFinger[finger].toFixed(1)} u</b>`
          + ` (全体の ${((result.metrics.perFinger[finger] / total) * 100).toFixed(1)}%)<br>`
          + `押下 <b>${result.metrics.perFingerPresses[finger]}</b> 回`
          + ` (${((result.metrics.perFingerPresses[finger] / Math.max(1, result.metrics.presses)) * 100).toFixed(1)}%)`,
      }))}
      options={{ format: (value) => value.toFixed(0) }}
    />
  );
}

export function AnalyzerAdjacentChart({
  model,
}: {
  model: AnalyzerMetricsModel;
}) {
  const snapshot = useSyncExternalStore(
    model.subscribe,
    model.getSnapshot,
    model.getSnapshot,
  );
  const result = detailResult(snapshot.results, snapshot.detailLayoutId);
  if (!result) return null;
  return (
    <AnalyzerColumnChart
      data={result.metrics.adjacent.map((item) => ({
        label: `${SHORT_FINGER[item.pair[0]]}–${SHORT_FINGER[item.pair[1]]}`,
        group: item.pair[0][0] === 'L' ? '左手' : '右手',
        value: item.stdDev,
        tip: `${FINGER_LABEL[item.pair[0]]}–${FINGER_LABEL[item.pair[1]]}<br>`
          + `超過の平均 <b>${item.meanExcess.toFixed(3)} u</b><br>`
          + `超過の実測最大 <b>${item.maxExcess.toFixed(3)} u</b><br>`
          + `標準偏差 <b>${item.stdDev.toFixed(3)} u</b>`,
      }))}
      options={{ format: (value) => value.toFixed(3) }}
    />
  );
}

function sensitivityLabel(
  result: Result,
  state: ReturnType<AnalyzerUiStateOwner['getSnapshot']>,
): string {
  const defaults = state.conditions.defaults;
  const override = state.conditions.perLayout[result.layout.id];
  const differences = [
    result.geometry.id !== defaultGeometryId(state)
      ? `形状=${result.geometry.name}`
      : '',
    result.options.windowSize !== defaults.windowSize
      ? `N=${result.options.windowSize}`
      : '',
    result.options.sfbHomeCost !== defaults.sfbHomeCost
      ? 'SFBホーム設定変更'
      : '',
    result.options.preferOppositeThumb !== defaults.preferOppositeThumb
      ? '逆側親指設定変更'
      : '',
    override?.romajiRule !== undefined ? 'ローマ字個別設定' : '',
    override?.chain !== undefined && !sameChainPolicy(override.chain, defaults.chain)
      ? 'Chain境界個別設定'
      : '',
    override?.arpeggioPolicy !== undefined
      && !sameArpeggioPolicy(override.arpeggioPolicy, defaults.arpeggioPolicy)
      ? 'ArpeggioPolicy個別設定'
      : '',
  ].filter(Boolean);
  return differences.length === 0
    ? result.layout.name
    : `${result.layout.name}（${differences.join('・')}）`;
}

export function AnalyzerSensitivityResults({
  model,
  stateOwner,
}: {
  model: AnalyzerMetricsModel;
  stateOwner: AnalyzerUiStateOwner;
}) {
  const { metrics: snapshot, state } = useMetrics(model, stateOwner);
  if (snapshot.results.length === 0) {
    return <p className="note">配列を1つ以上選ぶ</p>;
  }
  if (!state.ui.panels.sensitivity) {
    return <p className="note">N感度はパネルを開くと計算します</p>;
  }

  const range = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const relative = state.ui.sensitivity.scale === 'relative';
  const series = snapshot.results.map((result) => {
    const points = nSensitivity(
      snapshot.text,
      result.layout,
      result.geometry,
      result.options,
      range,
      result.metrics.conditions.romajiRuleId,
      result.analysis.chainPolicy,
      result.analysis.arpeggioPolicy,
    );
    const base = points[0]?.totalUnits || 1;
    return {
      name: sensitivityLabel(result, state),
      color: SERIES(result.slot),
      points: points.map((point) => ({
        x: point.windowSize,
        y: relative ? (point.totalUnits / base) * 100 : point.totalUnits,
        raw: relative ? point.totalUnits : undefined,
      })),
    };
  });

  return (
    <AnalyzerLineChart
      series={series}
      xTicks={range}
      format={relative
        ? (value) => `${value.toFixed(0)}%`
        : (value) => `${value.toFixed(0)} u`}
      options={relative ? { yMax: 100 } : {}}
    />
  );
}
