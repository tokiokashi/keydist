import { useId, useMemo, useState } from 'react';
import { visibleGeometryKeys } from '#input/layouts/physical-keys.ts';
import { keyboardStandardForGeometryId } from '#input/shapes/key-labels.ts';
import { PhysicalKeyboard, type PhysicalKeyboardKeyView } from '#ui/keyboard/physical-keyboard.tsx';
import { keyPatternSelectionView, toggleSelectedKey } from './key-pattern-selection.ts';
import { inputMethodDefinition, type InputMethodExtracted } from './extract.ts';
import { comboDiagramItems, comboRows, modifierRows, type ComboDiagramItem } from './layout-breakdown.ts';
import { DEFAULT_INPUT_METHOD_OPTIONS, inputMethodOptions, type InputMethodOptions } from './options.ts';
import { INPUT_METHOD_PANE_META } from './pane-meta.ts';
import type { Geometry } from '#input/shapes/geometry.ts';
import type { Layout } from '#input/layouts/types.ts';
import type { AnalyzerSettingsProps, SingleAnalyzerPaneParts, SingleBodyProps } from '../pane-parts.tsx';
import './input-method-view.css';

/**
 * 入力方法。配列が持つ修飾・キーを選んで出る文字を調べる図・コンボの一覧と配列図を、配列の定義から並べる。
 * テキストを打った結果は使わない。優劣を示す強調・順位は出さない。
 */

function ModifierSection({ layout }: { readonly layout: Layout }) {
  const rows = useMemo(() => modifierRows(layout), [layout]);
  return (
    <section className="input-method-section" aria-labelledby="input-method-modifier-heading">
      <h3 id="input-method-modifier-heading">修飾（{rows.length}）</h3>
      {rows.length === 0 ? (
        <p className="input-method-empty">この配列は修飾のレイヤーを持ちません。</p>
      ) : (
        <div className="input-method-table-scroll">
          <table className="input-method-table" data-input-method-table="modifier">
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
    <section className="input-method-section" aria-labelledby="input-method-combo-heading">
      <h3 id="input-method-combo-heading">コンボ（{rows.length}）</h3>
      {rows.length === 0 ? (
        <p className="input-method-empty">この打ち方で使えるコンボはありません。</p>
      ) : (
        <>
          {current === undefined ? null : (
            <div className="input-method-diagram" data-input-method-diagram>
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
          <div className="input-method-table-scroll">
            <table className="input-method-table" data-input-method-table="combo">
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
 * キーを選んで出る文字を調べる図。キーを1つずつ選ぶと、続けて押せるキーが枠で、あと1キーで決まるキーには出る文字が出る。
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
    <section className="input-method-section" aria-labelledby="input-method-pattern-heading">
      <h3 id="input-method-pattern-heading">キーを選んで出る文字を調べる</h3>
      <div className="input-method-pattern" data-input-method-pattern>
        <div className="input-method-pattern-controls">
          <p className="input-method-pattern-result" role="status" data-input-method-pattern-result>{view.message}</p>
          <button type="button" onClick={clear} disabled={selected.length === 0}>選択を外す</button>
        </div>
        <PhysicalKeyboard
          ariaLabel="出る文字を調べるキーの選択"
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

export function InputMethodBody({ layout, geometry }: SingleBodyProps<InputMethodExtracted, InputMethodOptions>) {
  return (
    <div className="input-method-feature" data-react-feature="input-method">
      <ModifierSection layout={layout} />
      <KeyPatternSection layout={layout} geometry={geometry} />
      <ComboSection layout={layout} geometry={geometry} />
    </div>
  );
}

/** 設定できる項目は無い。 */
export function InputMethodSettings(_props: AnalyzerSettingsProps<InputMethodOptions>) {
  return <p className="input-method-empty">このAnalyzerに解析設定はありません。</p>;
}

/** ペインに渡すもの（`analyzers/pane-parts.tsx`）。 */
export const inputMethodAnalyzer = {
  definition: inputMethodDefinition,
  ...INPUT_METHOD_PANE_META,
  Body: InputMethodBody,
  Settings: InputMethodSettings,
  defaultOptions: DEFAULT_INPUT_METHOD_OPTIONS,
  urlOptions: inputMethodOptions,
} satisfies SingleAnalyzerPaneParts<InputMethodOptions, InputMethodExtracted>;
