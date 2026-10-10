import { useMemo, useState } from 'react';
import { displayTriggerKeys, handOfKey, layerShiftStyles } from '#input/layouts/layers.ts';
import { resolveKeyId } from '#input/shapes/geometry.ts';
import { keyboardStandardForGeometryId } from '#input/shapes/key-labels.ts';
import { FigureSettingsBox, FigureSettingsToggle } from '#ui/primitives/figure-settings.tsx';
import { bindOption, SegmentedOptionField } from '#ui/primitives/option-fields.tsx';
import { heatmapLayersDefinition, type HeatmapLayersExtracted } from './extract.ts';
import { HeatmapDiagram, type HeatmapShiftStyle } from '../heatmap-diagram.tsx';
import { layerLegends, presentationLayersOf } from '../heatmap-figure.ts';
import {
  activeEntryIndex,
  buildLayerEntries,
  canToggleLayerDetail,
  compactPresentationOf,
  entryKeyDetail,
  resolveArrangement,
  sharedMaxCount,
} from './layer-view.ts';
import { DEFAULT_HEATMAP_LAYERS_OPTIONS, heatmapLayersOptions, type HeatmapLayersOptions } from './options.ts';
import { HEATMAP_LAYERS_PANE_META } from './pane-meta.ts';
import type { Face } from '#input/layouts/types.ts';
import type { AnalyzerSettingsProps, SingleAnalyzerPaneParts, SingleBodyProps } from '../pane-parts.tsx';
import './heatmap-layers-view.css';

/**
 * レイヤーごとの、キーごとの押下数のヒートマップ。
 *
 * `extracted`（`extract.ts` の計算結果）を色にして描くだけで、押下数は数え直さない
 * （docs/architecture.md「可視化は計算しない」）。層どうしで共通の最大値は、表示する図の組から
 * `layer-view.ts` が求める。優劣を示す色・強調・順位は出さない。
 *
 * キーのツールチップは、図が表すものの値を出す。レイヤー別の図はそのレイヤー、
 * 「まとめ」の図は合算したレイヤーの和。キーを選ぶ操作はホストが持ち、選んだキーはどの図でも同じ枠で示す。
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

export function HeatmapLayersBody({ layout, geometry, extracted, options, onOptionsChange, keySelection }: SingleBodyProps<HeatmapLayersExtracted, HeatmapLayersOptions>) {
  const standard = keyboardStandardForGeometryId(geometry.id);
  const [detailOpen, setDetailOpen] = useState(false);
  const view = useMemo(() => {
    const entries = buildLayerEntries(layout, extracted, options.layerDetail, standard);
    const presentation = presentationLayersOf(layout);
    const allFaces = presentation.flatMap((layer) => layer.faces);
    // シフトキーの枠色は、まとめ方に依らず配列の全レイヤーから1回だけ決める（図と凡例で共有）
    const styles = layerShiftStyles(presentation);
    return {
      entries,
      allFaces,
      styles,
      max: sharedMaxCount(entries),
    };
  }, [layout, extracted, options.layerDetail, standard]);

  const { entries, styles } = view;
  const arrangement = resolveArrangement(options.layerArrangement, entries.length);
  const tabbed = arrangement === 'tabs' && entries.length > 1;
  const activeIndex = activeEntryIndex(entries, options.activeLayerId);
  const compact = compactPresentationOf(layout);
  const shiftLegend = entries.flatMap((entry) => {
    const style = entry.layer.faces.map((face) => styles.get(face)).find((candidate) => candidate !== undefined);
    return style === undefined ? [] : [{ id: entry.id, style, label: `レイヤー${style.layerIndex}の${entry.label}` }];
  });
  const scaleText = options.colorScale === 'log' ? '対数' : '線形';

  return (
    <div className="heatmap-feature heatmap-layers" data-react-feature="heatmap-layers">
      <div className="heatmap-heading">
        <h3 id="heatmap-layers-heading">ヒートマップ（レイヤー）・{entries.length}図</h3>
        {compact !== undefined && canToggleLayerDetail(layout) ? (
          <FigureSettingsToggle name="ヒートマップ（レイヤー）" open={detailOpen} onToggle={() => setDetailOpen(!detailOpen)} />
        ) : null}
      </div>
      {compact !== undefined && canToggleLayerDetail(layout) && detailOpen ? (
        <FigureSettingsBox name="ヒートマップ（レイヤー）">
          <SegmentedOptionField
            label={compact.controlLabel}
            binding={bindOption(options, DEFAULT_HEATMAP_LAYERS_OPTIONS, onOptionsChange, 'layerDetail')}
            choices={[
              { value: 'compact', label: compact.compactLabel },
              { value: 'detail', label: compact.detailLabel },
            ]}
          />
        </FigureSettingsBox>
      ) : null}
      {shiftLegend.length > 0 ? (
        <div className="heatmap-shift-legend" aria-label="シフトキーの枠色">
          {shiftLegend.map((item) => (
            <span key={item.id} className="heatmap-shift-swatch" style={{ ['--shift-color' as string]: `var(--series-${item.style.colorSlot})` }}>
              {item.label}
            </span>
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
            detailOf={(keyId) => entryKeyDetail(extracted.keyDetails, entry.faceIds, keyId)}
            colorCounts={entry.colorCounts}
            maxCount={view.max}
            scale={options.colorScale}
            shiftStyles={shiftStylesByKey(entry.layer.faces.length === 0 ? view.allFaces : entry.layer.faces, styles)}
            standard={standard}
            hidden={tabbed && activeIndex !== index}
            ariaSuffix={`（レイヤー別・${scaleText}・共通の最大値）`}
            {...(keySelection === undefined ? {} : { keySelection })}
          />
        ))}
      </div>
    </div>
  );
}

/** 色の尺度とレイヤーの並べ方。 */
export function HeatmapLayersSettings({ options, onOptionsChange }: AnalyzerSettingsProps<HeatmapLayersOptions>) {
  const bind = <K extends keyof HeatmapLayersOptions>(key: K) =>
    bindOption(options, DEFAULT_HEATMAP_LAYERS_OPTIONS, onOptionsChange, key);
  return (
    <div className="option-groups">
      <SegmentedOptionField
        label="色の尺度"
        binding={bind('colorScale')}
        choices={[
          { value: 'linear', label: '線形' },
          { value: 'log', label: '対数' },
        ]}
        hint="線形は押下数に比例した色にし、対数は押下数の少ないキーの差も見分けやすくします。"
      />
      <SegmentedOptionField
        label="レイヤーの並べ方"
        binding={bind('layerArrangement')}
        choices={[
          { value: 'auto', label: '自動' },
          { value: 'side-by-side', label: '並置' },
          { value: 'tabs', label: 'タブ' },
        ]}
        hint="自動は、レイヤーが5つ以下なら並置、6つ以上ならタブにします。"
      />
    </div>
  );
}

/** ペインに渡すもの（`analyzers/pane-parts.tsx`）。 */
export const heatmapLayersAnalyzer = {
  definition: heatmapLayersDefinition,
  ...HEATMAP_LAYERS_PANE_META,
  Body: HeatmapLayersBody,
  Settings: HeatmapLayersSettings,
  defaultOptions: DEFAULT_HEATMAP_LAYERS_OPTIONS,
  urlOptions: heatmapLayersOptions,
  keyDetailsOf: (extracted) => extracted.keyDetails,
} satisfies SingleAnalyzerPaneParts<HeatmapLayersOptions, HeatmapLayersExtracted>;
