import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applyDraftInput, initialDraftSync, syncDraftWithStored } from './options-draft-sync.ts';
import { createOptionsWriteLog, createOptionsWriteLogs, type OptionsWriteLog } from './options-write-log.ts';

interface Opts { readonly on: boolean; readonly n: number }
const X: Opts = { on: true, n: 1 };
const A: Opts = { on: false, n: 1 };
const B: Opts = { on: true, n: 2 };

/** 下書きと書き込みの記録を、実際の呼び出しと同じ順で動かす道具。 */
function harness(initial: Opts, log: OptionsWriteLog = createOptionsWriteLog()) {
  let state = initialDraftSync(initial, log.latestSeq());
  return {
    log,
    /** 利用者の入力 */
    input: (next: Opts) => { state = applyDraftInput(state, next); },
    /** 保存先へ書いた（debounceのtimer・元に戻す前のflush）。保存先の変化は`stored`で別に届く */
    write: (value: Opts) => { log.record(value); },
    /** 保存先の値の変化が描画に届いた */
    stored: (value: Opts) => { state = syncDraftWithStored(state, { ...value }, log.entries(), log.latestSeq()); },
    /** 保存先が最後に見た値と同じ参照のまま描画された（元に戻すは以前の資産の値へ戻すので、参照も同じになる） */
    storedAgain: () => { state = syncDraftWithStored(state, state.source, log.entries(), log.latestSeq()); },
    draft: () => state.draft,
  };
}

test('#935型: Aの反響が、その後の入力Bより後に届いても下書きはBのまま', () => {
  const h = harness(X);
  h.input(A);
  h.write(A); // timerでAを書く
  h.input(B); // 反響の描画より先にBが入る
  h.stored(A);
  assert.deepEqual(h.draft(), B);
  h.write(B);
  h.stored(B);
  assert.deepEqual(h.draft(), B);
});

test('外からの変更（別タブ・共有URL・既定値へ戻す）では下書きが保存先に揃う', () => {
  const h = harness(X);
  h.input(A);
  h.write(A);
  h.stored(A);
  h.stored(B);
  assert.deepEqual(h.draft(), B);
});

test('元に戻す→やり直すで揃う', () => {
  const h = harness(X);
  h.input(A);
  h.write(A);
  h.stored(A);
  h.stored(X); // 元に戻す
  assert.deepEqual(h.draft(), X);
  h.stored(A); // やり直す
  assert.deepEqual(h.draft(), A);
});

test('ケース1: debounceの中で元に戻した入力（A→X）は書かれず、続くAの反響でも下書きは正しい', () => {
  const h = harness(X);
  h.input(A);
  h.input(X); // Aはdebounceの中で捨てられ、書かれない
  h.input(A);
  h.write(A);
  h.stored(A);
  assert.deepEqual(h.draft(), A);
  h.stored(X); // 元に戻す
  assert.deepEqual(h.draft(), X);
});

test('ケース2: X→Aの反響の後にX→A→Xと入力しても、元に戻すで揃う', () => {
  const h = harness(X);
  h.input(A);
  h.write(A);
  h.stored(A);
  h.input(X);
  h.input(A);
  h.input(X);
  h.write(X);
  h.stored(X);
  assert.deepEqual(h.draft(), X);
  h.stored(A); // 元に戻すでAへ
  assert.deepEqual(h.draft(), A);
});

test('書かれなかった入れ直しの後の元に戻すで揃う（uncheck→待つ→check→すぐuncheck→元に戻す）', () => {
  const h = harness(X);
  h.input(A);
  h.write(A);
  h.stored(A);
  h.input(X); // check
  h.input(A); // すぐuncheck。保存先と同じAなので、書いても保存先は動かない
  h.write(A);
  h.stored(X); // 元に戻す（保存先はAからXへ）
  assert.deepEqual(h.draft(), X);
  h.stored(A); // やり直す
  assert.deepEqual(h.draft(), A);
});

test('H1: 入力の397ms後に次の入力が来た場合も、書かれなかった入力は記録に入らない', () => {
  const h = harness(X);
  h.input(X);
  h.input(A); // 397ms後。時刻で推測すると「書かれた」側に入る間隔だが、実際には書かれていない
  h.write(A);
  h.stored(A);
  assert.deepEqual(h.draft(), A);
  h.stored(X); // 元に戻す
  assert.deepEqual(h.draft(), X);
});

