import { adjoinsPunctuation } from '#interpretation/timing/sentence-measurement.ts';
import { textDigest, type KeystrokeRecord } from '#interpretation/record/keystroke-record.ts';
import {
  differingConditionKeys,
  scalarRecordMismatches,
  type RecordCheck,
  type RecordCurrentFacts,
  type RecordMismatchItem,
  type RecordStrokeFact,
} from '#interpretation/record/keystroke-gaps.ts';
import { strokeEndsOf } from '#interpretation/selection-ends.ts';
import type { Trace } from '#trace/generate.ts';
import { MODEL_VERSION } from './model-version.ts';
import { rangeStrokesOf, recordConditionsOf, recordPlanOf, recordRangeStatuses, stepSignature } from './keystroke-record.ts';
import type { ResolvedInput } from './resolved-input.ts';

/**
 * 打鍵の記録を、記録の対象の今の入力と照らす（`spec/keystroke-record.md` §4.1）。
 * 打鍵の列は、全文の打鍵の列（`trace`）と記録の`typed`から作り直す。食い違いが無ければ、間隔の集計に使うストロークの事実を返す。
 */

function plain(conditions: unknown): Record<string, unknown> {
  return JSON.parse(JSON.stringify(conditions)) as Record<string, unknown>;
}

export function checkKeystrokeRecord(input: ResolvedInput, trace: Trace, record: KeystrokeRecord): RecordCheck {
  const chars = [...input.text];
  const current: RecordCurrentFacts = {
    shapeId: input.geometry.id,
    fingerAssignmentId: input.cascade.fingerAssignmentId.value,
    conditions: plain(recordConditionsOf(input)),
    modelVersion: MODEL_VERSION,
    textDigest: textDigest(input.text),
    rangeDigestOf: (start, end) => (end > chars.length || start >= end ? undefined : textDigest(chars.slice(start, end).join(''))),
  };
  const mismatches: RecordMismatchItem[] = scalarRecordMismatches(record, current);
  if (mismatches.length > 0) {
    return {
      mismatches,
      ...(mismatches.includes('conditions') ? { differingConditions: differingConditionKeys(plain(record.conditions), current.conditions) } : {}),
    };
  }

  const keysMismatch: RecordCheck = { mismatches: ['keys'] };
  const rangeIndex = recordRangeStatuses(input, trace).findIndex((range) => range.start === record.range.start && range.end === record.range.end);
  if (rangeIndex === -1) return keysMismatch;
  const planned = recordPlanOf(input, trace, rangeIndex);
  if (!planned.ok) return keysMismatch;
  // 綴りを持つ記録は、今も綴りを受け付ける範囲でなければ作り直せない。持たない記録は、条件の規則の綴りで打った。
  if (record.typed !== undefined && planned.rebuild === undefined) return keysMismatch;
  const typed = record.typed ?? planned.rebuild?.base ?? [];
  const built = rangeStrokesOf(input, trace, rangeIndex, planned.range, planned.rebuild, typed);
  if (!built.ok) return keysMismatch;
  const { strokes } = built;
  if (strokes.length !== record.taps.length) return keysMismatch;
  const ends = strokeEndsOf(strokes, built.inputChars);
  if (ends.some((end, index) => end !== record.ends[index])) return keysMismatch;
  if (textDigest(stepSignature(strokes)) !== record.range.keysDigest) return keysMismatch;

  const facts: RecordStrokeFact[] = strokes.map((stroke, index) => ({
    end: ends[index]!,
    kanaStart: stroke.kanaStart,
    kanaEnd: stroke.kanaEnd,
    adjoinsPunctuation: adjoinsPunctuation(strokes, index),
  }));
  return { mismatches: [], facts };
}
