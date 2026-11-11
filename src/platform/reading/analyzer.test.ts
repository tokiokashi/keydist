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

const conjugating = (surface: string, pos: string, form: string, base: string, reading: string | undefined, isUnknown = false) => ({
  surface,
  byteStart: 0,
  byteEnd: 3,
  isUnknown,
  details: [pos, '自立', '*', '*', '活用型', form, base, ...(reading === undefined ? [] : [reading, reading])],
});

test('活用する語は、表記と原形の共通の先頭部分を語幹として、語幹の長さを取り出す', () => {
  assert.equal(toReadingToken(conjugating('早く', '形容詞', '連用テ接続', '早い', 'ハヤク')).stemLength, 1);
  assert.equal(toReadingToken(conjugating('嬉しかっ', '形容詞', '連用タ接続', '嬉しい', 'ウレシカッ')).stemLength, 2);
  assert.equal(toReadingToken(conjugating('行か', '動詞', '未然形', '行く', 'イカ')).stemLength, 1);
  assert.equal(toReadingToken(conjugating('思い出し', '動詞', '連用形', '思い出す', 'オモイダシ')).stemLength, 3);
  assert.equal(toReadingToken(conjugating('ましょ', '助動詞', '未然ウ接続', 'ます', 'マショ')).stemLength, 1);
  assert.equal(toReadingToken(conjugating('なかっ', '助動詞', '連用タ接続', 'ない', 'ナカッ')).stemLength, 1);
});

test('語幹を出さない語: 活用語尾が無い・語幹が空・活用しない品詞・未知語・読みを割れない語', () => {
  // 基本形は活用語尾が無い
  assert.equal(toReadingToken(conjugating('食べる', '動詞', '基本形', '食べる', 'タベル')).stemLength, undefined);
  // 一段活用の連用形は、表記が原形の語幹と同じで、活用語尾が無い
  assert.equal(toReadingToken(conjugating('食べ', '動詞', '連用形', '食べる', 'タベ')).stemLength, undefined);
  // 語幹と原形が先頭から食い違う（し／する、で／だ）
  assert.equal(toReadingToken(conjugating('し', '動詞', '連用形', 'する', 'シ')).stemLength, undefined);
  assert.equal(toReadingToken(conjugating('で', '助動詞', '連用形', 'だ', 'デ')).stemLength, undefined);
  // 活用しない品詞。形容動詞はIPADICが語幹（名詞）と助詞に分けるので、1語の内側には語幹と語尾の境が無い
  assert.equal(toReadingToken(conjugating('静か', '名詞', '*', '静か', 'シズカ')).stemLength, undefined);
  assert.equal(toReadingToken(conjugating('に', '助詞', '*', 'に', 'ニ')).stemLength, undefined);
  // 未知語・読みが無い語・読みが活用語尾で終わらない語
  assert.equal(toReadingToken(conjugating('早く', '形容詞', '連用テ接続', '早い', 'ハヤク', true)).stemLength, undefined);
  assert.equal(toReadingToken(conjugating('早く', '形容詞', '連用テ接続', '早い', undefined)).stemLength, undefined);
  assert.equal(toReadingToken(conjugating('早く', '形容詞', '連用テ接続', '早い', 'ハヤイ')).stemLength, undefined);
  // 活用語尾に漢字が混ざる
  assert.equal(toReadingToken(conjugating('行く方', '動詞', '連用形', '行く', 'イクホウ')).stemLength, undefined);
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

// 実際の辞書があるとき（ビルドやdevで取得した後）に、lindera-wasmで語の位置と読みを確かめる。テスト自身は取得しない。
// CIでは取得の step が先に回るので、zipが無ければ飛ばさず失敗させる
const zipPath = new URL(`../../../.cache/dictionary/${DICTIONARY_SPEC.fileName}`, import.meta.url);
test('実際の辞書で、語のバイト位置と読みが原文に対応する', { skip: process.env.CI === undefined && !existsSync(zipPath) }, async () => {
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

test('実際の辞書で、活用する語だけが語幹の長さを持つ', { skip: process.env.CI === undefined && !existsSync(zipPath) }, async () => {
  const lindera = await import('lindera-wasm');
  lindera.initSync({ module: await readFile(new URL('../../../node_modules/lindera-wasm/lindera_wasm_bg.wasm', import.meta.url)) });
  const analyzer = createReadingAnalyzer(lindera as unknown as LinderaModule, await readDictionaryZip(await readFile(zipPath)));
  const stems = (text: string) => analyzer.tokenize(text).map((token) => [token.surface, token.stemLength]);
  assert.deepEqual(stems('早く'), [['早く', 1]]);
  assert.deepEqual(stems('嬉しかった'), [
    ['嬉しかっ', 2],
    ['た', undefined],
  ]);
  assert.deepEqual(stems('行きましょう'), [
    ['行き', 1],
    ['ましょ', 1],
    ['う', undefined],
  ]);
  assert.deepEqual(stems('入力'), [['入力', undefined]]);
  // 形容動詞は語幹（名詞）と助詞に分かれる
  assert.deepEqual(stems('静かに'), [
    ['静か', undefined],
    ['に', undefined],
  ]);
});
