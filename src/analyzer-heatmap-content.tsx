import {
  useEffect,
  useState,
  useSyncExternalStore,
} from 'react';
import {
  resolveKeyId,
  THUMB_KEY,
  THUMB_ROW,
  type Geometry,
} from './geometry.ts';
import type { AnalyzerMetricsModel } from './analyzer-metrics-model.ts';
import type { AnalyzerUiStateOwner } from './analyzer-ui-state-owner.ts';
import { normalizedLayerColors } from './layer-heatmap.ts';
import {
  classifyPresentationFaces,
  displayTriggerAlternatives,
  displayTriggerHandLabel,
  displayTriggerKeys,
  faceCells,
  faceDisplayCells,
  handOfKey,
  layerShiftStyles,
  orderedPresentationLayers,
  type Layer,
  type LayerShiftStyle,
} from './layers.ts';
import {
  COMBO_LAYER_ID,
  SINGLE_LAYER_ID,
  faceFromEntries,
  type Face,
  type Layout,
} from './layouts/types.ts';
import {
  findActiveLayerFace,
  matchKeyPatterns,
  summarizeCandidateMatches,
} from './key-pattern-picker.ts';
import type { LayerStat, Metrics } from './metrics.ts';
import type {
  LayerColorScale,
  LayerView,
} from './ui-state.ts';
import { visibleGeometryKeys } from './layout-physical-keys.ts';
import { escapeText } from './chart.ts';

interface LayerCell {
  label: string;
  annotation?: string;
}

interface PickerView {
  layoutId: string;
  clickable: boolean;
  selected: ReadonlySet<string>;
  candidateLabels: ReadonlyMap<string, string>;
  guideStrokes?: ReadonlyMap<string, string>;
  selectedStroke: string;
  legendOverrides?: ReadonlyMap<string, string>;
  onToggleKey?(keyId: string): void;
}

interface HeatmapValues {
  keyCounts: ReadonlyMap<string, number>;
  colorCounts: ReadonlyMap<string, number>;
  keyDistance: ReadonlyMap<string, number>;
  maxCount: number;
  colorScale: LayerColorScale;
  showHeat: boolean;
  ariaSuffix: string;
  triggerTipLabel?: string;
  picker?: PickerView;
}

interface LayerViewEntry {
  id: string;
  layer: Layer;
  title: string;
  stat: LayerStat;
}

function triggerKeyText(key: string, legends: Map<string, string>): string {
  const resolved = resolveKeyId(key);
  return resolved === THUMB_KEY.LT || resolved === THUMB_KEY.RT
    ? legends.get(resolved) ?? resolved
    : resolved;
}

function displayTriggerText(
  layout: Layout,
  face: Layer['faces'][number],
): string {
  return face.presentationTriggerText ?? displayTriggerAlternatives(face)
    .map((alternative) => alternative
      .map((key) => triggerKeyText(key, layout.legends))
      .join(' + '))
    .join(' / ');
}

function displayTriggerAnnotation(
  layout: Layout,
  face: Layer['faces'][number],
): string {
  if (face.presentationLabel !== undefined) return face.presentationLabel;
  const trigger = displayTriggerText(layout, face);
  const hand = displayTriggerHandLabel(face);
  return hand === undefined ? `${trigger}を押す` : `${hand} ${trigger}を押す`;
}

function layerDefinitionForId(layout: Layout, layerId: string) {
  const definition = layout.layerDefinitions?.find((entry) => entry.id === layerId);
  if (definition === undefined) {
    throw new Error(
      `レイヤー表示にはaggregation「${layerId}」のlayerDefinitions明示が必要`,
    );
  }
  return definition;
}

function layerLabelForId(layout: Layout, layerId: string): string {
  return layerDefinitionForId(layout, layerId).label;
}

function layerTitle(layer: Layer, index: number, layout: Layout): string {
  const definition = layerDefinitionForId(layout, layer.id);
  const label = definition.label;
  if (layer.faces.length === 0 || layer.id === SINGLE_LAYER_ID) {
    return `レイヤー ${index + 1}: ${label}`;
  }
  const triggers = layer.faces.map((face) => displayTriggerText(layout, face));
  if (triggers.length === 0) return `レイヤー ${index + 1}: ${label}`;
  if (definition.presentationModeLabel === undefined) {
    throw new Error(
      `レイヤー表示にはaggregation「${layer.id}」のpresentationModeLabel明示が必要`,
    );
  }
  return `レイヤー ${index + 1}: ${label} [${triggers.join(' / ')}]・${definition.presentationModeLabel}`;
}

