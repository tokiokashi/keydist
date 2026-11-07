import assert from 'node:assert/strict';
import test from 'node:test';
import { FINGER_LABEL } from '#input/shapes/finger-names.ts';
import { SENTENCE_MIN_SAMPLES, type SentenceMeasurement } from '#interpretation/timing/sentence-measurement.ts';
import {
  MEASUREMENT_SENTENCE_BREAKS,
  MEASUREMENT_SENTENCES,
  ZERO_MOVE_ROW_NOTE,
  zeroMoveFingersText,
  zeroMoveRowNote,
  clearedOverheadsText,
  clearedSimultaneousText,
  measurementEffectText,
  savedMessage,
  SENTENCE_OTHER_LAYOUT_NOTE,
  sentenceFailureText,
  sentenceSavedMessage,
  sentenceTableSavedDetail,
  sentenceTableSavedText,
} from './calibration-text.ts';

/** 文章の知らせの文だけを検査するための測定結果。表に使う値は持たない。 */
function measurement(overheadMs: SentenceMeasurement['overheadMs']): SentenceMeasurement {
  const counts = {
    arpeggio: 12,
    'arpeggio-within': 5,
    'arpeggio-boundary': 7,
    chain: 3,
    'chain-within': 1,
    'chain-boundary': 2,
    other: 100,
    'other-within': 40,
    'other-boundary': 60,
    repeat: 12,
    sfb: 2,
  };
  return { counts, overheadMs } as unknown as SentenceMeasurement;
}

const ALL = {
  arpeggio: 10,
  'arpeggio-within': 1,
  'arpeggio-boundary': 2,
  chain: 12,
  'chain-within': 3,
  'chain-boundary': 4,
  other: 20,
  'other-within': 5,
  'other-boundary': 6,
  repeat: 30,
  sfb: 40,
};

test('下限に届かない種類があって保存した時の知らせに、別の配列で測ることの添え書きが付く', () => {
  const text = sentenceSavedMessage(measurement({ arpeggio: 10, other: 20, repeat: 30 }));
  assert.ok(text.endsWith(SENTENCE_OTHER_LAYOUT_NOTE));
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
  assert.notEqual(measurementEffectText('normal', true, []), undefined);
  assert.notEqual(measurementEffectText('directional', true, ['repeat']), undefined);
});

test('測るボタンの直後の保存値への影響は、置き換わる・消える値を、保存されている種類だけで挙げる', () => {
  const directionalChain = measurementEffectText('directional', true, ['chain', 'repeat']) ?? '';
  assert.ok(directionalChain.includes('Chain'));
  assert.ok(!directionalChain.includes('Arpeggio') && !directionalChain.includes('その他'));
  const directionalOther = measurementEffectText('directional', true, ['arpeggio', 'other']) ?? '';
  assert.ok(directionalOther.includes('Arpeggio・その他'));
  assert.ok(!directionalOther.includes('Chain'));
  // 向きの測定は続け打ちを消さない
  assert.ok(!(measurementEffectText('directional', true, ['repeat']) ?? '').includes('消えます'));
  assert.notEqual(measurementEffectText('sentence', true, ['sfb']), undefined);
});

test('通常速度・移動速度の測定の前の注意は、続け打ちの置き換えと他の種類が消えることを区別して伝える', () => {
  const repeatOnly = measurementEffectText('normal', true, ['repeat']) ?? '';
  const repeatAndOther = measurementEffectText('normal', true, ['repeat', 'sfb']) ?? '';
  const withoutRepeat = measurementEffectText('normal', true, ['other', 'sfb']) ?? '';
  // 続け打ちだけなら消えるものは無い
  assert.ok(!repeatOnly.includes('消えます'));
  assert.ok(repeatOnly.includes('続け打ち'));
  // 続け打ちと他の種類がある時は、置き換えと消えるものの両方を伝える
  assert.ok(repeatAndOther.includes('続け打ち') && repeatAndOther.includes('消えます'));
  // 続け打ちが無い時は、置き換わるものを挙げずに消えるものだけを伝える
  assert.ok(withoutRepeat.includes('消えます') && !withoutRepeat.includes('続け打ち'));
});

