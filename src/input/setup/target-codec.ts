import * as v from 'valibot';
import type { BaseIssue, BaseSchema } from 'valibot';
import { decodeDroppingInvalid, type CodecDiagnostic } from '#input/codec/index.ts';
import type { AnalysisTarget } from './target.ts';

/**
 * `AnalysisTarget`のvalibot schema。
 * `input/text/selection-codec.ts`の`textRefSchema`（`v.variant('kind', […])`）と同じ形。
 * 診断は呼び出し側（このファイルの`decodeAnalysisTarget`、または個々の資産codec）が
 * `decodeField`/`decodeDroppingInvalid`（#input/codec）で積む。`v.fallback`は使わない
 * （新しいcodecはvalibot + decodeField/decodeDroppingInvalid、
 * v.fallbackなし。既定値へのフォールバックには診断を要するため）。
 */
export const analysisTargetSchema: BaseSchema<unknown, AnalysisTarget, BaseIssue<unknown>> = v.variant('kind', [
  v.strictObject({ kind: v.literal('layout'), layoutId: v.pipe(v.string(), v.minLength(1)) }),
  v.strictObject({ kind: v.literal('setup'), setupId: v.pipe(v.string(), v.minLength(1)) }),
]);

/** 壊れていれば`undefined`（呼び出し側が既定値へ戻すか、要素ごと捨てるかを決める）。 */
export function decodeAnalysisTarget(
  raw: unknown,
  path: string,
  diagnostics: CodecDiagnostic[],
): AnalysisTarget | undefined {
  return decodeDroppingInvalid(analysisTargetSchema, raw, path, diagnostics);
}

export function encodeAnalysisTarget(target: AnalysisTarget): AnalysisTarget {
  return target.kind === 'layout'
    ? { kind: 'layout', layoutId: target.layoutId }
    : { kind: 'setup', setupId: target.setupId };
}
