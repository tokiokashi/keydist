import assert from 'node:assert/strict';
import test from 'node:test';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { assertNoMarkup } from '../../../scripts/aozora-core.ts';
import { setCorpusBody } from './corpus-bodies.ts';
import { containsKanji } from './reading.ts';
import { CORPUS_ENTRIES, SAMPLE_TEXT_NAMES, SAMPLE_TEXTS, sampleText, sampleTextEntries, type TextLanguage } from './samples.ts';

test('sampleTextEntries: SAMPLE_TEXTSと同梱のテキストの全件を1件ずつ平らにする', () => {
  const entries = sampleTextEntries();
  const expectedCount = (Object.keys(SAMPLE_TEXTS) as TextLanguage[]).reduce((sum, language) => sum + Object.keys(SAMPLE_TEXTS[language]).length, 0);
  assert.equal(entries.length, expectedCount + CORPUS_ENTRIES.length);
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

test('既定の日本語サンプルは、青空文庫の記法を含まない漢字かな交じりの原文', () => {
  const legacy = sampleText('ja', 'legacy');
  assert.ok(legacy.startsWith('吾輩は猫である。名前はまだ無い。'));
  assert.ok(legacy.endsWith('何となく人間臭い所へ出た。'));
  assert.ok(containsKanji(legacy));
  assertNoMarkup(legacy);
});

const CORPUS_DIR = fileURLToPath(new URL('./corpus/', import.meta.url));

test('同梱のテキストの一覧・本文のファイル・出典の一覧が一致し、全テキストに出典がある', () => {
  const files = readdirSync(CORPUS_DIR)
    .filter((name) => name.endsWith('.txt'))
    .sort();
  assert.deepEqual(files, CORPUS_ENTRIES.map((entry) => entry.fileName).sort());
  const sources = readFileSync(`${CORPUS_DIR}SOURCES.md`, 'utf8');
  for (const entry of CORPUS_ENTRIES) {
    assert.ok(entry.items.length > 0, `${entry.sampleId} に出典が無い`);
    assert.ok(sources.includes(`\`${entry.fileName}\``), `${entry.fileName} が出典の一覧に無い`);
    for (const item of entry.items) assert.ok(sources.includes(item.url), `${item.url} が出典の一覧に無い`);
  }
  for (const entry of sampleTextEntries()) assert.ok(entry.source.items.length > 0, `${entry.sampleId} に出典が無い`);
});

test('Wikipediaの文を含むテキストはCC BY-SA 4.0で、記事ごとに履歴へのリンクを持つ', () => {
  const wikipedia = CORPUS_ENTRIES.filter((entry) => entry.sampleId.startsWith('wiki-') || entry.sampleId === 'mixed');
  assert.equal(wikipedia.length, 9);
  for (const entry of wikipedia) {
    assert.equal(entry.license, 'cc-by-sa-4.0');
    const articles = entry.items.filter((item) => item.url.startsWith('https://ja.wikipedia.org/'));
    assert.ok(articles.length > 0);
    for (const article of articles) assert.ok(article.historyUrl?.startsWith('https://ja.wikipedia.org/'));
  }
});

test('同梱のテキストの本文は、読み込むまでは空で、読み込むと空白を畳んだ本文になる', () => {
  assert.equal(sampleText('ja', 'wiki-science'), '');
  assert.equal(sampleTextEntries().find((entry) => entry.sampleId === 'wiki-science')?.lazy, true);
  assert.equal(SAMPLE_TEXTS.ja['wiki-science'], undefined);
  setCorpusBody('wiki-science', 'あい う\nえ');
  assert.equal(sampleText('ja', 'wiki-science'), 'あいうえ');
});
