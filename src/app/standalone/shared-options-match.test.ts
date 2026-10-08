import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_BIGRAM_FLOW_OPTIONS, decodeBigramFlowOptions } from '#analyzers/bigram-flow/options.ts';
import { DEFAULT_FINGER_DISTANCE_OPTIONS, fingerDistanceOptions } from '#analyzers/finger-distance/options.ts';
import { sameAsSharedOptions } from './shared-options-match.ts';

const decodeBigram = (raw: unknown) => decodeBigramFlowOptions(raw, []);
const decodeFinger = (raw: unknown) => fingerDistanceOptions.decodeOptions(raw, []);

test('共有の設定が未設定で、個別画面が全項目の既定値なら同じ値', () => {
  assert.equal(sameAsSharedOptions(decodeFinger, undefined, DEFAULT_FINGER_DISTANCE_OPTIONS), true);
});

test('共有の設定が変えた項目だけで、個別画面が同じ項目を変えた全項目なら同じ値', () => {
  const shared = { source: 'within-hand' };
  const standalone = { ...DEFAULT_BIGRAM_FLOW_OPTIONS, source: 'within-hand' };
  assert.equal(sameAsSharedOptions(decodeBigram, shared, standalone), true);
});

test('項目の値が違えば違う値', () => {
  assert.equal(sameAsSharedOptions(decodeBigram, { source: 'within-hand' }, DEFAULT_BIGRAM_FLOW_OPTIONS), false);
  assert.equal(sameAsSharedOptions(decodeBigram, undefined, { ...DEFAULT_BIGRAM_FLOW_OPTIONS, source: 'within-hand' }), false);
});
