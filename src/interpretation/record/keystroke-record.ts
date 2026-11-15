import { defineAssetCodec, isRecord, UNSAFE_OBJECT_KEYS, type AssetCodec, type CodecDiagnostic } from '#input/codec/index.ts';
import { droppedDuplicateId, droppedNotArray } from '#input/codec/diagnostic-text.ts';
import type { MetricConditions } from '../metrics.ts';
import type { SentenceTap } from '../timing/sentence-measurement.ts';

/**
 * 打鍵の記録（`spec/keystroke-record.md`）。評価に渡したテキストの範囲を打った時の、ストロークごとの時刻と、
 * 再現の条件を持つ。記録は打った綴りと条件から同じ打鍵の列を作り直せる形で、記録を読む側（打鍵の間隔を図に出す画面）が
 * 今の条件で作った打鍵の列との食い違いを判定する材料も持つ。
 */

/** 打鍵の列とその構造を決める条件の実効値。`Metrics`の条件のうち、評価に渡す本文を作る読みの変換（本文の照合値が受け持つ）を除いたもの。 */
export type RecordConditions = Omit<MetricConditions, 'reading'>;

export interface RecordTarget {
  readonly kind: 'layout' | 'setup';
  readonly id: string;
}

/** 記録したテキストの識別と、評価に渡した本文（前処理の後）の照合値。 */
export interface RecordText {
  /** 選んだテキストの識別（`builtin:<id>`・`user:<id>`）。 */
  readonly identity: string;
  /** 記録した時のテキストの名前。一覧の表示に使う。 */
  readonly name: string;
  /** 評価に渡した本文の字数。 */
  readonly chars: number;
  /** 評価に渡した本文全体の照合値（`textDigest`）。 */
  readonly digest: string;
}

/** 打った範囲。評価に渡した本文の文字位置の半開区間 `[start, end)` と、その範囲の本文の照合値。 */
export interface RecordRange {
  readonly start: number;
  readonly end: number;
  readonly digest: string;
}

export interface KeystrokeRecord {
  readonly id: string;
  /** 記録した日時（ISO 8601、UTC）。 */
  readonly recordedAt: string;
  readonly appVersion: string;
  readonly modelVersion: number;
  readonly target: RecordTarget;
  /** 記録した時の対象の表示名。一覧の表示に使う。 */
  readonly targetName: string;
  readonly shapeId: string;
  readonly fingerAssignmentId: string;
  readonly conditions: RecordConditions;
  readonly text: RecordText;
  readonly range: RecordRange;
  /**
   * 範囲のかなごとに打った綴り（ローマ字の配列で、綴りを選べる範囲だけ）。無ければ、条件の規則の打ち方の打鍵の列を打った。
   */
  readonly typed?: readonly string[];
  /** ストロークごとの、属する入力の選択の文字位置 `e`（`interpretation/selection-ends.ts`）。`taps`と同じ並び。 */
  readonly ends: readonly number[];
  /** ストロークごとの記録。`atMs`は最初のストロークの時刻を0とした相対の時刻[ms]。 */
  readonly taps: readonly SentenceTap[];
}

/** 本文の照合値。同じ文字列から同じ値が出る非暗号のハッシュ（FNV-1aの32ビットを2系統）。改ざん検知には使わない。 */
export function textDigest(text: string): string {
  let a = 0x811c9dc5;
  let b = 0x9e3779b1;
  for (let index = 0; index < text.length; index++) {
    const unit = text.charCodeAt(index);
    a = Math.imul(a ^ unit, 0x01000193);
    b = Math.imul(b ^ unit, 0x85ebca6b);
    b ^= b >>> 13;
  }
  return `${(a >>> 0).toString(16).padStart(8, '0')}${(b >>> 0).toString(16).padStart(8, '0')}`;
}

/** 記録に残す時刻の分解能。1ミリ秒を10に分け、0.1ミリ秒に丸める。 */
export const RECORD_TIME_STEPS_PER_MS = 10;

/** 1件の記録に入れられるストロークの上限。読み込む記録の大きさを抑える。 */
export const RECORD_MAX_STROKES = 100_000;

/** 1つの記録のかなごとの綴りの上限の長さ。 */
const MAX_SPELLING_LENGTH = 16;

// ---------------------------------------------------------------------------
// 条件のスナップショット
// ---------------------------------------------------------------------------

function isJsonValue(value: unknown, depth: number): boolean {
  if (depth > 6) return false;
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every((item) => isJsonValue(item, depth + 1));
  if (isRecord(value)) return Object.entries(value).every(([key, item]) => !UNSAFE_OBJECT_KEYS.has(key) && isJsonValue(item, depth + 1));
  return false;
}

function jsonObject(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) && isJsonValue(value, 0) ? (JSON.parse(JSON.stringify(value)) as Record<string, unknown>) : undefined;
}

