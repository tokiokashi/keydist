import type { AnalysisTarget } from '#input/setup/index.ts';
import { interquartileMean, type SentenceTap } from '../timing/sentence-measurement.ts';
import type { KeystrokeRecord } from './keystroke-record.ts';

/**
 * 打鍵の記録の間隔（`spec/keystroke-record.md` §6）と、記録と今の入力の食い違い（§4.1）。
 * 時刻とストロークの事実は呼び出し側が渡す純粋な計算で、描画にも打鍵の列の生成にも依存しない。
 */

// ---------------------------------------------------------------------------
// 食い違い
// ---------------------------------------------------------------------------

/** 記録と今の入力が食い違う項目（仕様 §4.1の表の行）。 */
export type RecordMismatchItem = 'target' | 'shape' | 'fingerAssignment' | 'conditions' | 'version' | 'text' | 'range' | 'keys';

/** 記録の対象が、見ている対象に当たるか。配列は配列のid、Setupはidで当てる。 */
export function recordTargetMatches(record: Pick<KeystrokeRecord, 'target'>, target: AnalysisTarget): boolean {
  return record.target.kind === 'layout'
    ? target.kind === 'layout' && target.layoutId === record.target.id
    : target.kind === 'setup' && target.setupId === record.target.id;
}

/** 記録の対象を今解決した入力の、記録と照らす値。 */
export interface RecordCurrentFacts {
  readonly shapeId: string;
  readonly fingerAssignmentId: string;
  /** 条件の実効値（読みの変換を除く）。項目の並びは問わない。 */
  readonly conditions: Readonly<Record<string, unknown>>;
  readonly modelVersion: number;
  /** 評価に渡す本文の照合値。 */
  readonly textDigest: string;
  /** 今の本文の`[start, end)`の照合値。本文に収まらない範囲は`undefined`。 */
  readonly rangeDigestOf: (start: number, end: number) => string | undefined;
}

/** 値の比べ方。オブジェクトは項目の並びを問わない。 */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (typeof value === 'object' && value !== null) {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'undefined';
}

/** 記録の条件と今の条件で、値が違う項目の名前（条件の項目の名前の昇順）。 */
export function differingConditionKeys(recorded: Readonly<Record<string, unknown>>, current: Readonly<Record<string, unknown>>): string[] {
  const keys = new Set([...Object.keys(recorded), ...Object.keys(current)]);
  return [...keys].filter((key) => canonical(recorded[key]) !== canonical(current[key])).sort();
}

/**
 * 対象以外の、打鍵の列を作り直さずに判定できる項目の食い違い。範囲は、テキストが同じ時だけ判定する
 * （テキストが違えば範囲の本文も違うので、重ねて示さない）。
 */
export function scalarRecordMismatches(record: KeystrokeRecord, current: RecordCurrentFacts): RecordMismatchItem[] {
  const items: RecordMismatchItem[] = [];
  if (record.shapeId !== current.shapeId) items.push('shape');
  if (record.fingerAssignmentId !== current.fingerAssignmentId) items.push('fingerAssignment');
  if (differingConditionKeys(record.conditions, current.conditions).length > 0) items.push('conditions');
  if (record.modelVersion !== current.modelVersion) items.push('version');
  if (record.text.digest !== current.textDigest) {
    items.push('text');
  } else if (current.rangeDigestOf(record.range.start, record.range.end) !== record.range.digest) {
    items.push('range');
  }
  return items;
}

// ---------------------------------------------------------------------------
// 間隔
// ---------------------------------------------------------------------------

/** 間隔を数えるかを決めるストロークの事実。記録のストロークと同じ並び。 */
export interface RecordStrokeFact {
  /** ストロークが属する入力の選択の文字位置`e`。 */
  readonly end: number;
  /** ストロークが打ち始める、かなの位置（評価に渡した本文の文字位置）。 */
  readonly kanaStart: number;
  /** ストロークが打ち終える、かなの位置。 */
  readonly kanaEnd: number;
  /** 句読点を打つストロークか、その直後のストロークか（`adjoinsPunctuation`）。 */
  readonly adjoinsPunctuation: boolean;
}

