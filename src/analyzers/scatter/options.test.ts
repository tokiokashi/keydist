import assert from 'node:assert/strict';
import test from 'node:test';
import type { CodecDiagnostic } from '#input/codec/index.ts';
import { ALTERNATE_SCATTER_OPTIONS, DEFAULT_SCATTER_OPTIONS, scatterOptions } from './options.ts';

test('目盛りの種類: 既定は通常で、URLに載せて読み戻すと同じ設定になる', () => {
  assert.equal(DEFAULT_SCATTER_OPTIONS.tickScale, 'linear');
  const diagnostics: CodecDiagnostic[] = [];
  const params = scatterOptions.encodeOptionsToUrl({ ...DEFAULT_SCATTER_OPTIONS, tickScale: 'log' });
  assert.equal(params.get('scale'), 'log');
  const decoded = scatterOptions.decodeOptionsFromUrl(params, diagnostics);
  assert.deepEqual(diagnostics, []);
  assert.equal(decoded.values.tickScale, 'log');
  // 既定のままならURLに載せない
  assert.equal(scatterOptions.encodeOptionsToUrl(DEFAULT_SCATTER_OPTIONS).has('scale'), false);
});

test('目盛りの種類: 既定と違う値の組をURLに載せて読み戻すと、目盛りの種類を含めて同じ設定になる', () => {
  const diagnostics: CodecDiagnostic[] = [];
  const decoded = scatterOptions.decodeOptionsFromUrl(scatterOptions.encodeOptionsToUrl(ALTERNATE_SCATTER_OPTIONS), diagnostics);
  assert.deepEqual(diagnostics, []);
  assert.deepEqual({ ...DEFAULT_SCATTER_OPTIONS, ...decoded.values }, ALTERNATE_SCATTER_OPTIONS);
});

test('目盛りの種類: 知らない値のURLは診断に残して読まない', () => {
  const diagnostics: CodecDiagnostic[] = [];
  const decoded = scatterOptions.decodeOptionsFromUrl(new URLSearchParams('scale=sqrt'), diagnostics);
  assert.equal(diagnostics.length, 1);
  assert.equal(decoded.values.tickScale, undefined);
});