function decodeComboSetConditions(raw: unknown): MetricConditions['comboSet'] | null {
  if (!isRecord(raw)) return null;
  const { name, romajiRuleId, combos, dropped } = raw;
  if (typeof name !== 'string' || typeof romajiRuleId !== 'string' || !Array.isArray(combos) || typeof dropped !== 'number') return null;
  const copied: { keys: readonly string[]; output: string }[] = [];
  for (const combo of combos) {
    if (!isRecord(combo) || typeof combo.output !== 'string' || !Array.isArray(combo.keys) || !combo.keys.every((key) => typeof key === 'string'))
      return null;
    copied.push({ keys: [...(combo.keys as string[])], output: combo.output });
  }
  return { name, romajiRuleId, combos: copied, dropped };
}

/** 条件のスナップショットを読む。形が合わなければ`undefined`。 */
function decodeRecordConditions(raw: unknown): RecordConditions | undefined {
  if (!isRecord(raw)) return undefined;
  const chain = jsonObject(raw.chainInterpretation);
  const arpeggio = jsonObject(raw.arpeggioInterpretation);
  const trigger = jsonObject(raw.triggerRealizationPolicy);
  const action = jsonObject(raw.actionRealizationPolicy);
  if (
    typeof raw.windowSize !== 'number' ||
    !Number.isFinite(raw.windowSize) ||
    typeof raw.sfbHomeCost !== 'boolean' ||
    (raw.centerShiftThumb !== 'right' && raw.centerShiftThumb !== 'left' && raw.centerShiftThumb !== 'opposite') ||
    (raw.spaceThumb !== 'right' && raw.spaceThumb !== 'left') ||
    chain === undefined ||
    arpeggio === undefined ||
    trigger === undefined ||
    action === undefined ||
    (raw.romajiRuleId !== null && typeof raw.romajiRuleId !== 'string') ||
    typeof raw.keepSymbols !== 'boolean' ||
    typeof raw.keepAlphanumerics !== 'boolean'
  ) {
    return undefined;
  }
  const comboSet = raw.comboSet === undefined ? undefined : decodeComboSetConditions(raw.comboSet);
  if (comboSet === null) return undefined;
  return {
    windowSize: raw.windowSize,
    sfbHomeCost: raw.sfbHomeCost,
    centerShiftThumb: raw.centerShiftThumb,
    spaceThumb: raw.spaceThumb,
    chainInterpretation: chain as unknown as RecordConditions['chainInterpretation'],
    arpeggioInterpretation: arpeggio as unknown as RecordConditions['arpeggioInterpretation'],
    triggerRealizationPolicy: trigger as unknown as RecordConditions['triggerRealizationPolicy'],
    actionRealizationPolicy: action as unknown as RecordConditions['actionRealizationPolicy'],
    romajiRuleId: raw.romajiRuleId,
    keepSymbols: raw.keepSymbols,
    keepAlphanumerics: raw.keepAlphanumerics,
    ...(comboSet === undefined ? {} : { comboSet }),
  };
}

