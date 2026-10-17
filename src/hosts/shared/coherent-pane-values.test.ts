import assert from 'node:assert/strict';
import test from 'node:test';
import type { ExtractionRequestState, TraceRequestState } from '#engine/engine-requests.ts';
import type { EngineExtractionResult, EngineTraceResult } from '#engine/pipeline.ts';
import { settleCoherentValues, type CoherentPaneValues } from './coherent-pane-values.ts';

// 入力の違いは、Traceの飛ばした文字数とエラー、抽出の図の値の両方に出る
function traceOf(skipped: number, errors: readonly string[] = []): EngineTraceResult {
  return { modelVersion: 1, trace: { skipped, errors } as unknown as EngineTraceResult['trace'] };
}
function extractionOf(figure: string): EngineExtractionResult<string> {
  return { modelVersion: 1, extracted: figure };
}
const ready = <T>(value: T) => ({ status: 'ready' as const, value });
const stale = <T>(value: T) => ({ status: 'stale' as const, value });

const A = { trace: traceOf(1, ['入力Aのエラー']), extraction: extractionOf('A') };
const B = { trace: traceOf(7), extraction: extractionOf('B') };
const pairA: CoherentPaneValues<string> = A;

test('Bigram Flowの組: 両方がreadyなら、今のTraceと抽出の組を返す', () => {
  const settled = settleCoherentValues<string>(undefined, ready(A.extraction), ready(A.trace));
  assert.deepEqual(settled, A);
});

test('Bigram Flowの組: Traceだけが新しい入力でreadyでも、抽出がstaleの間は前の入力の組を返す', () => {
  const extraction: ExtractionRequestState<string> = stale(A.extraction);
  const trace: TraceRequestState = ready(B.trace);
  const settled = settleCoherentValues(pairA, extraction, trace);
  assert.equal(settled, pairA);
  assert.equal(settled?.trace.trace.skipped, 1);
  assert.equal(settled?.extraction.extracted, 'A');
});

test('Bigram Flowの組: 抽出だけが新しい入力でreadyでも、Traceがstaleの間は前の入力の組を返す', () => {
  const settled = settleCoherentValues(pairA, ready(B.extraction), stale(A.trace));
  assert.equal(settled, pairA);
});

test('Bigram Flowの組: 両方が新しい入力でreadyになったら新しい組に替わる', () => {
  const settled = settleCoherentValues(pairA, ready(B.extraction), ready(B.trace));
  assert.equal(settled?.trace.trace.skipped, 7);
  assert.equal(settled?.extraction.extracted, 'B');
});

test('同じ値のreadyが続く間は、組の参照を保つ', () => {
  const first = settleCoherentValues<string>(undefined, ready(A.extraction), ready(A.trace));
  assert.equal(settleCoherentValues(first, ready(A.extraction), ready(A.trace)), first);
});

test('組が無い間と、どちらかが表示できない間は何も返さない', () => {
  assert.equal(settleCoherentValues<string>(undefined, stale(A.extraction), ready(B.trace)), undefined);
  assert.equal(settleCoherentValues(pairA, { status: 'computing' }, ready(B.trace)), undefined);
  assert.equal(settleCoherentValues(pairA, ready(B.extraction), { status: 'idle' }), undefined);
  assert.equal(
    settleCoherentValues(pairA, ready(B.extraction), { status: 'failed', error: { kind: 'exception', error: new Error('x') } }),
    undefined,
  );
});
