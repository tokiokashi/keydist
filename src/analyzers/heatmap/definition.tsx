import { useMemo } from 'react';
import { displayTriggerKeys, handOfKey, layerShiftStyles } from '#input/layouts/layers.ts';
import { resolveKeyId } from '#input/shapes/geometry.ts';
import { bindOption, SegmentedOptionField } from '#ui/primitives/option-fields.tsx';
import { heatmapDefinition, type HeatmapExtracted } from './extract.ts';
import { HeatmapDiagram, type HeatmapShiftStyle } from './heatmap-diagram.tsx';
import {
  activeEntryIndex,
  buildLayerEntries,
  canToggleLayerDetail,
  compactPresentationOf,
  layerLegends,
  presentationLayersOf,
  resolveArrangement,
  sharedMaxCount,
} from './layer-view.ts';
import { DEFAULT_HEATMAP_OPTIONS, heatmapOptions, type HeatmapOptions } from './options.ts';
import { HEATMAP_PANE_META } from './pane-meta.ts';
import type { Face } from '#input/layouts/types.ts';
import type { AnalyzerSettingsProps, SingleAnalyzerPaneParts, SingleBodyProps } from '../pane-parts.tsx';
import './heatmap-view.css';

/**
 * キーごとの押下数のヒートマップ。
 *
 * `extracted`（`extract.ts` の計算結果）を色にして描くだけで、押下数は数え直さない
 * （docs/architecture.md「可視化は計算しない」）。層どうしで共通の最大値は、表示する図の組から
 * `layer-view.ts` が求める。優劣を示す色・強調・順位は出さない。
 */

/** 層を切り替えるキーの枠を、キーidへ引き直す。 */
function shiftStylesByKey(faces: readonly Face[], styles: ReadonlyMap<Face, HeatmapShiftStyle>): Map<string, HeatmapShiftStyle> {
  const byKey = new Map<string, HeatmapShiftStyle>();
  for (const face of faces) {
    const style = styles.get(face);
    if (style === undefined) continue;
    for (const trigger of displayTriggerKeys(face)) {
      if (handOfKey(trigger) === undefined) continue;
      byKey.set(resolveKeyId(trigger), style);
    }
  }
  return byKey;
}

