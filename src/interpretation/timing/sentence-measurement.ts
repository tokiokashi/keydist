import {
  CALIBRATION_OVERHEAD_MS_MAX,
  CALIBRATION_OVERHEAD_MS_MIN,
  OVERHEAD_KINDS,
  playbackCalibrationProblem,
  sideOverheadKind,
  type OverheadKind,
  type PlaybackCalibration,
} from './calibration.ts';
import type { Stroke } from '#trace/generate.ts';
import {
  playbackNormalMs,
  playbackSameFingerMovementMs,
  playbackSimultaneousOverheadMs,
  type PlaybackTimingAnalysis,
} from './playback.ts';
import { strokeOverheadKinds, strokeOverheadSide } from './stroke-structure.ts';

/**
 * 文章を打つ測定（`spec/playback-timing.md` §6.4）の計算。差の種類（構造の種類の3つ・続け打ち・同指連続）ごとに、
 * ストロークの実際の間隔から基準の時間を引いた差の四分位平均を、打鍵の上乗せにする。
 * 構造の種類は、分けない値に加えて、かなの中・かなの境目のストロークだけからも求める。
 * 基準の時間は、続け打ちと構造の種類では1打の時間（`normalMs`）、同指連続では`max(normalMs, 指の移動の時間)`。
 * 同時押しのストロークの基準の時間には、そのストロークの同時押しの上乗せを足す（続け打ちは同時押しにならない）。
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

/** 差の種類ごとの打鍵の上乗せを保存する、数えたストロークの最小数（文ごとに数える回の最大を全文で足した数）。これ未満の種類は保存しない。 */
export const SENTENCE_MIN_SAMPLES = 10;