test('H2: timerが700msに遅れ、450ms後の入力が先に来ても、書かれなかった入力は記録に入らない', () => {
  const h = harness(X);
  h.input(A); // 700msに遅れたtimerはまだ発火しない
  h.input(X); // 450ms後。Aは書かれない
  h.input(A); // この時点で書かれた値は無い
  h.write(A);
  h.stored(A);
  assert.deepEqual(h.draft(), A);
  h.stored(X); // 3秒後の元に戻す
  assert.deepEqual(h.draft(), X);
});

test('同じ値を書いた場合（保存先が動かない）の記録が残っても、元に戻す・やり直すは揃う', () => {
  const h = harness(X);
  h.input(A);
  h.write(A);
  h.stored(A);
  h.write(A); // 同じ値をもう一度書く。保存先は動かない
  h.stored(X); // 元に戻す
  assert.deepEqual(h.draft(), X);
  h.stored(A); // やり直す。記録のAは、外からの変更に呑まれて見ない
  assert.deepEqual(h.draft(), A);
});

test('反響の描画を挟んだ後の元に戻す: 書いた値は反響として扱われ、1つ前の値へ揃う', () => {
  const h = harness(X);
  h.input(A);
  h.write(A);
  h.stored(A); // 反響の描画
  h.stored(X); // 元に戻す
  assert.deepEqual(h.draft(), X);
});

test('反響の描画を挟まない、書いた直後の元に戻す（flushと元に戻すが1つのクリックで続く）で揃う（#944）', () => {
  const h = harness(X);
  h.input(A);
  h.write(A);
  h.stored(A); // 消した設定が保存され、履歴ができる
  h.input(X); // 戻す。まだ書かれていない
  h.write(X); // 元に戻す前のflush
  h.storedAgain(); // 元に戻すで保存先はAへ戻る。描画は1回で、保存先は直前の描画と同じ参照
  assert.deepEqual(h.draft(), A);
  h.stored(X); // やり直す
  assert.deepEqual(h.draft(), X);
});

test('保存を待つ間の元に戻すで、元に戻すが中身だけ同じ別の参照を返しても揃う（#944）', () => {
  const h = harness(X);
  h.input(A);
  h.write(A);
  h.stored(A);
  h.input(X);
  h.write(X);
  h.stored(A);
  assert.deepEqual(h.draft(), A);
});

test('書き込みが無い間の中身が同じ読み直しは、書き込みを待つ下書きを触らない（#606）', () => {
  const h = harness(X);
  h.input(A);
  h.write(A);
  h.stored(A); // 反響
  h.input(X); // まだ書かれていない入力
  h.stored(A); // 他タブが別のAnalyzerを書いて、中身が同じまま読み直された
  assert.deepEqual(h.draft(), X);
  h.storedAgain(); // 同じ参照の描画（入力のたびの描画）も下書きを触らない
  assert.deepEqual(h.draft(), X);
});

test('複数のペインが保存先を共有する場合: 記録は書き先ごとに別で、他のペインの書き込みに巻き込まれない', () => {
  const logs = createOptionsWriteLogs();
  const p1 = harness(X, logs.forKey('p1'));
  const p2 = harness(X, logs.forKey('p2'));
  p1.input(A);
  p1.write(A);
  p2.input(B);
  p2.write(B);
  p1.stored(A);
  p2.stored(B);
  assert.deepEqual(p1.draft(), A);
  assert.deepEqual(p2.draft(), B);
  // p2の保存先がp1の書いた値に変わるのは、p2にとって外からの変更
  p2.stored(A);
  assert.deepEqual(p2.draft(), A);
});

test('作り直した下書きは、それ以前の書き込みを自分の分として扱わない', () => {
  const log = createOptionsWriteLog();
  log.record(A);
  const h = harness(X, log);
  h.stored(A);
  assert.deepEqual(h.draft(), A);
});

test('中身が同じ読み直しは下書きを触らない（#606）', () => {
  const h = harness(X);
  h.input(A);
  h.stored(X);
  assert.deepEqual(h.draft(), A);
});
