import assert from 'node:assert/strict';
import test from 'node:test';
import {
  initialStandaloneAnalyzerOptions,
  standaloneAnalyzerOptionsFor,
  withStandaloneAnalyzerOptions,
} from './standalone-analyzer-options.ts';

test('initialStandaloneAnalyzerOptions: 空のrecord', () => {
  assert.deepEqual(initialStandaloneAnalyzerOptions(), {});
});

test('standaloneAnalyzerOptionsFor: 保存が無ければundefined', () => {
  assert.equal(standaloneAnalyzerOptionsFor({}, 'bigram-flow'), undefined);
});

test('withStandaloneAnalyzerOptions: 新規に1件書き込む', () => {
  const next = withStandaloneAnalyzerOptions({}, 'bigram-flow', { source: 'actual' });
  assert.deepEqual(standaloneAnalyzerOptionsFor(next, 'bigram-flow'), { source: 'actual' });
});

test('withStandaloneAnalyzerOptions: 他のAnalyzer idの設定はそのまま残る', () => {
  const current = withStandaloneAnalyzerOptions({}, 'heatmap', { colorScale: 'linear' });
  const next = withStandaloneAnalyzerOptions(current, 'bigram-flow', { source: 'actual' });
  assert.deepEqual(standaloneAnalyzerOptionsFor(next, 'heatmap'), { colorScale: 'linear' });
  assert.deepEqual(standaloneAnalyzerOptionsFor(next, 'bigram-flow'), { source: 'actual' });
});

test('withStandaloneAnalyzerOptions: 値が構造的に同じなら同じ参照を返す(no-op)', () => {
  const current = withStandaloneAnalyzerOptions({}, 'bigram-flow', { source: 'actual', selectedFingers: ['index'] });
  const next = withStandaloneAnalyzerOptions(current, 'bigram-flow', { source: 'actual', selectedFingers: ['index'] });
  assert.equal(next, current);
});

test('withStandaloneAnalyzerOptions: 値が変われば新しい参照を返す', () => {
  const current = withStandaloneAnalyzerOptions({}, 'bigram-flow', { source: 'actual' });
  const next = withStandaloneAnalyzerOptions(current, 'bigram-flow', { source: 'within-hand' });
  assert.notEqual(next, current);
  assert.deepEqual(standaloneAnalyzerOptionsFor(next, 'bigram-flow'), { source: 'within-hand' });
});
