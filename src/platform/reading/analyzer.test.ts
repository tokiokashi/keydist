import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { createReadingAnalyzer, type LinderaModule, toReadingToken } from './analyzer.ts';
import { readDictionaryZip } from './dictionary-files.ts';
import { DICTIONARY_SPEC } from './dictionary-spec.ts';

const raw = (surface: string, reading: string | undefined, isUnknown = false) => ({
  surface,
  byteStart: 0,
  byteEnd: 3,
  isUnknown,
  details: ['名詞', '一般', '*', '*', '*', '*', surface, ...(reading === undefined ? [] : [reading, 'x'])],
});

test('読みの欄を取り出し、無い・* はnullにする', () => {
  assert.equal(toReadingToken(raw('曜', 'ヨウ')).reading, 'ヨウ');
  assert.equal(toReadingToken(raw('曜', '*')).reading, null);
  assert.equal(toReadingToken(raw('曜', undefined)).reading, null);
  assert.deepEqual(toReadingToken(raw('曜', 'ヨウ', true)), { surface: '曜', byteStart: 0, byteEnd: 3, reading: 'ヨウ', isUnknown: true });
});

test('辞書の読み込みは解析器を作る1回だけで、解析は作った解析器を使い回す', () => {
  const calls: string[] = [];
  const lindera: LinderaModule = {
    loadDictionaryFromBytes: (...files) => {
      calls.push(`load:${files.length}`);
      return { dictionary: true };
    },
    TokenizerBuilder: class {
      setDictionaryInstance() {
        calls.push('instance');
      }
      setMode(mode: string) {
        calls.push(`mode:${mode}`);
      }
      build() {
        calls.push('build');
        return { tokenize: (text: string) => [raw(text, 'ア')] };
      }
    },
  };
  const analyzer = createReadingAnalyzer(lindera, [new Uint8Array(1), new Uint8Array(1)]);
  analyzer.tokenize('あ');
  analyzer.tokenize('い');
  assert.deepEqual(calls, ['load:2', 'instance', 'mode:normal', 'build']);
});

// 実際の辞書があるとき（ビルドやdevで取得した後）だけ、lindera-wasmで語の位置と読みを確かめる。ネットワークには頼らない
const zipPath = new URL(`../../../.cache/dictionary/${DICTIONARY_SPEC.fileName}`, import.meta.url);
test('実際の辞書で、語のバイト位置と読みが原文に対応する', { skip: !existsSync(zipPath) }, async () => {
  const lindera = await import('lindera-wasm');
  lindera.initSync({ module: await readFile(new URL('../../../node_modules/lindera-wasm/lindera_wasm_bg.wasm', import.meta.url)) });
  const analyzer = createReadingAnalyzer(lindera as unknown as LinderaModule, await readDictionaryZip(await readFile(zipPath)));
  const text = '今日は𠮷野家abcぐぐぐ';
  const bytes = new TextEncoder().encode(text);
  const tokens = analyzer.tokenize(text);
  for (const token of tokens) {
    assert.equal(new TextDecoder().decode(bytes.subarray(token.byteStart, token.byteEnd)), token.surface);
  }
  assert.deepEqual(
    tokens.slice(0, 2).map((token) => [token.surface, token.reading, token.isUnknown]),
    [
      ['今日', 'キョウ', false],
      ['は', 'ハ', false],
    ],
  );
  assert.equal(tokens.find((token) => token.surface === '𠮷')?.isUnknown, true);
  assert.equal(tokens.find((token) => token.surface === '𠮷')?.reading, null);
});