export function HeatmapBody({ layout, geometry, extracted, options, onOptionsChange }: SingleBodyProps<HeatmapExtracted, HeatmapOptions>) {
  const view = useMemo(() => {
    const entries = buildLayerEntries(layout, extracted, options.layerDetail);
    const presentation = presentationLayersOf(layout);
    const allFaces = presentation.flatMap((layer) => layer.faces);
    const styles = layerShiftStyles(entries.map((entry) => entry.layer));
    const base = presentation.find((layer) => layer.id === 'single') ?? presentation[0]!;
    return {
      entries,
      allFaces,
      styles,
      baseLegends: layerLegends(base, layout),
      baseFaces: base.faces.length === 0 ? allFaces : base.faces,
      max: sharedMaxCount(entries),
    };
  }, [layout, extracted, options.layerDetail]);

  const { entries, styles } = view;
  const arrangement = resolveArrangement(options.layerArrangement, entries.length);
  const tabbed = arrangement === 'tabs' && entries.length > 1;
  const activeIndex = activeEntryIndex(entries, options.activeLayerId);
  const compact = compactPresentationOf(layout);
  const shiftLegend = entries.flatMap((entry, index) => {
    const style = entry.layer.faces.map((face) => styles.get(face)).find((candidate) => candidate !== undefined);
    return style === undefined ? [] : [{ id: entry.id, index, style, label: `レイヤー${index + 1}の${entry.label}` }];
  });
  const scaleText = options.colorScale === 'log' ? '対数' : '線形';

  return (
    <div className="heatmap-feature" data-react-feature="heatmap">
      <section className="heatmap-section" aria-labelledby="heatmap-integrated-heading">
        <h3 id="heatmap-integrated-heading">統合ヒートマップ</h3>
        <div className="heatmap-diagrams">
          <HeatmapDiagram
            layout={layout}
            geometry={geometry}
            title="統合"
            diagramId="integrated"
            legends={view.baseLegends}
            keyCounts={extracted.integrated.keyCounts}
            colorCounts={extracted.integrated.keyCounts}
            maxCount={Math.max(1, extracted.integrated.maxCount)}
            scale="linear"
            shiftStyles={shiftStylesByKey(view.baseFaces, styles)}
            ariaSuffix="（全レイヤー合算・線形）"
          />
        </div>
      </section>

      <section className="heatmap-section" aria-labelledby="heatmap-layers-heading">
        <h3 id="heatmap-layers-heading">層別ヒートマップ（{entries.length}）</h3>
        <p className="heatmap-note">層別図の色は、層を切り替えるために押したキーを除いた押下数で決め、全部の層で最大値をそろえています。</p>

        {shiftLegend.length > 0 ? (
          <div className="heatmap-shift-legend" aria-label="シフトキーの枠色">
            {shiftLegend.map((item) => (
              <span key={item.id} className="heatmap-shift-swatch" style={{ ['--shift-color' as string]: `var(--series-${item.style.colorSlot})` }}>
                {item.label}
              </span>
            ))}
          </div>
        ) : null}

        {compact !== undefined && canToggleLayerDetail(layout) ? (
          <div className="heatmap-controls" role="group" aria-label={compact.controlLabel}>
            <span>{compact.controlLabel}</span>
            {([['compact', compact.compactLabel], ['detail', compact.detailLabel]] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={options.layerDetail === value}
                onClick={() => onOptionsChange({ ...options, layerDetail: value })}
              >
                {label}
              </button>
            ))}
          </div>
        ) : null}

        {tabbed ? (
          <div className="heatmap-tabs" role="tablist" aria-label="レイヤー">
            {entries.map((entry, index) => (
              <button
                key={entry.id}
                type="button"
                role="tab"
                aria-selected={activeIndex === index}
                data-heatmap-tab={entry.id}
                onClick={() => onOptionsChange({ ...options, activeLayerId: entry.id })}
              >
                レイヤー{index + 1}
              </button>
            ))}
          </div>
        ) : null}

        <div className="heatmap-diagrams" data-heatmap-arrangement={tabbed ? 'tabs' : 'side-by-side'}>
          {entries.map((entry, index) => (
            <HeatmapDiagram
              key={entry.id}
              layout={layout}
              geometry={geometry}
              title={entry.title}
              diagramId={entry.id}
              legends={layerLegends(entry.layer, layout)}
              keyCounts={entry.keyCounts}
              colorCounts={entry.colorCounts}
              maxCount={view.max}
              scale={options.colorScale}
              shiftStyles={shiftStylesByKey(entry.layer.faces.length === 0 ? view.allFaces : entry.layer.faces, styles)}
              hidden={tabbed && activeIndex !== index}
              ariaSuffix={`（層別・${scaleText}・共通の最大値）`}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

/** 色の尺度と層の並べ方。 */
export function HeatmapSettings({ options, onOptionsChange }: AnalyzerSettingsProps<HeatmapOptions>) {
  const bind = <K extends keyof HeatmapOptions>(key: K) =>
    bindOption(options, DEFAULT_HEATMAP_OPTIONS, onOptionsChange, key);
  return (
    <div className="option-groups">
      <SegmentedOptionField
        label="色の尺度"
        binding={bind('colorScale')}
        choices={[
          { value: 'linear', label: '線形' },
          { value: 'log', label: '対数' },
        ]}
        hint="層別図の色に使います。統合図は常に線形です。"
      />
      <SegmentedOptionField
        label="層の並べ方"
        binding={bind('layerArrangement')}
        choices={[
          { value: 'auto', label: '自動' },
          { value: 'side-by-side', label: '並置' },
          { value: 'tabs', label: 'タブ' },
        ]}
        hint="自動は、層が5つ以下なら並置、6つ以上ならタブにします。"
      />
    </div>
  );
}

/** ペインに渡すもの（`analyzers/pane-parts.tsx`）。 */
export const heatmapAnalyzer = {
  definition: heatmapDefinition,
  ...HEATMAP_PANE_META,
  Body: HeatmapBody,
  Settings: HeatmapSettings,
  defaultOptions: DEFAULT_HEATMAP_OPTIONS,
  urlOptions: heatmapOptions,
} satisfies SingleAnalyzerPaneParts<HeatmapOptions, HeatmapExtracted>;
