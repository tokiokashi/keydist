import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setupColor, setupColorIndex, SETUP_COLOR_PALETTE_SIZE } from './color.ts';

test('setupColor: 同じidなら常に同じ色（決定的）', () => {
  const id = 'setup-abc-123';
  const first = setupColor(id);
  for (let i = 0; i < 5; i++) assert.equal(setupColor(id), first);
});

test('setupColorIndex: パレットの範囲内に収まる', () => {
  for (const id of ['a', 'b', 'setup-1', 'setup-2', '日本語のid', '']) {
    const index = setupColorIndex(id);
    assert.ok(index >= 0 && index < SETUP_COLOR_PALETTE_SIZE, `index=${index} for id=${id}`);
  }
});

test('setupColor: idが違えば同じ色になるとは限らない（パレットを分散して使う）', () => {
  const ids = Array.from({ length: 30 }, (_, i) => `setup-${i}`);
  const colors = new Set(ids.map(setupColor));
  // 30個のidを12色のパレットへ配れば、全て同じ色に潰れることは無い。
  assert.ok(colors.size > 1);
});

test('setupColor: 配列も形状も同じで上書きだけ違う2つのSetup（idが別）は別の色を持ちうる', () => {
  // 色はlayoutId+shapeIdではなくsetup idから決める（overrides.tsと同じ理由: ポリシー比較用途で
  // 同じ配列・形状のSetupを2つ作った時に、色でも区別できる必要がある）。
  const colorA = setupColor('setup-compare-a');
  const colorB = setupColor('setup-compare-b');
  // 衝突しても仕様上は許容するが、少なくとも「同じ関数が常に同じ結果を返す」ことは保証する。
  assert.equal(setupColor('setup-compare-a'), colorA);
  assert.equal(setupColor('setup-compare-b'), colorB);
});
