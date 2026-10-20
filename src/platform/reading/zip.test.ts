import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readDictionaryNotice, readDictionaryZip } from './dictionary-files.ts';
import { DICTIONARY_ENTRY_NAMES } from './dictionary-spec.ts';
import { extractZip, ZipFormatError } from './zip.ts';
import { buildDictionaryZip, buildZip } from './zip-fixture.ts';

const text = (value: string) => new TextEncoder().encode(value);

test('無圧縮とdeflateのエントリを展開し、ディレクトリは飛ばす', async () => {
  const zip = buildZip([
    { name: 'dir/', content: new Uint8Array(0) },
    { name: 'dir/a.txt', content: text('あいう'), deflate: true },
    { name: 'dir/b.bin', content: Uint8Array.of(1, 2, 3) },
  ]);
  const entries = await extractZip(zip);
  assert.deepEqual([...entries.keys()], ['dir/a.txt', 'dir/b.bin']);
  assert.equal(new TextDecoder().decode(entries.get('dir/a.txt')), 'あいう');
  assert.deepEqual([...(entries.get('dir/b.bin') ?? [])], [1, 2, 3]);
});

test('zipでない入力と、途中で切れたzipは拒む', async () => {
  await assert.rejects(extractZip(text('<!doctype html><title>404</title>')), ZipFormatError);
  const zip = buildZip([{ name: 'a.txt', content: text('abc'.repeat(100)) }]);
  await assert.rejects(extractZip(zip.subarray(0, zip.length - 30)), ZipFormatError);
});

test('辞書の9ファイルを決まった順で取り出す', async () => {
  const files = await readDictionaryZip(buildDictionaryZip());
  assert.equal(files.length, DICTIONARY_ENTRY_NAMES.length);
  assert.equal(new TextDecoder().decode(files[1]), 'dict.trie:1');
});

test('辞書のファイルが足りないzipと、metadata.jsonがJSONでないzipは拒む', async () => {
  await assert.rejects(readDictionaryZip(buildDictionaryZip({ omit: 'dict.words' })), /dict\.words/);
  await assert.rejects(readDictionaryZip(buildDictionaryZip({ metadata: 'not json' })), /metadata\.json/);
});

test('告知文を取り出す', async () => {
  assert.equal(new TextDecoder().decode(await readDictionaryNotice(buildDictionaryZip())), 'notice');
  assert.equal(await readDictionaryNotice(buildZip([{ name: 'a.txt', content: text('a') }])), undefined);
});
