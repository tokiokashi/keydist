import assert from 'node:assert/strict';
import test from 'node:test';
import { prepareEvaluationText } from './evaluation-text.ts';

const has = (chars: string) => (char: string) => [...chars].includes(char);

test('日本語: 既定の範囲は、かな・長音・々・英数字・空白と、、。だけを残す', () => {
  const text = 'ひらがなカタカナー々abc123\t、。\n';
  assert.equal(prepareEvaluationText(text, { language: 'ja', keepSymbols: false, layoutHasChar: has('') }), text);
});

test('日本語: 既定の範囲は、、。以外の記号を取り除く', () => {
  const out = prepareEvaluationText('あ「い」！う？え・お〜か…き゛く゜け!こ?', {
    language: 'ja',
    keepSymbols: false,
    layoutHasChar: has('!?'),
  });
  assert.equal(out, 'あいうえおかきくけこ');
});

test('日本語: 範囲を広げると記号をすべて残す', () => {
  const text = 'あ「い」！う？え・お〜か…，．!';
  assert.equal(prepareEvaluationText(text, { language: 'ja', keepSymbols: true, layoutHasChar: has('') }), text);
});

test('日本語: 配列が半角の , . を持たなければ 、 。 に解決する', () => {
  for (const keepSymbols of [false, true]) {
    assert.equal(prepareEvaluationText('あ,い.う', { language: 'ja', keepSymbols, layoutHasChar: has('') }), 'あ、い。う');
  }
});

test('日本語: 配列が半角の , . を持てばそのまま残す', () => {
  for (const keepSymbols of [false, true]) {
    assert.equal(prepareEvaluationText('あ,い.う', { language: 'ja', keepSymbols, layoutHasChar: has(',.') }), 'あ,い.う');
  }
});

test('日本語: , と . は配列ごとに別に判定する', () => {
  assert.equal(prepareEvaluationText(',.', { language: 'ja', keepSymbols: false, layoutHasChar: has(',') }), ',。');
});

test('日本語: 、 。 を半角へ戻す解決はしない', () => {
  assert.equal(prepareEvaluationText('、。', { language: 'ja', keepSymbols: false, layoutHasChar: has(',.') }), '、。');
});

test('英語: 範囲の切り替えに関わらず何も変えない', () => {
  const text = 'It\'s (a) test; "ok", yes. 〜！';
  for (const keepSymbols of [false, true]) {
    assert.equal(prepareEvaluationText(text, { language: 'en', keepSymbols, layoutHasChar: has('') }), text);
  }
});
