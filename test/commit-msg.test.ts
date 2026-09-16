import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const HOOK = new URL('../.githooks/commit-msg', import.meta.url).pathname;
const dir = mkdtempSync(join(tmpdir(), 'keydist-hook-'));
// Windowsなどbashの無い環境では検証を飛ばす。CI（ubuntu）では必ず走る
const hasBash = spawnSync('bash', ['-c', 'exit 0']).status === 0;

/** フックにメッセージを食わせ、通ったかどうかを返す */
function accepts(message: string): boolean {
  const file = join(dir, 'COMMIT_EDITMSG');
  writeFileSync(file, message);
  return spawnSync('bash', [HOOK, file]).status === 0;
}

const ja = (n: number) => 'あ'.repeat(n);

describe('commit-msgフック', { skip: hasBash ? false : 'bashが無い' }, () => {
  test('規約に沿った件名を通す', () => {
    assert.ok(accepts('feat(ui): 配列追加フォームを分ける'));
    assert.ok(accepts('docs: 仕様への導線を足す'));
    assert.ok(accepts('fix(model): 同指連続の距離を計上する\n\n理由を書く\n\nRefs #1\n'));
  });

  test('typeが無い件名を弾く', () => {
    assert.ok(!accepts('配列追加フォームを分ける'));
    assert.ok(!accepts('feature(ui): 分ける'));
    assert.ok(!accepts('feat(ui)分ける'));
    assert.ok(!accepts('feat(ui):'));
  });

  test('件名の末尾の句点を弾く', () => {
    assert.ok(!accepts('fix: 直す。'));
  });

  test('文字数はバイト数ではなく文字数で数える', () => {
    // 日本語1文字 = 3バイト。バイト数で数えると24文字で溢れる
    assert.ok(accepts(`fix: ${ja(30)}`), '30文字（95バイト）は通す');
    assert.ok(accepts(`fix: ${ja(67)}`), 'ちょうど72文字は通す');
    assert.ok(!accepts(`fix: ${ja(68)}`), '73文字は弾く');
  });

  test('件名と本文の間に空行を求める', () => {
    assert.ok(!accepts('fix: 直す\n理由をすぐ下に書いた'));
    assert.ok(accepts('fix: 直す\n\n理由を空行の後に書いた'));
  });

  test('gitが形を決めるメッセージは素通しする', () => {
    assert.ok(accepts('Merge branch \'main\' into feat/x'));
    assert.ok(accepts('Merge pull request #26 from tokiokashi/feat/x'));
    assert.ok(accepts('Revert "feat(ui): 分ける"'));
    assert.ok(accepts('fixup! feat(ui): 分ける'));
  });

  test('コメント行を件名として読まない', () => {
    assert.ok(accepts('feat(ui): 分ける\n\n# この行は無視される\n'));
    // コメントだけのメッセージはgitが中断するので、ここでは何も言わない
    assert.ok(accepts('# Please enter the commit message\n'));
  });

  test('件名を書き忘れた時に本文を件名と読み違えない', () => {
    assert.ok(!accepts('\nfeat(ui): 本文の側に書いてしまった'));
  });
});
