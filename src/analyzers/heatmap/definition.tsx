import { Fragment } from 'react';
import { useFigureSettings } from '#ui/primitives/figure-settings.tsx';
import { OptionGroup } from '#ui/primitives/option-fields.tsx';
import { keyboardStandardForGeometryId } from '#input/shapes/key-labels.ts';
import type { Geometry } from '#input/shapes/geometry.ts';
import type { Layout } from '#input/layouts/types.ts';
import { isStrokeOnlyMark, TARGET_DASH_ARRAY, targetMarkPath, type TargetMark } from '#ui/theme/target-marks.ts';
import { HeatmapDiagram, type HeatmapDiagramFlow, type HeatmapShiftStyle } from '../heatmap-diagram.tsx';
import { baseLayerLegends, type HeatmapDrawStyle, type HeatmapPalette } from '../heatmap-figure.ts';
import { heatmapBounds, heatmapDrawnKeys, sharedHeatmapBounds } from '../heatmap-keys.ts';
import type { AnalyzerSettingsProps, SingleAnalyzerPaneParts, SingleBodyProps } from '../pane-parts.tsx';
import { heatmapDefinition, sharedMaxCount, sharedMaxFlowWeight, type HeatmapExtracted } from './extract.ts';
import { HeatmapFlowLegend } from './flow-legend.tsx';
import { HeatmapPaletteLegend } from './palette-legend.tsx';
import { DEFAULT_HEATMAP_OPTIONS, heatmapOptions, type HeatmapOptions } from './options.ts';
import { useHeatmapFields } from './option-fields.tsx';
import { HEATMAP_FIGURE_GROUPS } from './settings-sections.ts';
import { HEATMAP_PANE_META, HEATMAP_STANDALONE_SET_TARGETS_WIDTH_REM } from './pane-meta.ts';

/**
 * 全部のレイヤーを合わせた、キーごとの押下数のヒートマップ。
 *
 * `extracted`（`extract.ts` の計算結果）を色にして描くだけで、押下数は数え直さない
 * （docs/architecture.md「可視化は計算しない」）。色は常に線形で、シフトキーの枠は描かない。
 * キーのツールチップは面をまたいだ合算の値を出す。キーを選ぶ操作はホストが持つ。
 * 優劣を示す色・強調・順位は出さない。
 *
 * 単体の画面では、Singleの対象の図の下に、Multiの集合の対象の図を格子に並べる（`setTargets`）。
 * 格子に並べる対象を選ぶ操作は、一番上の図と格子の間に置く（`setTargetPicker`）。
 * 色の尺度は並べた図の全部で共通にし、同じ押下数のキーが同じ濃さになる。格子の図のキーは押せず、
 * ツールチップは押下数だけを出す。
 */

const NO_SHIFT_STYLES: ReadonlyMap<string, HeatmapShiftStyle> = new Map();

/** 対象の色と点の形（と線種）の見本。色だけに頼らず、形で対象を区別できる。 */
function TargetSwatch({ color, mark }: { readonly color: string | undefined; readonly mark: TargetMark | undefined }) {
  if (color === undefined || mark === undefined) return null;
  const strokeOnly = isStrokeOnlyMark(mark.shape);
  return (
    <svg className="heatmap-set-swatch" viewBox="-10 -5 20 10" aria-hidden="true" data-mark={mark.shape}>
      <line x1={-10} x2={10} y1={0} y2={0} style={{ stroke: color }} strokeWidth={1.5} strokeDasharray={mark.dashed ? TARGET_DASH_ARRAY : undefined} />
      <path
        d={targetMarkPath(mark.shape, 3.4)}
        style={strokeOnly ? { fill: 'none', stroke: color } : { fill: color }}
        strokeWidth={strokeOnly ? 1.8 : undefined}
      />
    </svg>
  );
}

/** 図の見出し行のボタンから開く小窓の中身。表示だけが変わる項目を、グループごとに並べる。 */
function HeatmapFigureSettings({
  options,
  onOptionsChange,
}: {
  readonly options: HeatmapOptions;
  readonly onOptionsChange: (next: HeatmapOptions) => void;
}) {
  const fields = useHeatmapFields(options, onOptionsChange);
  return (
    <>
      {HEATMAP_FIGURE_GROUPS.map((group) => (
        <OptionGroup key={group.id} title={group.title}>
          {group.keys.map((key) => (
            <Fragment key={key}>{fields[key]}</Fragment>
          ))}
        </OptionGroup>
      ))}
    </>
  );
}

function figureProps(layout: Layout, geometry: Geometry, drawStyle: HeatmapDrawStyle, palette: HeatmapPalette) {
  return {
    drawStyle,
    palette,
    layout,
    geometry,
    legends: baseLayerLegends(layout),
    scale: 'linear' as const,
    shiftStyles: NO_SHIFT_STYLES,
    standard: keyboardStandardForGeometryId(geometry.id),
  };
}

/** 線が無い時は属性ごと渡さない（`exactOptionalPropertyTypes`）。 */
function flowProp(flow: HeatmapDiagramFlow | undefined): { readonly flow?: HeatmapDiagramFlow } {
  return flow === undefined ? {} : { flow };
}

