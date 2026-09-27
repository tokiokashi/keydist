import assert from 'node:assert/strict';
import test from 'node:test';
import { decodeStoredAnalyzerOptions } from './standalone-analyzer-options.ts';
import { bigramFlowDefinition } from '#analyzers/bigram-flow/extract.ts';
import { DEFAULT_BIGRAM_FLOW_OPTIONS } from '#analyzers/bigram-flow/options.ts';

test('decodeStoredAnalyzerOptions: 保存が無ければ既定値・診断は空', () => {
  const decoded = decodeStoredAnalyzerOptions(bigramFlowDefinition, undefined);
  assert.deepEqual(decoded.options, DEFAULT_BIGRAM_FLOW_OPTIONS);
  assert.deepEqual(decoded.diagnostics, []);
});

test('decodeStoredAnalyzerOptions: 保存された値をAnalyzer自身のdecodeOptionsで読む', () => {
  const decoded = decodeStoredAnalyzerOptions(bigramFlowDefinition, {
    source: 'within-hand',
    polarGain: 2,
  });
  assert.equal(decoded.options.source, 'within-hand');
  assert.equal(decoded.options.polarGain, 2);
  // decodeOptionsが埋めなかった項目は既定値へ落ちる（options.tsの契約）。
  assert.equal(decoded.options.lineScale, DEFAULT_BIGRAM_FLOW_OPTIONS.lineScale);
  assert.deepEqual(decoded.diagnostics, []);
});

test('decodeStoredAnalyzerOptions: 壊れた値は既定値へ戻し、診断を捨てずに返す（例外を投げない）', () => {
  const decoded = decodeStoredAnalyzerOptions(bigramFlowDefinition, { source: 'no-such-source' });
  assert.deepEqual(decoded.options, DEFAULT_BIGRAM_FLOW_OPTIONS);
  assert.ok(decoded.diagnostics.length > 0);
  assert.ok(decoded.diagnostics.some((diagnostic) => diagnostic.path === 'options.source'));
});