function layerCells(layer: Layer, layout: Layout): Map<string, LayerCell> {
  if (layer.faces.length === 0) {
    return new Map(
      [...layout.legends].map(([key, label]) => [key, { label }]),
    );
  }
  const cells = new Map<string, LayerCell>();
  for (const face of layer.faces) {
    const annotation = layer.id !== SINGLE_LAYER_ID
      ? displayTriggerAnnotation(layout, face)
      : undefined;
    for (const [key, label] of faceDisplayCells(face)) {
      const previous = cells.get(key);
      cells.set(
        key,
        previous
          ? {
              label: `${previous.label} / ${label}`,
              annotation: previous.annotation ?? annotation,
            }
          : { label, annotation },
      );
    }
  }
  return cells;
}

function pickerGuideColorMap(
  groups: ReturnType<typeof classifyPresentationFaces>,
  faceShiftStyles: ReadonlyMap<Face, LayerShiftStyle>,
  layout: Layout,
): Map<string, string> {
  const colors = new Map<string, string>();
  for (const layer of orderedPresentationLayers(groups)) {
    for (const face of layer.faces) {
      const slot = faceShiftStyles.get(face)?.colorSlot;
      const stroke = slot === undefined
        ? 'var(--picker-selected)'
        : `var(--series-${slot})`;
      for (const trigger of displayTriggerKeys(face)) {
        const key = resolveKeyId(trigger);
        if (!colors.has(key)) colors.set(key, stroke);
      }
    }
  }
  for (const face of groups.combos) {
    for (const trigger of displayTriggerKeys(face)) {
      const key = resolveKeyId(trigger);
      if (!colors.has(key)) colors.set(key, 'var(--picker-selected)');
    }
  }
  for (const combo of layout.resolvedComboDefinitions ?? []) {
    for (const variant of combo.keyVariants ?? [combo.keys]) {
      for (const key of variant) {
        if (!colors.has(key)) colors.set(key, 'var(--picker-selected)');
      }
    }
  }
  return colors;
}

function heatIntensity(
  count: number,
  maxCount: number,
  scale: LayerColorScale,
): number {
  if (scale === 'log') {
    return Math.log1p(count) / Math.log1p(Math.max(1, maxCount));
  }
  return count / Math.max(1, maxCount);
}

