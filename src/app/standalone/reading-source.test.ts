import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ReadingToken } from '#input/text/reading.ts';
import { createLazyReadingSource } from './reading-source.ts';

const token: ReadingToken = { surface: '今日', byteStart: 0, byteEnd: 6, reading: 'キョウ', isUnknown: false };

test('入口は最初の解析の依頼まで読み込まない', async () => {
  let loads = 0;
  const source = createLazyReadingSource(async () => {
    loads += 1;
    return { tokenize: async () => [token] };
  });
  assert.equal(loads, 0);
  assert.deepEqual(await source.tokenize('今日'), [token]);
  await source.tokenize('今日');
  assert.equal(loads, 1);
});

test('読み込みに失敗したら例外を返し、次の依頼で読み込み直す', async () => {
  let loads = 0;
  const source = createLazyReadingSource(async () => {
    loads += 1;
    if (loads === 1) throw new Error('読み込めない');
    return { tokenize: async () => [token] };
  });
  await assert.rejects(source.tokenize('今日'), /読み込めない/);
  assert.deepEqual(await source.tokenize('今日'), [token]);
  assert.equal(loads, 2);
});

test('数値の条件に載せる辞書と解析器の名前・版を持つ', () => {
  const { conditions } = createLazyReadingSource(async () => ({ tokenize: async () => [] }));
  assert.deepEqual(conditions.dictionary, { name: 'IPADIC', version: '6.2.0' });
  assert.deepEqual(conditions.library, { name: 'lindera-wasm', version: '6.2.0' });
});
