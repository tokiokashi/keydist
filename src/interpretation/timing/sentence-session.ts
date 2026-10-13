import { calibrationKeyMatches } from './calibration.ts';
import type { SentenceAnalysis, SentenceTap } from './sentence-measurement.ts';

/**
 * 示す文を打つ測定の進行（打つキーの列・打鍵の照合・ストロークごとの時刻の記録）。
 * 時刻とキーの押下は呼び出し側が渡すので、描画にもタイマーにも依存しない。
 * 測定の計算は `sentence-measurement.ts`、規則は `spec/playback-timing.md` §6.4。
 */

/** 打つ1ストローク。`keys`は同時に押すキーのid（押す順は問わない）。 */
export interface SentenceStep {
  readonly keys: readonly string[];
  /** 入力単位（かな1文字など）の通し番号。同じ入力単位を複数ストロークで打つ配列では共有する。 */
  readonly inputIndex: number;
  /** 入力単位の文字。 */
  readonly inputChar: string;
}

/** 打鍵の列を、打つキーの列にする。 */
export function sentenceSteps(analysis: SentenceAnalysis): SentenceStep[] {
  return analysis.strokes.map((stroke) => ({
    keys: [...new Set(stroke.presses.flatMap((press) => press.keys.map((key) => key.id)))],
    inputIndex: stroke.inputIndex,
    inputChar: stroke.inputChar,
  }));
}

/**
 * 測定の打鍵として取れるキーか。取れるのは1文字のキーだけで（`key-capture.ts`）、
 * Space・Shiftなどの修飾キー・親指キー・名前を持たない追加のキーは取れない。
 */
function capturableKey(keyId: string): boolean {
  return [...keyId].length === 1 && keyId.trim() !== '';
}

/** 測れない理由。打つ列が空、または取れないキーが要る。 */
export type SentenceUnmeasurable = 'empty' | 'uncapturable-key';

/** 示す文を打つのに取れないキーが要る、または打つ列が空なら、測れない。 */
export function sentenceUnmeasurable(steps: readonly SentenceStep[]): SentenceUnmeasurable | undefined {
  if (steps.length === 0) return 'empty';
  return steps.some((step) => step.keys.length === 0 || step.keys.some((key) => !capturableKey(key)))
    ? 'uncapturable-key'
    : undefined;
}

/** 示す文の入力単位（かな1文字など）と、それを打つステップの範囲。 */
export interface SentenceUnit {
  readonly text: string;
  /** 打つステップの範囲（半開区間）。 */
  readonly start: number;
  readonly end: number;
}

export function sentenceUnits(steps: readonly SentenceStep[]): SentenceUnit[] {
  const units: SentenceUnit[] = [];
  for (let start = 0; start < steps.length; ) {
    let end = start + 1;
    while (end < steps.length && steps[end].inputIndex === steps[start].inputIndex) end++;
    units.push({ text: steps[end - 1].inputChar, start, end });
    start = end;
  }
  return units;
}

/** 測定の進行。打鍵のたびに`pressSentenceKey`が新しい値を返す。 */
export interface SentenceRun {
  readonly steps: readonly SentenceStep[];
  /** 今打つステップの位置。`steps.length`なら全ステップが済んでいる。 */
  readonly index: number;
  /** 今のステップで押し済みのキー。 */
  readonly pressed: readonly string[];
  /** 今のステップの最初の押下の時刻[ms]。まだ押していなければ無い。 */
  readonly firstAtMs: number | undefined;
  /** 今のステップで違うキーを押していなければ真。 */
  readonly clean: boolean;
  /** 済んだステップの記録。 */
  readonly taps: readonly SentenceTap[];
}

export function startSentenceRun(steps: readonly SentenceStep[]): SentenceRun {
  return { steps, index: 0, pressed: [], firstAtMs: undefined, clean: true, taps: [] };
}

export function sentenceRunFinished(run: SentenceRun): boolean {
  return run.index >= run.steps.length;
}

/** 今のステップでまだ押していないキーのid。 */
export function remainingSentenceKeys(run: SentenceRun): readonly string[] {
  const step = run.steps[run.index];
  return step === undefined ? [] : step.keys.filter((key) => !run.pressed.includes(key));
}

export interface SentenceKeyEvent {
  readonly key: string;
  readonly code: string;
}

export type SentencePressOutcome =
  /** 今のステップで押すキーではない。そのステップの間隔は数えない。 */
  | { readonly kind: 'wrong-key'; readonly expectedKey: string }
  /** 時刻が戻った、または同時刻だった。進行は変わらない。 */
  | { readonly kind: 'ignored' }
  /** 同時に押すキーの一部を押した。 */
  | { readonly kind: 'partial' }
  | { readonly kind: 'step-finished' }
  | { readonly kind: 'run-finished' };

/**
 * 打鍵1つを進行に反映する。ステップの時刻は、そのステップの最初の押下の時刻にする。
 * `atMs`は単調に増える時刻[ms]で、前のステップの時刻より後でなければ無視する。
 */
export function pressSentenceKey(
  run: SentenceRun,
  event: SentenceKeyEvent,
  atMs: number,
  keyLabel: (keyId: string) => string,
): { readonly run: SentenceRun; readonly outcome: SentencePressOutcome } {
  const remaining = remainingSentenceKeys(run);
  if (remaining.length === 0) return { run, outcome: { kind: 'ignored' } };

  const matched = remaining.find((key) => calibrationKeyMatches(event, key, keyLabel(key)));
  if (matched === undefined) {
    return { run: { ...run, clean: false }, outcome: { kind: 'wrong-key', expectedKey: remaining[0] } };
  }
  const previousAtMs = run.taps[run.taps.length - 1]?.atMs;
  if (run.firstAtMs === undefined && previousAtMs !== undefined && atMs <= previousAtMs) {
    return { run, outcome: { kind: 'ignored' } };
  }

  const firstAtMs = run.firstAtMs ?? atMs;
  const pressed = [...run.pressed, matched];
  if (pressed.length < run.steps[run.index].keys.length) {
    return { run: { ...run, pressed, firstAtMs }, outcome: { kind: 'partial' } };
  }
  const next: SentenceRun = {
    ...run,
    index: run.index + 1,
    pressed: [],
    firstAtMs: undefined,
    clean: true,
    taps: [...run.taps, { atMs: firstAtMs, clean: run.clean }],
  };
  return { run: next, outcome: { kind: sentenceRunFinished(next) ? 'run-finished' : 'step-finished' } };
}
