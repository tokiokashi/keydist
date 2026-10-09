import { useId, useMemo, useState } from 'react';
import { visibleGeometryKeys } from '#input/layouts/physical-keys.ts';
import { keyboardStandardForGeometryId } from '#input/shapes/key-labels.ts';
import { PhysicalKeyboard, type PhysicalKeyboardKeyView } from '#ui/keyboard/physical-keyboard.tsx';
import { keyPatternSelectionView, toggleSelectedKey } from './key-pattern-selection.ts';
import { layerComboDefinition, type LayerComboExtracted } from './extract.ts';
import { comboDiagramItems, comboRows, modifierRows, type ComboDiagramItem } from './layout-breakdown.ts';
import { DEFAULT_LAYER_COMBO_OPTIONS, layerComboOptions, type LayerComboOptions } from './options.ts';
import { LAYER_COMBO_PANE_META } from './pane-meta.ts';
import { attributionShare } from './share.ts';
import type { Geometry } from '#input/shapes/geometry.ts';
import type { Layout } from '#input/layouts/types.ts';
import type { AnalyzerSettingsProps, SingleAnalyzerPaneParts, SingleBodyProps } from '../pane-parts.tsx';
import './layer-combo-view.css';

/**
 * レイヤーとコンボの内訳。
 *
 * 帰属先の押下数は `extracted`（`extract.ts` の計算結果）をそのまま表にし、割合だけを求める。
 * 修飾・コンボ表・コンボの配列図は配列の定義から並べる。優劣を示す強調・順位は出さない。
 */

