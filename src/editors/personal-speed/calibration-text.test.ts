import assert from 'node:assert/strict';
import test from 'node:test';
import type { SentenceMeasurement } from '#interpretation/timing/sentence-measurement.ts';
import { SENTENCE_TABLE_NOTES, clearedOverheadsText, clearedSimultaneousText, measurementEffectText, savedMessage, SENTENCE_OTHER_LAYOUT_NOTE, sentenceFailureText, sentenceSavedMessage } from './calibration-text.ts';

/** 文章の知らせの文だけを検査するための測定結果。表に使う値は持たない。 */
function measurement(overheadMs: SentenceMeasurement['overheadMs']): SentenceMeasurement {
  const counts = {
    arpeggio: 12, 'arpeggio-within': 5, 'arpeggio-boundary': 7,
    chain: 3, 'chain-within': 1, 'chain-boundary': 2,
    other: 100, 'other-within': 40, 'other-boundary': 60,
    repeat: 12, sfb: 2,
  };
  return { counts, overheadMs } as unknown as SentenceMeasurement;
}

const ALL = {
  arpeggio: 10, 'arpeggio-within': 1, 'arpeggio-boundary': 2,
  chain: 12, 'chain-within': 3, 'chain-boundary': 4,
  other: 20, 'other-within': 5, 'other-boundary': 6,
  repeat: 30, sfb: 40,
};

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
  // 打鍵の上乗せを持たない時の文章を打つ速さは、前の打鍵の上乗せが無いので文を出さない
  assert.equal(measurementEffectText('sentence', true, []), undefined);
  assert.equal(measurementEffectText('normal', true, []), '測ると、方向別の値を除く保存値が置き換わります。');
  assert.equal(measurementEffectText('directional', true, ['repeat']), '測ると、測った向きの値が置き換わります。');
});

test('測るボタンの直後の保存値への影響は、置き換わる・消える値を、保存されている種類だけで挙げる', () => {
  assert.equal(
    measurementEffectText('normal', true, ['chain']),
    '測ると、方向別の値を除く保存値が置き換わり、文章を打つ速さの打鍵の上乗せは全て消えます。',
  );
  assert.equal(
    measurementEffectText('directional', true, ['chain', 'repeat']),
    '測ると、測った向きの値が置き換わり、打鍵の上乗せのうちChain全体が消えます（続け打ちは残ります）。',
  );
  assert.equal(
    measurementEffectText('directional', true, ['arpeggio', 'other']),
    '測ると、測った向きの値が置き換わり、打鍵の上乗せのうちArpeggio全体・その他全体が消えます。',
  );
  assert.equal(measurementEffectText('sentence', true, ['sfb']), '測り直して保存すると、前の打鍵の上乗せは全て置き換わります。');
});

test('通常速度・移動速度の測定の前の注意は、続け打ちの置き換えと他の種類が消えることを区別して伝える', () => {
  assert.equal(
    measurementEffectText('normal', true, ['repeat']),
    '測ると、方向別の値を除く保存値が置き換わり、続け打ちの打鍵の上乗せは再生の時間が変わらない値に置き換わります。',
  );
  assert.equal(
    measurementEffectText('normal', true, ['repeat', 'sfb']),
    '測ると、方向別の値を除く保存値が置き換わり、続け打ちの打鍵の上乗せは再生の時間が変わらない値に置き換わって、それ以外の打鍵の上乗せは消えます。',
  );
  assert.equal(
    measurementEffectText('normal', true, ['other', 'sfb']),
    '測ると、方向別の値を除く保存値が置き換わり、文章を打つ速さの打鍵の上乗せは全て消えます。',
  );
});

test('測った後の知らせは、消した種類と置き換えた種類を分けて伝える', () => {
  assert.equal(
    clearedOverheadsText(['other'], ['repeat']),
    '打鍵の上乗せ（続け打ち）は、基準の時間が変わったため、再生の時間が変わらない値に置き換えました。'
    + '打鍵の上乗せ（その他全体）は、他の値が変わったため消しました。文章を打つ速さをもう一度測ってください。',
  );
  assert.ok(!clearedOverheadsText([], ['repeat']).includes('消しました'));
  assert.ok(!clearedOverheadsText(['sfb']).includes('置き換えました'));
  assert.ok(savedMessage('normal', undefined, [], ['repeat']).includes('続け打ちの打鍵の上乗せは置き換えました。'));
  assert.ok(!savedMessage('normal', undefined, [], ['repeat']).includes('消えました'));
});

test('結果の表の説明は、負の値を0にすると書かない', () => {
  assert.ok(SENTENCE_TABLE_NOTES.every((note) => !note.includes('0にします')));
});

test('同時押しの測定の前の注意は、消える打鍵の上乗せを挙げ、続け打ちは残ると伝える', () => {
  assert.equal(measurementEffectText('simultaneous', false, []), undefined);
  assert.equal(measurementEffectText('simultaneous', true, ['repeat']), '測ると、測った同時押しの上乗せが置き換わります。');
  const text = measurementEffectText('simultaneous', true, ['other', 'repeat']) ?? '';
  assert.ok(text.includes('が消えます（続け打ちは残ります）'));
});

test('基準の速さの測定の前の注意は、同時押しの上乗せがある時だけ、消えることを足す', () => {
  const tail = '同時押しの上乗せは、基準にする速さが変わると消えます。';
  assert.ok(!(measurementEffectText('normal', true, [], []) ?? '').includes(tail));
  assert.ok((measurementEffectText('normal', true, [], ['thumb']) ?? '').endsWith(tail));
  assert.ok((measurementEffectText('directional', true, [], ['thumb']) ?? '').endsWith(tail));
});

test('同時押しを測った後の知らせは、消えた同時押しの上乗せを伝え、測り直しを促す', () => {
  assert.ok(clearedSimultaneousText(['thumb', 'one-hand']).includes('親指との同時押し・片手の同時押し'));
  assert.ok(clearedSimultaneousText(['thumb']).endsWith('同時押しをもう一度測ってください。'));
  assert.equal(savedMessage('simultaneous'), '同時押しを測って保存しました。');
  assert.ok(savedMessage('normal', undefined, [], [], ['thumb']).includes('同時押しの上乗せが消えました。'));
});
