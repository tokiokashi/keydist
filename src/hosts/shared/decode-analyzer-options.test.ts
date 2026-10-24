import assert from 'node:assert/strict';
import test from 'node:test';
import { decodeStoredAnalyzerOptions } from './decode-analyzer-options.ts';
import { bigramFlowDefinition } from '#analyzers/bigram-flow/extract.ts';
import { DEFAULT_BIGRAM_FLOW_OPTIONS } from '#analyzers/bigram-flow/options.ts';

test('decodeStoredAnalyzerOptions: 保存が無ければ既定値', () => {
  assert.deepEqual(decodeStoredAnalyzerOptions(bigramFlowDefinition, undefined), DEFAULT_BIGRAM_FLOW_OPTIONS);
});

test('decodeStoredAnalyzerOptions: 保存された値をAnalyzer自身のdecodeOptionsで読む', () => {
  const decoded = decodeStoredAnalyzerOptions(bigramFlowDefinition, {
    source: 'within-hand',
    polarGain: 2,
  });
  assert.equal(decoded.source, 'within-hand');
  assert.equal(decoded.polarGain, 2);
  // decodeOptionsが埋めなかった項目は既定値へ落ちる（options.tsの契約）。
  assert.equal(decoded.lineScale, DEFAULT_BIGRAM_FLOW_OPTIONS.lineScale);
});

test('decodeStoredAnalyzerOptions: 読めない値は既定値へ戻す（例外を投げない）', () => {
  assert.deepEqual(decodeStoredAnalyzerOptions(bigramFlowDefinition, { source: 'no-such-source' }), DEFAULT_BIGRAM_FLOW_OPTIONS);
});
