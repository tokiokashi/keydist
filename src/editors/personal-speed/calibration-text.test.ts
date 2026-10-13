import assert from 'node:assert/strict';
import test from 'node:test';
import type { SentenceMeasurement } from '#interpretation/timing/sentence-measurement.ts';
import { measurementEffectText, SENTENCE_OTHER_LAYOUT_NOTE, sentenceFailureText, sentenceSavedMessage } from './calibration-text.ts';

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

test('測るボタンの直後の保存値への影響は、保存値を持たない時と、置き換わる値も消える値も無い時には出さない', () => {
  for (const group of ['normal', 'directional', 'sentence'] as const) {
    assert.equal(measurementEffectText(group, false, []), undefined);
  }
  // 連打との差を持たない時の文章を打つ速さは、前の連打との差が無いので文を出さない
  assert.equal(measurementEffectText('sentence', true, []), undefined);
  assert.equal(measurementEffectText('normal', true, []), '測ると、方向別の値を除く保存値が置き換わります。');
  assert.equal(measurementEffectText('directional', true, ['repeat']), '測ると、測った向きの値が置き換わります。');
});

test('測るボタンの直後の保存値への影響は、置き換わる・消える値を、保存されている種類だけで挙げる', () => {
  assert.equal(
    measurementEffectText('normal', true, ['chain']),
    '測ると、方向別の値を除く保存値が置き換わり、文章を打つ速さの連打との差は全て消えます。',
  );
  assert.equal(
    measurementEffectText('directional', true, ['chain', 'repeat']),
    '測ると、測った向きの値が置き換わり、連打との差のうちChainが消えます（続け打ちは残ります）。',
  );
  assert.equal(
    measurementEffectText('directional', true, ['arpeggio', 'other']),
    '測ると、測った向きの値が置き換わり、連打との差のうちArpeggio・その他が消えます。',
  );
  assert.equal(measurementEffectText('sentence', true, ['sfb']), '測り直して保存すると、前の連打との差は全て置き換わります。');
});
