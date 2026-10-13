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
  /**
   * コンボで打つストロークの出力の文字（打つ順）。コンボで打つストロークだけが持つ。
   * キーボードがコンボを文字に変えて送る時は、`keys`の押下の代わりにこの文字の押下が届く。
   */
  readonly outputChars?: readonly string[];
}

/**
 * 測定の打鍵として取れるキーか。取れるのは1文字のキーだけで（`key-capture.ts`）、
 * Space・Shiftなどの修飾キー・親指キー・名前を持たない追加のキーは取れない。
 */
function capturableKey(keyId: string): boolean {
  return [...keyId].length === 1 && keyId.trim() !== '';
}

/** 打鍵の列を、打つキーの列にする。 */
export function sentenceSteps(analysis: SentenceAnalysis): SentenceStep[] {
  // 出力の文字列は、1回の入力の選択が1つのストロークになる時だけ、そのストロークの出力として決まる。
  // 複数のストロークになる時は、`char`が全ストロークに同じ値で入る。
  const strokesPerSelection = new Map<number, number>();
  for (const stroke of analysis.strokes) {
    strokesPerSelection.set(stroke.selectionIndex, (strokesPerSelection.get(stroke.selectionIndex) ?? 0) + 1);
  }
  return analysis.strokes.map((stroke) => {
    const outputChars = [...stroke.char];
    const comboOutput = stroke.aggregationGroupId === 'combo'
      && strokesPerSelection.get(stroke.selectionIndex) === 1
      && outputChars.length > 0
      && outputChars.every(capturableKey);
    return {
      keys: [...new Set(stroke.presses.flatMap((press) => press.keys.map((key) => key.id)))],
      inputIndex: stroke.inputIndex,
      inputChar: stroke.inputChar,
      ...(comboOutput ? { outputChars } : {}),
    };
  });
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
  /** 今のステップで、押すキーの読み方として押し済みのキー。 */
  readonly pressed: readonly string[];
  /** 今のステップで、出力の文字の読み方として押し済みの文字の数。 */
  readonly outputCount: number;
  /** 今のステップの押下の列が、押すキーの読み方に初めから一致していれば真。 */
  readonly pressReadingAlive: boolean;
  /** 今のステップの押下の列が、出力の文字の読み方に初めから一致していれば真。コンボで打たないステップでは偽。 */
  readonly outputReadingAlive: boolean;
  /** 今のステップの最初の押下の時刻[ms]。まだ押していなければ無い。 */
  readonly firstAtMs: number | undefined;
  /** 今のステップで違うキーを押していなければ真。 */
  readonly clean: boolean;
  /** 済んだステップの記録。 */
  readonly taps: readonly SentenceTap[];
}

/** 新しいステップに入った時の、読み方の状態。 */
function stepStart(steps: readonly SentenceStep[], index: number) {
  return {
    index,
    pressed: [],
    outputCount: 0,
    pressReadingAlive: true,
    outputReadingAlive: steps[index]?.outputChars !== undefined,
    firstAtMs: undefined,
    clean: true,
  } as const;
}

export function startSentenceRun(steps: readonly SentenceStep[]): SentenceRun {
  return { steps, ...stepStart(steps, 0), taps: [] };
}

export function sentenceRunFinished(run: SentenceRun): boolean {
  return run.index >= run.steps.length;
}

/**
 * 今のステップでまだ押していないキーのid。画面の「次に打つキー」に使う。
 * 出力の文字で打っている間も、押すキーを示したまま変えない。
 */
export function remainingSentenceKeys(run: SentenceRun): readonly string[] {
  const step = run.steps[run.index];
  return step === undefined ? [] : step.keys.filter((key) => !run.pressed.includes(key));
}

export interface SentenceKeyEvent {
  readonly key: string;
  readonly code: string;
}

export type SentencePressOutcome =
  /**
   * 今のステップで押すキーではない。そのステップの間隔は数えない。
   * `expectedKey`は案内するキー。`expectedIsOutput`が真なら、キーのidではなく出力の文字そのもの
   * （出力の文字の読み方だけが残っている時の、次の文字）。
   */
  | { readonly kind: 'wrong-key'; readonly expectedKey: string; readonly expectedIsOutput: boolean }
  /** 時刻が戻った、または同時刻だった。進行は変わらない。 */
  | { readonly kind: 'ignored' }
  /** 同時に押すキーの一部を押した。または、完了した読み方があるが、他方の読み方が途中でステップを確定していない。 */
  | { readonly kind: 'partial' }
  | { readonly kind: 'step-finished' }
  | { readonly kind: 'run-finished' };

