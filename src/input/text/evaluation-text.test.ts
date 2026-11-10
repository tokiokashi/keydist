import assert from 'node:assert/strict';
import test from 'node:test';
import { prepareEvaluationText } from './evaluation-text.ts';

/** 見出しの集合での最長一致で、見出しに入らない文字の位置を返す（かな配列の切り出しと同じ形）。 */
function uncoveredByLongestMatch(text: string, set: ReadonlySet<string>): number[] {
  const chars = [...text];
  const maxLength = Math.max(1, ...[...set].map((heading) => [...heading].length));
  const uncovered: number[] = [];
  for (let i = 0; i < chars.length; ) {
    let length = Math.min(maxLength, chars.length - i);
    while (length >= 1 && !set.has(chars.slice(i, i + length).join(''))) length--;
    if (length === 0) uncovered.push(i++);
    else i += length;
  }
  return uncovered;
}

/** 見出しの一覧から、前処理に渡す配列側の引数を作る。 */
function headings(list: readonly string[]) {
  const set = new Set(list);
  return {
    layoutHasChar: (char: string) => set.has(char),
    uncoveredPositions: (text: string) => uncoveredByLongestMatch(text, set),
  };
}

/** 片仮名の見出しを持たない配列。 */
const NO_HEADINGS = headings([]);

test('日本語: 既定の範囲は、かな・長音・々・空白と、、。だけを残す', () => {
  const text = 'ひらがなかたかなー々\t、。\n';
  assert.equal(prepareEvaluationText(text, { language: 'ja', keepSymbols: false, keepAlphanumerics: false, ...NO_HEADINGS }), text);
});

test('日本語: 既定の範囲は、半角と全角の英字と数字を取り除く', () => {
  const text = 'あabcＡＢＣいé123１２３う';
  assert.equal(prepareEvaluationText(text, { language: 'ja', keepSymbols: false, keepAlphanumerics: false, ...NO_HEADINGS }), 'あいう');
});

test('日本語: 英字と数字を残す条件では、英字と数字をそのまま残す', () => {
  const text = 'あabcＡＢＣ123１２３い';
  assert.equal(prepareEvaluationText(text, { language: 'ja', keepSymbols: false, keepAlphanumerics: true, ...NO_HEADINGS }), text);
});

test('日本語: 英字と数字を取り除く範囲は、配列が見出しとして持つ英字と数字も取り除く', () => {
  const out = prepareEvaluationText('あa1い', { language: 'ja', keepSymbols: false, keepAlphanumerics: false, ...headings([...'a1']) });
  assert.equal(out, 'あい');
});

test('日本語: 英字と数字を取り除く範囲に、漢数字・〇・ギリシャ文字・十進でない数字は入らない', () => {
  const text = '一二〇〇αβ①';
  assert.equal(prepareEvaluationText(text, { language: 'ja', keepSymbols: false, keepAlphanumerics: false, ...NO_HEADINGS }), text);
});

test('日本語: 記号の範囲と英字と数字の範囲は、互いの結果を変えない', () => {
  const text = 'あ!a1「い」、';
  const prepare = (keepSymbols: boolean, keepAlphanumerics: boolean) =>
    prepareEvaluationText(text, { language: 'ja', keepSymbols, keepAlphanumerics, ...NO_HEADINGS });
  assert.equal(prepare(false, false), 'あい、');
  assert.equal(prepare(true, false), 'あ!「い」、');
  assert.equal(prepare(false, true), 'あa1い、');
  assert.equal(prepare(true, true), 'あ!a1「い」、');
});

test('日本語: 英字と数字を挟んだ片仮名は、取り除いた後の隣り合う文字で見出しに当たる', () => {
  const out = prepareEvaluationText('ヴaァ', { language: 'ja', keepSymbols: false, keepAlphanumerics: false, ...headings(['ヴァ']) });
  assert.equal(out, 'ヴァ');
});

