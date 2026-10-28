import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { tableForRule } from '../romaji/rules.ts';
import { faceCells } from './index.ts';
import { SEOTO_FACES } from './seoto.ts';

interface SeotoSource {
  format: string;
  layoutId: string;
  source: { url: string; repository: string; commit: string; license: string; sha: string; lastModified: string; retrievedAt: string };
  definition: {
    customRules: string;
    aliases: { source: string; keys: string }[];
    L: (string | null)[];
    R: (string | null)[];
  };
}

const source = JSON.parse(readFileSync(new URL('../../../test/fixtures/sources/seoto.json', import.meta.url), 'utf8')) as SeotoSource;

/** 解析ツールの格子の行ごとの、QWERTYの刻印のキー。左手は先頭のnullを除く5列、右手は5列の後にnullが2つ続く */
const LEFT_KEYS = ['12345', 'qwert', 'asdfg', 'zxcvb'];
const RIGHT_KEYS = ['67890', 'yuiop', 'hjkl;', 'nm,./'];

/** 解析ツールの層のセルの表記を、層で出す文字にする。BackSpaceは文字を出さない */
const LAYER_OUTPUT: Readonly<Record<string, string | null>> = { 'nn:ん': 'ん', '-': 'ー', 'ltu:っ': 'っ', BS: null };
/** 解析ツールにあり、制作記と公式ページの配列図に無い層のセル。せおと配列の層には置かない（`'` は単打で打てて経路が重なり、`~` は作者の記号の表が `v-` で打つ `〜` と別に置くものではない） */
const KNOWN_MISMATCH_LAYER_CELLS: Readonly<Record<string, string>> = { o: '~', h: "'" };

interface Cell {
  key: string;
  base: string | undefined;
  layer: string | undefined;
}

function cells(): Cell[] {
  const { L, R } = source.definition;
  const out: Cell[] = [];
  const read = (value: string | null, key: string) => {
    if (value === null) throw new Error(`${key} の位置がnull`);
    const [base, layer] = value.split(' ');
    out.push({ key, base, layer });
  };
  for (const [row, keys] of LEFT_KEYS.entries()) for (const [col, key] of [...keys].entries()) read(L[row * 6 + 1 + col]!, key);
  for (const [row, keys] of RIGHT_KEYS.entries()) for (const [col, key] of [...keys].entries()) read(R[row * 7 + col]!, key);
  return out;
}

test('写しは解析ツールのHTMLを指し、取得の記録を持つ', () => {
  assert.equal(source.format, 'keyflow-analyzer-layout');
  assert.equal(source.layoutId, 'seoto');
  assert.equal(source.source.url, 'https://keyflow.koyasi777.com/');
  assert.equal(source.source.repository, 'https://github.com/koyasi777/keyflow-analyzer');
  assert.match(source.source.commit, /^[0-9a-f]{40}$/);
  assert.equal(source.source.license, 'MIT License');
  assert.match(source.source.sha, /^[0-9a-f]{64}$/);
  assert.ok(source.source.lastModified !== '' && source.source.retrievedAt !== '');
});

test('並び: 30キーの単打は解析ツールの定義と一致し、矢印のキーには文字が無い', () => {
  const base = faceCells(SEOTO_FACES[0]!);
  const thirty = cells().filter(({ key }) => 'qwertyuiopasdfghjkl;zxcvbnm,./'.includes(key));
  assert.equal(thirty.length, 30);
  for (const { key, base: expected } of thirty) {
    if (expected === '←' || expected === '→') assert.equal(base.has(key), false, `${key} は文字の無いキー`);
    else assert.equal(base.get(key), expected, `${key} の位置`);
  }
  // 解析ツールの数字段（左1〜5、右6〜0）はQWERTYのまま
  for (const { key, base: expected } of cells().filter(({ key }) => '1234567890'.includes(key))) assert.equal(base.get(key), expected);
  // 解析ツールの定義で、`;` `/` の位置のキーは `e` `v` で、`;` `/` を出すキーは無い
  assert.equal([...base.values()].includes(';'), false);
  assert.equal([...base.values()].includes('/'), false);
});

test('層: ん ー っ は解析ツールの定義と一致し、BackSpaceと既知の不一致の2セルは置かない', () => {
  const layer = faceCells(SEOTO_FACES[1]!);
  const layered = cells().filter(({ layer: cell }) => cell !== undefined);
  const placed: Record<string, string> = {};
  for (const { key, layer: cell } of layered) {
    const output = LAYER_OUTPUT[cell!];
    if (output !== undefined) {
      if (output !== null) placed[key] = output;
    } else {
      // 既知の不一致。解析ツールにだけある
      assert.equal(KNOWN_MISMATCH_LAYER_CELLS[key], cell, `${key} の層のセル ${cell} が既知の不一致に無い`);
    }
  }
  assert.deepEqual(Object.fromEntries(layer), placed);
  assert.deepEqual(KNOWN_MISMATCH_LAYER_CELLS, { o: '~', h: "'" });
  for (const key of Object.keys(KNOWN_MISMATCH_LAYER_CELLS)) assert.equal(layer.has(key), false);
});

test('綴りの拡張: customRulesとaliasesが一致し、せおと配列の綴りに当たる', () => {
  const { customRules, aliases } = source.definition;
  const parsed = customRules.split(', ').map((pair) => {
    const [from, keys] = pair.split('=');
    return { source: from, keys };
  });
  assert.deepEqual(parsed, aliases);

  const table = tableForRule('seoto');
  const keysOf = (from: string) => aliases.find((alias) => alias.source === from)!.keys;
  // k=c: か行の綴りはcで始まる
  for (const kana of ['か', 'き', 'く', 'け', 'こ']) assert.ok(table.get(kana)!.startsWith(keysOf('k')), kana);
  const kanaOf: Record<string, string> = {
    ya: 'や',
    yu: 'ゆ',
    yo: 'よ',
    ji: 'じ',
    ja: 'じゃ',
    ju: 'じゅ',
    je: 'じぇ',
    jo: 'じょ',
    jya: 'じゃ',
    jyu: 'じゅ',
    jye: 'じぇ',
    jyo: 'じょ',
  };
  for (const [from, kana] of Object.entries(kanaOf)) assert.equal(table.get(kana), keysOf(from), `${from} → ${kana}`);
  // jyi=zyiは、訓令式のテーブルに じぃ の見出しが無いので、せおと配列の綴りにも見出しが無い
  assert.equal(table.has('じぃ'), false);
});
