import type { Stroke } from '#trace/generate.ts';
import { calibrationKeyMatches } from './calibration.ts';
import type { SentenceAnalysis, SentenceSpellingSource, SentenceTap } from './sentence-measurement.ts';

/**
 * 示す文を打つ測定の進行（打つキーの列・打鍵の照合・ストロークごとの時刻の記録）。
 * 時刻とキーの押下は呼び出し側が渡すので、描画にもタイマーにも依存しない。
 * 測定の計算は `sentence-measurement.ts`、規則は `spec/playback-timing.md` §6.4。
 *
 * 示す文は入力単位（かな1見出しなど）に分け、単位ごとに受け付ける綴りの候補を持つ。
 * 単位の中では、候補ごとに打つキーの列を1本ずつ追い（スレッド）、押下の列が一致し続ける候補だけを残す。
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

/** 打つキーの列を作るのに読むストロークの部分。 */
type SentenceStroke = Pick<Stroke, 'selectionIndex' | 'char' | 'aggregationGroupId' | 'presses' | 'inputIndex' | 'inputChar'>;

/** 打鍵の列を、打つキーの列にする。 */
export function sentenceSteps(analysis: { readonly strokes: readonly SentenceStroke[] }): SentenceStep[] {
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


/** 打つキーの列を、同じ入力単位を打つ連続したステップごとの組に分ける。 */
function groupSteps(steps: readonly SentenceStep[]): SentenceStep[][] {
  const groups: SentenceStep[][] = [];
  for (const step of steps) {
    const last = groups[groups.length - 1];
    if (last !== undefined && last[0].inputIndex === step.inputIndex) last.push(step);
    else groups.push([step]);
  }
  return groups;
}

/** 示す文の入力単位（かな1見出しなど）と、受け付ける綴り。 */
export interface SentenceUnit {
  /** 画面に出す入力単位の文字。 */
  readonly text: string;
  /** 受け付ける綴り。先頭は今の条件のローマ字規則の綴り。綴りを選べない配列では空の綴り1つ。 */
  readonly spellings: readonly string[];
}

/** 測定の計画。示す文の入力単位と、単位ごとの綴りの候補から打つキーの列を求める方法。 */
export interface SentencePlan {
  readonly units: readonly SentenceUnit[];
  /** 全単位を先頭の綴りで打つ時の、単位ごとの打つキーの列。 */
  readonly baseSteps: readonly (readonly SentenceStep[])[];
  /**
   * それまでに打った単位の綴り`typed`の後で、単位`unit`を`spelling`で打つ時の打つキーの列。
   * 打てない綴り（取れないキーが要る・配列に無い文字を含む）は無い。
   */
  candidateSteps(typed: readonly string[], unit: number, spelling: string): readonly SentenceStep[] | undefined;
  /** 単位ごとに打った綴りから、打鍵の列と構造を作る。 */
  analyze(typed: readonly string[]): SentenceAnalysis | undefined;
}

/**
 * 入力単位ごとの打つキーの列から、綴りを1つに決めた計画を作る。同じ入力単位を打つ連続したステップを1単位にする。
 * 打った綴りの打鍵の列と構造は`analyze`が返す。
 */
export function stepsSentencePlan(steps: readonly SentenceStep[], analyze: () => SentenceAnalysis | undefined): SentencePlan {
  const groups = groupSteps(steps);
  return {
    units: groups.map((group) => ({ text: group[group.length - 1].inputChar, spellings: [''] })),
    baseSteps: groups,
    candidateSteps: (_typed, unit) => groups[unit],
    analyze: () => analyze(),
  };
}

/**
 * 示す文の測定の計画を作る。`spelling`があり、かなの入力単位とストロークが1対1に対応する時だけ、綴りの候補を使う。
 * 対応しない時（出力が複数のかなにまたがるコンボを持つ配列など）と、かな配列は、先頭の綴りの打鍵の列だけで進める。
 */
export function sentencePlan(analysis: SentenceAnalysis, spelling?: SentenceSpellingSource): SentencePlan {
  const groups = groupSteps(sentenceSteps(analysis));
  const aligned = spelling !== undefined
    && spelling.units.length === groups.length
    && spelling.units.every((unit, index) => groups[index][groups[index].length - 1].inputChar === unit.kana);
  if (!aligned) return stepsSentencePlan(sentenceSteps(analysis), () => analysis);
  const baseSpellings = spelling.units.map((unit) => unit.spellings[0]);
  return {
    units: spelling.units.map((unit) => ({ text: unit.kana, spellings: unit.spellings })),
    baseSteps: groups,
    candidateSteps(typed, unit, candidate) {
      if (candidate === baseSpellings[unit] && typed.every((spell, index) => spell === baseSpellings[index])) return groups[unit];
      // 前に打った綴りで後の単位の打ち方が変わる配列があるので、打った綴りの列で作り直して単位の分を取る。
      const rebuilt = spelling.strokes([...typed, candidate, ...baseSpellings.slice(unit + 1)]);
      const rebuiltGroups = rebuilt === undefined ? undefined : groupSteps(sentenceSteps({ strokes: rebuilt }));
      const steps = rebuiltGroups?.length === groups.length ? rebuiltGroups[unit] : undefined;
      if (steps !== undefined && steps[steps.length - 1].inputChar === spelling.units[unit].kana && sentenceUnmeasurable(steps) === undefined) {
        return steps;
      }
      // 作り直せない時、先頭の綴りは測定を始めた時の打鍵の列で進める。他の綴りは受け付けない。
      return candidate === baseSpellings[unit] ? groups[unit] : undefined;
    },
    analyze: (typed) => spelling.analyze(typed),
  };
}

/** 1本の綴りの打つキーの列を追う進行。 */
interface StepRun {
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
  /** 測定の最初から済んだステップの記録。 */
  readonly taps: readonly SentenceTap[];
  /**
   * 利用者の打ち方。一方の読み方だけで完了したコンボのステップが済んだ時に決まり、以後のコンボのステップは決まった読み方だけで進める。
   * まだ決まっていなければ無い。
   */
  readonly reading: ComboReading | undefined;
  /**
   * 綴りを打ち終えた後の押下で確定したコンボのステップが決めた読み方。その押下が次の単位に受け付けられた時だけ、`reading`にする。
   * 打ち終えた綴りの進行にだけ付く。
   */
  readonly pendingReading?: ComboReading;
}

/** コンボで打つステップの読み方。`press`は押すキー、`output`は出力の文字。 */
type ComboReading = 'press' | 'output';

/** 新しいステップに入った時の、読み方の状態。 */
function stepStart(steps: readonly SentenceStep[], index: number, reading: ComboReading | undefined) {
  return {
    index,
    pressed: [],
    outputCount: 0,
    // 打ち方が決まっていれば、コンボで打つステップは決まった読み方だけで進める。
    pressReadingAlive: steps[index]?.outputChars === undefined || reading !== 'output',
    outputReadingAlive: steps[index]?.outputChars !== undefined && reading !== 'press',
    firstAtMs: undefined,
    clean: true,
  } as const;
}

function startStepRun(steps: readonly SentenceStep[], taps: readonly SentenceTap[], reading: ComboReading | undefined): StepRun {
  return { steps, ...stepStart(steps, 0, reading), taps, reading };
}

function stepRunFinished(run: StepRun): boolean {
  return run.index >= run.steps.length;
}

/** 今のステップでまだ押していないキーのid。 */
function remainingStepKeys(run: StepRun): readonly string[] {
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
  /** 同時に押すキーの一部を押した。または、完了した読み方・綴りがあるが、他方が途中で確定していない。 */
  | { readonly kind: 'partial' }
  | { readonly kind: 'step-finished' }
  | { readonly kind: 'run-finished' };

/** 1本の綴りの進行が返す結果。`overflow`は、綴りを打ち終えた後の押下で、次の単位へ回す。 */
type StepOutcome = SentencePressOutcome | { readonly kind: 'overflow' };

function outputCharMatches(event: SentenceKeyEvent, char: string): boolean {
  return event.key.toLowerCase() === char.toLowerCase();
}

/**
 * 今のステップを確定して、次のステップへ進める。
 * `decided`は、このステップが一方の読み方だけで完了した時の、その読み方。
 */
function finishStep(run: StepRun, firstAtMs: number, decided: ComboReading | undefined): StepRun {
  const reading = decided ?? run.reading;
  return {
    ...run,
    ...stepStart(run.steps, run.index + 1, reading),
    reading,
    taps: [...run.taps, { atMs: firstAtMs, clean: run.clean }],
  };
}

/**
 * 1本の綴りの進行に打鍵1つを反映する。ステップの時刻は、そのステップの最初の押下の時刻にする。
 * `atMs`は単調に増える時刻[ms]で、前のステップの時刻より後でなければ無視する。
 *
 * コンボで打つステップは、押すキーの読み方と出力の文字の読み方を別々に追い、押下の列が一致し続ける読み方だけを残す。
 * 一方の読み方が完了しても他方が途中で一致している間はステップを確定せず、次の押下が他方の続きに一致しなければ、
 * 完了した読み方で確定して、その押下を次のステップの最初の押下として扱う（`spec/playback-timing.md` §6.4）。
 * 一方の読み方だけで完了したコンボのステップが済むと、以後のコンボのステップはその読み方だけで進める（同じ節の打ち方の決め方）。
 * 最後のステップが済むと、`run-finished`を返す（綴りを打ち終えた印）。綴りを打ち終えた後の押下は`overflow`を返す。
 * 他方の読み方が途中でも最後のステップで確定するのは、`final`（示す文の最後の単位）の時だけ。
 */
function pressStep(
  run: StepRun,
  event: SentenceKeyEvent,
  atMs: number,
  keyLabel: (keyId: string) => string,
  final: boolean,
): { readonly run: StepRun; readonly outcome: StepOutcome } {
  const step = run.steps[run.index];
  if (step === undefined) return { run, outcome: { kind: 'overflow' } };

  const output = step.outputChars;
  const pressDone = run.pressReadingAlive && run.pressed.length >= step.keys.length;
  const outputDone = run.outputReadingAlive && output !== undefined && run.outputCount >= output.length;

  const pressMatch = run.pressReadingAlive && !pressDone
    ? remainingStepKeys(run).find((key) => calibrationKeyMatches(event, key, keyLabel(key)))
    : undefined;
  const outputMatches = run.outputReadingAlive && output !== undefined && !outputDone
    && outputCharMatches(event, output[run.outputCount]);

  if (pressMatch === undefined && !outputMatches) {
    if (pressDone || outputDone) {
      // 完了した読み方で確定し、この押下を次のステップの最初の押下にする。
      // 次の押下が他方の続きに一致しなかったので、他方の読み方は外れている。
      // 読み方を決めるのは、その押下が次のストロークに受け付けられた時だけ（打ち間違いでは決めない）。
      const decided = output === undefined || (pressDone && outputDone) ? undefined : pressDone ? 'press' : 'output';
      const firstAt = run.firstAtMs ?? atMs;
      if (decided !== undefined) {
        const trial = pressStep(finishStep(run, firstAt, decided), event, atMs, keyLabel, final);
        if (trial.outcome.kind !== 'wrong-key' && trial.outcome.kind !== 'overflow') return trial;
        const undecided = pressStep(finishStep(run, firstAt, undefined), event, atMs, keyLabel, final);
        return trial.outcome.kind === 'overflow' && undecided.outcome.kind === 'overflow'
          ? { run: { ...undecided.run, pendingReading: decided }, outcome: undecided.outcome }
          : undecided;
      }
      return pressStep(finishStep(run, firstAt, undefined), event, atMs, keyLabel, final);
    }
    const expected = run.pressReadingAlive || output === undefined
      ? { expectedKey: remainingStepKeys(run)[0], expectedIsOutput: false }
      : { expectedKey: output[run.outputCount], expectedIsOutput: true };
    return { run: { ...run, clean: false }, outcome: { kind: 'wrong-key', ...expected } };
  }

  const previousAtMs = run.taps[run.taps.length - 1]?.atMs;
  if (run.firstAtMs === undefined && previousAtMs !== undefined && atMs <= previousAtMs) {
    return { run, outcome: { kind: 'ignored' } };
  }

  const firstAtMs = run.firstAtMs ?? atMs;
  const advanced: StepRun = {
    ...run,
    pressed: pressMatch === undefined ? run.pressed : [...run.pressed, pressMatch],
    outputCount: outputMatches ? run.outputCount + 1 : run.outputCount,
    pressReadingAlive: pressMatch !== undefined,
    outputReadingAlive: outputMatches,
    firstAtMs,
  };
  const pressComplete = advanced.pressReadingAlive && advanced.pressed.length >= step.keys.length;
  const outputComplete = advanced.outputReadingAlive && output !== undefined && advanced.outputCount >= output.length;
  const lastStep = final && run.index === run.steps.length - 1;
  // 完了した読み方があり、他方が無い、または完了している、または最後のステップなら確定する。
  const otherPending = (advanced.pressReadingAlive && !pressComplete) || (advanced.outputReadingAlive && !outputComplete);
  if ((pressComplete || outputComplete) && (!otherPending || lastStep)) {
    // もう一方の読み方が、完了せずに外れていれば、完了した読み方に決まる。
    // 入った時点で既に完了していた読み方は、この押下で外れても決めない。
    const decided = output === undefined ? undefined
      : pressComplete && !advanced.outputReadingAlive && !outputDone ? 'press'
        : outputComplete && !advanced.pressReadingAlive && !pressDone ? 'output' : undefined;
    const next = finishStep(advanced, firstAtMs, decided);
    return { run: next, outcome: { kind: stepRunFinished(next) ? 'run-finished' : 'step-finished' } };
  }
  return { run: advanced, outcome: { kind: 'partial' } };
}

/** 単位の中で追っている、1つの綴り。 */
interface SentenceThread {
  readonly spelling: string;
  readonly run: StepRun;
}

/** 測定の進行。打鍵のたびに`pressSentenceKey`が新しい値を返す。 */
export interface SentenceRun {
  readonly plan: SentencePlan;
  /** 今打つ単位の位置。`plan.units.length`なら全単位が済んでいる。 */
  readonly unit: number;
  /** 済んだ単位を打った綴り。 */
  readonly typed: readonly string[];
  /** 済んだ単位までの、ストロークごとの記録。全単位が済めば全ストロークの記録になる。 */
  readonly taps: readonly SentenceTap[];
  /** 今の単位で残っている綴り。先頭に近いほど、今の条件のローマ字規則の綴りに近い。 */
  readonly threads: readonly SentenceThread[];
}

/** 単位`unit`の綴りの候補を、打つキーの列が同じものを除いてスレッドにする。 */
function startUnit(
  plan: SentencePlan,
  typed: readonly string[],
  taps: readonly SentenceTap[],
  unit: number,
  reading: ComboReading | undefined,
): readonly SentenceThread[] {
  const seen = new Set<string>();
  const threads: SentenceThread[] = [];
  for (const spelling of plan.units[unit].spellings) {
    const steps = plan.candidateSteps(typed, unit, spelling);
    if (steps === undefined || steps.length === 0) continue;
    const signature = JSON.stringify(steps.map((step) => [step.keys, step.outputChars]));
    if (seen.has(signature)) continue;
    seen.add(signature);
    threads.push({ spelling, run: startStepRun(steps, taps, reading) });
  }
  return threads;
}

export function startSentenceRun(plan: SentencePlan): SentenceRun {
  return { plan, unit: 0, typed: [], taps: [], threads: startUnit(plan, [], [], 0, undefined) };
}

export function sentenceRunFinished(run: SentenceRun): boolean {
  return run.unit >= run.plan.units.length;
}

/** 画面で次に打つキーを示す綴り。残っている綴りのうち、打ち終えていない先頭のもの。 */
function shownThread(run: SentenceRun): SentenceThread | undefined {
  return run.threads.find((thread) => !stepRunFinished(thread.run)) ?? run.threads[0];
}

/**
 * 今のステップでまだ押していないキーのid。画面の「次に打つキー」に使う。
 * 出力の文字で打っている間も、押すキーを示したまま変えない。
 */
export function remainingSentenceKeys(run: SentenceRun): readonly string[] {
  const shown = shownThread(run);
  return shown === undefined ? [] : remainingStepKeys(shown.run);
}

/** 今のステップの後に打つキーの列。画面の「この後:」に使う。後の単位は先頭の綴りで数える。 */
export function upcomingSentenceSteps(run: SentenceRun, count: number): readonly SentenceStep[] {
  const shown = shownThread(run);
  if (shown === undefined) return [];
  const steps = [...shown.run.steps.slice(shown.run.index + 1)];
  for (let unit = run.unit + 1; unit < run.plan.baseSteps.length && steps.length < count; unit++) {
    steps.push(...run.plan.baseSteps[unit]);
  }
  return steps.slice(0, count);
}

/** 残りのストロークの数。画面の「あと何打」に使う。後の単位は先頭の綴りで数える。 */
export function remainingSentenceStrokes(run: SentenceRun): number {
  const shown = shownThread(run);
  if (shown === undefined) return 0;
  let count = shown.run.steps.length - shown.run.index;
  for (let unit = run.unit + 1; unit < run.plan.baseSteps.length; unit++) count += run.plan.baseSteps[unit].length;
  return count;
}

/** 単位を`thread`の綴りで確定して、次の単位へ進める。 */
function commitUnit(run: SentenceRun, thread: SentenceThread, reading: ComboReading | undefined = thread.run.reading): SentenceRun {
  const typed = [...run.typed, thread.spelling];
  const taps = thread.run.taps;
  const unit = run.unit + 1;
  return {
    plan: run.plan,
    unit,
    typed,
    taps,
    threads: unit >= run.plan.units.length ? [] : startUnit(run.plan, typed, taps, unit, reading),
  };
}

/**
 * 打鍵1つを進行に反映する。
 *
 * 残っている綴りのうち、押下の列が一致し続けるものだけを残す。どの綴りにも続かない押下は違うキーで、残っている綴り全部の
 * 今のステップの間隔を数えない印を付ける。打ち終えた綴りがあっても、より長い綴りが途中で一致している間は確定せず、
 * 次の押下が長い綴りに続かなければ、打ち終えた綴りで確定して、その押下を次の単位の最初の押下として扱う。
 * 最後の単位は、綴りを打ち終えた時点で確定する（`spec/playback-timing.md` §6.4）。
 */
export function pressSentenceKey(
  run: SentenceRun,
  event: SentenceKeyEvent,
  atMs: number,
  keyLabel: (keyId: string) => string,
): { readonly run: SentenceRun; readonly outcome: SentencePressOutcome } {
  if (sentenceRunFinished(run)) return { run, outcome: { kind: 'ignored' } };

  const open = run.threads.filter((thread) => !stepRunFinished(thread.run));
  const held = run.threads.filter((thread) => stepRunFinished(thread.run));
  const final = run.unit === run.plan.units.length - 1;
  if (open.length === 0 && held.length === 0) return { run, outcome: { kind: 'ignored' } };
  const results = open.map((thread) => ({ thread, ...pressStep(thread.run, event, atMs, keyLabel, final) }));
  const matched = results.flatMap((result) =>
    result.outcome.kind === 'wrong-key' || result.outcome.kind === 'overflow' ? [] : [{ ...result, outcome: result.outcome }]);

  if (matched.length === 0) {
    // 押下の途中だった綴りが、この押下で確定して綴りを打ち終えることもある。
    const finished = [...held, ...results.filter((result) => result.outcome.kind === 'overflow').map(({ thread, run: stepRun }) => ({ spelling: thread.spelling, run: stepRun }))];
    if (finished.length > 0) {
      // 打ち終えた綴りで確定し、この押下を次の単位の最初の押下にする。
      const pending = finished[0].run.pendingReading;
      if (pending !== undefined) {
        // 決めた読み方は、この押下が次の単位に受け付けられた時だけ使う。
        const trial = pressSentenceKey(commitUnit(run, finished[0], pending), event, atMs, keyLabel);
        if (trial.outcome.kind !== 'wrong-key') return trial;
      }
      return pressSentenceKey(commitUnit(run, finished[0]), event, atMs, keyLabel);
    }
    const first = results[0].outcome;
    return {
      run: { ...run, threads: results.map(({ thread, run: stepRun }) => ({ spelling: thread.spelling, run: stepRun })) },
      outcome: first.kind === 'wrong-key' ? first : { kind: 'ignored' },
    };
  }

  const advanced = matched.filter((result) => result.outcome.kind !== 'ignored');
  if (advanced.length === 0) return { run, outcome: { kind: 'ignored' } };

  const threads = advanced.map(({ thread, run: stepRun }) => ({ spelling: thread.spelling, run: stepRun }));
  const complete = threads.filter((thread) => stepRunFinished(thread.run));
  if (complete.length > 0 && (complete.length === threads.length || final)) {
    const next = commitUnit(run, complete[0]);
    return { run: next, outcome: { kind: sentenceRunFinished(next) ? 'run-finished' : 'step-finished' } };
  }
  const stepFinished = advanced.some((result) => result.outcome.kind === 'step-finished');
  return { run: { ...run, threads }, outcome: { kind: stepFinished ? 'step-finished' : 'partial' } };
}