export function HeatmapBody({
  layout,
  geometry,
  extracted,
  keySelection,
  setTargets,
  setTargetPicker,
  options,
  onOptionsChange,
}: SingleBodyProps<HeatmapExtracted, HeatmapOptions>) {
  const figureSettings = useFigureSettings('打鍵頻度');
  const flowSource = options.flowLineSource;
  // 線の太さの尺度は、色の尺度と同じく、一番上の図と計算できた格子の図の全部で共通にする
  const flowMaxWeight = sharedMaxFlowWeight([
    extracted.flowLines[flowSource].maxWeight,
    ...(setTargets ?? []).flatMap((figure) => (figure.state.status === 'ready' ? [figure.state.extracted.flowLines[flowSource].maxWeight] : [])),
  ]);
  const flowOf = (figureExtracted: HeatmapExtracted): HeatmapDiagramFlow | undefined =>
    options.flowLines ? { vectors: figureExtracted.flowLines[flowSource].vectors, maxWeight: flowMaxWeight } : undefined;
  const maxCount = sharedMaxCount([
    extracted.maxCount,
    ...(setTargets ?? []).flatMap((figure) => (figure.state.status === 'ready' ? [figure.state.extracted.maxCount] : [])),
  ]);
  // 格子の図は、描く範囲を全部で共通にする。キーの大きさと位置が図ごとに変わらない
  const setBounds = sharedHeatmapBounds(
    (setTargets ?? []).flatMap((figure) =>
      figure.state.status === 'ready' ? [heatmapBounds(heatmapDrawnKeys(figure.state.layout, figure.state.geometry))] : [],
    ),
  );
  // 凡例は、描いているものだけを並べる。色の帯は、色を塗る描き方（キーの塗り・サーモグラフィ）の多色の時だけ出す
  const legendItems = [
    options.palette === 'multi' && options.drawStyle !== 'none' ? <HeatmapPaletteLegend key="palette" /> : null,
    options.flowLines ? <HeatmapFlowLegend key="flow" source={flowSource} /> : null,
  ].filter((item) => item !== null);
  const legends = legendItems.length === 0 ? undefined : <div className="heatmap-legends">{legendItems}</div>;
  return (
    <div className="heatmap-feature" data-react-feature="heatmap">
      {figureSettings.renderWindow(<HeatmapFigureSettings options={options} onOptionsChange={onOptionsChange} />)}
      <div className="heatmap-diagrams">
        <HeatmapDiagram
          {...figureProps(layout, geometry, options.drawStyle, options.palette)}
          diagramId="integrated"
          captionAction={figureSettings.toggle}
          {...(legends === undefined ? {} : { captionNote: legends })}
          {...flowProp(flowOf(extracted))}
          detailOf={(keyId) => extracted.keyDetails.merged.get(keyId)}
          colorCounts={extracted.keyCounts}
          maxCount={maxCount}
          ariaSuffix="（全レイヤー合算・線形）"
          {...(keySelection === undefined ? {} : { keySelection })}
        />
      </div>
      {setTargetPicker ?? null}
      {setTargets === undefined ? null : (
        <ul className="heatmap-set-grid" aria-label="他の対象の打鍵頻度">
          {setTargets.map((figure) => (
            <li key={figure.key} className="heatmap-set-cell" data-heatmap-set-target={figure.key} data-state={figure.state.status}>
              <p className="heatmap-set-name" title={figure.fullName}>
                <TargetSwatch color={figure.color} mark={figure.mark} />
                <span>{figure.label}</span>
              </p>
              {figure.state.status === 'ready' ? (
                <HeatmapDiagram
                  {...figureProps(figure.state.layout, figure.state.geometry, options.drawStyle, options.palette)}
                  title={figure.label}
                  {...flowProp(flowOf(figure.state.extracted))}
                  diagramId={`set-${figure.key}`}
                  detailOf={(keyId) => (figure.state.status === 'ready' ? figure.state.extracted.keyDetails.merged.get(keyId) : undefined)}
                  colorCounts={figure.state.extracted.keyCounts}
                  maxCount={maxCount}
                  ariaSuffix="（全レイヤー合算・線形）"
                  fill
                  countOnlyTooltip
                  {...(setBounds === undefined ? {} : { bounds: setBounds })}
                />
              ) : (
                <p className="heatmap-empty">{figure.state.status === 'failed' ? figure.state.message : '計算中…'}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** 解析設定の小窓に置く項目は無い（描き方は図の表示の小窓）。 */
export function HeatmapSettings(_props: AnalyzerSettingsProps<HeatmapOptions>) {
  return <p className="heatmap-empty">このAnalyzerに解析設定はありません。</p>;
}

/** ペインに渡すもの（`analyzers/pane-parts.tsx`）。 */
export const heatmapAnalyzer = {
  definition: heatmapDefinition,
  ...HEATMAP_PANE_META,
  Body: HeatmapBody,
  Settings: HeatmapSettings,
  defaultOptions: DEFAULT_HEATMAP_OPTIONS,
  urlOptions: heatmapOptions,
  keyDetailsOf: (extracted) => extracted.keyDetails,
  standaloneSetTargets: {
    recommendedWidthRem: HEATMAP_STANDALONE_SET_TARGETS_WIDTH_REM,
  },
} satisfies SingleAnalyzerPaneParts<HeatmapOptions, HeatmapExtracted>;