function outputCharMatches(event: SentenceKeyEvent, char: string): boolean {
  return event.key.toLowerCase() === char.toLowerCase();
}

/** 今のステップを確定して、次のステップへ進める。 */
function finishStep(run: SentenceRun, firstAtMs: number): SentenceRun {
  return {
    ...run,
    ...stepStart(run.steps, run.index + 1),
    taps: [...run.taps, { atMs: firstAtMs, clean: run.clean }],
  };
}

/**
 * 打鍵1つを進行に反映する。ステップの時刻は、そのステップの最初の押下の時刻にする。
 * `atMs`は単調に増える時刻[ms]で、前のステップの時刻より後でなければ無視する。
 *
 * コンボで打つステップは、押すキーの読み方と出力の文字の読み方を別々に追い、押下の列が一致し続ける読み方だけを残す。
 * 一方の読み方が完了しても他方が途中で一致している間はステップを確定せず、次の押下が他方の続きに一致しなければ、
 * 完了した読み方で確定して、その押下を次のステップの最初の押下として扱う（`spec/playback-timing.md` §6.4）。
 */
export function pressSentenceKey(
  run: SentenceRun,
  event: SentenceKeyEvent,
  atMs: number,
  keyLabel: (keyId: string) => string,
): { readonly run: SentenceRun; readonly outcome: SentencePressOutcome } {
  const step = run.steps[run.index];
  if (step === undefined) return { run, outcome: { kind: 'ignored' } };

  const output = step.outputChars;
  const pressDone = run.pressReadingAlive && run.pressed.length >= step.keys.length;
  const outputDone = run.outputReadingAlive && output !== undefined && run.outputCount >= output.length;

  const pressMatch = run.pressReadingAlive && !pressDone
    ? remainingSentenceKeys(run).find((key) => calibrationKeyMatches(event, key, keyLabel(key)))
    : undefined;
  const outputMatches = run.outputReadingAlive && output !== undefined && !outputDone
    && outputCharMatches(event, output[run.outputCount]);

  if (pressMatch === undefined && !outputMatches) {
    if (pressDone || outputDone) {
      // 完了した読み方で確定し、この押下を次のステップの最初の押下にする。
      return pressSentenceKey(finishStep(run, run.firstAtMs ?? atMs), event, atMs, keyLabel);
    }
    const expected = run.pressReadingAlive || output === undefined
      ? { expectedKey: remainingSentenceKeys(run)[0], expectedIsOutput: false }
      : { expectedKey: output[run.outputCount], expectedIsOutput: true };
    return { run: { ...run, clean: false }, outcome: { kind: 'wrong-key', ...expected } };
  }

  const previousAtMs = run.taps[run.taps.length - 1]?.atMs;
  if (run.firstAtMs === undefined && previousAtMs !== undefined && atMs <= previousAtMs) {
    return { run, outcome: { kind: 'ignored' } };
  }

  const firstAtMs = run.firstAtMs ?? atMs;
  const advanced: SentenceRun = {
    ...run,
    pressed: pressMatch === undefined ? run.pressed : [...run.pressed, pressMatch],
    outputCount: outputMatches ? run.outputCount + 1 : run.outputCount,
    pressReadingAlive: pressMatch !== undefined,
    outputReadingAlive: outputMatches,
    firstAtMs,
  };
  const pressComplete = advanced.pressReadingAlive && advanced.pressed.length >= step.keys.length;
  const outputComplete = advanced.outputReadingAlive && output !== undefined && advanced.outputCount >= output.length;
  const lastStep = run.index === run.steps.length - 1;
  // 完了した読み方があり、他方が無い、または完了している、または最後のステップなら確定する。
  const otherPending = (advanced.pressReadingAlive && !pressComplete) || (advanced.outputReadingAlive && !outputComplete);
  if ((pressComplete || outputComplete) && (!otherPending || lastStep)) {
    const next = finishStep(advanced, firstAtMs);
    return { run: next, outcome: { kind: sentenceRunFinished(next) ? 'run-finished' : 'step-finished' } };
  }
  return { run: advanced, outcome: { kind: 'partial' } };
}
