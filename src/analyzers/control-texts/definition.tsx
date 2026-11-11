import type { ControlTextKind } from '#interpretation/control-texts.ts';
import { COMPARISON_COLUMN_FORMAT, comparisonColumnText } from '../comparison-column-text.ts';
import { CONTROL_COLUMN_IDS, type ControlColumnId } from '../comparison-column-values.ts';
import type { AnalyzerSettingsProps, SetAnalyzerPaneParts, SetBodyProps } from '../pane-parts.tsx';
import { useTextLanguage } from '../text-language-context.tsx';
import { CONTROL_KINDS, controlTextsDefinition, type ControlTextsExtracted, type ControlTextsOkRow } from './extract.ts';
import { DEFAULT_CONTROL_TEXTS_OPTIONS, controlTextsOptions, type ControlTextsOptions } from './options.ts';
import { CONTROL_CONDITION_TEXT, CONTROL_ROW_LABEL, CONTROL_SEED_RANGE_TEXT, CONTROL_TEXTS_PANE_META } from './pane-meta.ts';
import './control-texts-view.css';

/**
 * 対照テキストとの比較の可視化。
 *
 * 抽出の結果（`extract.ts`）を表に並べるだけで、計算し直さない。実文・順序破壊・一様ランダムの3行を対象ごとに並べ、
 * 順位・優劣の表示・差の列は出さない。対照テキストの行は、名前に「並べ替え」を含め、表の題に種の組を出す。
 * 表だけを持ち出しても、並べ替えて測った値であることと種の組が付いてくる。
 */

/** 1対象ぶんの、行の名前。条件は名前が重なった時だけ名前に足し、基本はペインの条件の要約が出す。 */
export interface ControlTextsRowContext {
  readonly targetKey: string;
  readonly label: string;
  /** 集合によらない完全な名前。hover（`title`属性）に出す。 */
  readonly fullName: string;
}

export type ControlTextsBodyProps = SetBodyProps<ControlTextsExtracted, ControlTextsOptions, ControlTextsRowContext>;

const EMPTY_CELL_TEXT = '—';

function formatValue(column: ControlColumnId, value: number): string {
  return Number.isFinite(value) ? COMPARISON_COLUMN_FORMAT[column](value) : EMPTY_CELL_TEXT;
}

const ROW_KIND_TITLE: Readonly<Record<'actual' | ControlTextKind, string>> = {
  actual: '評価に渡したテキストをそのまま測った値',
  shuffled: `評価に渡したテキストのまとまりの並びを入れ替えたテキストを、種${CONTROL_SEED_RANGE_TEXT}で測った値の平均と母標準偏差`,
  uniform: `評価に渡したテキストに出たまとまりの種類を同じ確率で引いて並べたテキストを、種${CONTROL_SEED_RANGE_TEXT}で測った値の平均と母標準偏差`,
};

interface ValueCells {
  readonly value: number;
  readonly deviation: number | undefined;
}

function cellsOf(row: ControlTextsOkRow, kind: 'actual' | ControlTextKind, column: ControlColumnId): ValueCells {
  if (kind === 'actual') return { value: row.actual[column], deviation: undefined };
  const summary = row.controls[kind][column];
  return { value: summary.mean, deviation: summary.deviation };
}

function TargetRows({
  row,
  label,
  fullName,
  columns,
}: {
  readonly row: ControlTextsOkRow;
  readonly label: string;
  readonly fullName: string;
  readonly columns: readonly ControlColumnId[];
}) {
  const kinds = ['actual', ...CONTROL_KINDS] as const;
  return (
    <>
      {kinds.map((kind, index) => (
        <tr key={kind} data-control-texts-row={kind}>
          {index === 0 ? (
            <th scope="rowgroup" rowSpan={kinds.length} title={fullName}>
              {label}
            </th>
          ) : null}
          <th scope="row" title={ROW_KIND_TITLE[kind]}>
            {CONTROL_ROW_LABEL[kind]}
          </th>
          {columns.flatMap((column) => {
            const cell = cellsOf(row, kind, column);
            const deviation = cell.deviation === undefined ? EMPTY_CELL_TEXT : formatValue(column, cell.deviation);
            return [
              <td key={`${column}:value`} className="control-texts-edge-start" data-control-texts-cell={column}>
                {formatValue(column, cell.value)}
              </td>,
              <td key={`${column}:deviation`} className="control-texts-edge-end" data-empty={cell.deviation === undefined || undefined}>
                {deviation}
              </td>,
            ];
          })}
        </tr>
      ))}
    </>
  );
}