function LayerDiagram({
  metrics,
  layout,
  geometry,
  layer,
  title,
  allLayerFaces,
  faceShiftStyles,
  values,
  className = '',
  hidden = false,
}: {
  metrics: Metrics;
  layout: Layout;
  geometry: Geometry;
  layer: Layer;
  title: string;
  allLayerFaces: readonly Face[];
  faceShiftStyles: ReadonlyMap<Face, LayerShiftStyle>;
  values: HeatmapValues;
  className?: string;
  hidden?: boolean;
}) {
  const pickerSelected = (values.picker?.selected.size ?? 0) > 0;
  const labels = pickerSelected
    ? new Map<string, LayerCell>()
    : layerCells(layer, layout);
  if (values.picker?.legendOverrides) {
    for (const [key, output] of values.picker.legendOverrides) {
      labels.set(key, { label: output });
    }
  }

  const triggerFaces = layer.faces.length === 0 ? allLayerFaces : layer.faces;
  const shiftStyles = new Map<string, LayerShiftStyle>();
  const shiftTipLabels = new Map<string, string>();
  for (const face of triggerFaces) {
    const style = faceShiftStyles.get(face);
    if (!style) continue;
    for (const trigger of displayTriggerKeys(face)) {
      if (!handOfKey(trigger)) continue;
      const keyId = resolveKeyId(trigger);
      shiftStyles.set(keyId, style);
      if (face.presentationLabel !== undefined) {
        shiftTipLabels.set(
          keyId,
          `${face.presentationLabel}（レイヤー ${style.layerIndex}）`,
        );
      }
    }
  }

  const keySize = 30;
  const pad = 6;
  const thumbWidth = 1.9;
  let minX = 0;
  let minY = 0;
  let maxX = 0;
  let maxY = 0;

  const keys = visibleGeometryKeys(layout, geometry).map((key) => {
    const count = values.keyCounts.get(key.id) ?? 0;
    const colorCount = values.colorCounts.get(key.id) ?? 0;
    const intensity = heatIntensity(colorCount, values.maxCount, values.colorScale);
    const thumb = key.row === THUMB_ROW;
    const widthU = thumb ? thumbWidth : (key.width ?? 1);
    const width = widthU * keySize;
    const x = (key.x - (widthU - 1) / 2) * keySize;
    const y = key.y * keySize;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + width);
    maxY = Math.max(maxY, y + keySize);

    const cell = labels.get(key.id);
    const label = cell?.label ?? '';
    const annotation = cell?.annotation;
    const shiftStyle = shiftStyles.get(key.id);
    const share = ((count / Math.max(1, metrics.presses)) * 100).toFixed(1);
    const distance = values.keyDistance.get(key.id) ?? 0;
    const shiftTipLabel = shiftStyle
      ? values.triggerTipLabel
        ?? shiftTipLabels.get(key.id)
        ?? `レイヤー ${shiftStyle.layerIndex} のシフトトリガー`
      : undefined;

    const picker = values.picker;
    const isSelected = picker?.selected.has(key.id) ?? false;
    const candidateLabel = picker?.candidateLabels.get(key.id);
    const guideStroke = picker?.guideStrokes?.get(key.id);
    const isGuide = !isSelected && !candidateLabel && guideStroke !== undefined;

    const annotationText = annotation ? `<br>${escapeText(annotation)}` : '';
    const shiftTip = shiftTipLabel !== undefined
      ? `<br><b>${escapeText(shiftTipLabel)}</b>`
      : '';
    const pickerTip = isSelected
      ? '<br><b>選択中</b>'
      : candidateLabel
        ? `<br><b>候補:</b> ${escapeText(candidateLabel)}`
        : isGuide
          ? '<br><span style="color:var(--muted)">入力パターンのトリガー</span>'
          : '';
    const tip = values.showHeat
      ? `${escapeText(label || key.id)} <span style="color:var(--muted)">(${escapeText(key.id)})</span><br>`
        + `<b>${count}</b> 打 (${share}%)<br>移動 <b>${distance.toFixed(1)} u</b>`
        + annotationText + shiftTip + pickerTip
      : `${escapeText(label || key.id)} <span style="color:var(--muted)">(${escapeText(key.id)})</span>`
        + annotationText + shiftTip + pickerTip;

    const fill = values.showHeat
      ? `color-mix(in oklab, var(--heat-1) ${(intensity * 100).toFixed(1)}%, var(--heat-0))`
      : 'var(--panel)';
    const stroke = isSelected
      ? picker?.selectedStroke ?? 'var(--picker-selected)'
      : candidateLabel
        ? 'var(--picker-candidate)'
        : isGuide
          ? guideStroke!
          : shiftStyle
            ? `var(--series-${shiftStyle.colorSlot})`
            : 'var(--line)';
    const strokeWidth = isSelected || candidateLabel || shiftStyle
      ? 3
      : isGuide
        ? 2
        : 1;

    return {
      key,
      x,
      y,
      width,
      label,
      tip,
      fill,
      stroke,
      strokeWidth,
      fontSize: thumb ? 10 : label.length > 3 ? 9 : 12,
      textFill: values.showHeat && intensity > 0.5
        ? 'var(--on-heat)'
        : 'var(--fg)',
    };
  });

  const viewX = minX - pad / 2;
  const viewY = minY - pad / 2;
  const width = maxX - minX + pad;
  const height = maxY - minY + pad;
  const caption = values.showHeat ? `${title}・打鍵頻度` : title;

  return (
    <figure
      className={`layer-diagram ${className}`.trim()}
      style={{ width }}
      hidden={hidden}
    >
      <figcaption>{caption}</figcaption>
      <svg
        viewBox={`${viewX} ${viewY} ${width} ${height}`}
        width={width}
        height={height}
        role="img"
        aria-label={`${caption}${values.ariaSuffix}`}
      >
        {keys.map((item) => (
          <g
            key={item.key.id}
            data-tip={item.tip}
            className={values.picker?.clickable ? 'picker-key tip-wrap' : undefined}
            data-picker-key={values.picker?.clickable ? item.key.id : undefined}
            data-layout-id={values.picker?.clickable ? values.picker.layoutId : undefined}
            onClick={values.picker?.clickable
              ? () => values.picker?.onToggleKey?.(item.key.id)
              : undefined}
            style={{ cursor: values.picker?.clickable ? 'pointer' : undefined }}
          >
            <rect
              x={item.x + 1}
              y={item.y + 1}
              width={item.width - 2}
              height={keySize - 2}
              rx={5}
              fill={item.fill}
              stroke={item.stroke}
              strokeWidth={item.strokeWidth}
            />
            <text
              x={item.x + item.width / 2}
              y={item.y + keySize / 2 + 4}
              textAnchor="middle"
              fontSize={item.fontSize}
              fill={item.textFill}
              pointerEvents="none"
            >
              {item.label}
            </text>
          </g>
        ))}
      </svg>
    </figure>
  );
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

