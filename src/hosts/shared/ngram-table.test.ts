import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ReadingToken } from '#input/text/reading.ts';
import type { ResolvedText } from '#input/text/resolve.ts';
import { buildUserNgramTable } from '#interpretation/user-ngram-table.ts';
import { evaluationText, segmentationBasisOf, type ReadingOutcome, type ReadingSource } from './reading-evaluation.ts';
import { computeSegmentation, type BunsetsuSource } from './segmentation.ts';
import { userTableRequestOf } from './ngram-table.ts';

const CONDITIONS = { dictionary: { name: 'IPADIC', version: '6.2.0' }, library: { name: 'lindera-wasm', version: '6.2.0' } } as const;
const SOURCE: ReadingSource = { conditions: CONDITIONS, loadCandidates: async () => ({}), tokenize: async () => [] };
const SPLITTER = { name: 'budoux', version: '0.10.4' } as const;

// 今日(6バイト) は(3) 朝(3) です(6)
const TOKENS: readonly ReadingToken[] = [
  { surface: '今日', byteStart: 0, byteEnd: 6, reading: 'キョウ', isUnknown: false },
  { surface: 'は', byteStart: 6, byteEnd: 9, reading: 'ハ', isUnknown: false },
  { surface: '朝', byteStart: 9, byteEnd: 12, reading: 'アサ', isUnknown: false },
  { surface: 'です', byteStart: 12, byteEnd: 18, reading: 'デス', isUnknown: false },
];
const OUTCOME: ReadingOutcome = { kind: 'analyzed', sourceText: '今日は朝です', tokens: TOKENS };
const SPLIT: BunsetsuSource = { info: SPLITTER, split: async () => ['今日は', '朝です'] };

function resolved(readingCorrections: ResolvedText['readingCorrections']): ResolvedText {
  return {
    ref: { kind: 'user', id: 't' },
    name: 'わたしの文章',
    text: '今日は朝です',
    language: 'ja',
    languageOverride: undefined,
    isBuiltin: false,
    readingCorrections,
    wordReadingCorrections: [],
  };
}

async function tableOf(readingCorrections: ResolvedText['readingCorrections']) {
  const { text } = evaluationText(resolved(readingCorrections), SOURCE, OUTCOME);
  const basis = segmentationBasisOf(text);
  assert.ok(basis);
  const segmentation = await computeSegmentation(SPLIT, basis);
  return buildUserNgramTable(userTableRequestOf(text, segmentation));
}

test('選んだテキストの表は、読みの直しを当てた読みで数え、文節の区切りは読みの位置へ写した分割器の出力になる', async () => {
  const plain = await tableOf({});
  assert.deepEqual([...plain.tables[0]!.keys].sort(), ['あさです', 'きょうは']);
  const corrected = await tableOf({ 今日: 'こんにち' });
  assert.deepEqual([...corrected.tables[0]!.keys].sort(), ['あさです', 'こんにちは']);
  // 直しの違いは、表の中身のキーに現れる（古い表の抽出結果を使い回さない）
  assert.notEqual(plain.contentKey, corrected.contentKey);
  assert.equal(corrected.source.kind, 'user-text');
  assert.equal(corrected.source.name, 'わたしの文章');
  assert.deepEqual(corrected.source.reading, { library: CONDITIONS.library, dictionary: CONDITIONS.dictionary });
});
