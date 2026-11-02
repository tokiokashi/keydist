import test from 'node:test';
import assert from 'node:assert/strict';
import { LAYOUT_BY_ID } from '#input/layouts/index.ts';
import { inputAlternativeSelectionIdentity } from '#input/semantics/index.ts';
import { evaluationCanonicalInputs } from '#input/text/char-alias.ts';
import { romajiToKana, romajiTypingCorrectness } from './live-romaji.ts';
import { reverseLookup, reverseLookupGuideIndexForText, reverseLookupStepMatchesRecognition } from './reverse-lookup.ts';
import { typingTargetPresentation } from './typing-target.ts';

const fullwidthLayout = LAYOUT_BY_ID.get('asuka')!;
const qwerty = LAYOUT_BY_ID.get('qwerty')!;

const stepKeys = (layoutId: string, text: string) => {
  const routes = reverseLookup(LAYOUT_BY_ID.get(layoutId)!, text, 1);
  return routes[0]?.steps.map((step) => step.actions.map((action) => [...action]));
};

test('前提: 飛鳥は見出しを全角形だけで持ち、QWERTYは半角で持つ', () => {
  assert.ok(fullwidthLayout.canonicalInputs.has('！') && !fullwidthLayout.canonicalInputs.has('!'));
  assert.ok(qwerty.canonicalInputs.has('!') && !qwerty.canonicalInputs.has('！'));
});

test('テキストが半角で見出しが全角形の配列でも、同じキーで逆引きできる', () => {
  assert.ok(stepKeys('asuka', '!?'));
  assert.deepEqual(stepKeys('asuka', '!?'), stepKeys('asuka', '！？'));
});

test('テキストが全角形で見出しが半角の配列でも、同じキーで逆引きできる', () => {
  assert.ok(stepKeys('qwerty', '！？'));
  assert.deepEqual(stepKeys('qwerty', '！？'), stepKeys('qwerty', '!?'));
  assert.ok(stepKeys('qwerty', 'あ！'));
});

test('かな配列: 半角のテキストを、全角形の出力で打ち終えられる（誤入力なし・完了）', () => {
  const partial = typingTargetPresentation(fullwidthLayout, '!?', '！');
  assert.deepEqual(
    partial.typed.map((item) => item.correct),
    [true],
  );
  assert.deepEqual(partial.remaining, ['?']);
  assert.equal(partial.complete, false);
  const done = typingTargetPresentation(fullwidthLayout, '!?', '！？');
  assert.ok(done.typed.every((item) => item.correct));
  assert.equal(done.complete, true);
  // 画面に出すテキストは元のまま
  assert.deepEqual(typingTargetPresentation(fullwidthLayout, '!?', '').remaining, ['!', '?']);
});

test('ローマ字配列: 全角形のテキストを、半角の出力で打ち終えられる（誤入力なし・完了）', () => {
  const table = qwerty.romajiTable!;
  const done = typingTargetPresentation(qwerty, 'あ！い？', romajiToKana('a!i?', table));
  assert.ok(done.typed.every((item) => item.correct));
  assert.equal(done.complete, true);
  const partial = typingTargetPresentation(qwerty, 'あ！い？', romajiToKana('a!', table));
  assert.deepEqual(
    partial.typed.map((item) => item.correct),
    [true, true],
  );
  assert.equal(partial.complete, false);
  // 別の記号を打つと誤入力のまま
  const wrong = typingTargetPresentation(qwerty, 'あ！', romajiToKana('a?', table));
  assert.deepEqual(
    wrong.typed.map((item) => item.correct),
    [true, false],
  );
  assert.equal(wrong.complete, false);
  assert.deepEqual(romajiTypingCorrectness('あ!', 'あ！', table), [true, true]);
});

test('全角形の英字は半角の英字と同じに扱わない', () => {
  const done = typingTargetPresentation(fullwidthLayout, 'Ａ', 'A');
  assert.equal(done.complete, false);
  assert.deepEqual(
    done.typed.map((item) => item.correct),
    [false],
  );
});

test('案内の進み具合と打鍵の認識も、幅の違いを同じに扱う', () => {
  const route = reverseLookup(fullwidthLayout, '!?', 1)[0]!;
  assert.equal(reverseLookupGuideIndexForText(fullwidthLayout, route, '！'), route.steps[0]!.actions.length);
  const accepted = route.steps[0]!.acceptedAlternativeSelectionIdentities;
  const alternative = [...fullwidthLayout.canonicalInputs.get('！')!].find((candidate) =>
    accepted.includes(inputAlternativeSelectionIdentity(candidate)),
  )!;
  assert.equal(reverseLookupStepMatchesRecognition(route.steps[0]!, { output: '！', alternative }), true);
});

test('見出しの表は評価と同じ関数を共有し、全角形の見出しは半角の見出しへ合流する', () => {
  const merged = evaluationCanonicalInputs(fullwidthLayout);
  assert.ok(merged.has('!'));
  assert.ok(!merged.has('！'));
  assert.equal(evaluationCanonicalInputs(fullwidthLayout), merged);
});

test('案内に出す出力の文字は、選んだ候補の元の見出しにする', () => {
  const outputsOf = (layout: typeof qwerty, text: string) => reverseLookup(layout, text, 1)[0]!.steps.map((step) => step.output);
  assert.deepEqual(outputsOf(fullwidthLayout, 'あ！'), ['あ', '！']);
  assert.deepEqual(outputsOf(fullwidthLayout, 'あ!'), ['あ', '！']);
  assert.deepEqual(outputsOf(qwerty, '！'), ['!']);
  const naginata = LAYOUT_BY_ID.get('naginata-v18')!;
  const labels = outputsOf(naginata, 'え？');
  assert.equal(labels.at(-1), '？');
  // 半角の見出しも持つ薙刀式では、選んだキー自身の見出しが出る
  assert.deepEqual(outputsOf(naginata, 'あ！'), ['あ', '!']);
});
