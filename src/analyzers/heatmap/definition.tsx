import { keyboardStandardForGeometryId } from '#input/shapes/key-labels.ts';
import type { Geometry } from '#input/shapes/geometry.ts';
import type { Layout } from '#input/layouts/types.ts';
import { isStrokeOnlyMark, TARGET_DASH_ARRAY, targetMarkPath, type TargetMark } from '#ui/theme/target-marks.ts';
import { HeatmapDiagram, type HeatmapShiftStyle } from '../heatmap-diagram.tsx';
import { baseLayerLegends } from '../heatmap-figure.ts';
import type { AnalyzerSettingsProps, SingleAnalyzerPaneParts, SingleBodyProps } from '../pane-parts.tsx';
import { heatmapDefinition, sharedMaxCount, type HeatmapExtracted } from './extract.ts';
import { DEFAULT_HEATMAP_OPTIONS, heatmapOptions, type HeatmapOptions } from './options.ts';
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

function figureProps(layout: Layout, geometry: Geometry) {
  return {
    layout,
    geometry,
    legends: baseLayerLegends(layout),
    scale: 'linear' as const,
    shiftStyles: NO_SHIFT_STYLES,
    standard: keyboardStandardForGeometryId(geometry.id),
  };
}

export function HeatmapBody({ layout, geometry, extracted, keySelection, setTargets }: SingleBodyProps<HeatmapExtracted, HeatmapOptions>) {
  const maxCount = sharedMaxCount([
    extracted.maxCount,
    ...(setTargets ?? []).flatMap((figure) => (figure.state.status === 'ready' ? [figure.state.extracted.maxCount] : [])),
  ]);
  return (
    <div className="heatmap-feature" data-react-feature="heatmap">
      <div className="heatmap-diagrams">
        <HeatmapDiagram
          {...figureProps(layout, geometry)}
          diagramId="integrated"
          detailOf={(keyId) => extracted.keyDetails.merged.get(keyId)}
          colorCounts={extracted.keyCounts}
          maxCount={maxCount}
          ariaSuffix="（全レイヤー合算・線形）"
          {...(keySelection === undefined ? {} : { keySelection })}
        />
      </div>
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
                  {...figureProps(figure.state.layout, figure.state.geometry)}
                  title={figure.label}
                  diagramId={`set-${figure.key}`}
                  detailOf={(keyId) => figure.state.status === 'ready' ? figure.state.extracted.keyDetails.merged.get(keyId) : undefined}
                  colorCounts={figure.state.extracted.keyCounts}
                  maxCount={maxCount}
                  ariaSuffix="（全レイヤー合算・線形）"
                  fill
                  countOnlyTooltip
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

/** 設定できる項目は無い。 */
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
  standaloneSetTargets: { recommendedWidthRem: HEATMAP_STANDALONE_SET_TARGETS_WIDTH_REM },
} satisfies SingleAnalyzerPaneParts<HeatmapOptions, HeatmapExtracted>;
