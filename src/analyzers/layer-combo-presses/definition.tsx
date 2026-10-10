import { layerComboPressesDefinition, type LayerComboPressesExtracted } from './extract.ts';
import { DEFAULT_LAYER_COMBO_PRESSES_OPTIONS, layerComboPressesOptions, type LayerComboPressesOptions } from './options.ts';
import { LAYER_COMBO_PRESSES_PANE_META } from './pane-meta.ts';
import { attributionShare } from './share.ts';
import type { AnalyzerSettingsProps, SingleAnalyzerPaneParts, SingleBodyProps } from '../pane-parts.tsx';
import './layer-combo-presses-view.css';

/**
 * レイヤーとコンボの押下数。
 *
 * 押下数は `extracted`（`extract.ts` の計算結果）をそのまま表にし、割合だけを求める。
 * 優劣を示す強調・順位は出さない。
 */

function PressesTable({ extracted }: { readonly extracted: LayerComboPressesExtracted }) {
  return (
    <section className="layer-combo-presses-section" aria-labelledby="layer-combo-presses-heading">
      <h3 id="layer-combo-presses-heading">レイヤーとコンボごとの押下数（{extracted.rows.length}）</h3>
      <div className="layer-combo-presses-table-scroll">
        <table className="layer-combo-presses-table" data-layer-combo-presses-table>
          <thead>
            <tr><th scope="col">レイヤー・コンボ</th><th scope="col">押下数</th><th scope="col">割合</th></tr>
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

export function LayerComboPressesBody({ extracted }: SingleBodyProps<LayerComboPressesExtracted, LayerComboPressesOptions>) {
  return (
    <div className="layer-combo-presses-feature" data-react-feature="layer-combo-presses">
      <PressesTable extracted={extracted} />
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