function mergeLayerStats(
  id: string,
  label: string,
  stats: readonly LayerStat[],
): LayerStat {
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
      pairedTriggerKeyCounts.set(
        key,
        (pairedTriggerKeyCounts.get(key) ?? 0) + count,
      );
    }
  }
  return {
    id,
    label,
    presses,
    keyCounts,
    keyDistance,
    triggerKeyCounts,
    pairedTriggerKeyCounts,
  };
}

function layerViewEntries(
  metrics: Metrics,
  layout: Layout,
  layers: readonly Layer[],
  showLayerDetails: boolean,
): LayerViewEntry[] {
  const stats = new Map(metrics.layers.map((stat) => [stat.id, stat]));
  const entries = layers.map((layer, index) => {
    const title = layerTitle(layer, index, layout);
    return {
      id: layer.id,
      layer,
      title,
      stat: stats.get(layer.id) ?? emptyLayerStat(layer.id, title),
    };
  });

  const compact = layout.layerViewPresentation?.compact;
  if (compact === undefined || showLayerDetails) return entries;

  const keepLayerIds = new Set(compact.keepLayerIds);
  if (keepLayerIds.size !== compact.keepLayerIds.length) {
    throw new Error('compact layer presentationのkeepLayerIdsに重複がある');
  }
  if (!keepLayerIds.has(compact.mergeIntoLayerId)) {
    throw new Error(
      'compact layer presentationのmergeIntoLayerIdはkeepLayerIdsに含める必要がある',
    );
  }
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const kept = compact.keepLayerIds.map((id) => {
    const entry = byId.get(id);
    if (!entry) {
      throw new Error(
        `compact layer presentationのaggregation「${id}」が見つからない`,
      );
    }
    return entry;
  });
  const merged = entries.filter((entry) => !keepLayerIds.has(entry.id));
  if (merged.length === 0) return entries;

  return kept.map((entry) => {
    if (entry.id !== compact.mergeIntoLayerId) return entry;
    const title = `${entry.title}${compact.mergedTitleSuffix}`;
    return {
      ...entry,
      title,
      stat: mergeLayerStats(
        `compact:${entry.id}`,
        title,
        [entry.stat, ...merged.map((item) => item.stat)],
      ),
    };
  });
}

