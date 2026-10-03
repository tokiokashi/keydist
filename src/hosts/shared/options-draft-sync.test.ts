import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  applyDraftInput,
  ECHO_WINDOW_MS,
  initialDraftSync,
  syncDraftWithStored,
} from './options-draft-sync.ts';

interface Opts { readonly on: boolean; readonly n: number }
const X: Opts = { on: true, n: 1 };
const A: Opts = { on: false, n: 1 };
const B: Opts = { on: true, n: 1 };

test('自分の保存の反響が次の入力の後に届いても、下書きは新しい値のまま（#935）', () => {
  let s = initialDraftSync(X);
  s = applyDraftInput(s, A, 0); // 消す
  s = applyDraftInput(s, { on: true, n: 2 }, 300); // すぐ別の項目を触る
  // 400ms: Aの保存の反響が届く
  s = syncDraftWithStored(s, { ...A }, 400);
  assert.deepEqual(s.draft, { on: true, n: 2 });
});

test('Aを消して戻す間に反響が届いても、戻した値が残る（チェックが外れた状態に戻らない）', () => {
  let s = initialDraftSync(X);
  s = applyDraftInput(s, A, 0);
  s = applyDraftInput(s, B, 350); // 戻す
  s = syncDraftWithStored(s, { ...A }, 400); // Aの反響
  assert.deepEqual(s.draft, B);
  s = syncDraftWithStored(s, { ...B }, 800); // Bの反響
  assert.deepEqual(s.draft, B);
});

test('外からの変更（元に戻す・別タブ・既定値へ戻す）では下書きが保存先に揃う', () => {
  let s = initialDraftSync(X);
  s = applyDraftInput(s, A, 0);
  s = syncDraftWithStored(s, { ...A }, 400); // 反響
  const external: Opts = { on: true, n: 9 };
  s = syncDraftWithStored(s, external, 1000);
  assert.deepEqual(s.draft, external);
  assert.deepEqual(s.own, []);
});

test('反響の記録が済んだ後は、同じ値への外からの変更でも揃う（元に戻す）', () => {
  let s = initialDraftSync(X);
  s = applyDraftInput(s, A, 0);
  s = syncDraftWithStored(s, { ...A }, 400); // Aの反響で記録が空になる
  s = applyDraftInput(s, { on: true, n: 2 }, 500);
  s = syncDraftWithStored(s, { on: true, n: 2 }, 900);
  s = syncDraftWithStored(s, { ...A }, 1000); // 元に戻すでAへ戻った
  assert.deepEqual(s.draft, A);
});

test('反響を待つ期間を過ぎた値は、外からの変更として揃える', () => {
  let s = initialDraftSync(X);
  s = applyDraftInput(s, A, 0);
  s = syncDraftWithStored(s, { ...A }, ECHO_WINDOW_MS + 1);
  assert.deepEqual(s.draft, A);
  assert.deepEqual(s.own, []);
});

test('中身が同じ読み直しは下書きを触らない（#606）', () => {
  let s = initialDraftSync(X);
  s = applyDraftInput(s, A, 0);
  s = syncDraftWithStored(s, { ...X }, 100);
  assert.deepEqual(s.draft, A);
});
