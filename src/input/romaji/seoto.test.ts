import assert from 'node:assert/strict';
import test from 'node:test';
import { LAYOUTS } from '../layouts/index.ts';
import { ROMAJI_RULES, allRomajiRules, tableForRule } from './rules.ts';

const table = tableForRule('seoto');
const spelling = (kana: readonly string[]) => kana.map((heading) => table.get(heading));

test('か行はcで綴る', () => {
  assert.deepEqual(spelling(['か', 'き', 'く', 'け', 'こ']), ['ca', 'ci', 'cu', 'ce', 'co']);
  assert.deepEqual(spelling(['が', 'ぎ', 'ぐ']), ['ga', 'gi', 'gu']);
});

test('や・ゆ・よは1打で、拗音のya yu yoもx j qにする', () => {
  assert.deepEqual(spelling(['や', 'ゆ', 'よ']), ['x', 'j', 'q']);
  assert.deepEqual(spelling(['きゃ', 'しゃ', 'ちゅ', 'りょ', 'ぎょ', 'ぴゅ']), ['cx', 'sx', 'tj', 'rq', 'gq', 'pj']);
  assert.deepEqual(spelling(['きゅ', 'きょ', 'にゃ', 'ひゃ', 'みゅ', 'びょ']), ['cj', 'cq', 'nx', 'hx', 'mj', 'bq']);
});

test('じゃ行はzで打つ。yeはyのままにする', () => {
  assert.deepEqual(spelling(['じゃ', 'じゅ', 'じょ', 'じ']), ['zx', 'zj', 'zq', 'zi']);
  assert.deepEqual(spelling(['しぇ', 'じぇ']), ['sye', 'zye']);
});

test('し・ち・つ・ふ は指定が無いので訓令式のまま', () => {
  assert.deepEqual(spelling(['し', 'ち', 'つ', 'ふ']), ['si', 'ti', 'tu', 'hu']);
});

test('てぃ でぃ は作者が書くthi dhiで綴る', () => {
  assert.deepEqual(spelling(['てぃ', 'でぃ']), ['thi', 'dhi']);
});

test('小書きのかなはlで始める', () => {
  assert.deepEqual(spelling(['ぁ', 'ぃ', 'ぅ', 'ぇ', 'ぉ', 'ゃ', 'ゅ', 'ょ', 'ゎ']), ['la', 'li', 'lu', 'le', 'lo', 'lx', 'lj', 'lq', 'lwa']);
});

test('ん っ ー は層の出力と同じ文字そのもので綴る', () => {
  assert.deepEqual(spelling(['ん', 'っ', 'ー']), ['ん', 'っ', 'ー']);
});

test('促音は子音を重ねる見出しを持たない', () => {
  assert.deepEqual(
    [...table.keys()].filter((heading) => heading.startsWith('っ') && heading !== 'っ'),
    [],
  );
  assert.equal(ROMAJI_RULES.seoto.generateSokuon, false);
});

test('句読点と括弧は訓令式と同じ綴り', () => {
  const kunrei = tableForRule('kunrei');
  for (const heading of ['、', '。', '「', '」']) assert.equal(table.get(heading), kunrei.get(heading));
});

test('作者の記号の表の4行（v/ v. v, v-）を綴りにし、矢印と『』は入れない', () => {
  assert.deepEqual(spelling(['・', '…', '‥', '〜']), ['v/', 'v.', 'v,', 'v-']);
  for (const heading of ['←', '↑', '→', '↓', '↗', '↘', '↙', '↖', '『', '』']) assert.equal(table.has(heading), false, heading);
});

test('綴りは配列の英字・句読点か、層の3文字だけで、訓令式に無い見出しを足さない', () => {
  const kunrei = tableForRule('kunrei');
  const extra = [...table.keys()].filter((heading) => !kunrei.has(heading) && !heading.startsWith('っ'));
  assert.deepEqual(extra.sort(), ['ゎ', 'でぃ', 'てぃ', '…', '‥', '〜'].sort());
  const seoto = LAYOUTS.find((layout) => layout.id === 'seoto')!;
  for (const [heading, roman] of table) {
    if (['ん', 'っ', 'ー', '・'].includes(heading)) continue; // `・` は `/` を出すキーが無い
    for (const char of roman) assert.ok(seoto.map.has(char), `${heading} の綴り ${roman} の ${char} がせおと配列に無い`);
  }
});

test('規則の一覧に入り、名前を持つ', () => {
  assert.ok(allRomajiRules().some((rule) => rule.id === 'seoto'));
  assert.match(ROMAJI_RULES.seoto.name, /^せおと配列/);
});
