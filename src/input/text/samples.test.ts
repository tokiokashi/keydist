import assert from 'node:assert/strict';
import test from 'node:test';
import { SAMPLE_TEXT_NAMES, SAMPLE_TEXTS, sampleText, sampleTextEntries, type TextLanguage } from './samples.ts';

test('sampleTextEntries: SAMPLE_TEXTSの全件を1件ずつ平らにする', () => {
  const entries = sampleTextEntries();
  const expectedCount = (Object.keys(SAMPLE_TEXTS) as TextLanguage[])
    .reduce((sum, language) => sum + Object.keys(SAMPLE_TEXTS[language]).length, 0);
  assert.equal(entries.length, expectedCount);
});

test('sampleTextEntries: 各entryはsampleText()・SAMPLE_TEXT_NAMESと一致する', () => {
  for (const entry of sampleTextEntries()) {
    assert.equal(entry.text, sampleText(entry.language, entry.sampleId));
    assert.equal(entry.name, SAMPLE_TEXT_NAMES[entry.language][entry.sampleId]);
  }
});

test('sampleTextEntries: language:sampleIdの組み合わせに重複が無い（選択UIのvalueに使えること）', () => {
  const keys = sampleTextEntries().map((entry) => `${entry.language}:${entry.sampleId}`);
  assert.deepEqual(keys, [...new Set(keys)]);
});
