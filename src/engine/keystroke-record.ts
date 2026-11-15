import type { SentenceSpellingSource, SentenceTap } from '#interpretation/timing/sentence-measurement.ts';
import { sentenceSteps, sentenceUnmeasurable, strokesSentencePlan, type SentencePlan } from '#interpretation/timing/sentence-session.ts';
import { RECORD_TIME_STEPS_PER_MS, textDigest, type KeystrokeRecord, type RecordConditions } from '#interpretation/record/keystroke-record.ts';
import { strokeEndsOf } from '#interpretation/selection-ends.ts';
import { hasRomajiOnlyCombos } from '#input/layouts/types.ts';
import { romajiSpellingUnits, type SpellingUnit } from '#input/romaji/spelling-variants.ts';
import type { RomajiChunk } from '#input/romaji/kunrei.ts';
import type { AnalysisTarget } from '#input/setup/index.ts';
import { sentenceEnds as sentenceEndsOf, textRangeBounds } from '#input/text/display-ranges.ts';
import type { Stroke, Trace } from '#trace/generate.ts';
import { MODEL_VERSION } from './model-version.ts';
import { generateEngineTrace, metricConditionsOf } from './pipeline.ts';
import type { ResolvedInput } from './resolved-input.ts';

/**
 * 打鍵の記録を取る側の計算（`spec/keystroke-record.md`）。評価に渡す全文の打鍵の列（Run Chartと同じ解決の経路）から、
 * 範囲ごとの打てるか・打つ計画・打ち終えた記録の組み立てを求める。時刻とキー入力は呼び出し側が渡すので、描画にもタイマーにも依存しない。
 */

/** 範囲を打てない理由。 */
export type RecordUnmeasurable =
  /** 配列の定義に不備があり、打鍵の列を作れない。 */
  | 'layout-errors'
  /** 範囲に、配列で打てずに飛ばした文字がある。 */
  | 'skipped'
  /** 範囲に打つストロークが無い。 */
  | 'empty'
  /** 範囲の境目をまたぐ入力の選択・入力単位があり、範囲のストロークを切り出せない。 */
  | 'split-selection'
  /** 打つのに取れないキー（修飾キー・名前を持たない追加のキーなど）が要る。 */
  | 'uncapturable-key';

/** 評価に渡す全文を約1000字ごとに分けた範囲の1つ。 */
export interface RecordRangeStatus {
  /** 範囲の文字位置の半開区間`[start, end)`。 */
  readonly start: number;
  readonly end: number;
  /** 範囲に入る最初のストロークの位置と、ストロークの数。打てない範囲では無い。 */
  readonly firstStroke?: number;
  readonly strokeCount?: number;
  /** 打てない理由。打てる範囲では無い。 */
  readonly unmeasurable?: RecordUnmeasurable;
}

/** 打たない文字。改行・空白は、打鍵の列から飛ばされても、打てない文字には数えない。 */
const BLANK = /^\s$/u;

/** `text`の`[start, end)`にある、打てない文字（打鍵の列から飛ばされた、空白類でない文字）の位置。 */
function unplayablePositions(skippedPositions: readonly number[], chars: readonly string[], start: number, end: number): number[] {
  return skippedPositions.filter((position) => position >= start && position < end && !BLANK.test(chars[position] ?? ''));
}

/** 打てる打鍵の列か。配列定義の不備・範囲`[start, end)`の打てない文字・空の列は打てない。 */
function playable(
  trace: {
    readonly errors: readonly string[];
    readonly skippedPositions: readonly number[];
    readonly strokes: readonly unknown[];
  },
  text: string,
  start: number,
  end: number,
): boolean {
  return trace.errors.length === 0 && unplayablePositions(trace.skippedPositions, [...text], start, end).length === 0 && trace.strokes.length > 0;
}

/** 全文の打鍵の列を作る。長いテキストでは重い（約30万字で数秒）。 */
export function recordBaseTrace(input: ResolvedInput): Trace {
  return generateEngineTrace(input).trace;
}

/**
 * 範囲ごとの状態。ストロークの属する範囲は、属する入力の選択の文字位置`e`（`selectionEndsOf`）で決める。
 * 範囲のストロークは全文の打鍵の列の連続した部分でなければならず、範囲の端で入力単位を分けてもいけない。
 */
