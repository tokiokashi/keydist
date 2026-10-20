import assert from 'node:assert/strict';
import test from 'node:test';
import { hasConvertibleKatakana, prepareEvaluationText } from './evaluation-text.ts';

/** 見出しの一覧から、前処理に渡す配列側の引数を作る。 */
function headings(list: readonly string[]) {
  const set = new Set(list);
  return {
    layoutHasChar: (char: string) => set.has(char),
    layoutHasHeading: (heading: string) => set.has(heading),
    maxKatakanaHeadingLength: Math.max(0, ...list.filter((heading) => hasConvertibleKatakana(heading)).map((heading) => [...heading].length)),
  };
}

/** 片仮名の見出しを持たない配列。 */
const NO_HEADINGS = headings([]);

test('日本語: 既定の範囲は、かな・長音・々・英数字・空白と、、。だけを残す', () => {
  const text = 'ひらがなかたかなー々abc123\t、。\n';
  assert.equal(prepareEvaluationText(text, { language: 'ja', keepSymbols: false, ...NO_HEADINGS }), text);
});

test('日本語: 既定の範囲は、、。以外の記号を取り除く', () => {
  const out = prepareEvaluationText('あ「い」！う？え・お〜か…き゛く゜け!こ?', {
    language: 'ja',
    keepSymbols: false,
    ...headings([...'!?']),
  });
  assert.equal(out, 'あいうえおかきくけこ');
});

test('日本語: 範囲を広げると記号をすべて残す', () => {
  const text = 'あ「い」！う？え・お〜か…，．!';
  assert.equal(prepareEvaluationText(text, { language: 'ja', keepSymbols: true, ...NO_HEADINGS }), text);
});

test('日本語: 配列が半角の , . を持たなければ 、 。 に解決する', () => {
  for (const keepSymbols of [false, true]) {
    assert.equal(prepareEvaluationText('あ,い.う', { language: 'ja', keepSymbols, ...NO_HEADINGS }), 'あ、い。う');
  }
});

test('日本語: 配列が半角の , . を持てばそのまま残す', () => {
  for (const keepSymbols of [false, true]) {
    assert.equal(prepareEvaluationText('あ,い.う', { language: 'ja', keepSymbols, ...headings([...',.']) }), 'あ,い.う');
  }
});

test('日本語: , と . は配列ごとに別に判定する', () => {
  assert.equal(prepareEvaluationText(',.', { language: 'ja', keepSymbols: false, ...headings([...',']) }), ',。');
});

test('日本語: 、 。 を半角へ戻す解決はしない', () => {
  assert.equal(prepareEvaluationText('、。', { language: 'ja', keepSymbols: false, ...headings([...',.']) }), '、。');
});

test('英語: 範囲の切り替えに関わらず何も変えない', () => {
  const text = 'It\'s (a) test; "ok", yes. 〜！';
  for (const keepSymbols of [false, true]) {
    assert.equal(prepareEvaluationText(text, { language: 'en', keepSymbols, ...NO_HEADINGS }), text);
  }
});

const prepare = (text: string, list: readonly string[], language: 'ja' | 'en' = 'ja') =>
  prepareEvaluationText(text, { language, keepSymbols: false, ...headings(list) });

test('片仮名: ァ から ヴ までをひらがなに書き換える', () => {
  assert.equal(
    prepare('ァアィイゥウェエォオカガキギクグヂヅテデトドニヌネノハバパフブプホボポマミムメモャヤュユョヨラリルレロヮワヰヱヲンヴ', []),
    'ぁあぃいぅうぇえぉおかがきぎくぐぢづてでとどにぬねのはばぱふぶぷほぼぽまみむめもゃやゅゆょよらりるれろゎわゐゑをんゔ',
  );
});

test('片仮名: 長音・ヵ・ヶ・ヷからヺ・半角の片仮名は書き換えない', () => {
  const text = 'ー\u30F5\u30F6\u30F7\u30F8\u30F9\u30FAｱｲｳﾞ';
  assert.equal(prepare(text, []), text);
  assert.equal(prepare('ニャーニャー', []), 'にゃーにゃー');
});

test('片仮名: 配列が見出しとして持つ文字列はそのまま残し、持たない部分だけ書き換える', () => {
  assert.equal(prepare('ヴォ', ['ヴ']), 'ヴぉ');
  assert.equal(prepare('ヴ', ['ヴ']), 'ヴ');
  assert.equal(prepare('ヴ', []), 'ゔ');
});

test('片仮名: 複数文字の見出しは原文を最長一致で切り出して残す', () => {
  const list = ['ヴ', 'ヴァ', 'ヴォ'];
  assert.equal(prepare('ヴァヴォヴィ', list), 'ヴァヴォヴぃ');
  assert.equal(prepare('ヴァ', ['ヴ']), 'ヴぁ');
});

test('片仮名: 片仮名とひらがなが混じった見出しも残す', () => {
  assert.equal(prepare('ヴぇい', ['ヴぇい']), 'ヴぇい');
  assert.equal(prepare('ヴぁヴぇ', ['ヴぁ', 'ヴぇ']), 'ヴぁヴぇ');
  assert.equal(prepare('ヴぇい', ['ヴ']), 'ヴぇい');
});

test('片仮名: 見出しに当たらない片仮名は、見出しの隣でもひらがなにする', () => {
  assert.equal(prepare('カヴァキ', ['ヴァ']), 'かヴァき');
});

test('片仮名: 英語のテキストには当てない', () => {
  assert.equal(prepare('ニャー ヴ', [], 'en'), 'ニャー ヴ');
});
