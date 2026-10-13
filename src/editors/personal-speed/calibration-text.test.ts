import assert from 'node:assert/strict';
import test from 'node:test';
import type { SentenceMeasurement } from '#interpretation/timing/sentence-measurement.ts';
import { SENTENCE_OTHER_LAYOUT_NOTE, sentenceFailureText, sentenceSavedMessage } from './calibration-text.ts';

/** 文章の知らせの文だけを検査するための測定結果。表に使う値は持たない。 */
function measurement(overheadMs: SentenceMeasurement['overheadMs']): SentenceMeasurement {
  const counts = { arpeggio: 12, chain: 3, other: 100, repeat: 12, sfb: 2 };
  return { counts, overheadMs } as unknown as SentenceMeasurement;
}

const ALL = { arpeggio: 10, chain: 12, other: 20, repeat: 30, sfb: 40 };

test('下限に届かない種類があって保存した時の知らせに、別の配列で測ることの添え書きが付く', () => {
  const text = sentenceSavedMessage(measurement({ arpeggio: 10, other: 20, repeat: 30 }));
  assert.ok(text.endsWith(SENTENCE_OTHER_LAYOUT_NOTE));
  assert.ok(SENTENCE_OTHER_LAYOUT_NOTE.includes('別の配列'));
  assert.ok(SENTENCE_OTHER_LAYOUT_NOTE.includes('測り直して保存すると'));
});

test('全ての種類が届いて保存した時の知らせには、添え書きが付かない', () => {
  assert.ok(!sentenceSavedMessage(measurement(ALL)).includes(SENTENCE_OTHER_LAYOUT_NOTE));
});

test('どの種類も届かず保存しなかった時の文に、添え書きが付く', () => {
  const text = sentenceFailureText({ ok: false, reason: 'too-few', measurement: measurement({}) });
  assert.ok(text.includes(SENTENCE_OTHER_LAYOUT_NOTE));
});

test('範囲の外の値があって保存しなかった時と、保存値が変わった時の文には、添え書きが付かない', () => {
  const outOfRange = sentenceFailureText({ ok: false, reason: 'out-of-range', measurement: measurement({ other: 2000 }) });
  assert.ok(!outOfRange.includes(SENTENCE_OTHER_LAYOUT_NOTE));
  assert.ok(!sentenceFailureText({ ok: false, reason: 'changed' }).includes(SENTENCE_OTHER_LAYOUT_NOTE));
  assert.ok(!sentenceFailureText({ ok: false, reason: 'no-saved-value' }).includes(SENTENCE_OTHER_LAYOUT_NOTE));
});