test('測った後の知らせは、消した種類と置き換えた種類を分けて伝える', () => {
  const both = clearedOverheadsText(['other'], ['repeat']);
  assert.ok(both.includes('その他') && both.includes('続け打ち'));
  assert.ok(!clearedOverheadsText([], ['repeat']).includes('消しました'));
  assert.ok(!clearedOverheadsText(['sfb']).includes('置き換えました'));
  assert.ok(savedMessage('normal', undefined, [], ['repeat']).includes('続け打ちの打鍵の上乗せは置き換えました。'));
  assert.ok(!savedMessage('normal', undefined, [], ['repeat']).includes('消えました'));
});

test('同時押しの測定の前の注意は、消える打鍵の上乗せを挙げ、続け打ちは残ると伝える', () => {
  assert.equal(measurementEffectText('simultaneous', false, []), undefined);
  const repeatOnly = measurementEffectText('simultaneous', true, ['repeat']) ?? '';
  assert.ok(!repeatOnly.includes('消えます'));
  const text = measurementEffectText('simultaneous', true, ['other', 'repeat']) ?? '';
  assert.ok(text.includes('その他') && text.includes('消えます') && text.includes('続け打ちは残ります'));
});

test('基準の速さの測定の前の注意は、同時押しの上乗せがある時だけ、消えることを足す', () => {
  for (const group of ['normal', 'directional'] as const) {
    const without = measurementEffectText(group, true, [], []) ?? '';
    const withThumb = measurementEffectText(group, true, [], ['thumb']) ?? '';
    assert.notEqual(withThumb, without);
    assert.ok(withThumb.startsWith(without));
  }
});

test('同時押しを測った後の知らせは、消えた同時押しの上乗せを伝える', () => {
  assert.ok(clearedSimultaneousText(['thumb', 'one-hand']).includes('親指との同時押し・片手の同時押し'));
  const cleared = savedMessage('normal', undefined, [], [], ['thumb']);
  assert.notEqual(cleared, savedMessage('normal'));
  assert.ok(cleared.startsWith(savedMessage('normal')));
});

test('保存した時の知らせは、保存しなかった種類がある時だけ、下限の打鍵の数を挙げる', () => {
  const all = sentenceSavedMessage(measurement(ALL));
  const partial = sentenceSavedMessage(measurement({ arpeggio: 10, other: 20, repeat: 30 }));
  assert.ok(partial.startsWith(all));
  assert.ok(partial.includes(`${SENTENCE_MIN_SAMPLES}打`));
});

test('消える・置き換わる打鍵の上乗せは、全体・かなの中・かなの境目をまとめて差の種類の名前で並べる', () => {
  const text = measurementEffectText('directional', true, ['arpeggio', 'arpeggio-within', 'arpeggio-boundary', 'chain-within', 'sfb', 'repeat']) ?? '';
  assert.ok(text.includes('Arpeggio・Chain・同指連続'));
  assert.ok(!text.includes('かなの'));
  const cleared = clearedOverheadsText(['other', 'other-within', 'other-boundary', 'sfb'], ['repeat']);
  assert.ok(cleared.includes('その他・同指連続'));
  assert.ok(!cleared.includes('かなの'));
});

test('同時押しを測る前の文は、文章に入った分け方を測る時だけ消えると伝え、記録が無い時は今まで通りに伝える', () => {
  const noRecord = measurementEffectText('simultaneous', true, ['other', 'repeat']) ?? '';
  const included = measurementEffectText('simultaneous', true, ['other', 'repeat'], [], ['both-hands', 'thumb']) ?? '';
  const none = measurementEffectText('simultaneous', true, ['other', 'repeat'], [], []) ?? '';
  const repeatOnly = measurementEffectText('simultaneous', true, ['repeat']) ?? '';
  // 入っていた分け方の名前を挙げる
  assert.ok(included.includes('両手の同時押し') && included.includes('親指との同時押し'));
  assert.ok(!included.includes('片手の同時押し'));
  // 入っていた分け方が無い時と、消える種類が無い時は、打鍵の上乗せが消える旨を足さない
  assert.equal(none, repeatOnly);
  assert.equal(measurementEffectText('simultaneous', true, ['repeat'], [], ['thumb']), repeatOnly);
  assert.ok(noRecord.includes('その他') && noRecord.includes('消えます'));
  assert.ok(!none.includes('その他'));
});

test('測った後の知らせは、打鍵の上乗せを消した時だけ出る', () => {
  assert.equal(clearedOverheadsText([], []), '');
  assert.notEqual(clearedOverheadsText(['other'], []), '');
});