export function recordRangeStatuses(input: ResolvedInput, trace: Trace): RecordRangeStatus[] {
  const bounds = textRangeBounds(input.text);
  const textChars = [...input.text];
  const ends = strokeEndsOf(trace.strokes, trace.inputChars);
  const first = new Array<number>(bounds.length - 1).fill(-1);
  const last = new Array<number>(bounds.length - 1).fill(-1);
  const counts = new Array<number>(bounds.length - 1).fill(0);
  let range = 0;
  for (let index = 0; index < ends.length; index++) {
    const end = ends[index]!;
    while (range > 0 && end < bounds[range]!) range--;
    while (range < bounds.length - 2 && end >= bounds[range + 1]!) range++;
    if (first[range] === -1) first[range] = index;
    last[range] = index;
    counts[range]!++;
  }
  return bounds.slice(0, -1).map((start, rangeIndex): RecordRangeStatus => {
    const end = bounds[rangeIndex + 1]!;
    if (trace.errors.length > 0) return { start, end, unmeasurable: 'layout-errors' };
    if (unplayablePositions(trace.skippedPositions, textChars, start, end).length > 0) return { start, end, unmeasurable: 'skipped' };
    const count = counts[rangeIndex]!;
    if (count === 0) return { start, end, unmeasurable: 'empty' };
    const from = first[rangeIndex]!;
    const to = last[rangeIndex]!;
    const strokes = trace.strokes;
    if (
      to - from + 1 !== count ||
      strokes[from - 1]?.inputIndex === strokes[from]!.inputIndex ||
      strokes[to + 1]?.inputIndex === strokes[to]!.inputIndex
    ) {
      return { start, end, unmeasurable: 'split-selection' };
    }
    if (sentenceUnmeasurable(sentenceSteps({ strokes: strokes.slice(from, to + 1) })) !== undefined)
      return { start, end, unmeasurable: 'uncapturable-key' };
    return { start, end, firstStroke: from, strokeCount: count };
  });
}

// ---------------------------------------------------------------------------
// 打つ計画
// ---------------------------------------------------------------------------

/** ローマ字の配列で、かなごとの綴りを選べる全文の単位。 */
interface SpellingContext {
  readonly table: ReadonlyMap<string, string>;
  readonly units: readonly SpellingUnit[];
  /** 単位ごとの、評価に渡した本文での開始位置。 */
  readonly starts: readonly number[];
}

function spellingContextOf(input: ResolvedInput, inputChars: number): SpellingContext | undefined {
  const table = input.layout.romajiTable;
  if (table === undefined || hasRomajiOnlyCombos(input.layout)) return undefined;
  const units = romajiSpellingUnits(input.text, table);
  if (units === undefined) return undefined;
  const starts: number[] = [];
  let at = 0;
  for (const unit of units) {
    starts.push(at);
    at += [...unit.kana].length;
  }
  return at === inputChars ? { table, units, starts } : undefined;
}

/** 打つ時に綴りを作り直す単位（文の長さの窓）の最大の字数。 */
const WINDOW_MAX_CHARS = 100;

/** 範囲の中の、作り直しの窓。かなの単位の位置（全文の通し番号）と、本文の文字位置の半開区間。 */
interface RebuildWindow {
  readonly from: number;
  readonly to: number;
}

/**
 * 範囲を、文の終わりか`WINDOW_MAX_CHARS`字ごとに、かなの単位の境目で窓に分ける。
 * 綴りを変えた時に作り直すのは、変えた単位を含む窓だけにする。範囲全体を作り直すと、約1000字の範囲でも
 * かなごとに数十ミリ秒かかり、打鍵に追いつけない。
 */
function rebuildWindows(context: SpellingContext, span: { readonly from: number; readonly to: number }, ends: ReadonlySet<number>): RebuildWindow[] {
  const windows: RebuildWindow[] = [];
  let from = span.from;
  for (let unit = span.from + 1; unit < span.to; unit++) {
    const at = context.starts[unit]!;
    if (ends.has(at) || at - context.starts[from]! >= WINDOW_MAX_CHARS) {
      windows.push({ from, to: unit });
      from = unit;
    }
  }
  windows.push({ from, to: span.to });
  return windows;
}

/** 窓の本文だけでTraceを作った打鍵の列。`spellings`は窓のかなの単位ごとの綴り。 */
function windowStrokes(
  input: ResolvedInput,
  context: SpellingContext,
  piece: RebuildWindow,
  spellings: readonly string[],
): readonly Stroke[] | undefined {
  const chars = [...input.text];
  const start = context.starts[piece.from]!;
  const end = piece.to >= context.units.length ? chars.length : context.starts[piece.to]!;
  const text = chars.slice(start, end).join('');
  const comboBarriers = input.comboBarriers.filter((barrier) => barrier > start && barrier < end).map((barrier) => barrier - start);
  const chunks: RomajiChunk[] = context.units.slice(piece.from, piece.to).map((unit, index) => ({
    kana: unit.kana,
    roman: spellings[index]!,
    fromTable: context.table.has(unit.kana),
  }));
  try {
    const { trace } = generateEngineTrace({ ...input, text, comboBarriers }, chunks);
    return playable(trace, text, 0, [...text].length) ? trace.strokes : undefined;
  } catch {
    return undefined;
  }
}

