import { useId, useMemo, useState } from 'react';
import { visibleGeometryKeys } from '#input/layouts/physical-keys.ts';
import { keyboardStandardForGeometryId } from '#input/shapes/key-labels.ts';
import { PhysicalKeyboard, type PhysicalKeyboardKeyView } from '#ui/keyboard/physical-keyboard.tsx';
import { keyPatternSelectionView, toggleSelectedKey } from './key-pattern-selection.ts';
import { keymapDefinition, type KeymapExtracted } from './extract.ts';
import { comboDiagramItems, comboRows, modifierRows, type ComboDiagramItem } from './layout-breakdown.ts';
import { DEFAULT_KEYMAP_OPTIONS, keymapOptions, type KeymapOptions } from './options.ts';
import { KEYMAP_PANE_META } from './pane-meta.ts';
import { triggerGuide } from './trigger-guide.ts';
import type { Geometry } from '#input/shapes/geometry.ts';
import type { Layout } from '#input/layouts/types.ts';
import type { AnalyzerSettingsProps, SingleAnalyzerPaneParts, SingleBodyProps } from '../pane-parts.tsx';
import './keymap-view.css';

/**
 * キーマップ。配列が持つ修飾・キーを選んで出る文字を調べる図・コンボの一覧と配列図を、配列の定義から並べる。
 * テキストを打った結果は使わない。優劣を示す強調・順位は出さない。
 */

function ModifierSection({ layout }: { readonly layout: Layout }) {
  const rows = useMemo(() => modifierRows(layout), [layout]);
  return (
    <section className="keymap-section" aria-labelledby="keymap-modifier-heading">
      <h3 id="keymap-modifier-heading">修飾（{rows.length}）</h3>
      {rows.length === 0 ? (
        <p className="keymap-empty">この配列は修飾のレイヤーを持ちません。</p>
      ) : (
        <div className="keymap-table-scroll">
          <table className="keymap-table" data-keymap-table="modifier">
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
    <section className="keymap-section" aria-labelledby="keymap-combo-heading">
      <h3 id="keymap-combo-heading">コンボ（{rows.length}）</h3>
      {rows.length === 0 ? (
        <p className="keymap-empty">この打ち方で使えるコンボはありません。</p>
      ) : (
        <>
          {current === undefined ? null : (
            <div className="keymap-diagram" data-keymap-diagram>
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
          <div className="keymap-table-scroll">
            <table className="keymap-table" data-keymap-table="combo">
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
 *
 * 何も選んでいない間は、トリガーになるキーを細い実線の枠で示す（レイヤーはその色、コンボは選択の色）。
 * 普通のキーの枠より太く、続けて押せるキーの枠・選んだキーの枠より細くして、選んだ後の枠と見た目を分ける。
 * 凡例は図のそばに置く。
 */
function KeyPatternSection({ layout, geometry }: { readonly layout: Layout; readonly geometry: Geometry }) {
  const keys = useMemo(() => visibleGeometryKeys(layout, geometry), [layout, geometry]);
  const [selected, setSelected] = useState<readonly string[]>([]);
  const view = useMemo(() => keyPatternSelectionView(layout, selected), [layout, selected]);
  const triggers = useMemo(() => triggerGuide(layout), [layout]);
  const selectedSlot = useMemo(() => triggers.slotOfSelected(selected), [triggers, selected]);
  const views = useMemo(() => {
    const chosen = new Set(selected);
    const showTriggers = selected.length === 0;
    return new Map<string, PhysicalKeyboardKeyView>(keys.map((key) => {
      const candidate = view.candidateLegends.get(key.id);
      const isTrigger = showTriggers && triggers.keySlots.has(key.id);
      const guide = candidate !== undefined
        ? 'output' as const
        : view.continuationKeys.has(key.id) ? 'continuation' as const : isTrigger ? 'trigger' as const : undefined;
      const slot = isTrigger ? triggers.keySlots.get(key.id) : chosen.has(key.id) ? selectedSlot : undefined;
      return [key.id, {
        legend: candidate ?? layout.legends.get(key.id) ?? '',
        selected: chosen.has(key.id),
        guide,
        ...(slot === undefined ? {} : { accentSlot: slot }),
      }];
    }));
  }, [keys, layout, selected, view, triggers, selectedSlot]);
  const clear = () => setSelected([]);
  return (
    <section className="keymap-section" aria-labelledby="keymap-pattern-heading">
      <h3 id="keymap-pattern-heading">キーを選んで出る文字を調べる</h3>
      <div className="keymap-pattern" data-keymap-pattern>
        <div className="keymap-pattern-controls">
          <p className="keymap-pattern-result" role="status" data-keymap-pattern-result>{view.message}</p>
          <button type="button" onClick={clear} disabled={selected.length === 0}>選択を外す</button>
        </div>
        {triggers.legend.length > 0 ? (
          <div className="keymap-trigger-legend" aria-label="トリガーになるキーの枠" data-keymap-trigger-legend>
            {triggers.legend.map((item) => (
              <span
                key={item.id}
                className="keymap-trigger-swatch"
                data-legend-slot={item.slot}
                style={{ ['--trigger-color' as string]: item.slot === undefined ? 'var(--picker-selected)' : `var(--series-${item.slot})` }}
              >
                {item.label}
              </span>
            ))}
          </div>
        ) : null}
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

export function KeymapBody({ layout, geometry }: SingleBodyProps<KeymapExtracted, KeymapOptions>) {
  return (
    <div className="keymap-feature" data-react-feature="keymap">
      <KeyPatternSection layout={layout} geometry={geometry} />
      <ModifierSection layout={layout} />
      <ComboSection layout={layout} geometry={geometry} />
    </div>
  );
}

/** 設定できる項目は無い。 */
export function KeymapSettings(_props: AnalyzerSettingsProps<KeymapOptions>) {
  return <p className="keymap-empty">このAnalyzerに解析設定はありません。</p>;
}

/** ペインに渡すもの（`analyzers/pane-parts.tsx`）。 */
export const keymapAnalyzer = {
  definition: keymapDefinition,
  ...KEYMAP_PANE_META,
  Body: KeymapBody,
  Settings: KeymapSettings,
  defaultOptions: DEFAULT_KEYMAP_OPTIONS,
  urlOptions: keymapOptions,
} satisfies SingleAnalyzerPaneParts<KeymapOptions, KeymapExtracted>;
