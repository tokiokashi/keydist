import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { evaluateChecks, movedHeads } = require('../.github/scripts/merge-stack-checks.cjs');

const required = ['verify', 'browser-e2e', 'commit-messages'];
const run = (name: string, event: string, conclusion: string | null, t: string, status = 'completed') => ({
  name, event, conclusion, status, started_at: t,
});
const check = (runs: unknown[]): string[] => evaluateChecks({ runs, required, selfJob: 'merge-stack', prNumber: 1 });

const green = [
  run('verify', 'push', 'success', '1'), run('verify', 'pull_request', 'success', '2'),
  run('browser-e2e', 'pull_request', 'success', '2'),
  run('commit-messages', 'pull_request', 'success', '2'),
];

describe('evaluateChecks', () => {
  test('verifyがpushとpull_requestの両方で成功し、browser-e2eがpull_requestだけに付いていれば通る', () => {
    assert.deepEqual(check(green), []);
  });
  test('.mdだけのPRでshardがskippedでも、browser-e2eがsuccessなら通る', () => {
    const runs = [...green, run('changes', 'pull_request', 'success', '2'), run('browser-e2e-shard (1/4)', 'pull_request', 'skipped', '2')];
    assert.deepEqual(check(runs), []);
  });
  test('browser-e2eがpull_requestでfailureなら通らない', () => {
    const runs = [...green.filter((r) => r.name !== 'browser-e2e'), run('browser-e2e', 'pull_request', 'failure', '2')];
    const p = check(runs);
    assert.equal(p.length, 1);
    assert.match(p[0], /browser-e2e.*pull_request.*failure/);
  });
  test('browser-e2eがpull_requestで実行中なら通らない', () => {
    const runs = [...green.filter((r) => r.name !== 'browser-e2e'), run('browser-e2e', 'pull_request', null, '2', 'in_progress')];
    assert.match(check(runs)[0], /browser-e2e.*終わっていない/);
  });
  test('browser-e2eがworkflow_dispatchの失敗でも、pull_requestのsuccessで隠さない', () => {
    const p = check([...green, run('browser-e2e', 'workflow_dispatch', 'failure', '1')]);
    assert.equal(p.length, 1);
    assert.match(p[0], /browser-e2e.*workflow_dispatch.*failure/);
  });
  test('shardのジョブ（必須でない）がfailureなら通らない', () => {
    const p = check([...green, run('browser-e2e-shard (2/4)', 'pull_request', 'failure', '2')]);
    assert.match(p[0], /browser-e2e-shard.*failure/);
  });
  test('古い push 側の failure を新しい pull_request 側の success が隠さない', () => {
    const runs = [...green.filter((r) => !(r.name === 'verify' && r.event === 'push')),
      run('verify', 'push', 'failure', '1')];
    const p = check(runs);
    assert.equal(p.length, 1);
    assert.match(p[0], /verify.*push.*failure/);
  });
  test('片方が in_progress なら通らない', () => {
    const runs = [...green.filter((r) => !(r.name === 'verify' && r.event === 'push')),
      run('verify', 'push', null, '1', 'in_progress')];
    assert.match(check(runs)[0], /終わっていない/);
  });
  test('同じ event 内の再実行は新しい方を見る', () => {
    assert.deepEqual(check([...green, run('verify', 'push', 'failure', '0')]), []);
  });
  test('必須ジョブが無ければ通らない', () => {
    assert.match(check(green.filter((r) => r.name !== 'commit-messages'))[0], /commit-messages.*走っていない/);
  });
  test('commit-messages が push で skipped でも数えない', () => {
    assert.deepEqual(check([...green, run('commit-messages', 'push', 'skipped', '1')]), []);
  });
  test('必須でないジョブは neutral・skipped を許すが failure は許さない', () => {
    assert.deepEqual(check([...green, run('lint', 'push', 'neutral', '1')]), []);
    assert.match(check([...green, run('lint', 'push', 'failure', '1')])[0], /lint/);
  });
  test('必須ジョブの event が引けなければ断る', () => {
    const runs = green.map((r) => (r.name === 'verify' ? { ...r, event: undefined } : r));
    assert.match(check(runs)[0], /verify.*起動元/);
  });
  test('自分自身のジョブは見ない', () => {
    assert.deepEqual(check([...green, run('merge-stack', 'pull_request_target', null, '3', 'in_progress')]), []);
  });
});

describe('movedHeads', () => {
  const pr = (number: number, sha: string) => ({ number, head: { sha } });
  test('変わっていなければ空', () => {
    assert.deepEqual(movedHeads([pr(1, 'aaaaaaaa'), pr(2, 'bbbbbbbb')], [pr(2, 'bbbbbbbb'), pr(1, 'aaaaaaaa')]), []);
  });
  test('下の PR の head が動いたら検出する', () => {
    assert.equal(movedHeads([pr(1, 'aaaaaaaa'), pr(2, 'bbbbbbbb')], [pr(1, 'cccccccc'), pr(2, 'bbbbbbbb')]).length, 1);
  });
  test('スタックから消えた PR も検出する', () => {
    assert.equal(movedHeads([pr(1, 'aaaaaaaa')], []).length, 1);
  });
});