function AttributionTable({ extracted }: { readonly extracted: LayerComboExtracted }) {
  return (
    <section className="layer-combo-section" aria-labelledby="layer-combo-attribution-heading">
      <h3 id="layer-combo-attribution-heading">押下の帰属先（{extracted.rows.length}）</h3>
      <div className="layer-combo-table-scroll">
        <table className="layer-combo-table" data-layer-combo-table="attribution">
          <thead>
            <tr><th scope="col">帰属先</th><th scope="col">押下数</th><th scope="col">割合</th></tr>
          </thead>
          <tbody>
            {extracted.rows.map((row) => (
              <tr key={row.id} data-attribution-row={row.id}>
                <th scope="row">{row.label}</th>
                <td className="layer-combo-num">{row.presses}</td>
                <td className="layer-combo-num">{attributionShare(row.presses, extracted.presses)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">合計</th>
              <td className="layer-combo-num">{extracted.presses}</td>
              <td className="layer-combo-num">{attributionShare(extracted.presses, extracted.presses)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}

function ModifierSection({ layout }: { readonly layout: Layout }) {
  const rows = useMemo(() => modifierRows(layout), [layout]);
  return (
    <section className="layer-combo-section" aria-labelledby="layer-combo-modifier-heading">
      <h3 id="layer-combo-modifier-heading">修飾（{rows.length}）</h3>
      {rows.length === 0 ? (
        <p className="layer-combo-empty">この配列は修飾のレイヤーを持ちません。</p>
      ) : (
        <div className="layer-combo-table-scroll">
          <table className="layer-combo-table" data-layer-combo-table="modifier">
            <thead>
              <tr><th scope="col">レイヤー</th><th scope="col">押し方</th><th scope="col">出る文字</th></tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <th scope="row">{row.label}</th>
                  <td>{row.trigger}</td>
                  <td>{row.outputs}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function ComboDiagram({ layout, geometry, item }: { readonly layout: Layout; readonly geometry: Geometry; readonly item: ComboDiagramItem }) {
  const keys = useMemo(() => visibleGeometryKeys(layout, geometry), [layout, geometry]);
  const views = useMemo(() => {
    const triggers = new Set(item.triggerKeys);
    return new Map<string, PhysicalKeyboardKeyView>(keys.map((key) => {
      const trigger = triggers.has(key.id);
      return [key.id, {
        legend: item.outputs.get(key.id) ?? (trigger ? layout.legends.get(key.id) ?? '' : ''),
        trigger,
        combo: trigger,
        highlighted: trigger,
      }];
    }));
  }, [keys, item, layout]);
  return (
    <PhysicalKeyboard
      ariaLabel={`コンボの配列図: ${item.label}`}
      geometryId={geometry.id}
      keys={keys}
      keyViews={views}
      showSecondary={false}
      unit={36}
      horizontalAlign="left"
    />
  );
}

function ComboSection({ layout, geometry }: { readonly layout: Layout; readonly geometry: Geometry }) {
  const standard = keyboardStandardForGeometryId(geometry.id);
  const rows = useMemo(() => comboRows(layout, standard), [layout, standard]);
  const items = useMemo(() => comboDiagramItems(layout, standard), [layout, standard]);
  const [selected, setSelected] = useState(0);
  const selectId = useId();
  const current = items[Math.min(selected, items.length - 1)];
  return (
    <section className="layer-combo-section" aria-labelledby="layer-combo-combo-heading">
      <h3 id="layer-combo-combo-heading">コンボ（{rows.length}）</h3>
      {rows.length === 0 ? (
        <p className="layer-combo-empty">この打ち方で使えるコンボはありません。</p>
      ) : (
        <>
          {current === undefined ? null : (
            <div className="layer-combo-diagram" data-layer-combo-diagram>
              <label htmlFor={selectId}>
                コンボの配列図
                <select id={selectId} value={items.indexOf(current)} onChange={(event) => setSelected(Number(event.currentTarget.value))}>
                  {items.map((item, index) => (
                    <option key={`${item.label}-${index}`} value={index}>{item.label}</option>
                  ))}
                </select>
              </label>
              <ComboDiagram layout={layout} geometry={geometry} item={current} />
            </div>
          )}
          <div className="layer-combo-table-scroll">
            <table className="layer-combo-table" data-layer-combo-table="combo">
              <thead>
                <tr><th scope="col">押し方</th><th scope="col">出力</th></tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={`${row.trigger}-${index}`}>
                    <td>{row.trigger}</td>
                    <td>{row.output}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

/**
 * 入力パターンの選択。キーを1つずつ選ぶと、続けて押せるキーが枠で、あと1キーで決まるキーには出る文字が出る。
 * 3キー以上を同時に押すコンボも、選んでいくと出る文字までたどれる。シフトのキーを選べば、そのレイヤーで出る文字が出る。
 */
function KeyPatternSection({ layout, geometry }: { readonly layout: Layout; readonly geometry: Geometry }) {
  const keys = useMemo(() => visibleGeometryKeys(layout, geometry), [layout, geometry]);
  const [selected, setSelected] = useState<readonly string[]>([]);
  const view = useMemo(() => keyPatternSelectionView(layout, selected), [layout, selected]);
  const views = useMemo(() => {
    const chosen = new Set(selected);
    return new Map<string, PhysicalKeyboardKeyView>(keys.map((key) => {
      const candidate = view.candidateLegends.get(key.id);
      const guide = candidate !== undefined ? 'output' as const : view.continuationKeys.has(key.id) ? 'continuation' as const : undefined;
      return [key.id, {
        legend: candidate ?? layout.legends.get(key.id) ?? '',
        selected: chosen.has(key.id),
        guide,
      }];
    }));
  }, [keys, layout, selected, view]);
  const clear = () => setSelected([]);
  return (
    <section className="layer-combo-section" aria-labelledby="layer-combo-pattern-heading">
      <h3 id="layer-combo-pattern-heading">入力パターン</h3>
      <div className="layer-combo-pattern" data-layer-combo-pattern>
        <div className="layer-combo-pattern-controls">
          <p className="layer-combo-pattern-result" role="status" data-layer-combo-pattern-result>{view.message}</p>
          <button type="button" onClick={clear} disabled={selected.length === 0}>選択を外す</button>
        </div>
        <PhysicalKeyboard
          ariaLabel="入力パターンの選択"
          geometryId={geometry.id}
          keys={keys}
          keyViews={views}
          showSecondary={false}
          unit={36}
          horizontalAlign="left"
          operable
          onKeyClick={(key) => setSelected((current) => toggleSelectedKey(current, key.id))}
          onEscape={clear}
        />
      </div>
    </section>
  );
}

export function LayerComboBody({ layout, geometry, extracted }: SingleBodyProps<LayerComboExtracted, LayerComboOptions>) {
  return (
    <div className="layer-combo-feature" data-react-feature="layer-combo">
      <AttributionTable extracted={extracted} />
      <ModifierSection layout={layout} />
      <KeyPatternSection layout={layout} geometry={geometry} />
      <ComboSection layout={layout} geometry={geometry} />
    </div>
  );
}

/** 設定できる項目は無い。 */
export function LayerComboSettings(_props: AnalyzerSettingsProps<LayerComboOptions>) {
  return <p className="layer-combo-empty">このAnalyzerに解析設定はありません。</p>;
}

/** ペインに渡すもの（`analyzers/pane-parts.tsx`）。 */
export const layerComboAnalyzer = {
  definition: layerComboDefinition,
  ...LAYER_COMBO_PANE_META,
  Body: LayerComboBody,
  Settings: LayerComboSettings,
  defaultOptions: DEFAULT_LAYER_COMBO_OPTIONS,
  urlOptions: layerComboOptions,
} satisfies SingleAnalyzerPaneParts<LayerComboOptions, LayerComboExtracted>;
