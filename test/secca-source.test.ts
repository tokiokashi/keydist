import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { readSeccaSources } from '../scripts/gen-secca-table.ts';
import { buildSeccaTable, type SeccaBuild, type SeccaTable } from '../scripts/secca-table.ts';

const embedded = JSON.parse(readFileSync(new URL('../src/input/layouts/tables/secca.json', import.meta.url), 'utf8')) as SeccaTable;

/** 出典の写しから作り直す。`config.kbd`の動きを再現して打鍵列を求めるので、このファイルのテストは全体で約25秒かかる（Nodeでの実測）。 */
const sources = readSeccaSources();
const rebuilt: SeccaBuild = buildSeccaTable(sources.config, sources.compose);

const entries = (section: keyof SeccaTable): Map<string, string> => {
  const map = new Map<string, string>();
  for (const line of embedded[section].split('\n')) {
    const at = line.indexOf(' ');
    map.set(line.slice(0, at), line.slice(at + 1));
  }
  return map;
};

test('組み込みの表が、出典の写しから作り直した表と一致する', () => {
  assert.deepEqual(rebuilt.table, embedded);
});

test('使わない行は、出力が空の行・カタカナのモードの行・どの押し方でも作れない行で、表に入っていない', () => {
  const count = (reason: string) => rebuilt.skipped.filter((skipped) => skipped.reason === reason).length;
  assert.equal(count('empty'), 112);
  assert.equal(count('katakana-mode'), 375);
  assert.equal(count('unreachable'), 136);
  const kana = embedded.kana.split('\n').map((line) => line.split(' ')[0]!);
  assert.ok(kana.every((output) => !/[ァ-ヴ]/u.test(output)));
  // どの押し方でも作れない行: 全角英字の52行（`layer-switch`で入るモードで出る）、記号3行、異体字4行（`config.kbd`に定義が無い）、
  // 熟語77行（保留中の`tap-next-release`の後に空白キーを押して左手を離す打ち方が、`tap-next-release`の挙動では別の出力になる）
  const unreachable = rebuilt.skipped.filter((skipped) => skipped.reason === 'unreachable');
  assert.equal(unreachable.filter(({ row }) => row.file === '.XCompose.symbols' && /^[Ａ-Ｚａ-ｚ]$/u.test(row.output)).length, 52);
  assert.equal(unreachable.filter(({ row }) => row.file === '.XCompose.variant_of_kanji').length, 4);
  assert.equal(unreachable.filter(({ row }) => row.file === '.XCompose.set_of_kanji').length, 77);
  assert.equal(entries('jukugo').has('荊妻'), false);
});

test('押す順序で字が変わる組が、別の字として別の打鍵列を持つ', () => {
  const kanji = entries('kanji');
  // 左手のfとdの順で朝と元が分かれ、右手のjとkの順で暴と担が分かれる
  assert.equal(kanji.get('朝'), 'fdj');
  assert.equal(kanji.get('元'), 'dfj');
  assert.equal(kanji.get('暴'), 'fdjk');
  assert.equal(kanji.get('担'), 'fdkj');
});

test('右手の打鍵は、作者の表記どおりのQWERTYの位置で打つ', () => {
  // 作者の`;`は、`config.kbd`では物理キーの`'`に置かれる
  assert.equal(entries('jukugo').get('焼却'), 'fe;e');
});

test('熟語は、空白キーを押す位置に空白キーのステップを持ち、左手を離して続ける熟語は打鍵の列だけを持つ', () => {
  const jukugo = entries('jukugo');
  assert.equal(jukugo.get('人間'), 'df_k');
  assert.equal(jukugo.get('人工'), 'df_kn');
  assert.equal(jukugo.get('人形'), 'dfkw');
});

test('かなは同時押しの組で、空白キーを先に押す面を持つ', () => {
  const kana = embedded.kana.split('\n');
  // ぎは、jとwのどちらを先に押しても出る
  assert.ok(kana.includes('ぎ (jw)'));
  assert.ok(kana.includes('ぬ (_w)'));
});
