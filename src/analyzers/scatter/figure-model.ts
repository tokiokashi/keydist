import type { LayoutKind } from '#input/layouts/kind.ts';
import type { TextLanguage } from '#input/text/language.ts';
import type { ComparisonColumnId } from '../comparison-column-text.ts';
import type { ComparisonRowValues } from '../comparison-column-values.ts';
import {
  isHandShareColumn,
  SCATTER_PRESET_AXES,
  scatterAxisProblem,
  scatterContour,
  type ScatterAxes,
  type ScatterAxisProblem,
  type ScatterContour,
  type ScatterPresetId,
} from './axes.ts';
import { axisTitle, axisUnit } from './axis-names.ts';
import type { ScatterRow } from './extract.ts';
import { SCATTER_KIND_ORDER, SCATTER_KIND_STYLES } from './kinds.ts';
import { logScaleBlockers, resolveLogScale, scatterPlotModel, type LogScaleBlockers, type ScatterPlotModel } from './plot-model.ts';

/**
 * 組み合わせ1つぶんの図の描画モデル（画面に依存しない純粋な関数）。
 * 選んだ組み合わせごとに1つ作り、その組み合わせ1つだけを選んだ時と同じ結果になる。
 * 目盛りの種類と「自由に選ぶ」の軸は全ての図で共通の入力として受け取り、図ごとの判定（対数にできるか・軸の組が選べるか）はここで行う。
 */

export interface ScatterFigureRowContext {
  readonly label: string;
  readonly fullName: string;
  /** 配列の種類。対象を解決できなかった行には無い。 */
  readonly kind: LayoutKind | undefined;
}

/** 図に描く対象1つ。 */
export interface ScatterPlottedRow {
  readonly targetKey: string;
  readonly label: string;
  readonly fullName: string;
  readonly kind: LayoutKind;
  readonly x: number;
  readonly y: number;
  /** 全列の値。点の読み取りで、等位線の量の列が値を持つかを見る。 */
  readonly values: ComparisonRowValues;
}

/** 図に描けない対象1つ。 */
export interface ScatterExcludedRow {
  readonly targetKey: string;
  readonly label: string;
  readonly fullName: string;
  readonly status: 'computing' | 'failed' | 'no-value';
  readonly message: string;
}

/** 全ての図で共通の入力。 */
export interface ScatterFiguresInput {
  readonly order: readonly string[];
  readonly rowContext: ReadonlyMap<string, ScatterFigureRowContext>;
  readonly rows: readonly ScatterRow[];
  /** 「自由に選ぶ」の軸。 */
  readonly xAxis: ComparisonColumnId;
  readonly yAxis: ComparisonColumnId;
  readonly tickScale: 'linear' | 'log';
  readonly language: TextLanguage;
}

export interface ScatterFigureModel {
  readonly preset: ScatterPresetId;
  readonly axes: ScatterAxes;
  /** 選べない軸の組。`free`の図でだけ起きる。あれば図は描かない。 */
  readonly problem: ScatterAxisProblem | undefined;
  readonly plotted: readonly ScatterPlottedRow[];
  readonly excluded: readonly ScatterExcludedRow[];
  readonly contour: ScatterContour | undefined;
  /** 細い線を引く組の細い線の量。引かない組は`undefined`。 */
  readonly lineContour: ScatterContour | undefined;
  readonly logScale: boolean;
  /** 対数の目盛りを選んでいるのに通常の目盛りで描く理由。 */
  readonly logReasons: readonly (keyof LogScaleBlockers)[];
  readonly usedKinds: readonly LayoutKind[];
  readonly model: ScatterPlotModel;
}

export function scatterAxesOf(preset: ScatterPresetId, xAxis: ComparisonColumnId, yAxis: ComparisonColumnId): ScatterAxes {
  return preset === 'free' ? { x: xAxis, y: yAxis } : SCATTER_PRESET_AXES[preset];
}

/** 組み合わせ1つぶんの図のモデルを作る。 */
export function scatterFigureModel(preset: ScatterPresetId, input: ScatterFiguresInput): ScatterFigureModel {
  const axes = scatterAxesOf(preset, input.xAxis, input.yAxis);
  const problem = scatterAxisProblem(axes.x, axes.y);
  const rowByKey = new Map(input.rows.map((row) => [row.targetKey, row] as const));
  const plotted: ScatterPlottedRow[] = [];
  const excluded: ScatterExcludedRow[] = [];
  let inputChars = 0;
  for (const targetKey of input.order) {
    const context = input.rowContext.get(targetKey);
    const label = context?.label ?? '—';
    const fullName = context?.fullName ?? '';
    const row = rowByKey.get(targetKey);
    if (row === undefined) {
      // extractedにまだ無いtargetKey（依頼の作り直し途中の一瞬）。値の欠落を偽らず、計算中と出す。
      excluded.push({ targetKey, label, fullName, status: 'computing', message: '計算中…' });
    } else if (row.kind === 'failed') {
      excluded.push({ targetKey, label, fullName, status: 'failed', message: row.message });
    } else {
      inputChars = row.inputChars;
      const x = row.values[axes.x];
      const y = row.values[axes.y];
      if (Number.isFinite(x) && Number.isFinite(y))
        plotted.push({ targetKey, label, fullName, kind: context?.kind ?? 'alpha', x, y, values: row.values });
      else excluded.push({ targetKey, label, fullName, status: 'no-value', message: '値なし' });
    }
  }
  const contour = problem === undefined ? scatterContour(axes.x, axes.y, inputChars, input.language) : undefined;
  // 線を引かない組でも、3つの量の関係は図の見方に出すので`contour`は残す。点の読み取りと凡例には、線を引く組の線の量だけを出す
  const lineContour = contour?.drawsLines === true ? contour : undefined;
  // 対数の目盛りは、対数にできる図でだけ使う。選んだ設定と表示が違う時は、図の近くに理由を出す
  const { logScale, reasons: logReasons } = resolveLogScale(input.tickScale, logScaleBlockers(lineContour, plotted));
  const usedKinds = SCATTER_KIND_ORDER.filter((kind) => plotted.some((row) => row.kind === kind));
  const model = scatterPlotModel({
    points: plotted.map(({ targetKey, label, x, y }) => ({ targetKey, label, x, y })),
    contour: lineContour,
    legendRows: usedKinds.map((kind) => SCATTER_KIND_STYLES[kind].label),
    contourName: lineContour === undefined ? '' : axisTitle(lineContour.column, input.language),
    contourSuffix: lineContour !== undefined && axisUnit(lineContour.column) === '%' ? '%' : '',
    centerAxes: { x: isHandShareColumn(axes.x), y: isHandShareColumn(axes.y) },
    logScale,
  });
  return { preset, axes, problem, plotted, excluded, contour, lineContour, logScale, logReasons, usedKinds, model };
}

/** 選んだ組み合わせの図のモデルを、渡された順に作る。 */
export function scatterFigureModels(presets: readonly ScatterPresetId[], input: ScatterFiguresInput): readonly ScatterFigureModel[] {
  return presets.map((preset) => scatterFigureModel(preset, input));
}
