import { InfoButton } from '#ui/primitives/info-button.tsx';
import { layerComboPressesDefinition, type LayerComboPressesExtracted } from './extract.ts';
import { DEFAULT_LAYER_COMBO_PRESSES_OPTIONS, layerComboPressesOptions, type LayerComboPressesOptions } from './options.ts';
import { LAYER_COMBO_PRESSES_PANE_META } from './pane-meta.ts';
import { attributionShare } from './share.ts';
import type { AnalyzerSettingsProps, SingleAnalyzerPaneParts, SingleBodyProps } from '../pane-parts.tsx';
import './layer-combo-presses-view.css';

/**
 * レイヤーとコンボの押下数。
 *
 * キー数と、切り替えのキーを使った打鍵の数は `extracted`（`extract.ts` の計算結果）をそのまま表にし、割合だけを求める。
 * 優劣を示す強調・順位は出さない。
 */

function PressesTable({ extracted }: { readonly extracted: LayerComboPressesExtracted }) {
  return (
    <section className="layer-combo-presses-section" aria-labelledby="layer-combo-presses-heading">
      <h3 id="layer-combo-presses-heading">レイヤーとコンボごとのキー数（{extracted.rows.length}）</h3>
      <div className="layer-combo-presses-table-scroll">
        <table className="layer-combo-presses-table" data-layer-combo-presses-table>
          <thead>
            <tr>
              <th scope="col">レイヤー・コンボ</th>
              <th scope="col">キー数</th>
              <th scope="col">割合</th>
            </tr>
          </thead>
          <tbody>
            {extracted.rows.map((row) => (
              <tr key={row.id} data-attribution-row={row.id}>
                <th scope="row">{row.label}</th>
                <td className="layer-combo-presses-num">{row.presses}</td>
                <td className="layer-combo-presses-num">{attributionShare(row.presses, extracted.presses)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">合計</th>
              <td className="layer-combo-presses-num">{extracted.presses}</td>
              <td className="layer-combo-presses-num">{attributionShare(extracted.presses, extracted.presses)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}

const TRIGGER_READING =
  '全打鍵に対する割合は、その行の打鍵の数を全打鍵の数で割った値です。同手の割合は、その行の打鍵のうち、切り替えのキーと出力のキーを打つ指が同じ手の打鍵の割合です。レイヤー・コンボと入力の意味と持続の行は重ならず、足すと全体の数になります。押す順の行だけは重なります。同時に押して押す順も縛る入力は、同時に押すと先に押すの両方に入ります。持続の行は、条件のシフト系キーの押し続けで決まります。押し続けを実現した打鍵が保持で、それ以外は単発です。面の編集画面の単発・保持は入力の宣言の意味で、ここでの分け方とは異なります。';

function TriggerTable({ extracted }: { readonly extracted: LayerComboPressesExtracted }) {
  return (
    <section className="layer-combo-presses-section" aria-labelledby="trigger-participation-heading">
      <div className="layer-combo-presses-heading">
        <h3 id="trigger-participation-heading">切り替えのキーを使った打鍵（全{extracted.strokes}打鍵）</h3>
        <InfoButton name="切り替えのキーを使った打鍵" description={TRIGGER_READING} />
      </div>
      <div className="layer-combo-presses-table-scroll">
        <table className="layer-combo-presses-table" data-trigger-participation-table>
          <thead>
            <tr>
              <th scope="col">区分</th>
              <th scope="col">打鍵数</th>
              <th scope="col">全打鍵に対する割合</th>
              <th scope="col">同手の打鍵数</th>
              <th scope="col">同手の割合</th>
            </tr>
          </thead>
          {extracted.triggerGroups.map((group) => (
            <tbody key={group.id} data-trigger-group={group.id}>
              <tr>
                <th scope="colgroup" colSpan={5} className="layer-combo-presses-group">
                  {group.label}
                </th>
              </tr>
              {group.rows.map((row) => (
                <tr key={row.id} data-trigger-row={`${group.id}:${row.id}`}>
                  <th scope="row">{row.label}</th>
                  <td className="layer-combo-presses-num">{row.participated}</td>
                  <td className="layer-combo-presses-num">{attributionShare(row.participated, extracted.strokes)}</td>
                  <td className="layer-combo-presses-num">{row.sameHand}</td>
                  <td className="layer-combo-presses-num">{row.participated === 0 ? '-' : attributionShare(row.sameHand, row.participated)}</td>
                </tr>
              ))}
            </tbody>
          ))}
          <tfoot>
            <tr>
              <th scope="row">全打鍵</th>
              <td className="layer-combo-presses-num">{extracted.strokes}</td>
              <td className="layer-combo-presses-num">{attributionShare(extracted.strokes, extracted.strokes)}</td>
              <td className="layer-combo-presses-num" />
              <td className="layer-combo-presses-num" />
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}

export function LayerComboPressesBody({ extracted }: SingleBodyProps<LayerComboPressesExtracted, LayerComboPressesOptions>) {
  return (
    <div className="layer-combo-presses-feature" data-react-feature="layer-combo-presses">
      <PressesTable extracted={extracted} />
      <TriggerTable extracted={extracted} />
    </div>
  );
}

/** 設定できる項目は無い。 */
export function LayerComboPressesSettings(_props: AnalyzerSettingsProps<LayerComboPressesOptions>) {
  return <p className="layer-combo-presses-empty">このAnalyzerに解析設定はありません。</p>;
}

/** ペインに渡すもの（`analyzers/pane-parts.tsx`）。 */
export const layerComboPressesAnalyzer = {
  definition: layerComboPressesDefinition,
  ...LAYER_COMBO_PRESSES_PANE_META,
  Body: LayerComboPressesBody,
  Settings: LayerComboPressesSettings,
  defaultOptions: DEFAULT_LAYER_COMBO_PRESSES_OPTIONS,
  urlOptions: layerComboPressesOptions,
} satisfies SingleAnalyzerPaneParts<LayerComboPressesOptions, LayerComboPressesExtracted>;
