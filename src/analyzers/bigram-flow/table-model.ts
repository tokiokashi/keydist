import type { FigureTableModel } from '../figure-table.ts';
import type { BigramVector, DirectionSummary, MeanDisplacement } from '../bigram-vectors.ts';
import { nonStationaryVectors } from '../keyboard-flow-lines.ts';
import type { BigramFlowHandProfile } from './extract.ts';

/** キーボード上の流れの表題。切り替えのボタンの読み上げ名にも使う。 */
export const KEYBOARD_FLOW_TABLE_CAPTION = 'キーボード上の打鍵の流れ';

/** 手ごとの移動の向きと距離の表題。切り替えのボタンの読み上げ名にも使う。 */
export const RELATIVE_VECTORS_TABLE_CAPTION = '手ごとの移動の向きと距離';

/** 図の線の、ツールチップと表の行で共通する名前（キーidを「+」でつないだ2打鍵の組）。 */
export function flowEdgeLabel(vector: Pick<BigramVector, 'fromKeyIds' | 'toKeyIds'>): string {
  return `${vector.fromKeyIds.join('+')} → ${vector.toKeyIds.join('+')}`;
}

/** 内向きと外向きの比。図の下の割合の棒と数値、表の列が同じ値を使う。向きのある移動が無い時は両方0。 */
export function rollRates(summary: Pick<DirectionSummary, 'inwardWeight' | 'outwardWeight'>): { readonly inward: number; readonly outward: number } {
  const total = summary.inwardWeight + summary.outwardWeight;
  return total === 0 ? { inward: 0, outward: 0 } : { inward: summary.inwardWeight / total, outward: summary.outwardWeight / total };
}

/** 割合の文字（図の下の割合と同じ書式）。 */
export function formatRollRate(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

/** 平均の移動の長さの文字（図の見出しの統計と同じ書式）。 */
export function formatMeanDistance(mean: Pick<MeanDisplacement, 'distance'>): string {
  return mean.distance.toFixed(2);
}

/** まとまりの文字（図の見出しの統計と同じ書式）。 */
export function formatMagnitude(summary: Pick<DirectionSummary, 'magnitude'>): string {
  return summary.magnitude.toFixed(2);
}

/**
 * キーボード上の流れの表。行は、図が描く線（同じキーに戻る連打を除く）と、図が連打の回数として出す同じキーの連打。
 * 並びは回数の多い順で、同じ回数は図の線のid順（連打は後ろ）。
 * 連打の行は、連打の回数を表示する設定が有効な時だけ入れる（図が回数を出す時と同じ）。
 */
export function keyboardFlowTableModel(
  vectors: readonly BigramVector[],
  repeatCounts: ReadonlyMap<string, number>,
  showRepeatBadge: boolean,
  keyNameOf: (keyId: string) => string,
): FigureTableModel {
  const rows = [
    ...nonStationaryVectors(vectors).map((vector) => ({
      key: vector.id,
      header: `${vector.fromKeyIds.map(keyNameOf).join('+')} → ${vector.toKeyIds.map(keyNameOf).join('+')}`,
      title: flowEdgeLabel(vector),
      count: vector.weight,
      order: vector.id,
    })),
    ...(showRepeatBadge
      ? [...repeatCounts].map(([keyId, count]) => ({
          key: `repeat:${keyId}`,
          header: `${keyNameOf(keyId)} → ${keyNameOf(keyId)}（連打）`,
          title: `${keyId} → ${keyId}`,
          count,
          order: `￿${keyId}`,
        }))
      : []),
  ]
    .filter((row) => row.count > 0)
    .sort((a, b) => b.count - a.count || a.order.localeCompare(b.order));
  return {
    caption: KEYBOARD_FLOW_TABLE_CAPTION,
    rowHeader: '2打鍵',
    columns: ['回数'],
    rows: rows.map((row) => ({ key: row.key, header: row.header, title: row.title, cells: [String(row.count)] })),
  };
}

/**
 * 手ごとの移動の向きと距離の表。行は左手・右手の順で、図の見出しの統計（線の数・平均移動・まとまり）と、
 * 図の下の内向き・外向きの割合を、図と同じ書式で並べる。
 */
export function relativeVectorsTableModel(hands: { readonly left: BigramFlowHandProfile; readonly right: BigramFlowHandProfile }): FigureTableModel {
  const row = (key: 'left' | 'right', header: string) => {
    const profile = hands[key];
    const rates = rollRates(profile.summary);
    return {
      key,
      header,
      cells: [
        String(profile.relative.length),
        formatMeanDistance(profile.mean),
        formatMagnitude(profile.summary),
        formatRollRate(rates.inward),
        formatRollRate(rates.outward),
      ],
    };
  };
  return {
    caption: RELATIVE_VECTORS_TABLE_CAPTION,
    rowHeader: '手',
    columns: ['線の数', '平均移動 [u]', 'まとまり', '内向き', '外向き'],
    rows: [row('left', '左手'), row('right', '右手')],
  };
}
