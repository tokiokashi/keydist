import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applyDraftInput, initialDraftSync, syncDraftWithStored } from './options-draft-sync.ts';

interface Opts { readonly on: boolean; readonly n: number }
const X: Opts = { on: true, n: 1 };
const A: Opts = { on: false, n: 1 };
const B: Opts = { on: true, n: 2 };

test('Aを書いた後、400ms以上あけて入力した新しい値は、Aの反響で巻き戻らない（#935）', () => {
  let s = initialDraftSync(X);
  s = applyDraftInput(s, A, 0);
  s = applyDraftInput(s, B, 400); // Aはちょうど400msで書かれ、その反響はこの後に届く
  s = syncDraftWithStored(s, { ...A });
  assert.deepEqual(s.draft, B);
  s = syncDraftWithStored(s, { ...B });
  assert.deepEqual(s.draft, B);
});

test('外からの変更（別タブ・既定値へ戻す）では下書きが保存先に揃う', () => {
  let s = initialDraftSync(X);
  s = applyDraftInput(s, A, 0);
  s = syncDraftWithStored(s, { ...A });
  s = syncDraftWithStored(s, B);
  assert.deepEqual(s.draft, B);
  assert.deepEqual(s.own, []);
});

test('反響の記録が済んだ後の元に戻す・やり直すで揃う', () => {
  let s = initialDraftSync(X);
  s = applyDraftInput(s, A, 0);
  s = syncDraftWithStored(s, { ...A });
  s = syncDraftWithStored(s, { ...X }); // 元に戻す
  assert.deepEqual(s.draft, X);
  s = syncDraftWithStored(s, { ...A }); // やり直す
  assert.deepEqual(s.draft, A);
});

test('debounceの中で上書きされた値は記録から捨てる', () => {
  let s = initialDraftSync(X);
  s = applyDraftInput(s, A, 0);
  s = applyDraftInput(s, X, 100); // Aは捨てられる。Xは保存先と同じで書き込みは起きない
  s = applyDraftInput(s, A, 600); // Xは間隔を過ぎたので残る
  assert.deepEqual(s.own.map((w) => w.at), [100, 600]); // 0のAは捨てられている
});

test('ケース1: 入れ直した後の反響は最も新しい記録に当たり、続く元に戻すで揃う', () => {
  let s = initialDraftSync(X);
  s = applyDraftInput(s, A, 0);
  s = applyDraftInput(s, X, 100);
  s = applyDraftInput(s, A, 600);
  s = syncDraftWithStored(s, { ...A });
  assert.deepEqual(s.own, []);
  s = syncDraftWithStored(s, { ...X }); // 元に戻す
  assert.deepEqual(s.draft, X);
});

test('ケース2: X→A の反響の後に X→A→X と入力しても、元に戻すで揃う', () => {
  let s = initialDraftSync(X);
  s = applyDraftInput(s, A, 0);
  s = syncDraftWithStored(s, { ...A });
  s = applyDraftInput(s, X, 500);
  s = applyDraftInput(s, A, 600);
  s = applyDraftInput(s, X, 700);
  s = syncDraftWithStored(s, { ...X }); // Xの反響
  assert.deepEqual(s.own, []);
  s = syncDraftWithStored(s, { ...A }); // 元に戻すでAへ
  assert.deepEqual(s.draft, A);
});

test('書かれなかった入れ直しの後の元に戻すで揃う（uncheck→600ms→check→すぐuncheck→元に戻す）', () => {
  let s = initialDraftSync(X);
  s = applyDraftInput(s, A, 0);
  s = syncDraftWithStored(s, { ...A }); // 400msでAが書かれる
  s = applyDraftInput(s, X, 600); // check
  s = applyDraftInput(s, A, 650); // すぐuncheck。Xは書かれず、Aは保存先と同じなので書き込みも起きない
  s = syncDraftWithStored(s, { ...X }); // 元に戻す。保存先はAからXへ
  assert.deepEqual(s.draft, X);
});

test('中身が同じ読み直しは下書きを触らない（#606）', () => {
  let s = initialDraftSync(X);
  s = applyDraftInput(s, A, 0);
  s = syncDraftWithStored(s, { ...X });
  assert.deepEqual(s.draft, A);
});
