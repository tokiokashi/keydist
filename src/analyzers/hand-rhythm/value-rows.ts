import type { HandRhythmExtracted } from './extract.ts';
import { formatContinuationRate, formatMeanLength, formatRate, formatShareOf } from './format.ts';

/**
 * 値の一覧の行を、抽出結果から作る。値は抽出が運んだ数をそのまま文字にするだけで、
 * 割合は数どうしの割り算だけを行う。分母が0の割合は「—」にする。
 */

export interface ValueRow {
  readonly id: string;
  readonly label: string;
  readonly text: string;
}

/** 手の切り替えと同じ手の続き、両手の打鍵。継続率のすぐ後ろに、分母から外した両手の打鍵を含む組を置く。 */
export function pairRowsOf(extracted: HandRhythmExtracted): ValueRow[] {
  const { aggregate, pairCount } = extracted;
  const { bothHandStrokes } = aggregate;
  return [
    { id: 'strokes', label: '打鍵', text: `${aggregate.strokeCount}打鍵` },
    { id: 'switches', label: '手の切り替え', text: `${aggregate.switches}組` },
    { id: 'continuations', label: '同じ手の続き', text: `${aggregate.continuations}組` },
    {
      id: 'continuation-rate',
      label: '同じ手の続きの割合',
      text: formatContinuationRate(aggregate.continuationRate, aggregate.switches, aggregate.continuations),
    },
    {
      id: 'both-hand-pairs',
      label: '両手の打鍵を含む組',
      text: `${aggregate.bothHandPairs}組（組全体の${formatShareOf(aggregate.bothHandPairs, pairCount)}）`,
    },
    { id: 'both-hand-strokes', label: '両手の打鍵', text: `${bothHandStrokes.simultaneous + bothHandStrokes.mixed}打鍵` },
    { id: 'both-output', label: '両手で文字を出す', text: `${bothHandStrokes.simultaneous}打鍵` },
    { id: 'both-mixed', label: '片手は切り替えのキーだけ', text: `${bothHandStrokes.mixed}打鍵` },
  ];
}

export function alternationRowsOf(extracted: HandRhythmExtracted): ValueRow[] {
  const { aggregate } = extracted;
  const { alternation } = aggregate;
  return [
    { id: 'alternation-runs', label: '連続の数', text: `${alternation.runs}件` },
    { id: 'alternation-mean', label: '平均の長さ', text: formatMeanLength(alternation.meanLength, alternation.runs) },
    { id: 'alternation-max', label: '最長の長さ', text: alternation.runs === 0 ? '—' : `${alternation.maxLength}打鍵` },
    {
      id: 'alternation-coverage',
      label: '覆う割合',
      text:
        aggregate.strokeCount === 0 ? '—' : `${formatRate(alternation.coverage.rate)}（${alternation.coverage.strokes} / ${aggregate.strokeCount}打鍵）`,
    },
  ];
}
