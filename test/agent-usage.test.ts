import assert from 'node:assert/strict';
import test from 'node:test';
import { extractRequests, formatSummary, summarize } from '../scripts/agent-usage-core.ts';

const row = (id: string, req: string, model: string, usage: object) =>
  JSON.stringify({ type: 'assistant', requestId: req, message: { id, model, usage } });

test('同じ(message.id, requestId)は最後の行だけを数える', () => {
  const jsonl = [
    row('m1', 'r1', 'claude-sonnet-5-5', { input_tokens: 1, cache_read_input_tokens: 10 }),
    JSON.stringify({ type: 'user', message: { content: 'x' } }),
    row('m1', 'r1', 'claude-sonnet-5-5', { input_tokens: 2, cache_read_input_tokens: 20 }),
    row('m2', 'r2', 'claude-sonnet-5-5', { input_tokens: 3, cache_read_input_tokens: 30 }),
  ].join('\n');
  const reqs = extractRequests(jsonl);
  assert.equal(reqs.length, 2);
  assert.deepEqual(reqs.map((r) => r.read), [20, 30]);
});

test('キャッシュ書き込みは5分と1時間を分け、内訳が無ければ全部5分', () => {
  const [a, b] = extractRequests(
    [
      row('m1', 'r1', 'claude-sonnet-5-5', {
        cache_creation_input_tokens: 300,
        cache_creation: { ephemeral_5m_input_tokens: 100, ephemeral_1h_input_tokens: 200 },
      }),
      row('m2', 'r2', 'claude-sonnet-5-5', { cache_creation_input_tokens: 50 }),
    ].join('\n'),
  );
  assert.deepEqual([a!.write5m, a!.write1h], [100, 200]);
  assert.deepEqual([b!.write5m, b!.write1h], [50, 0]);
  // 100*2*1.25 + 200*2*2 = 1050 を100万で割った値
  assert.ok(Math.abs(summarize([a!]).costUsd! - 0.00105) < 1e-12);
});

test('Haikuはプロンプトが10万tokensを超えたリクエストだけ単価が5倍になる', () => {
  const short = { model: 'claude-haiku-5-5', input: 0, write5m: 0, write1h: 0, read: 100_000 };
  const long = { ...short, read: 100_001 };
  const s1 = summarize([short]);
  assert.equal(s1.longPromptRequests, 0);
  assert.ok(Math.abs(s1.costUsd! - (100_000 * 0.01) / 1e6) < 1e-12);
  const s2 = summarize([long]);
  assert.equal(s2.longPromptRequests, 1);
  assert.ok(Math.abs(s2.costUsd! - (100_001 * 0.01 * 5) / 1e6) < 1e-12);
  // Sonnetは倍率を持たない
  assert.equal(summarize([{ ...long, model: 'claude-sonnet-5-5' }]).longPromptRequests, 0);
});

test('表に無いモデルは金額を出さず単価未登録と出す', () => {
  const s = summarize([{ model: 'claude-unknown-9', input: 1, write5m: 0, write1h: 0, read: 5 }]);
  assert.equal(s.costUsd, null);
  const text = formatSummary(s);
  assert.match(text, /単価未登録/);
  assert.doesNotMatch(text, /\$/);
  assert.match(text, /出力tokensは含まない/);
});

test('出力の形', () => {
  const s = summarize([{ model: 'claude-sonnet-5-5', input: 0, write5m: 78_000, write1h: 0, read: 2_630_000 }]);
  assert.equal(
    formatSummary(s),
    'model: claude-sonnet-5-5 / requests: 1 / cache write: 78K / cache read: 2.63M / input-side cost: $0.72（出力tokensは含まない）',
  );
});
