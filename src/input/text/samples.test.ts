import assert from 'node:assert/strict';
import test from 'node:test';
import { assertNoMarkup } from '../../../scripts/aozora-core.ts';
import { containsKanji } from './reading.ts';
import { SAMPLE_TEXT_NAMES, SAMPLE_TEXTS, sampleText, sampleTextEntries, type TextLanguage } from './samples.ts';

test('sampleTextEntries: SAMPLE_TEXTSの全件を1件ずつ平らにする', () => {
  const entries = sampleTextEntries();
  const expectedCount = (Object.keys(SAMPLE_TEXTS) as TextLanguage[]).reduce((sum, language) => sum + Object.keys(SAMPLE_TEXTS[language]).length, 0);
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

test('既定の日本語サンプルは、青空文庫の記法を含まない漢字かな交じりの原文で、現代文は漢字を含まない', () => {
  const legacy = sampleText('ja', 'legacy');
  assert.ok(legacy.startsWith('吾輩は猫である。名前はまだ無い。'));
  assert.ok(legacy.endsWith('あったばかりである。'));
  assert.ok(containsKanji(legacy));
  assertNoMarkup(legacy);
  assert.equal(containsKanji(sampleText('ja', 'modern')), false);
});
