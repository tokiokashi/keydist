import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
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

/** フックを通したあとのメッセージと、通ったかどうかを返す */
function rewritten(message: string): { ok: boolean; text: string } {
  const file = join(dir, 'COMMIT_EDITMSG');
  writeFileSync(file, message);
  const ok = spawnSync('bash', [HOOK, file]).status === 0;
  return { ok, text: readFileSync(file, 'utf8') };
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

  test('セッションURLの行(Claude-Session:)を落として、ほかの行は残す', () => {
    const r = rewritten(
      'docs: 規約を足す\n\n理由を書く\n\nCo-Authored-By: Someone <a@example.com>\nClaude-Session: https://example.com/session_x\n',
    );
    assert.ok(r.ok);
    assert.ok(!/^Claude-Session:/m.test(r.text));
    assert.ok(r.text.includes('Co-Authored-By: Someone'));
    assert.ok(r.text.includes('理由を書く'));
  });

  test('Merge など素通しするメッセージからも落とす', () => {
    const r = rewritten("Merge branch 'main' into feat/x\n\nClaude-Session: https://example.com/session_x\n");
    assert.ok(r.ok);
    assert.ok(!r.text.includes('Claude-Session:'));
  });

  test('行頭でない Claude-Session: は消さない', () => {
    const r = rewritten('docs: 説明を足す\n\n本文に Claude-Session: という語を書く\n');
    assert.ok(r.ok);
    assert.ok(r.text.includes('本文に Claude-Session: という語を書く'));
  });

  test('UTF-8ロケールで不正なバイト列を含む行も、セッションの行と一緒に消さない', () => {
    // -a が無いと GNU grep がメッセージ全体をバイナリと判定し、該当行を黙って落とす
    const file = join(dir, 'COMMIT_EDITMSG');
    writeFileSync(
      file,
      Buffer.concat([
        Buffer.from('fix: a\n\nbad '),
        Buffer.from([0xff, 0xfe]),
        Buffer.from(' byte\nafter\nClaude-Session: https://example.com/x\n'),
      ]),
    );
    const status = spawnSync('bash', [HOOK, file], { env: { ...process.env, LC_ALL: 'C.UTF-8' } }).status;
    const out = readFileSync(file);
    assert.equal(status, 0);
    assert.ok(out.includes(Buffer.from([0x62, 0x61, 0x64, 0x20, 0xff, 0xfe])), '不正なバイト列を含む行が残る');
    assert.ok(out.includes(Buffer.from('after\n')));
    assert.ok(!out.includes(Buffer.from('Claude-Session:')));
  });

  test('Claudeの共作者行から、メールアドレスだけを外す', () => {
    const r = rewritten(
      'docs: 規約を足す\n\n理由を書く\n\nCo-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>\n',
    );
    assert.ok(r.ok);
    assert.ok(r.text.includes('Co-Authored-By: Claude Sonnet 5.5\n'));
    assert.ok(!r.text.includes('noreply@anthropic.com'));
  });

  test('人間の共作者の行と、Claude以外のメールの行は書き換えない', () => {
    const r = rewritten(
      'docs: 規約を足す\n\nCo-authored-by: Taro <taro@example.com>\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>\nCo-authored-by: Claude Bot <bot@example.com>\n',
    );
    assert.ok(r.ok);
    assert.ok(r.text.includes('Co-authored-by: Taro <taro@example.com>'));
    assert.ok(r.text.includes('Co-Authored-By: Claude Opus 5.5\n'));
    assert.ok(r.text.includes('Co-authored-by: Claude Bot <bot@example.com>'));
  });

  test('共作者行の書き換えでも、不正なバイト列を含む行を消さない', () => {
    const file = join(dir, 'COMMIT_EDITMSG');
    writeFileSync(
      file,
      Buffer.concat([
        Buffer.from('fix: a\n\nbad '),
        Buffer.from([0xff, 0xfe]),
        Buffer.from(' byte\nCo-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>\n'),
      ]),
    );
    const status = spawnSync('bash', [HOOK, file], { env: { ...process.env, LC_ALL: 'C.UTF-8' } }).status;
    const out = readFileSync(file);
    assert.equal(status, 0);
    assert.ok(out.includes(Buffer.from([0x62, 0x61, 0x64, 0x20, 0xff, 0xfe])), '不正なバイト列を含む行が残る');
    assert.ok(out.includes(Buffer.from('Co-Authored-By: Claude Sonnet 5.5\n')));
  });

  test('素のClaudeの共作者行（モデル名なし）からもメールアドレスを外す', () => {
    const r = rewritten(
      'docs: 規約を足す\n\nCo-Authored-By: Claude <noreply@anthropic.com>\nCo-Authored-By:Claude\t<noreply@anthropic.com>\r\nCo-authored-by: Claude Monet <m@e.com>\n',
    );
    assert.ok(r.ok);
    assert.ok(r.text.includes('Co-Authored-By: Claude\nCo-Authored-By:Claude\nCo-authored-by: Claude Monet <m@e.com>'));
    assert.ok(!r.text.includes('noreply@anthropic.com'));
  });

  test('共作者行そのものに不正なバイト列があっても、メールアドレスを外す', () => {
    // grep を LC_ALL=C にしないと、UTF-8 ロケールでは不正なバイト列に [^<] が一致せず検出を逃す
    const file = join(dir, 'COMMIT_EDITMSG');
    writeFileSync(
      file,
      Buffer.concat([
        Buffer.from('fix: a\n\nCo-Authored-By: Claude '),
        Buffer.from([0xff]),
        Buffer.from(' <noreply@anthropic.com>\n'),
      ]),
    );
    const status = spawnSync('bash', [HOOK, file], { env: { ...process.env, LC_ALL: 'C.UTF-8' } }).status;
    const out = readFileSync(file);
    assert.equal(status, 0);
    assert.ok(!out.includes(Buffer.from('noreply@anthropic.com')));
    assert.ok(out.includes(Buffer.from([0x43, 0x6c, 0x61, 0x75, 0x64, 0x65, 0x20, 0xff, 0x0a])));
  });
});