/**
 * 対照テキストとの比較の本体。対象が空の時はホストが選ぶボタンを出し、本体は呼ばれない。
 * 行ごとの失敗・計算中（抽出の値として届くメンバー単位の状態）は行に出す。
 */
export function ControlTextsBody({ extracted, order, rowContext }: ControlTextsBodyProps) {
  const columns = CONTROL_COLUMN_IDS;
  const text = comparisonColumnText(useTextLanguage());
  const byKey = new Map(extracted.rows.map((row) => [row.targetKey, row]));
  const hasValues = extracted.rows.some((row) => row.kind === 'ok');
  const colSpan = 2 + columns.length * 2;
  return (
    <section className="control-texts-feature" data-react-feature="control-texts">
      <figure className="control-texts-figure">
        <figcaption className="control-texts-condition" data-control-texts-condition="">
          {CONTROL_CONDITION_TEXT}
        </figcaption>
        <div className="control-texts-scroll">
          <table className="control-texts-table" data-control-texts-table="" aria-label="実文と対照テキストの値">
            <thead>
              <tr>
                <th rowSpan={2} scope="col">
                  対象
                </th>
                <th rowSpan={2} scope="col">
                  テキスト
                </th>
                {columns.map((column) => (
                  <th key={column} colSpan={2} scope="colgroup" className="control-texts-edge-start control-texts-edge-end">
                    {text[column].label}
                  </th>
                ))}
              </tr>
              <tr>
                {columns.flatMap((column) => [
                  <th key={`${column}:value`} scope="col" className="control-texts-edge-start">
                    値
                  </th>,
                  <th key={`${column}:deviation`} scope="col" className="control-texts-edge-end">
                    標準偏差
                  </th>,
                ])}
              </tr>
            </thead>
            <tbody>
              {order.map((targetKey) => {
                const label = rowContext.get(targetKey)?.label ?? '—';
                const fullName = rowContext.get(targetKey)?.fullName ?? '';
                const row = byKey.get(targetKey);
                if (row === undefined) {
                  // extractedにまだ無いtargetKey（依頼の作り直し途中の一瞬）。値の欠落を偽らず、行の中で計算中と出す。
                  return (
                    <tr key={targetKey} data-control-texts-row="pending">
                      <th scope="rowgroup" title={fullName}>
                        {label}
                      </th>
                      <td colSpan={colSpan - 1} aria-busy="true">
                        計算中…
                      </td>
                    </tr>
                  );
                }
                if (row.kind === 'failed') {
                  return (
                    <tr key={targetKey} data-control-texts-row="failed">
                      <th scope="rowgroup" title={fullName}>
                        {label}
                      </th>
                      <td colSpan={colSpan - 1} role="alert">
                        {row.message}
                      </td>
                    </tr>
                  );
                }
                return <TargetRows key={targetKey} row={row} label={label} fullName={fullName} columns={columns} />;
              })}
            </tbody>
          </table>
        </div>
      </figure>
      {hasValues ? null : (
        <p className="control-texts-empty" data-control-texts-empty="">
          値を出せる対象がありません。
        </p>
      )}
    </section>
  );
}

/** 解析設定は無い。 */
export function ControlTextsSettings(_props: AnalyzerSettingsProps<ControlTextsOptions>) {
  return <p className="control-texts-notice">このAnalyzerに解析設定はありません。</p>;
}

/** ペインに渡すもの（`analyzers/pane-parts.tsx`）。 */
export const controlTextsAnalyzer = {
  definition: controlTextsDefinition,
  ...CONTROL_TEXTS_PANE_META,
  Body: ControlTextsBody,
  Settings: ControlTextsSettings,
  defaultOptions: DEFAULT_CONTROL_TEXTS_OPTIONS,
  urlOptions: controlTextsOptions,
  rowContext: ({ targetKey, label, fullName }) => ({ targetKey, label, fullName }),
} satisfies SetAnalyzerPaneParts<ControlTextsOptions, ControlTextsExtracted, ControlTextsRowContext>;
