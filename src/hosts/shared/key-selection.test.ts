import assert from 'node:assert/strict';
import test from 'node:test';
import {
  clearSelection,
  closeWindowsExcept,
  dropPane,
  EMPTY_KEY_SELECTION,
  keySelectionTargetOf,
  pressKey,
  selectedKeyOf,
  windowKeyOf,
} from './key-selection.ts';

const A = keySelectionTargetOf('qwerty', 'row-staggered');
const B = keySelectionTargetOf('dvorak', 'row-staggered');

test('対象は配列と物理配列の組で決まり、どちらかが違えば別の対象になる', () => {
  assert.equal(A, keySelectionTargetOf('qwerty', 'row-staggered'));
  assert.notEqual(A, keySelectionTargetOf('qwerty', 'ortho'));
  assert.notEqual(A, B);
  // 区切りを含むidでも、別の組と取り違えない
  assert.notEqual(keySelectionTargetOf('a,b', 'c'), keySelectionTargetOf('a', 'b,c'));
});

test('キーを押すと、そのペインの小窓が開き、同じ対象の選択が決まる', () => {
  const state = pressKey(EMPTY_KEY_SELECTION, 'p1', A, 'f');
  assert.equal(selectedKeyOf(state, A), 'f');
  assert.equal(windowKeyOf(state, 'p1', A), 'f');
  // 押していないペインには小窓が無い
  assert.equal(windowKeyOf(state, 'p2', A), undefined);
});

test('同じ対象の別のペインは選択を共有し、違う対象のペインには届かない', () => {
  const state = pressKey(EMPTY_KEY_SELECTION, 'p1', A, 'f');
  assert.equal(selectedKeyOf(state, A), 'f');
  assert.equal(selectedKeyOf(state, B), undefined);
  // 別の対象での選択は、先の対象の選択を変えない
  const both = pressKey(state, 'p3', B, 'j');
  assert.equal(selectedKeyOf(both, A), 'f');
  assert.equal(selectedKeyOf(both, B), 'j');
});

test('選択済みのキーを、小窓が開いているペインで押し直すと、選択を外して同じ対象の小窓を全部閉じる', () => {
  let state = pressKey(EMPTY_KEY_SELECTION, 'p1', A, 'f');
  state = pressKey(state, 'p2', A, 'f');
  assert.equal(windowKeyOf(state, 'p2', A), 'f');
  const cleared = pressKey(state, 'p2', A, 'f');
  assert.equal(selectedKeyOf(cleared, A), undefined);
  assert.equal(windowKeyOf(cleared, 'p1', A), undefined);
  assert.equal(windowKeyOf(cleared, 'p2', A), undefined);
  // 選び直しても、外す前に閉じていた小窓は開き直さない
  const again = pressKey(cleared, 'p2', A, 'f');
  assert.equal(windowKeyOf(again, 'p2', A), 'f');
  assert.equal(windowKeyOf(again, 'p1', A), undefined);
});

test('他のペインで選んだキーを、小窓が閉じているペインで押すと、選択は変えずにそのペインの小窓を開く', () => {
  const state = pressKey(EMPTY_KEY_SELECTION, 'p1', A, 'f');
  const opened = pressKey(state, 'p2', A, 'f');
  assert.equal(selectedKeyOf(opened, A), 'f');
  assert.equal(windowKeyOf(opened, 'p1', A), 'f');
  assert.equal(windowKeyOf(opened, 'p2', A), 'f');
});

test('別のキーを押すと、小窓を開いている全ペインが新しいキーに付いて動く', () => {
  let state = pressKey(EMPTY_KEY_SELECTION, 'p1', A, 'f');
  state = pressKey(state, 'p2', A, 'g');
  assert.equal(windowKeyOf(state, 'p1', A), 'g');
  assert.equal(windowKeyOf(state, 'p2', A), 'g');
});

test('対象を変えたペインの小窓は、前の対象の選択では開かない', () => {
  const state = pressKey(EMPTY_KEY_SELECTION, 'p1', A, 'f');
  // p1が映す対象がBに変わった。Bには選択が無い
  assert.equal(windowKeyOf(state, 'p1', B), undefined);
  // Bで選んでも、p1の記録はAのままなので、pressKeyで開き直すまで出ない
  const other = pressKey(state, 'p9', B, 'j');
  assert.equal(windowKeyOf(other, 'p1', B), undefined);
});

test('選択を外すと、その対象の小窓が閉じ、他の対象の選択と小窓は残る', () => {
  let state = pressKey(EMPTY_KEY_SELECTION, 'p1', A, 'f');
  state = pressKey(state, 'p2', B, 'j');
  const cleared = clearSelection(state, A);
  assert.equal(selectedKeyOf(cleared, A), undefined);
  assert.equal(windowKeyOf(cleared, 'p1', A), undefined);
  assert.equal(windowKeyOf(cleared, 'p2', B), 'j');
  // 何も無ければ同じ値を返す（不要な再描画を起こさない）
  assert.equal(clearSelection(EMPTY_KEY_SELECTION, A), EMPTY_KEY_SELECTION);
});

test('ペインを拡大した時は、他のペインの小窓だけを閉じ、選択は残す', () => {
  let state = pressKey(EMPTY_KEY_SELECTION, 'p1', A, 'f');
  state = pressKey(state, 'p2', A, 'f');
  const maximized = closeWindowsExcept(state, 'p2');
  assert.equal(windowKeyOf(maximized, 'p1', A), undefined);
  assert.equal(windowKeyOf(maximized, 'p2', A), 'f');
  assert.equal(selectedKeyOf(maximized, A), 'f');
  assert.equal(closeWindowsExcept(maximized, 'p2'), maximized);
});

test('ペインが無くなったら、そのペインの小窓の記録だけを消す', () => {
  let state = pressKey(EMPTY_KEY_SELECTION, 'p1', A, 'f');
  state = pressKey(state, 'p2', A, 'f');
  const dropped = dropPane(state, 'p1');
  assert.equal(windowKeyOf(dropped, 'p1', A), undefined);
  assert.equal(windowKeyOf(dropped, 'p2', A), 'f');
  assert.equal(selectedKeyOf(dropped, A), 'f');
  assert.equal(dropPane(dropped, 'p1'), dropped);
});
