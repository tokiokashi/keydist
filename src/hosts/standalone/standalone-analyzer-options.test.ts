import assert from 'node:assert/strict';
import test from 'node:test';
import { decodeStoredAnalyzerOptions } from './standalone-analyzer-options.ts';
import { bigramFlowDefinition } from '#analyzers/bigram-flow/extract.ts';
import { DEFAULT_BIGRAM_FLOW_OPTIONS } from '#analyzers/bigram-flow/options.ts';

test('decodeStoredAnalyzerOptions: 保存が無ければ既定値', () => {
  const options = decodeStoredAnalyzerOptions(bigramFlowDefinition, undefined);
  assert.deepEqual(options, DEFAULT_BIGRAM_FLOW_OPTIONS);
});

test('decodeStoredAnalyzerOptions: 保存された値をAnalyzer自身のdecodeOptionsで読む', () => {
  const options = decodeStoredAnalyzerOptions(bigramFlowDefinition, {
    source: 'within-hand',
    polarGain: 2,
  });
  assert.equal(options.source, 'within-hand');
  assert.equal(options.polarGain, 2);
  // decodeOptionsが埋めなかった項目は既定値へ落ちる（options.tsの契約）。
  assert.equal(options.lineScale, DEFAULT_BIGRAM_FLOW_OPTIONS.lineScale);
});

test('decodeStoredAnalyzerOptions: 壊れた値は既定値へ戻す（例外を投げない）', () => {
  const options = decodeStoredAnalyzerOptions(bigramFlowDefinition, { source: 'no-such-source' });
  assert.deepEqual(options, DEFAULT_BIGRAM_FLOW_OPTIONS);
});
