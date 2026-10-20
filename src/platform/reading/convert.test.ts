import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { convertToReading } from '#input/text/reading.ts';
import { createReadingAnalyzer, type LinderaModule, type ReadingAnalyzer } from './analyzer.ts';
import { readDictionaryZip } from './dictionary-files.ts';
import { DICTIONARY_SPEC } from './dictionary-spec.ts';

// 実際の辞書とlindera-wasmで、読みに直したテキストを確かめる。テスト自身は辞書を取得しない。
// CIでは取得のstepが先に回るので、zipが無ければ飛ばさず失敗させる
const zipPath = new URL(`../../../.cache/dictionary/${DICTIONARY_SPEC.fileName}`, import.meta.url);
const skip = process.env.CI === undefined && !existsSync(zipPath);

async function analyzer(): Promise<ReadingAnalyzer> {
  const lindera = await import('lindera-wasm');
  lindera.initSync({ module: await readFile(new URL('../../../node_modules/lindera-wasm/lindera_wasm_bg.wasm', import.meta.url)) });
  return createReadingAnalyzer(lindera as unknown as LinderaModule, await readDictionaryZip(await readFile(zipPath)));
}

test('実際の辞書で、漢字だけが読みに置き換わり、かな・英数字・記号はそのまま残る', { skip }, async () => {
  const tokenizer = await analyzer();
  const text = '今日は良い天気です。ABC１２３、木曜日';
  const result = convertToReading(text, tokenizer.tokenize(text));
  assert.equal(result.text, 'きょうはよいてんきです。ABC１２３、もくようび');
});

test('実際の辞書で、制御文字・半角空白・タブ・改行を含む入力も、語のバイト位置が原文と対応する', { skip }, async () => {
  const tokenizer = await analyzer();
  // 制御文字・各種の空白・ゼロ幅の文字・BOM。コードポイントで書く（見えない文字をソースに直接書かない）
  const controls = [0x01, 0x08, 0x0b, 0x0c, 0x7f, 0x85, 0xa0, 0x200b, 0x2028, 0xfeff].map((codePoint) => String.fromCodePoint(codePoint));
  const text = `今日 は\t雨\r\nで${controls.join('')}  明日\n\n 晴れ${controls.join(' ')}`;
  const tokens = tokenizer.tokenize(text);
  const bytes = new TextEncoder().encode(text);
  const decoder = new TextDecoder('utf-8', { ignoreBOM: true });
  for (const token of tokens) {
    assert.equal(decoder.decode(bytes.subarray(token.byteStart, token.byteEnd)), token.surface);
  }
  // 語が返らなかった文字は、読みに直した後のテキストにそのまま残る
  const result = convertToReading(text, tokens);
  assert.equal(result.text.replace(/[\p{Script=Hiragana}ー]/gu, ''), text.replace(/[\p{Script=Han}\p{Script=Hiragana}ー]/gu, ''));
  for (const control of controls) assert.ok(result.text.includes(control), `U+${control.codePointAt(0)?.toString(16)} が残る`);
  assert.ok(!/\p{Script=Han}/u.test(result.text));
});

test('実際の辞書で、辞書に無い漢字と々だけの語は漢字のまま残る', { skip }, async () => {
  const tokenizer = await analyzer();
  for (const text of ['々', 'あ々', '今日々']) {
    const tokens = tokenizer.tokenize(text);
    assert.ok(tokens.some((token) => token.surface === '々'));
    assert.equal(convertToReading(text, tokens).text, text.replace('今日', 'きょう'), text);
  }
  const unknown = '𠮷野家';
  const result = convertToReading(unknown, tokenizer.tokenize(unknown));
  assert.ok(result.text.startsWith('𠮷'));
});
