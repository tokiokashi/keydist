import assert from 'node:assert/strict';
import test from 'node:test';
import { SEGMENT_SEED_COUNT } from '#interpretation/segments.ts';
import { RUN_CHART_PANE_META } from './pane-meta.ts';

const { help } = RUN_CHART_PANE_META;
const helpText = [...help.notes, ...help.items.flatMap((item) => [item.name, item.description])].join('\n');

test('ⓘの説明に、目安線の幅の求め方と、目安が統計的な保証でないことを入れる', () => {
  for (const phrase of [
    '目安線は、中心線から上下に、全体のばらつきの3倍を範囲の大きさの平方根で割った幅を引いています',
    '統計的な保証ではなく、外れている箇所を探す目安です',
  ]) {
    assert.ok(helpText.includes(phrase), phrase);
  }
});

test('ⓘの説明に、ランダムの作り方と、順位が端に来る確率・同じ値の扱い・有意かどうかを入れる', () => {
  for (const phrase of [
    'ランダムの区切りは、文節の区間の長さを並べ替えて作ります',
    `2/${SEGMENT_SEED_COUNT + 1}の確率で端（1番目か${SEGMENT_SEED_COUNT + 1}番目）に来ます`,
    '同じ値がある時は幅で示し、端に数えるのは、ランダムのどの値よりも厳密に小さいか大きい時だけです',
    '順位は統計的に有意かどうかを示すものではありません',
  ]) {
    assert.ok(helpText.includes(phrase), phrase);
  }
});

test('ⓘの説明に、優劣の判定や順位付けの注記を入れない', () => {
  assert.doesNotMatch(helpText, /優劣/u);
});
