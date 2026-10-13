import {
  CALIBRATION_OVERHEAD_MS_MAX,
  CALIBRATION_OVERHEAD_MS_MIN,
  STROKE_STRUCTURE_KINDS,
  playbackCalibrationProblem,
  type PlaybackCalibration,
  type StrokeStructureKind,
} from './calibration.ts';
import type { Stroke } from '#trace/generate.ts';
import { playbackNormalMs, type PlaybackTimingAnalysis } from './playback.ts';
import { strokeStructureKinds } from './stroke-structure.ts';

/**
 * 文章を打つ測定（`spec/playback-timing.md` §6.4）の計算。構造の種類ごとに、同指連続を含まない
 * ストロークの実際の間隔から連打の時間（`normalMs`）を引いた差の中央値を、連打との差にする。
 * 時刻は呼び出し側が渡すので、描画にもタイマーにも依存しない。
 */

/** 種類ごとの連打との差を保存する、数えたストロークの最小数。これ未満の種類は保存しない。 */
export const SENTENCE_MIN_SAMPLES = 10;

/** 打ち終えたストローク1つの記録。 */
export interface SentenceTap {
  /** そのストロークの最初の押下の時刻[ms]。 */
  readonly atMs: number;
  /** そのストロークで違うキーを押していなければ真。偽なら、そのストロークの間隔は数えない。 */
  readonly clean: boolean;
}

/**
 * ローマ字の配列で、示す文のかなごとに受け付ける綴りと、打った綴りから打鍵の列を作る関数
 * （`spec/playback-timing.md` §6.4「ローマ字の綴り」）。条件・配列・物理配列・指の割り当ては、測定を始めた時に解決したものを使う。
 */
export interface SentenceSpellingSource {
  /** かなの入力単位と、受け付ける綴り。先頭は今の条件のローマ字規則の綴り。 */
  readonly units: readonly { readonly kana: string; readonly spellings: readonly string[] }[];
  /** 単位ごとの綴りを打つ時の打鍵の列。打てない綴りを含む時は無い。 */
  strokes(spellings: readonly string[]): readonly Stroke[] | undefined;
  /** 単位ごとの綴りを打つ時の打鍵の列と構造。打てない綴りを含む時は無い。 */
  analyze(spellings: readonly string[]): SentenceAnalysis | undefined;
}

/** 示す文の打鍵の列と構造。打てなければ理由を文で返す。 */
export type SentenceBuildResult =
  | {
      readonly ok: true;
      /** 今の条件のローマ字規則の綴り（かな配列などでは配列の打ち方）で打つ打鍵の列と構造。 */
      readonly analysis: SentenceAnalysis;
      /** 受け付ける綴りを複数持つ時だけある。 */
      readonly spelling?: SentenceSpellingSource;
    }
  | { readonly ok: false; readonly message: string };

/** 打鍵の列と、その構造解析の結果。再生と同じ方法で作ったもの。 */
export type SentenceAnalysis = PlaybackTimingAnalysis;

export type SentenceCounts = Readonly<Record<StrokeStructureKind, number>>;

export interface SentenceMeasurement {
  /** 種類ごとに数えたストロークの数。 */
  readonly counts: SentenceCounts;
  /** 数えたストロークが最小数以上の種類の連打との差[ms]。負の中央値は0にしてある。 */
  readonly overheadMs: Readonly<Partial<Record<StrokeStructureKind, number>>>;
}

/** 保存値全体の比較。キーの並びは問わない。 */
function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  for (const key of keys) {
    if (!sameValue(left[key], right[key])) return false;
  }
  return true;
}

function medianOf(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/**
 * 打ち終えたストロークの記録から、種類ごとの連打との差を求める。`taps`は`analysis.strokes`と同じ長さ。
 * 最初のストローク、違うキーを押したストローク、同指連続を含むストロークは数えない。
 */
export function measureSentence(
  analysis: SentenceAnalysis,
  calibration: PlaybackCalibration,
  taps: readonly SentenceTap[],
): SentenceMeasurement {
  const kinds = strokeStructureKinds(analysis);
  const differences: Record<StrokeStructureKind, number[]> = { arpeggio: [], chain: [], other: [] };
  for (let index = 1; index < analysis.strokes.length; index++) {
    const tap = taps[index];
    const previous = taps[index - 1];
    if (tap === undefined || previous === undefined || !tap.clean) continue;
    if (analysis.strokes[index].presses.some((press) => press.sfb)) continue;
    const normalMs = playbackNormalMs(analysis, index, calibration);
    if (!Number.isFinite(normalMs)) continue;
    differences[kinds[index]].push(tap.atMs - previous.atMs - normalMs);
  }

  const counts = { arpeggio: 0, chain: 0, other: 0 };
  const overheadMs: Partial<Record<StrokeStructureKind, number>> = {};
  for (const kind of STROKE_STRUCTURE_KINDS) {
    counts[kind] = differences[kind].length;
    if (counts[kind] >= SENTENCE_MIN_SAMPLES) overheadMs[kind] = Math.max(0, medianOf(differences[kind]));
  }
  return { counts, overheadMs };
}

export type ApplySentenceResult =
  | { readonly ok: true; readonly calibration: PlaybackCalibration; readonly measurement: SentenceMeasurement }
  /** 文章を打つ測定は、`normalMs`を求める保存値が無いと反映先が無い。 */
  | { readonly ok: false; readonly reason: 'no-saved-value' }
  /** 測定を始めた時の保存値と、保存の時の保存値が違う。打った時の基準で求めた連打との差を、違う保存値に付けない。 */
  | { readonly ok: false; readonly reason: 'changed' }
  /** どの種類も数えたストロークが足りない。 */
  | { readonly ok: false; readonly reason: 'too-few'; readonly measurement: SentenceMeasurement }
  /** 測った連打との差が保存できる範囲を外れた。 */
  | { readonly ok: false; readonly reason: 'out-of-range'; readonly measurement: SentenceMeasurement };

/**
 * 済んだ文章を打つ測定を保存値へ反映する（§6.3・§6.4）。連打との差だけを置き換え、他の項目は残す。
 * 数えたストロークが最小数に満たない種類は持たない。
 */
export function applySentenceMeasurement(
  base: PlaybackCalibration | undefined,
  analysis: SentenceAnalysis,
  taps: readonly SentenceTap[],
  nowMs: number,
  /** 保存の時点の保存値。測定を始めた時の保存値`base`と違えば保存しない。 */
  current: PlaybackCalibration | undefined,
): ApplySentenceResult {
  if (base === undefined) return { ok: false, reason: 'no-saved-value' };
  if (!sameValue(base, current)) return { ok: false, reason: 'changed' };
  const measurement = measureSentence(analysis, base, taps);
  if (Object.keys(measurement.overheadMs).length === 0) return { ok: false, reason: 'too-few', measurement };
  const inRange = Object.values(measurement.overheadMs).every((value) =>
    value >= CALIBRATION_OVERHEAD_MS_MIN && value <= CALIBRATION_OVERHEAD_MS_MAX);
  const next: PlaybackCalibration = { ...base, keystrokeOverheadMs: measurement.overheadMs, measuredAt: nowMs };
  if (!inRange || playbackCalibrationProblem(next) !== undefined) {
    return { ok: false, reason: 'out-of-range', measurement };
  }
  return { ok: true, calibration: next, measurement };
}
