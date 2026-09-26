import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ANALYZER_SAMPLE_NAMES,
  analyzerSampleText,
  isAnalyzerSampleText,
} from '#legacy/analyzer-samples.ts';

test('Analyzer sample catalog resolves mode samples and fallback', () => {
  assert.deepEqual(Object.keys(ANALYZER_SAMPLE_NAMES.en), ['default']);
  assert.deepEqual(Object.keys(ANALYZER_SAMPLE_NAMES.ja), ['modern', 'legacy']);
  assert.notEqual(analyzerSampleText('ja', 'legacy'), '');
  assert.equal(analyzerSampleText('ja', 'missing'), analyzerSampleText('ja', 'modern'));
});

test('Analyzer sample detection recognizes built-in text only', () => {
  assert.equal(isAnalyzerSampleText(analyzerSampleText('en', 'default')), true);
  assert.equal(isAnalyzerSampleText(analyzerSampleText('ja', 'legacy')), true);
  assert.equal(isAnalyzerSampleText('custom analyzer input'), false);
});
