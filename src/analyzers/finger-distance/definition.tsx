import type { Finger } from '#input/shapes/geometry.ts';
import {
  fingerDistanceDefinition,
  type FingerDistanceAdjacent,
  type FingerDistanceExtracted,
  type FingerDistanceFinger,
  type FingerDistanceHand,
  type FingerDistanceHandTotal,
} from './extract.ts';
import { DEFAULT_FINGER_DISTANCE_OPTIONS, type FingerDistanceOptions } from './options.ts';
import { FINGER_DISTANCE_PANE_META } from './pane-meta.ts';
import type { AnalyzerPaneParts, AnalyzerSettingsProps } from '../pane-parts.tsx';
import './finger-distance-view.css';

/**
 * 指ごとの距離の可視化。
 *
 * `extracted`（`extract.ts`の計算結果）をそのまま描くだけで、`Metrics`の再計算はしない
 * （docs/architecture.md「可視化は計算しない」）。**優劣を示す色・強調・順位は出さない**
 * （AGENTS.md「優劣の判定・順位付け・合成スコアを作らない」）。棒の長さは値の大きさを
 * 示すだけで、最大や最小の指を強調しない。指の並びは物理的な並び（左手の小指から右手の小指）のまま。
 */

export interface FingerDistanceBodyProps {
  readonly extracted: FingerDistanceExtracted;
}

const FINGER_LABEL: Readonly<Record<Finger, string>> = {
  LP: '左小指', LR: '左薬指', LM: '左中指', LI: '左人差し指', LT: '左親指',
  RT: '右親指', RI: '右人差し指', RM: '右中指', RR: '右薬指', RP: '右小指',
};

const SHORT_FINGER: Readonly<Record<Finger, string>> = {
  LP: '小', LR: '薬', LM: '中', LI: '人', LT: '親',
  RT: '親', RI: '人', RM: '中', RR: '薬', RP: '小',
};

const HAND_LABEL: Readonly<Record<FingerDistanceHand, string>> = { left: '左手', right: '右手' };

const HANDS: readonly FingerDistanceHand[] = ['left', 'right'];

const formatDistance = (value: number): string => value.toFixed(1);
const formatShare = (value: number): string => `${(value * 100).toFixed(1)}%`;
const formatDeviation = (value: number): string => value.toFixed(3);

/** 値の大きさを棒の長さ（0〜100%）にする。全体が0なら棒は出さない。 */
function barWidth(value: number, max: number): string {
  return max > 0 ? `${Math.max(0, Math.min(100, (value / max) * 100))}%` : '0%';
}

function FingerRow({ item, maxDistance }: { readonly item: FingerDistanceFinger; readonly maxDistance: number }) {
  return (
    <tr data-finger={item.finger}>
      <th scope="row">{FINGER_LABEL[item.finger]}</th>
      <td className="finger-distance-bar-cell" aria-hidden="true">
        <span className="finger-distance-bar" style={{ width: barWidth(item.distance, maxDistance) }} />
      </td>
      <td>{formatDistance(item.distance)}</td>
      <td>{formatShare(item.distanceShare)}</td>
      <td>{item.presses}</td>
      <td>{formatShare(item.pressShare)}</td>
    </tr>
  );
}

function HandTotalRow({ total }: { readonly total: FingerDistanceHandTotal }) {
  return (
    <tr className="finger-distance-subtotal" data-hand-total={total.hand}>
      <th scope="row">{HAND_LABEL[total.hand]}の合計</th>
      <td aria-hidden="true" />
      <td>{formatDistance(total.distance)}</td>
      <td>{formatShare(total.distanceShare)}</td>
      <td>{total.presses}</td>
      <td>{formatShare(total.pressShare)}</td>
    </tr>
  );
}

