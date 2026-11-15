import { finishKeystrokeRecord, recordBaseTrace, recordRangeStatuses, type RecordRangeStatus } from '#engine/keystroke-record.ts';
import { traceKeyOf } from '#engine/keys.ts';
import type { Trace } from '#trace/generate.ts';
import type { RecordFinishValue, RecordRangesValue, RecordRangeValue, RecordWorkerRequest, RecordWorkerResponse } from './record-worker-protocol.ts';

/**
 * 打鍵の記録の計算の入口（Workerの中でも、Workerが無い環境でも同じものを使う）。
 * 全文の打鍵の列と範囲ごとの状態は、直近の1つの入力ぶんだけ覚える。
 */
export function createRecordHandler(): (request: RecordWorkerRequest) => RecordWorkerResponse {
  let remembered: { readonly key: string; readonly trace: Trace; readonly statuses: readonly RecordRangeStatus[] } | undefined;

  const basisOf = (input: Parameters<typeof recordBaseTrace>[0]) => {
    const key = traceKeyOf(input);
    if (remembered?.key !== key) {
      const trace = recordBaseTrace(input);
      remembered = { key, trace, statuses: recordRangeStatuses(input, trace) };
    }
    return remembered;
  };

  return (request) => {
    try {
      const basis = basisOf(request.input);
      switch (request.kind) {
        case 'ranges': {
          const value: RecordRangesValue = { statuses: basis.statuses, inputChars: basis.trace.inputChars };
          return { id: request.id, ok: true, value };
        }
        case 'range': {
          const range = basis.statuses[request.rangeIndex];
          if (range?.firstStroke === undefined) return { id: request.id, ok: false, message: '打てない範囲です' };
          const value: RecordRangeValue = {
            range,
            strokes: basis.trace.strokes.slice(range.firstStroke, range.firstStroke + range.strokeCount!),
            inputChars: basis.trace.inputChars,
          };
          return { id: request.id, ok: true, value };
        }
        case 'finish': {
          const value: RecordFinishValue = finishKeystrokeRecord(
            request.input,
            basis.trace,
            request.rangeIndex,
            request.typed,
            request.taps,
            request.meta,
            request.windowed,
          );
          return { id: request.id, ok: true, value };
        }
      }
    } catch (error) {
      return { id: request.id, ok: false, message: error instanceof Error ? error.message : String(error) };
    }
  };
}
