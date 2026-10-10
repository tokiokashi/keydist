import { keyboardStandardForGeometryId } from '#input/shapes/key-labels.ts';
import { HeatmapDiagram, type HeatmapShiftStyle } from '../heatmap-diagram.tsx';
import { baseLayerLegends } from '../heatmap-figure.ts';
import type { AnalyzerSettingsProps, SingleAnalyzerPaneParts, SingleBodyProps } from '../pane-parts.tsx';
import { heatmapDefinition, type HeatmapExtracted } from './extract.ts';
import { DEFAULT_HEATMAP_OPTIONS, heatmapOptions, type HeatmapOptions } from './options.ts';
import { HEATMAP_PANE_META } from './pane-meta.ts';

/**
 * 全部のレイヤーを合わせた、キーごとの押下数のヒートマップ。
 *
 * `extracted`（`extract.ts` の計算結果）を色にして描くだけで、押下数は数え直さない
 * （docs/architecture.md「可視化は計算しない」）。色は常に線形で、シフトキーの枠は描かない。
 * キーのツールチップは面をまたいだ合算の値を出す。キーを選ぶ操作はホストが持つ。
 * 優劣を示す色・強調・順位は出さない。
 */

const NO_SHIFT_STYLES: ReadonlyMap<string, HeatmapShiftStyle> = new Map();

export function HeatmapBody({ layout, geometry, extracted, keySelection }: SingleBodyProps<HeatmapExtracted, HeatmapOptions>) {
  return (
    <div className="heatmap-feature" data-react-feature="heatmap">
      <div className="heatmap-diagrams">
        <HeatmapDiagram
          layout={layout}
          geometry={geometry}
          diagramId="integrated"
          legends={baseLayerLegends(layout)}
          detailOf={(keyId) => extracted.keyDetails.merged.get(keyId)}
          colorCounts={extracted.keyCounts}
          maxCount={Math.max(1, extracted.maxCount)}
          scale="linear"
          shiftStyles={NO_SHIFT_STYLES}
          standard={keyboardStandardForGeometryId(geometry.id)}
          ariaSuffix="（全レイヤー合算・線形）"
          {...(keySelection === undefined ? {} : { keySelection })}
        />
      </div>
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
} satisfies SingleAnalyzerPaneParts<HeatmapOptions, HeatmapExtracted>;