/**
 * ストロークごとの間隔[ms]（仕様 §6.1）。最初のストローク・違うキーを押したストローク・
 * 出力の文字の読み方で完了したストロークとその直後のストロークは、数えず`null`にする。
 * 句読点の前後は数える。
 */
export function strokeGaps(taps: readonly SentenceTap[]): (number | null)[] {
  return taps.map((tap, index) => {
    const previous = taps[index - 1];
    if (previous === undefined || !tap.clean) return null;
    if (tap.outputCompleted === true || previous.outputCompleted === true) return null;
    return tap.atMs - previous.atMs;
  });
}

/** `e`ごとの間隔の点（仕様 §6.2）。 */
export interface RecordGapPoints {
  /** 点の文字位置`e`。記録に出てくる順。 */
  readonly positions: readonly number[];
  /** 点の値[ms]。数えない間隔の点は`null`（欠け）。 */
  readonly values: readonly (number | null)[];
}

/** `e`ごとの値は、記録の中でその`e`を最初に持つストロークの間隔。 */
export function recordGapPoints(facts: readonly RecordStrokeFact[], taps: readonly SentenceTap[]): RecordGapPoints {
  const gaps = strokeGaps(taps);
  const seen = new Set<number>();
  const positions: number[] = [];
  const values: (number | null)[] = [];
  facts.forEach((fact, index) => {
    if (seen.has(fact.end)) return;
    seen.add(fact.end);
    positions.push(fact.end);
    values.push(gaps[index] ?? null);
  });
  return { positions, values };
}

/** 群1つの値。打数が0なら値を持たない。 */
export interface RecordGapGroup {
  /** 数えたストロークの数。 */
  readonly count: number;
  /** 間隔の四分位平均[ms]。 */
  readonly quartileMeanMs?: number;
  /** 間隔の平均[ms]。外れた値を除かない。 */
  readonly meanMs?: number;
}

/** 文節の区切りの直後とそれ以外のかなを打ち始めるストロークの、生の間隔の比較（仕様 §6.3）。 */
export interface RecordPhraseGapTable {
  readonly after: RecordGapGroup;
  readonly others: RecordGapGroup;
}

function gapGroup(values: readonly number[]): RecordGapGroup {
  if (values.length === 0) return { count: 0 };
  return { count: values.length, quartileMeanMs: interquartileMean(values), meanMs: values.reduce((sum, value) => sum + value, 0) / values.length };
}

/**
 * 文節の区切りの直後とそれ以外のかなを打ち始めるストロークの、生の間隔の打数・四分位平均・平均（仕様 §6.3）。
 * 基準の時間も打鍵の上乗せも引かない。`breaks`は文節の区切りの位置（評価に渡した本文の文字位置）。
 */
export function recordPhraseGapTable(facts: readonly RecordStrokeFact[], taps: readonly SentenceTap[], breaks: readonly number[]): RecordPhraseGapTable {
  const gaps = strokeGaps(taps);
  const breakSet = new Set(breaks);
  const after: number[] = [];
  const others: number[] = [];
  facts.forEach((fact, index) => {
    const gap = gaps[index];
    const previous = facts[index - 1];
    if (gap === null || gap === undefined || previous === undefined) return;
    if (fact.adjoinsPunctuation) return;
    // かなを打ち始めるストロークだけを比べる。かなの中のストロークは混ぜない。
    if (fact.kanaStart <= previous.kanaEnd) return;
    (breakSet.has(fact.kanaStart) ? after : others).push(gap);
  });
  return { after: gapGroup(after), others: gapGroup(others) };
}

// ---------------------------------------------------------------------------
// 記録と今の入力の照合の結果
// ---------------------------------------------------------------------------

/** 記録を、記録の対象のメンバーの今の入力と照らした結果。 */
export interface RecordCheck {
  /** 食い違う項目。空なら食い違わない。 */
  readonly mismatches: readonly RecordMismatchItem[];
  /** 食い違わない時だけ持つ。記録のストロークごとの事実。 */
  readonly facts?: readonly RecordStrokeFact[];
  /** 条件が食い違う時の、値が違う条件の項目の名前。 */
  readonly differingConditions?: readonly string[];
}