test('移動の時間を0にした指の知らせは、指が無ければ出さず、指の名前を挙げる', () => {
  assert.equal(zeroMoveFingersText([]), undefined);
  assert.ok(zeroMoveFingersText(['LI'])?.includes(FINGER_LABEL.LI));
  const two = zeroMoveFingersText(['LI', 'RI']);
  assert.ok(two?.includes(FINGER_LABEL.LI) && two.includes(FINGER_LABEL.RI));
});

test('保存値が数値の0の指の行にだけ、移動の時間の注記を出す', () => {
  const saved = { LI: 0, RI: 12.5 };
  assert.equal(zeroMoveRowNote('finger:LI', saved), ZERO_MOVE_ROW_NOTE);
  assert.equal(zeroMoveRowNote('finger:RI', saved), undefined);
  // まだ測っていない指
  assert.equal(zeroMoveRowNote('finger:LM', saved), undefined);
  // 代表値の行・同じキーを続けて打つ速さの行
  assert.equal(zeroMoveRowNote('fallback-move', { ...saved, LM: 0 }), undefined);
  assert.equal(zeroMoveRowNote('finger-repeat:LI', saved), undefined);
});

/** 文を区切りの位置で分けて`|`でつなぐ。 */
function withBreaks(sentence: string, breaks: readonly number[]): string {
  const characters = [...sentence];
  return characters.map((character, index) => (breaks.includes(index) ? `|${character}` : character)).join('');
}

test('測定の文の文節の区切りは、手で付けた20か所で、各文に1つ以上ある', () => {
  assert.deepEqual(
    MEASUREMENT_SENTENCES.map((sentence, index) => withBreaks(sentence, MEASUREMENT_SENTENCE_BREAKS[index])),
    [
      'こんしゅうの|どようびに',
      'えいがを|みに|いく',
      'まいにち|すこしずつ',
      'にほんごを|べんきょうする',
      'あしたの|かいぎの',
      'しりょうを|じゅんびした',
      'せんせいが|おしえて|くれた',
      'ことを|わすれない',
      'かぞくで|ふゆやすみに',
      'りょこうに|いきたい',
      'この|ほんは|とても',
      'おもしろくて|やめられない',
      'あたらしい|くつを',
      'かって|もらって|うれしい',
      'なつやすみには|うみへ',
      'あそびに|いきたい',
    ],
  );
  assert.equal(MEASUREMENT_SENTENCE_BREAKS.length, MEASUREMENT_SENTENCES.length);
  for (const breaks of MEASUREMENT_SENTENCE_BREAKS) assert.ok(breaks.length >= 1);
  assert.equal(MEASUREMENT_SENTENCE_BREAKS.flat().length, 20);
});

test('区切りで分けた文をつなぎ直すと元の文に戻り、区切りは0と末尾を含まず昇順に並ぶ', () => {
  MEASUREMENT_SENTENCES.forEach((sentence, index) => {
    const breaks = MEASUREMENT_SENTENCE_BREAKS[index];
    const characters = [...sentence];
    const edges = [0, ...breaks, characters.length];
    const phrases = edges.slice(0, -1).map((start, at) => characters.slice(start, edges[at + 1]).join(''));
    assert.equal(phrases.join(''), sentence);
    assert.ok(phrases.every((phrase) => phrase !== ''));
    assert.ok(breaks.every((position, at) => position > 0 && position < characters.length && (at === 0 || position > breaks[at - 1])));
  });
});

test('表の「保存したか」は、選ぶ前は保存する時の状態、選んだ後は保存した結果か保存しなかった旨を示す', () => {
  assert.equal(sentenceTableSavedText('saved', 'pending'), '保存する値');
  assert.equal(sentenceTableSavedText('below-minimum', 'pending'), '保存しない（10打未満）');
  assert.equal(sentenceTableSavedText('out-of-range', 'pending'), '保存しない（範囲外）');
  assert.equal(sentenceTableSavedText('saved', 'after-save'), '保存した');
  assert.equal(sentenceTableSavedText('below-minimum', 'after-save'), '未保存（10打未満）');
  assert.equal(sentenceTableSavedText('saved', 'after-decline'), '保存しなかった');
  assert.equal(sentenceTableSavedText('out-of-range', 'after-decline'), '未保存（範囲外）');
  // 詳しい文は、マスの中の文と同じ語を引く
  assert.ok(sentenceTableSavedDetail('below-minimum', 'pending').startsWith('「保存しない（10打未満）」は'));
  assert.ok(sentenceTableSavedDetail('below-minimum', 'after-save').startsWith('「未保存（10打未満）」は'));
});
