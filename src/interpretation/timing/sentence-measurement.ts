import {
  CALIBRATION_OVERHEAD_MS_MAX,
  CALIBRATION_OVERHEAD_MS_MIN,
  OVERHEAD_KINDS,
  playbackCalibrationProblem,
  type OverheadKind,
  type PlaybackCalibration,
} from './calibration.ts';
import type { Stroke } from '#trace/generate.ts';
import { playbackNormalMs, playbackSameFingerMovementMs, type PlaybackTimingAnalysis } from './playback.ts';
import { strokeOverheadKinds } from './stroke-structure.ts';

/**
 * 文章を打つ測定（`spec/playback-timing.md` §6.4）の計算。差の種類（構造の種類の3つ・続け打ち・同指連続）ごとに、
 * ストロークの実際の間隔から基準の時間を引いた差の中央値を、連打との差にする。
 * 基準の時間は、続け打ちと構造の種類では連打の時間（`normalMs`）、同指連続では`max(normalMs, 指の移動の時間)`。
 * 数えるのは、覚えた文を繰り返し打つ2回目以降だけ。句読点を打つストロークと、その直後のストロークは数えない。
 * 時刻は呼び出し側が渡すので、描画にもタイマーにも依存しない。
 */

/** 句読点の入力単位。これを打つストロークと直後のストロークは、止まる間を含みうるので数えない。 */
const PUNCTUATION_INPUT_CHARS: ReadonlySet<string> = new Set(['、', '。', '，', '．', '！', '？']);

/**
 * ストローク`index`が、句読点の入力単位を打つストロークか、その入力単位の最後のストロークの次のストロークか。
 * 直後は、文の区切りで止まる間を含みうる。句読点を打つストロークも、句読点で変換を確定する利用者では、確定の前に止まる間を含みうる。
 */
export function adjoinsPunctuation(strokes: readonly Pick<Stroke, 'inputChar' | 'inputIndex'>[], index: number): boolean {
  const stroke = strokes[index];
  if (stroke === undefined) return false;
  if (PUNCTUATION_INPUT_CHARS.has(stroke.inputChar)) return true;
  const previous = strokes[index - 1];
  return previous !== undefined
    && PUNCTUATION_INPUT_CHARS.has(previous.inputChar)
    && previous.inputIndex !== stroke.inputIndex;
}

/** 差の種類ごとの連打との差を保存する、数えたストロークの最小数（文ごとに数える回の最大を全文で足した数）。これ未満の種類は保存しない。 */
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

export type SentenceCounts = Readonly<Record<OverheadKind, number>>;

export interface SentenceMeasurement {
  /** 差の種類ごとに数えたストロークの数。 */
  readonly counts: SentenceCounts;
  /** 数えたストロークが最小数以上の種類の連打との差[ms]。負の中央値は0にしてある。 */
  readonly overheadMs: Readonly<Partial<Record<OverheadKind, number>>>;
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

/** 数える回（2回目以降）1回分の、打った綴りで作った打鍵の列と構造、ストロークごとの記録。 */
export interface SentenceSample {
  /** 示した文の番号。下限に使う数を文ごとに求める。 */
  readonly sentence: number;
  readonly analysis: SentenceAnalysis;
  /** `analysis.strokes`と同じ長さ。 */
  readonly taps: readonly SentenceTap[];
}

function emptyCounts(): Record<OverheadKind, number> {
  return { arpeggio: 0, chain: 0, other: 0, repeat: 0, sfb: 0 };
}

/**
 * 数える回の記録から、差の種類ごとの連打との差を求める。回ごとに、最初のストローク（直前の時刻が無い）、
 * 違うキーを押したストローク、句読点を打つストロークと直後のストロークは数えない。
 * 続け打ちの差は間隔から続け打ちの`normalMs`（同じキーを続けて打つ速さ、無ければ通常速度）を引いた値、
 * 同指連続の差は間隔から`max(normalMs, 指の移動の時間)`を引いた値、構造の種類の差は間隔から`normalMs`を引いた値。
 * `sameFingerDelay`は見ない。差の中央値は、数えたストロークの全部から取る。
 * 数えた数（`counts`。種類ごとの下限`SENTENCE_MIN_SAMPLES`の判定にも、画面と知らせにも使う）は、
 * 文ごとに数える回のそれぞれで数えたストロークの数の最大を取り、全文で足した数にする。
 * 文ごとの数はその文で数えた回のどれか1回の数に等しく、同じ打鍵を2回目と3回目で数え直して下限を満たすことが無い。
 */
export function measureSentence(
  samples: readonly SentenceSample[],
  calibration: PlaybackCalibration,
): SentenceMeasurement {
  const differences: Record<OverheadKind, number[]> = { arpeggio: [], chain: [], other: [], repeat: [], sfb: [] };
  const maxPerSentence = new Map<number, Record<OverheadKind, number>>();
  for (const { sentence, analysis, taps } of samples) {
    const kinds = strokeOverheadKinds(analysis);
    const round = emptyCounts();
    for (let index = 1; index < analysis.strokes.length; index++) {
      const tap = taps[index];
      const previous = taps[index - 1];
      if (tap === undefined || previous === undefined || !tap.clean) continue;
      if (adjoinsPunctuation(analysis.strokes, index)) continue;
      const normalMs = playbackNormalMs(analysis, index, calibration);
      if (!Number.isFinite(normalMs)) continue;
      const kind = kinds[index];
      const baseMs = kind === 'sfb'
        ? Math.max(normalMs, playbackSameFingerMovementMs(analysis.strokes[index], calibration) ?? 0)
        : normalMs;
      differences[kind].push(tap.atMs - previous.atMs - baseMs);
      round[kind] += 1;
    }
    const best = maxPerSentence.get(sentence) ?? emptyCounts();
    for (const kind of OVERHEAD_KINDS) best[kind] = Math.max(best[kind], round[kind]);
    maxPerSentence.set(sentence, best);
  }

  const counts = emptyCounts();
  const overheadMs: Partial<Record<OverheadKind, number>> = {};
  for (const kind of OVERHEAD_KINDS) {
    for (const best of maxPerSentence.values()) counts[kind] += best[kind];
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
  samples: readonly SentenceSample[],
  nowMs: number,
  /** 保存の時点の保存値。測定を始めた時の保存値`base`と違えば保存しない。 */
  current: PlaybackCalibration | undefined,
): ApplySentenceResult {
  if (base === undefined) return { ok: false, reason: 'no-saved-value' };
  if (!sameValue(base, current)) return { ok: false, reason: 'changed' };
  const measurement = measureSentence(samples, base);
  if (Object.keys(measurement.overheadMs).length === 0) return { ok: false, reason: 'too-few', measurement };
  const inRange = Object.values(measurement.overheadMs).every((value) =>
    value >= CALIBRATION_OVERHEAD_MS_MIN && value <= CALIBRATION_OVERHEAD_MS_MAX);
  const next: PlaybackCalibration = { ...base, keystrokeOverheadMs: measurement.overheadMs, measuredAt: nowMs };
  if (!inRange || playbackCalibrationProblem(next) !== undefined) {
    return { ok: false, reason: 'out-of-range', measurement };
  }
  return { ok: true, calibration: next, measurement };
}