function encodeRecordConditions(conditions: RecordConditions): Record<string, unknown> {
  return JSON.parse(JSON.stringify(conditions)) as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// 1件の記録
// ---------------------------------------------------------------------------

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function isIndexList(value: unknown, length: number): value is number[] {
  if (!Array.isArray(value)) return false;
  let previous = -1;
  for (const item of value) {
    if (!isCount(item) || item >= length || item <= previous) return false;
    previous = item;
  }
  return true;
}

function decodeRecord(raw: unknown): KeystrokeRecord | undefined {
  if (!isRecord(raw)) return undefined;
  const { id, recordedAt, appVersion, modelVersion, target, targetName, shapeId, fingerAssignmentId, text, range } = raw;
  if (
    !nonEmptyString(id) ||
    !nonEmptyString(recordedAt) ||
    !Number.isFinite(Date.parse(recordedAt)) ||
    typeof appVersion !== 'string' ||
    !isCount(modelVersion) ||
    !isRecord(target) ||
    (target.kind !== 'layout' && target.kind !== 'setup') ||
    !nonEmptyString(target.id) ||
    typeof targetName !== 'string' ||
    !nonEmptyString(shapeId) ||
    !nonEmptyString(fingerAssignmentId) ||
    !isRecord(text) ||
    !nonEmptyString(text.identity) ||
    typeof text.name !== 'string' ||
    !isCount(text.chars) ||
    !nonEmptyString(text.digest) ||
    !isRecord(range) ||
    !isCount(range.start) ||
    !isCount(range.end) ||
    range.start >= range.end ||
    range.end > text.chars ||
    !nonEmptyString(range.digest)
  ) {
    return undefined;
  }
  const conditions = decodeRecordConditions(raw.conditions);
  if (conditions === undefined) return undefined;

  const { gaps, deltas, unclean, outputCompleted, typed } = raw;
  if (!Array.isArray(gaps) || !Array.isArray(deltas) || gaps.length === 0 || gaps.length > RECORD_MAX_STROKES || deltas.length !== gaps.length)
    return undefined;
  const count = gaps.length;
  if (!isIndexList(unclean ?? [], count) || !isIndexList(outputCompleted ?? [], count)) return undefined;
  const uncleanSet = new Set(unclean as number[] | undefined);
  const completedSet = new Set(outputCompleted as number[] | undefined);

  const taps: SentenceTap[] = [];
  const ends: number[] = [];
  let steps = 0;
  let end = range.start;
  for (let index = 0; index < count; index++) {
    const gap = gaps[index];
    const delta = deltas[index];
    if (!Number.isSafeInteger(gap) || (gap as number) < 0 || !Number.isInteger(delta)) return undefined;
    steps += gap as number;
    end += delta as number;
    if (end < range.start || end >= range.end) return undefined;
    ends.push(end);
    taps.push({ atMs: steps / RECORD_TIME_STEPS_PER_MS, clean: !uncleanSet.has(index), ...(completedSet.has(index) ? { outputCompleted: true } : {}) });
  }
  if (gaps[0] !== 0) return undefined;

  let typedSpellings: string[] | undefined;
  if (typed !== undefined) {
    if (!Array.isArray(typed) || typed.length === 0 || typed.length > count) return undefined;
    if (!typed.every((spelling) => typeof spelling === 'string' && spelling.length > 0 && spelling.length <= MAX_SPELLING_LENGTH)) return undefined;
    typedSpellings = [...(typed as string[])];
  }

  return {
    id,
    recordedAt,
    appVersion,
    modelVersion,
    target: { kind: target.kind, id: target.id },
    targetName,
    shapeId,
    fingerAssignmentId,
    conditions,
    text: { identity: text.identity, name: text.name, chars: text.chars, digest: text.digest },
    range: { start: range.start, end: range.end, digest: range.digest },
    ...(typedSpellings === undefined ? {} : { typed: typedSpellings }),
    ends,
    taps,
  };
}

function encodeRecord(record: KeystrokeRecord): Record<string, unknown> {
  let previousEnd = record.range.start;
  const deltas = record.ends.map((end) => {
    const delta = end - previousEnd;
    previousEnd = end;
    return delta;
  });
  let previousSteps = 0;
  const gaps = record.taps.map((tap) => {
    const steps = Math.round(tap.atMs * RECORD_TIME_STEPS_PER_MS);
    const gap = steps - previousSteps;
    previousSteps = steps;
    return gap;
  });
  const unclean = record.taps.flatMap((tap, index) => (tap.clean ? [] : [index]));
  const outputCompleted = record.taps.flatMap((tap, index) => (tap.outputCompleted === true ? [index] : []));
  return {
    id: record.id,
    recordedAt: record.recordedAt,
    appVersion: record.appVersion,
    modelVersion: record.modelVersion,
    target: { kind: record.target.kind, id: record.target.id },
    targetName: record.targetName,
    shapeId: record.shapeId,
    fingerAssignmentId: record.fingerAssignmentId,
    conditions: encodeRecordConditions(record.conditions),
    text: { ...record.text },
    range: { ...record.range },
    ...(record.typed === undefined ? {} : { typed: [...record.typed] }),
    gaps,
    deltas,
    ...(unclean.length === 0 ? {} : { unclean }),
    ...(outputCompleted.length === 0 ? {} : { outputCompleted }),
  };
}

export function decodeKeystrokeRecords(raw: unknown, path: string, diagnostics: CodecDiagnostic[]): KeystrokeRecord[] {
  if (!Array.isArray(raw)) {
    if (raw !== undefined) diagnostics.push({ path, message: droppedNotArray('打鍵の記録') });
    return [];
  }
  const seen = new Set<string>();
  const records: KeystrokeRecord[] = [];
  raw.forEach((candidate: unknown, index) => {
    const where = `${path}[${index}]`;
    const record = decodeRecord(candidate);
    if (record === undefined) {
      diagnostics.push({ path: where, message: '形式が不正なため打鍵の記録を捨てました' });
      return;
    }
    if (seen.has(record.id)) {
      diagnostics.push({ path: where, message: droppedDuplicateId(record.id) });
      return;
    }
    seen.add(record.id);
    records.push(record);
  });
  return records;
}

export function encodeKeystrokeRecords(records: readonly KeystrokeRecord[]): readonly Record<string, unknown>[] {
  return records.map(encodeRecord);
}

/** 打鍵の記録の手持ちのcodec（版1）。 */
export const KEYSTROKE_RECORDS_CODEC: AssetCodec<readonly KeystrokeRecord[]> = defineAssetCodec({
  currentVersion: 1,
  decodePayload: (payload, diagnostics) => (isRecord(payload) ? decodeKeystrokeRecords(payload.records, 'records', diagnostics) : undefined),
  encodePayload: (value) => ({ records: encodeKeystrokeRecords(value) }),
});