/** 別々に作った窓の打鍵の列をつなぐ時に、入力単位と選択の番号が他の窓と重ならないよう、窓ごとに番号をずらす。 */
const WINDOW_INDEX_SHIFT = 1_000_000_000;
const WINDOW_INDEX_STEP = 10_000_000;

function shiftedStrokes(strokes: readonly Stroke[], windowIndex: number): readonly Stroke[] {
  const shift = WINDOW_INDEX_SHIFT + windowIndex * WINDOW_INDEX_STEP;
  return strokes.map((stroke) => ({ ...stroke, inputIndex: stroke.inputIndex + shift, selectionIndex: stroke.selectionIndex + shift }));
}

/** 範囲`[start, end)`のかなの単位。範囲の端が単位の境目に合わなければ無い。 */
function unitSpan(context: SpellingContext, start: number, end: number, inputChars: number): { readonly from: number; readonly to: number } | undefined {
  const from = context.starts.indexOf(start);
  if (from === -1) return undefined;
  const to = end >= inputChars ? context.units.length : context.starts.indexOf(end);
  return to === -1 || to <= from ? undefined : { from, to };
}

/** 綴りを受け付ける範囲が持つ、打った綴りから範囲の打鍵の列を作り直す関数。 */
export interface SpellingRebuild {
  readonly context: SpellingContext;
  readonly span: { readonly from: number; readonly to: number };
  /** 範囲の中で打つ単位（改行・空白の単位を除く）の、全文の通し番号。 */
  readonly active: readonly number[];
  /** 打つ単位ごとの、条件の規則の綴り。 */
  readonly base: readonly string[];
  /** 打つ単位ごとの綴りから、範囲の全単位（改行・空白を含む）の綴りを作る。 */
  expand(spellings: readonly string[]): string[];
  /** 打つ単位ごとの綴り`spellings`で打つ打鍵の列。作れなければ無い。 */
  strokes(spellings: readonly string[]): readonly Stroke[] | undefined;
}

/** 打った綴りで作った打鍵の列の、打つキーの列の照合値。 */
export function windowedSignatureOf(rebuild: SpellingRebuild, typed: readonly string[]): string | undefined {
  const built = rebuild.strokes(typed);
  return built === undefined ? undefined : stepSignature(built);
}

function spellingRebuildOf(
  input: ResolvedInput,
  context: SpellingContext,
  span: { readonly from: number; readonly to: number },
  baseStrokes: readonly Stroke[],
): SpellingRebuild | undefined {
  // 範囲の打鍵の列が、かなの単位と1対1に対応する時だけ、綴りを作り直せる。
  const groupEnds: number[] = [];
  baseStrokes.forEach((stroke, index) => {
    if (index === 0 || stroke.inputIndex !== baseStrokes[index - 1]!.inputIndex) groupEnds.push(index);
  });
  const active: number[] = [];
  for (let unit = span.from; unit < span.to; unit++) if (!BLANK.test(context.units[unit]!.kana)) active.push(unit);
  if (groupEnds.length !== active.length) return undefined;
  const activeBefore = (unit: number) => active.filter((index) => index < unit).length;
  const sentenceEnds = new Set(sentenceEndsOf(input.text));
  const windows = rebuildWindows(context, span, sentenceEnds);
  // 窓ごとの、条件の規則の綴りで打つ打鍵の列（全文の打鍵の列の部分）。
  const baseParts = windows.map((piece) => {
    const from = activeBefore(piece.from);
    const to = activeBefore(piece.to);
    const first = from < groupEnds.length ? groupEnds[from]! : baseStrokes.length;
    const last = to < groupEnds.length ? groupEnds[to]! : baseStrokes.length;
    return baseStrokes.slice(first, last);
  });
  const fullBase = context.units.slice(span.from, span.to).map((unit) => unit.spellings[0]!);
  const base = active.map((unit) => fullBase[unit - span.from]!);
  const expand = (spellings: readonly string[]) => {
    const full = [...fullBase];
    active.forEach((unit, index) => {
      full[unit - span.from] = spellings[index]!;
    });
    return full;
  };
  const cache = windows.map(() => new Map<string, readonly Stroke[] | undefined>());
  return {
    context,
    span,
    active,
    base,
    expand,
    strokes(typedSpellings) {
      if (typedSpellings.length !== base.length) return undefined;
      const spellings = expand(typedSpellings);
      const parts: (readonly Stroke[])[] = [];
      for (const [index, piece] of windows.entries()) {
        const mine = spellings.slice(piece.from - span.from, piece.to - span.from);
        if (mine.every((spelling, offset) => spelling === fullBase[piece.from - span.from + offset])) {
          parts.push(baseParts[index]!);
          continue;
        }
        const key = mine.join('\u0000');
        if (!cache[index]!.has(key)) {
          const built = windowStrokes(input, context, piece, mine);
          cache[index]!.set(key, built === undefined ? undefined : shiftedStrokes(built, index));
        }
        const part = cache[index]!.get(key);
        if (part === undefined) return undefined;
        parts.push(part);
      }
      return parts.flat();
    },
  };
}