test('日本語: 既定の範囲は、、。以外の記号を取り除く', () => {
  const out = prepareEvaluationText('あ「い」！う？え・お〜か…き゛く゜け!こ?', {
    language: 'ja',
    keepSymbols: false,
    keepAlphanumerics: false,
    ...headings([...'!?']),
  });
  assert.equal(out, 'あいうえおかきくけこ');
});

test('日本語: 範囲を広げると記号をすべて残す', () => {
  const text = 'あ「い」！う？え・お〜か…，．!';
  assert.equal(prepareEvaluationText(text, { language: 'ja', keepSymbols: true, keepAlphanumerics: false, ...NO_HEADINGS }), text);
});

test('日本語: 配列が半角の , . を持たなければ 、 。 に解決する', () => {
  for (const keepSymbols of [false, true]) {
    assert.equal(prepareEvaluationText('あ,い.う', { language: 'ja', keepSymbols, keepAlphanumerics: false, ...NO_HEADINGS }), 'あ、い。う');
  }
});

test('日本語: 配列が半角の , . を持てばそのまま残す', () => {
  for (const keepSymbols of [false, true]) {
    assert.equal(prepareEvaluationText('あ,い.う', { language: 'ja', keepSymbols, keepAlphanumerics: false, ...headings([...',.']) }), 'あ,い.う');
  }
});

test('日本語: , と . は配列ごとに別に判定する', () => {
  assert.equal(prepareEvaluationText(',.', { language: 'ja', keepSymbols: false, keepAlphanumerics: false, ...headings([...',']) }), ',。');
});

test('日本語: 、 。 を半角へ戻す解決はしない', () => {
  assert.equal(prepareEvaluationText('、。', { language: 'ja', keepSymbols: false, keepAlphanumerics: false, ...headings([...',.']) }), '、。');
});

test('英語: 範囲の切り替えに関わらず何も変えない', () => {
  const text = 'It\'s (a) test; "ok", yes. 〜！';
  for (const keepSymbols of [false, true]) {
    for (const keepAlphanumerics of [false, true]) {
      assert.equal(prepareEvaluationText(text, { language: 'en', keepSymbols, keepAlphanumerics, ...NO_HEADINGS }), text);
    }
  }
});

const prepare = (text: string, list: readonly string[], language: 'ja' | 'en' = 'ja') =>
  prepareEvaluationText(text, { language, keepSymbols: false, keepAlphanumerics: false, ...headings(list) });

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

test('片仮名: ひらがなだけの見出しと重なる時は、全部の見出しの最長一致で切って残す', () => {
  // 先頭から切ると しん|アイ。片仮名を含む見出しだけで切ると んア を残してしまう
  assert.equal(prepare('しんアイ', ['しん', 'んア', 'アイ', 'い']), 'しんアイ');
});

test('片仮名: 直したひらがなが隣の片仮名と見出しを組む時は、組んだ見出しに入らない片仮名も直す', () => {
  // ン → ん の後は んア|い と切れる。アイ を残すと イ が見出しに入らない
  assert.equal(prepare('ンアイ', ['んア', 'アイ', 'い']), 'んアい');
});

test('片仮名: 取り除く記号を挟んだ隣も、切り出しに使う', () => {
  assert.equal(prepare('し・んアイ', ['し', 'しん', 'んア', 'アイ', 'い']), 'しんアイ');
});

test('片仮名: 直した文字が、残した片仮名と別の見出しを組まない時は、残した片仮名はそのまま', () => {
  assert.equal(prepare('ンアイ', ['んあ', 'アイ', 'ん']), 'んアイ');
});

test('片仮名: 片仮名とひらがなが混じった見出しは、原文がその形の時だけ残す', () => {
  assert.equal(prepare('ヴァ', ['ヴぁ']), 'ゔぁ');
  assert.equal(prepare('ヴぁ', ['ヴぁ']), 'ヴぁ');
});