/** 打ち終えたストローク1つの記録。 */
export interface SentenceTap {
  /** そのストロークの最初の押下の時刻[ms]。 */
  readonly atMs: number;
  /** そのストロークで違うキーを押していなければ真。偽なら、そのストロークの間隔は数えない。 */
  readonly clean: boolean;
  /**
   * コンボで打つストロークが、出力の文字の読み方で完了していれば真（無ければ偽）。
   * 押すキーの読み方が完了したストロークと、両方の読み方が同じ押下で完了したストロークは偽。
   * 真なら、そのストロークの間隔と直後のストロークの間隔は数えない。
   */
  readonly outputCompleted?: boolean;
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

/** 表の1行ぶんの値。数えたストロークが無い行は、四分位平均を持たない。 */
export interface SentenceRowStats {
  /** 数えたストロークの数（下限の判定に使う数）。 */
  readonly count: number;
  /** 差を求める元の時間の四分位平均[ms]。 */
  readonly baseMs?: number;
  /** 文章を打った間隔の四分位平均[ms]。 */
  readonly intervalMs?: number;
  /** ストロークごとの差の四分位平均[ms]。負の値もそのまま持つ。 */
  readonly differenceMs?: number;
}

export interface SentenceMeasurement {
  /** 保存する行ごとに数えたストロークの数。 */
  readonly counts: SentenceCounts;
  /** 保存する行ごとの、表に示す値。 */
  readonly kinds: Readonly<Record<OverheadKind, SentenceRowStats>>;
  /** 数えたストロークが最小数以上の種類の打鍵の上乗せ[ms]。負の値もそのまま持つ。 */
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

/**
 * 四分位平均。小さい方と大きい方から、それぞれ`floor(n / 4)`個を除いた残りの平均。
 * 除く数の端数は切り捨てる（`n`が4で割り切れない時は、除く数が25%に満たない）ので、値の一部だけを除くことはしない。
 * `n`が1以上なら、残りは必ず1個以上ある。値が無ければ`NaN`。
 */
export function interquartileMean(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const trim = Math.floor(sorted.length / 4);
  const kept = sorted.slice(trim, sorted.length - trim);
  return kept.reduce((sum, value) => sum + value, 0) / kept.length;
}

/** 数える回（2回目以降）1回分の、打った綴りで作った打鍵の列と構造、ストロークごとの記録。 */
export interface SentenceSample {
  /** 示した文の番号。下限に使う数を文ごとに求める。 */
  readonly sentence: number;
  readonly analysis: SentenceAnalysis;
  /** `analysis.strokes`と同じ長さ。 */
  readonly taps: readonly SentenceTap[];
}

/** 行ごとに集めた、数えたストロークの値。 */
interface Collected {
  readonly bases: number[];
  readonly intervals: number[];
  readonly differences: number[];
}

function push(target: Collected, baseMs: number, intervalMs: number): void {
  target.bases.push(baseMs);
  target.intervals.push(intervalMs);
  target.differences.push(intervalMs - baseMs);
}

function rowStats(count: number, values: Collected): SentenceRowStats {
  if (values.differences.length === 0) return { count };
  return {
    count,
    baseMs: interquartileMean(values.bases),
    intervalMs: interquartileMean(values.intervals),
    differenceMs: interquartileMean(values.differences),
  };
}

function emptyCounts(): Record<OverheadKind, number> {
  return Object.fromEntries(OVERHEAD_KINDS.map((kind) => [kind, 0])) as Record<OverheadKind, number>;
}

/**
 * 数える回の記録から、差の種類ごとの打鍵の上乗せを求める。回ごとに、最初のストローク（直前の時刻が無い）、
 * 違うキーを押したストローク、出力の文字の読み方で完了したストロークとその直後のストローク、句読点を打つストロークと直後のストロークは数えない。
 * 続け打ちの差は間隔から続け打ちの`normalMs`（同じキーを続けて打つ速さ、無ければ通常速度）を引いた値、
 * 同指連続の差は間隔から`max(normalMs, 指の移動の時間)`と同時押しの上乗せを引いた値、
 * 構造の種類の差は間隔から`normalMs`と同時押しの上乗せを引いた値。
 * `sameFingerDelay`は見ない。差の四分位平均は、数えたストロークの全部から取る。
 * 数えた数（`counts`。種類ごとの下限`SENTENCE_MIN_SAMPLES`の判定にも、画面と知らせにも使う）は、
 * 文ごとに数える回のそれぞれで数えたストロークの数の最大を取り、全文で足した数にする。
 * 文ごとの数はその文で数えた回のどれか1回の数に等しく、同じ打鍵を2回目と3回目で数え直して下限を満たすことが無い。
 */
export function measureSentence(
  samples: readonly SentenceSample[],
  calibration: PlaybackCalibration,
): SentenceMeasurement {
  const collected = (): Collected => ({ bases: [], intervals: [], differences: [] });
  const gathered = Object.fromEntries(OVERHEAD_KINDS.map((kind) => [kind, collected()])) as Record<OverheadKind, Collected>;
  const maxPerSentence = new Map<number, Record<OverheadKind, number>>();
  for (const { sentence, analysis, taps } of samples) {
    const kinds = strokeOverheadKinds(analysis);
    const round = emptyCounts();
    for (let index = 1; index < analysis.strokes.length; index++) {
      const tap = taps[index];
      const previous = taps[index - 1];
      if (tap === undefined || previous === undefined || !tap.clean) continue;
      // 出力の文字を手で打った時の文字の間の時間と、押すキーと違う手・向きが入るので、前後の間隔を数えない。
      if (tap.outputCompleted === true || previous.outputCompleted === true) continue;
      if (adjoinsPunctuation(analysis.strokes, index)) continue;
      const normalMs = playbackNormalMs(analysis, index, calibration);
      if (!Number.isFinite(normalMs)) continue;
      const kind = kinds[index];
      // 同時押しのストロークの基準の時間には、再生と同じ位置（そのストロークのステップ）で同時押しの上乗せを含める。
      const simultaneousMs = playbackSimultaneousOverheadMs(analysis.strokes[index], calibration);
      const baseMs = (kind === 'sfb'
        ? Math.max(normalMs, playbackSameFingerMovementMs(analysis.strokes[index], calibration) ?? 0)
        : normalMs) + simultaneousMs;
      const intervalMs = tap.atMs - previous.atMs;
      const saved: OverheadKind[] = [kind];
      if (kind === 'arpeggio' || kind === 'chain' || kind === 'other') {
        saved.push(sideOverheadKind(kind, strokeOverheadSide(analysis.strokes, index)));
      }
      for (const row of saved) {
        push(gathered[row], baseMs, intervalMs);
        round[row] += 1;
      }
    }
    const best = maxPerSentence.get(sentence) ?? emptyCounts();
    for (const kind of OVERHEAD_KINDS) best[kind] = Math.max(best[kind], round[kind]);
    maxPerSentence.set(sentence, best);
  }

  const counts = emptyCounts();
  const overheadMs: Partial<Record<OverheadKind, number>> = {};
  const kinds = {} as Record<OverheadKind, SentenceRowStats>;
  for (const kind of OVERHEAD_KINDS) {
    for (const best of maxPerSentence.values()) counts[kind] += best[kind];
    if (counts[kind] >= SENTENCE_MIN_SAMPLES) overheadMs[kind] = interquartileMean(gathered[kind].differences);
    kinds[kind] = rowStats(counts[kind], gathered[kind]);
  }
  return { counts, kinds, overheadMs };
}

export type ApplySentenceResult =
  | { readonly ok: true; readonly calibration: PlaybackCalibration; readonly measurement: SentenceMeasurement }
  /** 文章を打つ測定は、`normalMs`を求める保存値が無いと反映先が無い。 */
  | { readonly ok: false; readonly reason: 'no-saved-value' }
  /** 測定を始めた時の保存値と、保存の時の保存値が違う。打った時の基準で求めた打鍵の上乗せを、違う保存値に付けない。 */
  | { readonly ok: false; readonly reason: 'changed' }
  /** どの種類も数えたストロークが足りない。 */
  | { readonly ok: false; readonly reason: 'too-few'; readonly measurement: SentenceMeasurement }
  /** 測った打鍵の上乗せが保存できる範囲を外れた。 */
  | { readonly ok: false; readonly reason: 'out-of-range'; readonly measurement: SentenceMeasurement };

/**
 * 済んだ文章を打つ測定を保存値へ反映する（§6.3・§6.4）。打鍵の上乗せだけを置き換え、他の項目は残す。
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

/** 保存する行で、打鍵の上乗せを保存したか。 */
export type SentenceSaveStatus =
  /** 保存値に入れた。 */
  | 'saved'
  /** 数えた打数が下限に届かず、保存しなかった。 */
  | 'below-minimum'
  /** 測った値が範囲の外の種類があり、保存値の全部を保存しなかった。 */
  | 'out-of-range';

/** 測り終えた時に示す表。 */
export interface SentenceResultTable {
  readonly kinds: readonly { readonly kind: OverheadKind; readonly stats: SentenceRowStats; readonly status: SentenceSaveStatus }[];
}

/**
 * 測り終えた時に示す表（`spec/playback-timing.md` §6.4「測り終えた時に示す表」）。
 * 保存値が無い時と、測定の途中で保存値が変わった時は、差を求める元の時間の保存値が決まらないので表を作らない。
 */
export function sentenceResultTable(result: ApplySentenceResult): SentenceResultTable | undefined {
  if (!result.ok && (result.reason === 'no-saved-value' || result.reason === 'changed')) return undefined;
  const { measurement } = result;
  const reachedStatus: SentenceSaveStatus = result.ok ? 'saved' : result.reason === 'out-of-range' ? 'out-of-range' : 'below-minimum';
  return {
    kinds: OVERHEAD_KINDS.map((kind) => ({
      kind,
      stats: measurement.kinds[kind],
      status: measurement.overheadMs[kind] === undefined ? 'below-minimum' : reachedStatus,
    })),
  };
}
