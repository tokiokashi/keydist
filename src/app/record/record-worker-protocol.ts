import type { RecordFailure, RecordMeta, RecordRangeStatus } from '#engine/keystroke-record.ts';
import type { WireResolvedInput } from '#engine/worker-protocol.ts';
import type { KeystrokeRecord } from '#interpretation/record/keystroke-record.ts';
import type { SentenceTap } from '#interpretation/timing/sentence-measurement.ts';
import type { Stroke } from '#trace/generate.ts';

/**
 * 打鍵の記録の計算用Workerとやりとりするメッセージ（構造化複製で運べる値だけ）。
 * 入力の配列は、表から作った配列なら表（または識別子）で運ぶ（`engine/worker-wire.ts`）。
 * 全文の打鍵の列は長いテキストで大きいので、Workerが持ち、メインスレッドへは範囲のストロークだけを渡す。
 */
export type RecordWorkerRequest =
  | {
      readonly id: number;
      readonly kind: 'ranges';
      readonly input: WireResolvedInput;
    }
  | {
      readonly id: number;
      readonly kind: 'range';
      readonly input: WireResolvedInput;
      readonly rangeIndex: number;
    }
  | {
      readonly id: number;
      readonly kind: 'finish';
      readonly input: WireResolvedInput;
      readonly rangeIndex: number;
      readonly typed: readonly string[];
      readonly taps: readonly SentenceTap[];
      readonly meta: RecordMeta;
      /** 打っている間に使った窓の作り直しの、打つキーの列の照合値。 */
      readonly windowed: string | undefined;
    };

/** `ranges`の結果。範囲ごとの状態と、全文の入力かな数。 */
export interface RecordRangesValue {
  readonly statuses: readonly RecordRangeStatus[];
  readonly inputChars: number;
}

/** `range`の結果。打てる範囲の、範囲のストロークだけ。 */
export interface RecordRangeValue {
  readonly range: RecordRangeStatus;
  readonly strokes: readonly Stroke[];
  readonly inputChars: number;
}

export type RecordFinishValue = { readonly ok: true; readonly record: KeystrokeRecord } | { readonly ok: false; readonly reason: RecordFailure };

export type RecordWorkerResponse =
  | { readonly id: number; readonly ok: true; readonly value: unknown }
  | { readonly id: number; readonly ok: false; readonly message: string };