function AdjacentRow({ item, maxDeviation }: { readonly item: FingerDistanceAdjacent; readonly maxDeviation: number }) {
  const [a, b] = item.pair;
  return (
    <tr data-adjacent-pair={`${a}-${b}`}>
      <th scope="row">{HAND_LABEL[item.hand]} {SHORT_FINGER[a]}–{SHORT_FINGER[b]}</th>
      <td className="finger-distance-bar-cell" aria-hidden="true">
        <span className="finger-distance-bar" style={{ width: barWidth(item.stdDev, maxDeviation) }} />
      </td>
      <td>{formatDeviation(item.stdDev)}</td>
      <td>{formatDeviation(item.meanExcess)}</td>
      <td>{formatDeviation(item.maxExcess)}</td>
    </tr>
  );
}

export function FingerDistanceBody({ extracted }: FingerDistanceBodyProps) {
  const maxDistance = Math.max(0, ...extracted.fingers.map((item) => item.distance));
  const maxDeviation = Math.max(0, ...extracted.adjacent.map((item) => item.stdDev));
  return (
    <section className="finger-distance-feature" data-react-feature="finger-distance">
      <h3 className="finger-distance-heading">指ごとの移動距離と押下数</h3>
      <div className="finger-distance-scroll">
        <table className="finger-distance-table">
          <thead>
            <tr>
              <th scope="col">指</th>
              <th scope="col" aria-hidden="true" />
              <th scope="col">移動距離 [u]</th>
              <th scope="col">距離の割合</th>
              <th scope="col">押下数</th>
              <th scope="col">押下の割合</th>
            </tr>
          </thead>
          {HANDS.map((hand) => (
            <tbody key={hand} data-hand={hand}>
              {extracted.fingers.filter((item) => item.hand === hand).map((item) => (
                <FingerRow key={item.finger} item={item} maxDistance={maxDistance} />
              ))}
              <HandTotalRow total={extracted.hands[hand]} />
            </tbody>
          ))}
          <tfoot>
            <tr data-total="true">
              <th scope="row">全体</th>
              <td aria-hidden="true" />
              <td>{formatDistance(extracted.totalDistance)}</td>
              <td>{formatShare(extracted.totalDistance === 0 ? 0 : 1)}</td>
              <td>{extracted.totalPresses}</td>
              <td>{formatShare(extracted.totalPresses === 0 ? 0 : 1)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <h3 className="finger-distance-heading">隣り合う指の間隔のばらつき</h3>
      <div className="finger-distance-scroll">
        <table className="finger-distance-table">
          <thead>
            <tr>
              <th scope="col">指の組</th>
              <th scope="col" aria-hidden="true" />
              <th scope="col">標準偏差 [u]</th>
              <th scope="col">平均 [u]</th>
              <th scope="col">最大 [u]</th>
            </tr>
          </thead>
          <tbody>
            {extracted.adjacent.map((item) => (
              <AdjacentRow key={item.pair.join('-')} item={item} maxDeviation={maxDeviation} />
            ))}
          </tbody>
        </table>
      </div>
      <p className="finger-distance-note">間隔は、2本の指がホームに並んだ時の間隔からの超過。平均と最大も同じ基準で測る。</p>
    </section>
  );
}

/** 解析設定の項目は無い。条件は見出しの条件から変える。 */
export function FingerDistanceSettings(_props: AnalyzerSettingsProps<FingerDistanceOptions>) {
  return <p className="finger-distance-note">このAnalyzerに専用の解析設定は無い。N・ローマ字・物理配列などは、見出しの条件から変える。</p>;
}

/** ペインに渡すもの（`analyzers/pane-parts.tsx`）。 */
export const fingerDistanceAnalyzer = {
  definition: fingerDistanceDefinition,
  ...FINGER_DISTANCE_PANE_META,
  Body: FingerDistanceBody,
  Settings: FingerDistanceSettings,
  defaultOptions: DEFAULT_FINGER_DISTANCE_OPTIONS,
} satisfies AnalyzerPaneParts<typeof fingerDistanceDefinition, FingerDistanceOptions, FingerDistanceBodyProps>;
