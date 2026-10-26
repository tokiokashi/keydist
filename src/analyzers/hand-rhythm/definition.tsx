import { InfoButton } from '#ui/primitives/info-button.tsx';
import { DISTRIBUTION_CAP, distributionRowsOf, type DistributionRow } from './distribution.ts';
import { handRhythmDefinition, type HandRhythmExtracted } from './extract.ts';
import { DEFAULT_HAND_RHYTHM_OPTIONS, handRhythmOptions, type HandRhythmOptions } from './options.ts';
import { HAND_RHYTHM_PANE_META } from './pane-meta.ts';
import { alternationRowsOf, pairRowsOf, type ValueRow } from './value-rows.ts';
import { ALTERNATION_MIN_STROKES } from '#interpretation/structure/hand-rhythm.ts';
import type { AnalyzerSettingsProps, SingleAnalyzerPaneParts, SingleBodyProps } from '../pane-parts.tsx';
import './hand-rhythm-view.css';

/**
 * 左右の手の交互。
 *
 * `extracted`（`extract.ts` の計算結果）をそのまま並べるだけで、数の定義は持たない
 * （docs/architecture.md「可視化は計算しない」）。割合は、抽出が運んだ数どうしの割り算だけを行う。
 * 優劣を示す強調・順位は出さない。
 */

const PAIR_READING =
  '打鍵は、新しく押すキーの手で分けます。押し続けているだけのキーは打鍵に数えません。手の切り替えと同じ手の続きは、隣り合う打鍵の組を数えた値です。' +
  '同じ手の続きの割合の分母は、手の切り替えと同じ手の続きの組の合計で、両手の打鍵を含む組は分母に入れません。' +
  '両手の打鍵を含む組が多い配列では、割合だけを読むと、実際の打鍵の流れとずれます。';

const ALTERNATION_READING =
  `交互打鍵の連続は、片手の打鍵が続き、隣り合う組がすべて手の切り替えになっている、${ALTERNATION_MIN_STROKES}打鍵以上の区間です。` +
  '孤立した1回の切り替えは数えません。両手の打鍵は区間を切ります。覆う割合は、連続に含まれる打鍵の数を全打鍵数で割った値です。';

const DISTRIBUTION_READING =
  '交互打鍵の連続と、同じ手の連続を、長さ（打鍵数）ごとに数えた分布です。同じ手の連続は、同じ手の片手の打鍵が続く区間で、1打鍵だけの区間も数えます。' +
  `左右の手を合わせた数で、両手の打鍵は区間を切ります。${DISTRIBUTION_CAP}打鍵以上の連続は1行にまとめています。棒の長さは、その分布の中で最も多い長さを基準にします。`;

function Heading({ title, description }: { readonly title: string; readonly description: string }) {
  return (
    <div className="hand-rhythm-heading">
      <h3>{title}</h3>
      <InfoButton name={title} description={description} />
    </div>
  );
}

function Values({ rows }: { readonly rows: readonly ValueRow[] }) {
  return (
    <dl className="hand-rhythm-values">
      {rows.map((row) => (
        <div key={row.id} className="hand-rhythm-item" data-hand-rhythm-value={row.id}>
          <dt>{row.label}</dt>
          <dd>{row.text}</dd>
        </div>
      ))}
    </dl>
  );
}

function Distribution({ id, title, rows }: { readonly id: string; readonly title: string; readonly rows: readonly DistributionRow[] }) {
  const high = Math.max(1, ...rows.map((row) => row.count));
  return (
    <figure className="hand-rhythm-distribution" data-hand-rhythm-distribution={id}>
      <figcaption>{title}</figcaption>
      {rows.length === 0 ? (
        <p className="hand-rhythm-empty">該当する連続はありません。</p>
      ) : (
        <div className="hand-rhythm-distribution-rows">
          {rows.map((row) => (
            <div key={row.key} className="hand-rhythm-distribution-row" data-run-length={row.key} title={`${row.label}打鍵: ${row.count}件`}>
              <span className="hand-rhythm-distribution-length">{row.label}</span>
              <span className="hand-rhythm-distribution-track">
                {row.count === 0 ? null : <span className="hand-rhythm-distribution-fill" style={{ width: `${(row.count / high) * 100}%` }} />}
              </span>
              <span className="hand-rhythm-distribution-count">{row.count}</span>
            </div>
          ))}
        </div>
      )}
    </figure>
  );
}

export function HandRhythmBody({ extracted }: SingleBodyProps<HandRhythmExtracted, HandRhythmOptions>) {
  return (
    <div className="hand-rhythm-feature" data-react-feature="hand-rhythm">
      <section className="hand-rhythm-section">
        <Heading title="手の切り替えと続き" description={PAIR_READING} />
        <Values rows={pairRowsOf(extracted)} />
      </section>
      <section className="hand-rhythm-section">
        <Heading title="交互打鍵の連続" description={ALTERNATION_READING} />
        <Values rows={alternationRowsOf(extracted)} />
      </section>
      <section className="hand-rhythm-section">
        <Heading title="連続の長さの分布" description={DISTRIBUTION_READING} />
        <div className="hand-rhythm-distributions">
          <Distribution id="alternation" title="交互打鍵の連続（件）" rows={distributionRowsOf(extracted.alternationLengths, ALTERNATION_MIN_STROKES)} />
          <Distribution id="same-hand" title="同じ手の連続（件）" rows={distributionRowsOf(extracted.sameHandLengths, 1)} />
        </div>
      </section>
    </div>
  );
}

/** 設定できる項目は無い。 */
export function HandRhythmSettings(_props: AnalyzerSettingsProps<HandRhythmOptions>) {
  return <p className="hand-rhythm-empty">このAnalyzerに解析設定はありません。</p>;
}

/** ペインに渡すもの（`analyzers/pane-parts.tsx`）。 */
export const handRhythmAnalyzer = {
  definition: handRhythmDefinition,
  ...HAND_RHYTHM_PANE_META,
  Body: HandRhythmBody,
  Settings: HandRhythmSettings,
  defaultOptions: DEFAULT_HAND_RHYTHM_OPTIONS,
  urlOptions: handRhythmOptions,
} satisfies SingleAnalyzerPaneParts<HandRhythmOptions, HandRhythmExtracted>;
