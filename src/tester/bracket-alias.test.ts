import test from 'node:test';
import assert from 'node:assert/strict';
import { LAYOUT_BY_ID } from '#input/layouts/index.ts';
import { applyBracketAliases } from '#input/text/bracket-alias.ts';
import { romajiToKana, romajiTypingCorrectness } from './live-romaji.ts';
import { reverseLookup } from './reverse-lookup.ts';
import { expectedTextFor, typingTargetPresentation } from './typing-target.ts';

const stepKeys = (layoutId: string, text: string) => {
  const layout = LAYOUT_BY_ID.get(layoutId)!;
  const routes = reverseLookup(layout, applyBracketAliases(text, layout), 1);
  return routes[0]?.steps.map((step) => step.actions.map((action) => [...action]));
};

test('ローマ字を経るQWERTYでは、『』を「」の綴りの[ ]で打って進める', () => {
  const qwerty = LAYOUT_BY_ID.get('qwerty')!;
  assert.equal(applyBracketAliases('『』', qwerty), '「」');
  assert.deepEqual(stepKeys('qwerty', '『』'), [[['[']], [[']']]]);

  const table = qwerty.romajiTable!;
  const expected = applyBracketAliases('あ『', qwerty);
  const typed = romajiToKana('a[', table);
  assert.equal(typed, 'あ「');
  assert.deepEqual(romajiTypingCorrectness(typed, expected, table), [true, true]);
  assert.equal(typed, expected);
  // 別名を当てない場合は、打った[が誤入力になる
  assert.deepEqual(romajiTypingCorrectness(typed, 'あ『', table), [true, false]);
});

test('『』を持つ薙刀式v18では、別名を当てず配列の定義で打つ', () => {
  const naginata = LAYOUT_BY_ID.get('naginata-v18')!;
  assert.equal(applyBracketAliases('『』「」', naginata), '『』「」');
  assert.deepEqual(stepKeys('naginata-v18', '『'), [[['j', 'k', 's']]]);
  assert.deepEqual(stepKeys('naginata-v18', '「'), [[['j', 'k', 'f']]]);
});

test('ローマ字テーブルが『』の綴りを持つせおと配列では、別名を当てず綴りv[ v]で打つ', () => {
  const seoto = LAYOUT_BY_ID.get('seoto')!;
  const table = seoto.romajiTable!;
  assert.equal(applyBracketAliases('『』', seoto), '『』');
  assert.equal(romajiToKana('v[v]', table), '『』');
  assert.deepEqual(romajiTypingCorrectness('『』', '『』', table), [true, true]);
  // せおと配列の綴りのvは、物理キーの/に当たる
  assert.deepEqual(stepKeys('seoto', '『』')?.flat(2), ['/', '[', '/', ']']);
});

test('ローマ字を経る配列で『』を[ ]で打つと、期待と一致して誤入力にならず、完了になる', () => {
  const qwerty = LAYOUT_BY_ID.get('qwerty')!;
  const table = qwerty.romajiTable!;
  const partial = typingTargetPresentation(qwerty, 'あ『い』', romajiToKana('a[', table));
  assert.deepEqual(
    partial.typed.map((item) => item.correct),
    [true, true],
  );
  assert.deepEqual(partial.remaining, ['い', '』']);
  assert.equal(partial.complete, false);

  const done = typingTargetPresentation(qwerty, 'あ『い』', romajiToKana('a[i]', table));
  assert.ok(done.typed.every((item) => item.correct));
  assert.equal(done.complete, true);
  assert.equal(expectedTextFor(qwerty, 'あ『い』'), 'あ「い」');
});

test('かな配列でも、『』を持たなければ「」の出力で打って完了になり、持つ配列では『』の出力が要る', () => {
  const jis = LAYOUT_BY_ID.get('jis-kana')!;
  assert.equal(typingTargetPresentation(jis, 'あ『い』', 'あ「い」').complete, true);
  assert.ok(typingTargetPresentation(jis, '『', '「').typed.every((item) => item.correct));
  const naginata = LAYOUT_BY_ID.get('naginata-v18')!;
  assert.equal(typingTargetPresentation(naginata, '『', '「').typed[0]?.correct, false);
  assert.equal(typingTargetPresentation(naginata, '『』', '『』').complete, true);
});

test('『』を持たないかな配列では、テキストの『』を「」の定義で打つ', () => {
  const jis = LAYOUT_BY_ID.get('jis-kana')!;
  assert.equal(applyBracketAliases('『あ』', jis), '「あ」');
  assert.deepEqual(stepKeys('jis-kana', '『』'), stepKeys('jis-kana', '「」'));
});