function LayerStats({
  metrics,
  entries,
  hasCombos,
  stateOwner,
  open,
}: {
  metrics: Metrics;
  entries: readonly LayerViewEntry[];
  hasCombos: boolean;
  stateOwner: AnalyzerUiStateOwner;
  open: boolean;
}) {
  const total = metrics.presses;
  return (
    <details
      className="layer-stats collapsible-list"
      open={open}
      onToggle={(event) => {
        const next = event.currentTarget.open;
        if (next === stateOwner.getSnapshot().ui.panels.layerStats) return;
        stateOwner.update((draft) => {
          draft.ui.panels.layerStats = next;
        });
      }}
    >
      <summary>帰属先（{entries.length + (hasCombos ? 1 : 0)}）</summary>
      <div className="scroll-x">
        <table>
          <thead>
            <tr><th>帰属先</th><th>押下数</th><th>割合</th></tr>
          </thead>
          <tbody>
            {entries.map(({ title, stat }) => (
              <tr key={stat.id}>
                <th scope="row">{title}</th>
                <td className="num">{stat.presses}</td>
                <td className="num">
                  {total ? ((stat.presses / total) * 100).toFixed(1) : '0.0'}%
                </td>
              </tr>
            ))}
            {hasCombos ? (
              <tr>
                <th scope="row">コンボ計</th>
                <td className="num">{metrics.comboPresses}</td>
                <td className="num">
                  {total ? ((metrics.comboPresses / total) * 100).toFixed(1) : '0.0'}%
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <p className="note">
        層とコンボの押下数の合計:{' '}
        {metrics.layers.reduce((sum, stat) => sum + stat.presses, 0)
          + metrics.comboPresses}{' '}
        / 総押下数: {metrics.presses}
      </p>
    </details>
  );
}

function ModifierList({
  layout,
  modifiers,
  stateOwner,
  open,
}: {
  layout: Layout;
  modifiers: readonly Layer[];
  stateOwner: AnalyzerUiStateOwner;
  open: boolean;
}) {
  if (modifiers.length === 0) return null;
  return (
    <details
      className="modifier-list collapsible-list"
      open={open}
      onToggle={(event) => {
        const next = event.currentTarget.open;
        if (next === stateOwner.getSnapshot().ui.panels.modifierList) return;
        stateOwner.update((draft) => {
          draft.ui.panels.modifierList = next;
        });
      }}
    >
      <summary>修飾（{modifiers.length}）</summary>
      <div className="scroll-x">
        <table>
          <thead><tr><th>トリガー</th><th>出力</th></tr></thead>
          <tbody>
            {modifiers.map((layer) => {
              const label = layerLabelForId(layout, layer.id);
              const triggers = layer.faces
                .map((face) => displayTriggerText(layout, face))
                .join(' / ');
              const outputs = layer.faces
                .flatMap((face) => [...faceCells(face).values()])
                .join(' / ');
              return (
                <tr key={layer.id}>
                  <td>{label}: {triggers}</td>
                  <td>{outputs}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </details>
  );
}

interface ComboDiagramItem {
  face: Face;
  trigger: string;
  optionLabel: string;
}

function comboItems(layout: Layout, combos: readonly Face[]): ComboDiagramItem[] {
  const resolvedCombos = layout.resolvedComboDefinitions ?? [];
  const faceItems = combos.map((face) => {
    const trigger = displayTriggerText(layout, face);
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

  const resolvedItems = [...foldedResolved.values()].map((folded) => {
    const trigger = folded.triggerInputs.join(' + ');
    return {
      face: faceFromEntries(
        folded.triggerKeys,
        'simultaneous',
        folded.entries,
      ),
      trigger,
      optionLabel: `${folded.group}: ${trigger}`,
    };
  });
  return [...faceItems, ...resolvedItems];
}

function ComboSection({
  metrics,
  layout,
  geometry,
  combos,
  picker,
  selectedIndex,
  onSelectIndex,
  stateOwner,
  open,
}: {
  metrics: Metrics;
  layout: Layout;
  geometry: Geometry;
  combos: readonly Face[];
  picker: PickerView;
  selectedIndex: number;
  onSelectIndex(index: number): void;
  stateOwner: AnalyzerUiStateOwner;
  open: boolean;
}) {
  const resolvedCombos = layout.resolvedComboDefinitions ?? [];
  if (combos.length === 0 && resolvedCombos.length === 0) return null;

  const items = comboItems(layout, combos);
  const selected = items.length === 0
    ? 0
    : Math.min(selectedIndex, items.length - 1);
  const comboStyles = new Map<Face, LayerShiftStyle>(
    items.map(({ face }) => [face, { layerIndex: 1, colorSlot: 4 }]),
  );
  const emptyCounts = new Map<string, number>();

  return (
    <section className="combo-section">
      <h3>コンボ（{combos.length + resolvedCombos.length}）</h3>
      {items.length > 0 ? (
        <>
          <div className="combo-diagram-controls">
            <label>
              配列図{' '}
              <select
                value={selected}
                onChange={(event) => onSelectIndex(Number(event.currentTarget.value))}
              >
                {items.map((item, index) => (
                  <option value={index} key={`${item.optionLabel}-${index}`}>
                    {item.optionLabel}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="combo-diagram-panel">
            {items.map((item, index) => (
              <LayerDiagram
                key={`${item.optionLabel}-${index}`}
                metrics={metrics}
                layout={layout}
                geometry={geometry}
                layer={{
                  id: COMBO_LAYER_ID,
                  role: 'layer',
                  order: 0,
                  faces: [item.face],
                }}
                title={item.optionLabel}
                allLayerFaces={[item.face]}
                faceShiftStyles={comboStyles}
                className="combo-diagram"
                hidden={index !== selected}
                values={{
                  keyCounts: emptyCounts,
                  colorCounts: emptyCounts,
                  keyDistance: emptyCounts,
                  maxCount: 1,
                  colorScale: 'linear',
                  showHeat: false,
                  ariaSuffix: '（コンボ配列図）',
                  triggerTipLabel: `コンボ: ${item.trigger}`,
                  picker: { ...picker, guideStrokes: undefined },
                }}
              />
            ))}
          </div>
        </>
      ) : null}
      <details
        className="combo-table collapsible-list"
        open={open}
        onToggle={(event) => {
          const next = event.currentTarget.open;
          if (next === stateOwner.getSnapshot().ui.panels.comboTable) return;
          stateOwner.update((draft) => {
            draft.ui.panels.comboTable = next;
          });
        }}
      >
        <summary>コンボ表</summary>
        <div className="scroll-x">
          <table>
            <thead><tr><th>トリガー</th><th>出力</th></tr></thead>
            <tbody>
              {combos.map((face, index) => (
                <tr key={`face-${index}`}>
                  <td>{displayTriggerText(layout, face)}</td>
                  <td>{[...faceCells(face).values()].join(' / ')}</td>
                </tr>
              ))}
              {resolvedCombos.map((combo, index) => (
                <tr key={`resolved-${index}`}>
                  <td>{combo.group ? `${combo.group}: ` : ''}{combo.inputs.join(' + ')}</td>
                  <td>{combo.output}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}

function PickerResult({
  selection,
  match,
}: {
  selection: ReadonlySet<string>;
  match: ReturnType<typeof matchKeyPatterns>;
}) {
  if (selection.size === 0) {
    return <p className="key-pattern-picker-result">キーをクリックすると、入力パターンを確認できます。</p>;
  }
  if (match.exact.length === 0 && match.candidates.size > 0) {
    return <p className="key-pattern-picker-result">青い枠が候補です。</p>;
  }
  if (match.exact.length > 0) {
    return (
      <p className="key-pattern-picker-result">
        確定: <b>{match.exact.map((item) => item.output).join(' / ')}</b>
        {match.candidates.size > 0 ? ' / 青い枠が候補です。' : ''}
      </p>
    );
  }
  return (
    <p className="key-pattern-picker-result">
      このキーの組み合わせに一致する出力はありません。
    </p>
  );
}

function detailResult(
  results: readonly import('./results-view.ts').Result[],
  detailLayoutId: string | undefined,
) {
  return results.find((result) => result.layout.id === detailLayoutId) ?? results[0];
}

export function AnalyzerHeatmap({
  model,
  stateOwner,
}: {
  model: AnalyzerMetricsModel;
  stateOwner: AnalyzerUiStateOwner;
}) {
  const snapshot = useSyncExternalStore(
    model.subscribe,
    model.getSnapshot,
    model.getSnapshot,
  );
  const state = useSyncExternalStore(
    stateOwner.subscribe,
    stateOwner.getSnapshot,
    stateOwner.getSnapshot,
  );
  const result = detailResult(snapshot.results, snapshot.detailLayoutId);
  const [selectionByLayout, setSelectionByLayout] = useState<
    Record<string, string[]>
  >({});
  const [comboIndexByLayout, setComboIndexByLayout] = useState<
    Record<string, number>
  >({});

  const layoutId = result?.layout.id;

  useEffect(() => {
    const onDocumentClick = (event: MouseEvent) => {
      if ((event.target as Element).closest('.layer-diagram')) return;
      if (!layoutId) return;
      setSelectionByLayout((current) => {
        if ((current[layoutId]?.length ?? 0) === 0) return current;
        return { ...current, [layoutId]: [] };
      });
    };
    document.addEventListener('click', onDocumentClick);
    return () => document.removeEventListener('click', onDocumentClick);
  }, [layoutId]);

  if (!result) return null;

  const { metrics, layout, geometry } = result;
  const groups = classifyPresentationFaces(layout);
  const layers = orderedPresentationLayers(groups);
  if (layers.length === 0) {
    layers.push({ id: SINGLE_LAYER_ID, role: 'layer', order: 0, faces: [] });
  }
  const entries = layerViewEntries(
    metrics,
    layout,
    layers,
    state.ui.layers.showLayerDetails,
  );
  const activeTab = Math.min(
    state.ui.layers.activeTab,
    Math.max(0, entries.length - 1),
  );

  useEffect(() => {
    if (state.ui.layers.activeTab === activeTab) return;
    stateOwner.update((draft) => {
      draft.ui.layers.activeTab = activeTab;
    });
  }, [activeTab, state.ui.layers.activeTab, stateOwner]);

  const titles = entries.map((entry) => entry.title);
  const allLayerFaces = layers.flatMap((layer) => layer.faces);
  const faceShiftStyles = layerShiftStyles(entries.map((entry) => entry.layer));
  const shiftLayers = entries
    .map((entry, index) => ({
      id: entry.id,
      index,
      style: entry.layer.faces
        .map((face) => faceShiftStyles.get(face))
        .find((style): style is LayerShiftStyle => style !== undefined),
    }))
    .filter(
      (entry): entry is {
        id: string;
        index: number;
        style: LayerShiftStyle;
      } => entry.style !== undefined,
    );

  const selectedLayerView: LayerView = state.ui.layers.view === 'auto'
    ? (entries.length <= 5 ? 'side-by-side' : 'tabs')
    : state.ui.layers.view;
  const commonMax = Math.max(1, ...metrics.keyCounts.values());
  const baseLayer = layers.find((layer) => layer.id === SINGLE_LAYER_ID) ?? layers[0]!;

  const selection = new Set(selectionByLayout[layout.id] ?? []);
  const pickerMatch = matchKeyPatterns(layout, selection);
  const candidateLabels = new Map(
    [...pickerMatch.candidates].map(([key, matches]) => [
      key,
      summarizeCandidateMatches(matches),
    ]),
  );
  const guideSetting = state.ui.layers.keyPatternGuide;
  const guideEnabled = guideSetting && selection.size === 0;
  const guideColors = guideEnabled
    ? pickerGuideColorMap(groups, faceShiftStyles, layout)
    : undefined;
  const activeLayerFace = findActiveLayerFace(layout, selection);
  const layerColorSlot = activeLayerFace
    ? faceShiftStyles.get(activeLayerFace)?.colorSlot
    : undefined;
  const selectedStroke = layerColorSlot !== undefined
    ? `var(--series-${layerColorSlot})`
    : 'var(--picker-selected)';

  const toggleKey = (keyId: string) => {
    setSelectionByLayout((current) => {
      const next = new Set(current[layout.id] ?? []);
      if (next.has(keyId)) next.delete(keyId);
      else next.add(keyId);
      return { ...current, [layout.id]: [...next] };
    });
  };

  const picker: PickerView = {
    layoutId: layout.id,
    clickable: true,
    selected: selection,
    candidateLabels,
    guideStrokes: guideColors,
    selectedStroke,
    legendOverrides: candidateLabels,
    onToggleKey: toggleKey,
  };

  const integrated = (
    <LayerDiagram
      metrics={metrics}
      layout={layout}
      geometry={geometry}
      layer={baseLayer}
      title="統合"
      allLayerFaces={allLayerFaces}
      faceShiftStyles={faceShiftStyles}
      values={{
        keyCounts: metrics.keyCounts,
        colorCounts: metrics.keyCounts,
        keyDistance: metrics.keyDistance,
        maxCount: commonMax,
        colorScale: 'linear',
        showHeat: true,
        ariaSuffix: '（全レイヤー合算・物理位置）',
        picker,
      }}
    />
  );

  const colorCounts = entries.map((entry) =>
    normalizedLayerColors(entry.layer, entry.stat));
  const layerMax = Math.max(
    1,
    ...colorCounts.flatMap((counts) => [...counts.values()]),
  );
  const diagrams = entries.map((entry, index) => (
    <LayerDiagram
      key={entry.id}
      metrics={metrics}
      layout={layout}
      geometry={geometry}
      layer={entry.layer}
      title={titles[index]!}
      allLayerFaces={allLayerFaces}
      faceShiftStyles={faceShiftStyles}
      hidden={selectedLayerView === 'tabs' && entries.length > 1 && activeTab !== index}
      values={{
        keyCounts: entry.stat.keyCounts,
        colorCounts: colorCounts[index]!,
        keyDistance: entry.stat.keyDistance,
        maxCount: layerMax,
        colorScale: state.ui.layers.colorScale,
        showHeat: true,
        ariaSuffix: `（層別・${state.ui.layers.colorScale === 'log' ? '対数' : '線形'}・共通スケール）`,
        picker: { ...picker, guideStrokes: undefined },
      }}
    />
  ));

  const compactPresentation = layout.layerViewPresentation?.compact;
  const hasCombos = groups.combos.length > 0
    || layout.layerDefinitions?.some((definition) => definition.kind === 'combo') === true;

  return (
    <>
      <section className="layer-section">
        <h3>統合ヒートマップ</h3>
        <div className="key-pattern-picker-controls">
          <PickerResult selection={selection} match={pickerMatch} />
          <label>
            <input
              type="checkbox"
              data-picker-guide
              data-layout-id={layout.id}
              checked={guideSetting}
              onChange={(event) => {
                stateOwner.update((draft) => {
                  draft.ui.layers.keyPatternGuide = event.currentTarget.checked;
                });
              }}
            />{' '}
            トリガーをガイド表示
          </label>
          <button
            type="button"
            className="secondary"
            disabled={selection.size === 0}
            onClick={() => {
              setSelectionByLayout((current) => ({
                ...current,
                [layout.id]: [],
              }));
            }}
          >
            選択をクリア
          </button>
        </div>
        <div className="layer-diagrams">{integrated}</div>
      </section>

      <section className="layer-section">
        <h3>層別ヒートマップ（{entries.length}）</h3>
        <p className="note">
          層別図の色は層操作のための押下を除いたキー押下数で正規化し、表示中の全層で共通の最大値にしている。相互同時シフトとレイヤー合算表示では、出力として扱うトリガー押下を色に残す。色の尺度は
          {state.ui.layers.colorScale === 'log' ? '対数' : '線形'}
          。実際の押下数はツールチップと帰属先表に残る。
        </p>

        <div
          className="layer-view-controls"
          role="group"
          aria-label="層別ヒートマップの色の尺度"
        >
          <span>色の尺度</span>
          {(['linear', 'log'] as const).map((scale) => (
            <button
              key={scale}
              type="button"
              className="ghost"
              aria-pressed={state.ui.layers.colorScale === scale}
              onClick={() => {
                stateOwner.update((draft) => {
                  draft.ui.layers.colorScale = scale;
                });
              }}
            >
              {scale === 'linear' ? '線形' : '対数'}
            </button>
          ))}
        </div>

        {shiftLayers.length > 0 ? (
          <div className="shift-key-legend" aria-label="シフトキーの枠色">
            {shiftLayers.map(({ id, index, style }) => (
              <span
                className="shift-key-swatch"
                style={{
                  ['--shift-color' as string]: `var(--series-${style.colorSlot})`,
                }}
                key={id}
              >
                レイヤー {index + 1} の{layerLabelForId(layout, id)}
              </span>
            ))}
          </div>
        ) : null}

        {compactPresentation !== undefined
          && layers.length > compactPresentation.keepLayerIds.length ? (
          <div
            className="layer-view-controls"
            role="group"
            aria-label={compactPresentation.controlLabel}
          >
            <span>{compactPresentation.controlLabel}</span>
            <button
              type="button"
              className="ghost"
              aria-pressed={!state.ui.layers.showLayerDetails}
              onClick={() => {
                stateOwner.update((draft) => {
                  draft.ui.layers.showLayerDetails = false;
                  draft.ui.layers.activeTab = 0;
                });
              }}
            >
              {compactPresentation.compactLabel}
            </button>
            <button
              type="button"
              className="ghost"
              aria-pressed={state.ui.layers.showLayerDetails}
              onClick={() => {
                stateOwner.update((draft) => {
                  draft.ui.layers.showLayerDetails = true;
                  draft.ui.layers.activeTab = 0;
                });
              }}
            >
              {compactPresentation.detailLabel}
            </button>
          </div>
        ) : null}

        {entries.length > 1 ? (
          <div
            className="layer-view-controls"
            role="group"
            aria-label="レイヤーの表示方法"
          >
            <span>レイヤーの表示</span>
            {(['side-by-side', 'tabs'] as const).map((view) => (
              <button
                key={view}
                type="button"
                className="ghost"
                aria-pressed={selectedLayerView === view}
                onClick={() => {
                  stateOwner.update((draft) => {
                    draft.ui.layers.view = view;
                    draft.ui.layers.activeTab = 0;
                  });
                }}
              >
                {view === 'side-by-side' ? '並置' : 'タブ'}
              </button>
            ))}
          </div>
        ) : null}

        {selectedLayerView === 'tabs' && entries.length > 1 ? (
          <>
            <div className="layer-tabs" role="tablist" aria-label="レイヤー">
              {titles.map((_, index) => (
                <button
                  key={index}
                  type="button"
                  className="ghost"
                  role="tab"
                  aria-selected={activeTab === index}
                  onClick={() => {
                    stateOwner.update((draft) => {
                      draft.ui.layers.activeTab = index;
                    });
                  }}
                >
                  レイヤー {index + 1}
                </button>
              ))}
            </div>
            <div className="layer-tab-panel">{diagrams}</div>
          </>
        ) : (
          <div className="layer-diagrams">{diagrams}</div>
        )}

        <LayerStats
          metrics={metrics}
          entries={entries}
          hasCombos={hasCombos}
          stateOwner={stateOwner}
          open={state.ui.panels.layerStats}
        />
      </section>

      <ModifierList
        layout={layout}
        modifiers={groups.modifiers}
        stateOwner={stateOwner}
        open={state.ui.panels.modifierList}
      />

      <ComboSection
        metrics={metrics}
        layout={layout}
        geometry={geometry}
        combos={groups.combos}
        picker={picker}
        selectedIndex={comboIndexByLayout[layout.id] ?? 0}
        onSelectIndex={(index) => {
          setComboIndexByLayout((current) => ({
            ...current,
            [layout.id]: index,
          }));
        }}
        stateOwner={stateOwner}
        open={state.ui.panels.comboTable}
      />
    </>
  );
}
