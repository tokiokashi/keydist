import assert from 'node:assert/strict';
import test from 'node:test';
import { BUNSETSU_STATS_PANE_META } from './pane-meta.ts';

const { description, help } = BUNSETSU_STATS_PANE_META;
const helpText = [...help.notes, ...help.items.flatMap((item) => [item.name, item.description])].join('\n');
// 文節頭・文節中の定義の1文だけは、「1文字目」「2文字目以降」を言う唯一の箇所
const DEFINITION_SENTENCE = '文節頭は文節の1文字目、文節中は文節の2文字目以降です。';

test('短い説明と ⓘ の説明に、実装の中の呼び方（境目・内側）を出さない', () => {
  assert.doesNotMatch(description, /境目|内側/u);
  assert.doesNotMatch(helpText, /境目|内側/u);
});

test('列の名前は「文節頭」「文節中」で、「1文字目」「2文字目以降」は定義の1文以外に出さない', () => {
  assert.ok(help.notes.includes(DEFINITION_SENTENCE));
  for (const text of [description, helpText.replace(DEFINITION_SENTENCE, '')]) {
    assert.doesNotMatch(text, /1文字目|2文字目以降/u);
  }
});

test('ⓘの説明に、列と一覧の定義を入れる', () => {
  for (const phrase of [
    'テキストの先頭の文字は、文節頭にも文節中にも数えません',
    '打てない文字は、文節頭と文節中の列と、文節頭の距離の割合の列に数えません',
    '標準偏差は母標準偏差です',
    '文節頭を含み、打てない文字も文字数に数えます',
    '文字数1の文節は除きます',
    'セルは、文節中の1文字あたりの距離です',
    'またいだ出現と文節の中の出現のそれぞれの平均距離です',
    '配列の値では並べ替えません',
    '距離は [u]',
  ]) {
    assert.ok(helpText.includes(phrase), phrase);
  }
});
