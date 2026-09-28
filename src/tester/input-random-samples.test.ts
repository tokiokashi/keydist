import test from 'node:test';
import assert from 'node:assert/strict';
import { SAMPLE_TEXT_JA } from '#input/text/sample-ja.ts';
import {
  buildJapaneseInputSamplePools,
  COMMON_WORD_SAMPLES_JA,
  pickRandomSample,
} from './random-samples.ts';

const codePointLength = (value: string): number => [...value].length;

test('日本語入力サンプルは既定本文中の単語と5〜15文字の節を使う', () => {
  const pools = buildJapaneseInputSamplePools(SAMPLE_TEXT_JA);
  const normalized = SAMPLE_TEXT_JA.replace(/\s+/gu, '');

  assert.equal(pools.words.length, COMMON_WORD_SAMPLES_JA.length);
  assert.ok(pools.phrases.length > 50);
  assert.ok(pools.words.includes('しごと'));
  assert.ok(pools.words.includes('がくしゅう'));

  for (const word of pools.words) {
    assert.ok(normalized.includes(word));
    assert.doesNotMatch(word, /[。、！？!?，,\s]/u);
  }

  for (const phrase of pools.phrases) {
    assert.ok(normalized.includes(phrase));
    assert.ok(codePointLength(phrase) >= 5);
    assert.ok(codePointLength(phrase) <= 15);
  }
});

test('pickRandomSampleは候補が複数なら現在値を避ける', () => {
  assert.equal(pickRandomSample(['あさ', 'ひる'], 'あさ', () => 0), 'ひる');
  assert.equal(pickRandomSample(['あさ'], 'あさ', () => 0.5), 'あさ');
  assert.equal(pickRandomSample([], 'あさ', () => 0.5), '');
});