export type RecordPlanResult =
  | {
      readonly ok: true;
      readonly plan: SentencePlan;
      readonly range: RecordRangeStatus;
      /** かなごとの綴りを受け付ける計画か。偽なら、条件の規則の打ち方の打鍵の列だけを打つ。 */
      readonly spellings: boolean;
      /** 綴りを受け付ける計画の、打った綴りから範囲の打鍵の列を作り直す関数。 */
      readonly rebuild?: SpellingRebuild;
    }
  | { readonly ok: false; readonly reason: RecordUnmeasurable | 'no-range' };

/**
 * 範囲を打つ計画。打鍵の照合は個人速度の文章を打つ測定と同じ規則（`interpretation/timing/sentence-session.ts`）で、
 * ローマ字の配列では範囲のかなごとに綴りを受け付ける。
 */
export function recordPlanOf(input: ResolvedInput, trace: Trace, rangeIndex: number): RecordPlanResult {
  const range = recordRangeStatuses(input, trace)[rangeIndex];
  if (range === undefined) return { ok: false, reason: 'no-range' };
  if (range.unmeasurable !== undefined) return { ok: false, reason: range.unmeasurable };
  return recordPlanFrom(input, range, trace.strokes.slice(range.firstStroke!, range.firstStroke! + range.strokeCount!), trace.inputChars);
}

/**
 * `recordPlanOf`の本体。全文の打鍵の列のうち範囲のストローク（`strokes`）だけから計画を作る。
 * 全文の打鍵の列は長いテキストで大きいので、持っている側（計算用のWorker）が範囲のストロークだけを渡せるように分けてある。
 * `range`は打てる範囲（`unmeasurable`が無いもの）で、`inputChars`は全文の入力かな数。
 */
export function recordPlanFrom(input: ResolvedInput, range: RecordRangeStatus, strokes: readonly Stroke[], inputChars: number): RecordPlanResult {
  const context = spellingContextOf(input, inputChars);
  const span = context === undefined ? undefined : unitSpan(context, range.start, range.end, inputChars);
  const rebuild = context === undefined || span === undefined ? undefined : spellingRebuildOf(input, context, span, strokes);
  const source: SentenceSpellingSource | undefined =
    rebuild === undefined
      ? undefined
      : {
          units: rebuild.active.map((unit) => rebuild.context.units[unit]!),
          strokes: (spellings) => rebuild.strokes(spellings),
          analyze: () => undefined,
        };
  const plan = strokesSentencePlan(strokes, source, () => undefined);
  const spellings = plan.units[0]?.spellings[0] !== '';
  return { ok: true, plan, range, spellings, ...(spellings && rebuild !== undefined ? { rebuild } : {}) };
}

// ---------------------------------------------------------------------------
// 打ち終えた記録
// ---------------------------------------------------------------------------

export type RecordFailure =
  /** 範囲を作り直した打鍵の列を作れない、または全文の経路で作り直した範囲と、打つ時に使った範囲の打鍵の列が合わない。 */
  | 'rebuild-mismatch'
  /** 作り直した打鍵の列のストロークの数が、記録した打鍵の数と合わない。 */
  | 'count-mismatch'
  | 'no-range';

export interface RecordMeta {
  readonly id: string;
  /** 記録した日時（ISO 8601、UTC）。 */
  readonly recordedAt: string;
  readonly appVersion: string;
  readonly target: AnalysisTarget;
  /** 対象の表示名。 */
  readonly targetName: string;
  /** 選んだテキストの識別と名前。 */
  readonly textIdentity: string;
  readonly textName: string;
}

function stepSignature(strokes: readonly Stroke[]): string {
  return JSON.stringify(sentenceSteps({ strokes }).map((step) => [step.keys, step.outputChars]));
}

