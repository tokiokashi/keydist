import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readTextFile } from './browser-file.ts';

test('readTextFile: 上限以下は文字列で読む', async () => {
  const result = await readTextFile(new Blob(['あいう']), 100);
  assert.deepEqual(result, { kind: 'ok', text: 'あいう' });
});

test('readTextFile: 上限ちょうどは読み、1バイト超えたら中身を読まずに断る', async () => {
  assert.equal((await readTextFile(new Blob(['abc']), 3)).kind, 'ok');
  assert.equal((await readTextFile(new Blob(['abcd']), 3)).kind, 'too-large');
});

test('readTextFile: 読み取りに失敗したらunreadable', async () => {
  const broken = { size: 1, text: () => Promise.reject(new Error('x')) } as unknown as Blob;
  assert.equal((await readTextFile(broken, 10)).kind, 'unreadable');
});
