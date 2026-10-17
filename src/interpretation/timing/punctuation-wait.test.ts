import assert from 'node:assert/strict';
import test from 'node:test';
import { NO_PUNCTUATION_WAIT, planPunctuationWaits, type PunctuationWaitMs } from './punctuation-wait.ts';

/** 4つとも違う値にして、どの項目がどの位置に入ったかを区別する。 */
const WAITS: PunctuationWaitMs = { commaBeforeMs: 300, commaAfterMs: 200, periodBeforeMs: 100, periodAfterMs: 500 };

/** 1文字を1ステップで打つ並び。`covered`に無い位置は打てずに読み飛ばされた文字。 */
function strokesOf(covered: readonly number[]) {
  return covered.map((at) => ({ kanaStart: at, kanaEnd: at }));
}

test('打てる読点・句点: 前の待機は入力単位の最初のステップの前、後の待機は最後のステップの後に入る', () => {
  const plan = planPunctuationWaits('あ、い。', strokesOf([0, 1, 2, 3]), WAITS, true);
  // ステップ0=あ、1=、、2=い、3=。。間は [0]あの前・[1]、の前・[2]い（、の後）の前・[3]。の前・[4]末尾（。の後）
  assert.deepEqual(plan.gapMs, [0, 300, 200, 100, 500]);
});

test('複数のステップで打つ読点: 前の待機は最初のステップの前、後の待機は最後のステップの後に入る', () => {
  const plan = planPunctuationWaits(
    'あ、い',
    [
      { kanaStart: 0, kanaEnd: 0 },
      { kanaStart: 1, kanaEnd: 1 },
      { kanaStart: 1, kanaEnd: 1 },
      { kanaStart: 2, kanaEnd: 2 },
    ],
    WAITS,
    true,
  );
  assert.deepEqual(plan.gapMs, [0, 300, 0, 200, 0]);
});

test('打てない読点・句点: テキストのその位置に前の待機と後の待機を続けて足す', () => {
  const plan = planPunctuationWaits('あ，い．', strokesOf([0, 2]), WAITS, true);
  // ，はあとい、．はいの後ろ（最後のステップの後）
  assert.deepEqual(plan.gapMs, [0, 300 + 200, 100 + 500]);
});

test('先頭で打てない句点は、最初のステップの前に足す', () => {
  const plan = planPunctuationWaits('。あ', strokesOf([1]), WAITS, true);
  assert.deepEqual(plan.gapMs, [100 + 500, 0]);
});

test('読点・句点が続く時は、それぞれの待機をそのまま順に足す', () => {
  // 、。が両方打てる: 、の後の待機と。の前の待機が同じ間に入る
  const covered = planPunctuationWaits('あ、。い', strokesOf([0, 1, 2, 3]), WAITS, true);
  assert.deepEqual(covered.gapMs, [0, 300, 200 + 100, 500, 0]);
  // 、。が両方打てない: 4つを続けて足す
  const skipped = planPunctuationWaits('あ、。い', strokesOf([0, 3]), WAITS, true);
  assert.deepEqual(skipped.gapMs, [0, 300 + 200 + 100 + 500, 0]);
  // 同じ読点が続く時も、まとめたり重ねたりしない
  const twice = planPunctuationWaits('、、あ', strokesOf([2]), WAITS, true);
  assert.deepEqual(twice.gapMs, [(300 + 200) * 2, 0]);
});

test('同じ役の文字には同じ待機を当てる', () => {
  for (const comma of ['、', '，', ',']) {
    assert.deepEqual(planPunctuationWaits(`あ${comma}い`, strokesOf([0, 1, 2]), WAITS, true).gapMs, [0, 300, 200, 0]);
  }
  for (const period of ['。', '．', '.']) {
    assert.deepEqual(planPunctuationWaits(`あ${period}い`, strokesOf([0, 1, 2]), WAITS, true).gapMs, [0, 100, 500, 0]);
  }
});

test('読点・句点以外の文字には待機を足さない', () => {
  const plan = planPunctuationWaits('あ！？・い', strokesOf([0, 1, 2, 3, 4]), WAITS, true);
  assert.deepEqual(plan.gapMs, [0, 0, 0, 0, 0, 0]);
});

test('日本語でないテキストには足さない', () => {
  const plan = planPunctuationWaits('a, b.', strokesOf([0, 1, 2, 3, 4]), WAITS, false);
  assert.deepEqual(plan.gapMs, new Array(6).fill(0));
  assert.deepEqual(plan.use, { commaBeforeMs: false, commaAfterMs: false, periodBeforeMs: false, periodAfterMs: false });
});

test('足す位置があり0でない項目だけが使われた項目になる', () => {
  const onlyComma = planPunctuationWaits('あ、い', strokesOf([0, 1, 2]), WAITS, true);
  assert.deepEqual(onlyComma.use, { commaBeforeMs: true, commaAfterMs: true, periodBeforeMs: false, periodAfterMs: false });
  // 打てない句点も使われた項目に数える
  const skipped = planPunctuationWaits('あ。い', strokesOf([0, 2]), WAITS, true);
  assert.deepEqual(skipped.use, { commaBeforeMs: false, commaAfterMs: false, periodBeforeMs: true, periodAfterMs: true });
  const zero = planPunctuationWaits('あ、い。', strokesOf([0, 1, 2, 3]), { ...NO_PUNCTUATION_WAIT, periodAfterMs: 500 }, true);
  assert.deepEqual(zero.use, { commaBeforeMs: false, commaAfterMs: false, periodBeforeMs: false, periodAfterMs: true });
});

test('待機がすべて0なら、どの間も0', () => {
  const plan = planPunctuationWaits('あ、い。', strokesOf([0, 1, 2, 3]), NO_PUNCTUATION_WAIT, true);
  assert.deepEqual(plan.gapMs, [0, 0, 0, 0, 0]);
});