/** 条件のスナップショット。`Metrics`の条件から、評価に渡す本文を作る読みの変換を除いたもの。 */
export function recordConditionsOf(input: ResolvedInput): RecordConditions {
  const { reading: _reading, ...conditions } = metricConditionsOf(input);
  return conditions;
}

/**
 * 範囲を打ち終えた結果（打った綴りと、ストロークごとの記録）から、保存する記録を作る。
 * 打った綴りで全文を作り直した打鍵の列を使い、範囲のストロークの数が記録した打鍵の数と合わなければ作らない
 * （`spec/keystroke-record.md`）。全部の単位を条件の規則の綴りで打った時は、全文の打鍵の列をそのまま使う。
 * `taps`の時刻は、最初のストロークを0とした相対の時刻[ms]（0.1ミリ秒刻み）にして持つ。
 */
export function finishKeystrokeRecord(
  input: ResolvedInput,
  trace: Trace,
  rangeIndex: number,
  typed: readonly string[],
  taps: readonly SentenceTap[],
  meta: RecordMeta,
  windowed?: string,
): { readonly ok: true; readonly record: KeystrokeRecord } | { readonly ok: false; readonly reason: RecordFailure } {
  const planned = recordPlanOf(input, trace, rangeIndex);
  if (!planned.ok) return { ok: false, reason: 'no-range' };
  const { range, rebuild } = planned;
  let strokes = trace.strokes.slice(range.firstStroke!, range.firstStroke! + range.strokeCount!);
  let inputChars = trace.inputChars;
  if (rebuild !== undefined) {
    const { context, span, base } = rebuild;
    const onBase = typed.length === base.length && typed.every((spelling, index) => spelling === base[index]);
    if (!onBase) {
      if (typed.length !== base.length) return { ok: false, reason: 'rebuild-mismatch' };
      const all = context.units.map((unit) => unit.spellings[0]!);
      const full = [...all.slice(0, span.from), ...rebuild.expand(typed), ...all.slice(span.to)];
      const chunks: RomajiChunk[] = context.units.map((unit, index) => ({
        kana: unit.kana,
        roman: full[index]!,
        fromTable: context.table.has(unit.kana),
      }));
      let rebuilt: Trace;
      try {
        rebuilt = generateEngineTrace(input, chunks).trace;
      } catch {
        return { ok: false, reason: 'rebuild-mismatch' };
      }
      if (!playable(rebuilt, input.text, range.start, range.end)) return { ok: false, reason: 'rebuild-mismatch' };
      const rebuiltStatus = recordRangeStatuses(input, rebuilt)[rangeIndex];
      if (rebuiltStatus?.firstStroke === undefined) return { ok: false, reason: 'rebuild-mismatch' };
      strokes = rebuilt.strokes.slice(rebuiltStatus.firstStroke, rebuiltStatus.firstStroke + rebuiltStatus.strokeCount!);
      inputChars = rebuilt.inputChars;
      // 打つ時に使った窓ごとの作り直しと、全文の経路で作り直した範囲が、同じ打つキーの列でなければならない。
      if (windowed === undefined || windowed !== stepSignature(strokes)) return { ok: false, reason: 'rebuild-mismatch' };
    }
  }
  if (strokes.length !== taps.length) return { ok: false, reason: 'count-mismatch' };
  const origin = taps[0]!.atMs;
  const normalized: SentenceTap[] = taps.map((tap) => ({
    atMs: Math.round((tap.atMs - origin) * RECORD_TIME_STEPS_PER_MS) / RECORD_TIME_STEPS_PER_MS,
    clean: tap.clean,
    ...(tap.outputCompleted === true ? { outputCompleted: true } : {}),
  }));
  const chars = [...input.text];
  const record: KeystrokeRecord = {
    id: meta.id,
    recordedAt: meta.recordedAt,
    appVersion: meta.appVersion,
    modelVersion: MODEL_VERSION,
    target: meta.target.kind === 'layout' ? { kind: 'layout', id: meta.target.layoutId } : { kind: 'setup', id: meta.target.setupId },
    targetName: meta.targetName,
    shapeId: input.geometry.id,
    fingerAssignmentId: input.cascade.fingerAssignmentId.value,
    conditions: recordConditionsOf(input),
    text: { identity: meta.textIdentity, name: meta.textName, chars: chars.length, digest: textDigest(input.text) },
    range: {
      start: range.start,
      end: range.end,
      digest: textDigest(chars.slice(range.start, range.end).join('')),
      keysDigest: textDigest(stepSignature(strokes)),
    },
    ...(rebuild === undefined ? {} : { typed: [...typed] }),
    ends: strokeEndsOf(strokes, inputChars),
    taps: normalized,
  };
  return { ok: true, record };
}
