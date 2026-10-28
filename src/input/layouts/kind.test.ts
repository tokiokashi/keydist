import assert from 'node:assert/strict';
import { test } from 'node:test';
import { builtInLayoutKind, layoutKind, userLayoutKind, type LayoutKind } from './kind.ts';
import type { Layout } from './types.ts';
import type { UserLayout } from './user-layouts.ts';

// test/analyzer-regression.test.tsのfixtureに記録された
// romajiRuleIdの有無から逆算した「各配列がどう扱われているか」の表。
// alpha配列はja条件でromajiRuleIdを持ち、kana配列は持たない
// （test/fixtures/analyzer-regression.json を参照して確認済み）。
const EXPECTED: Record<string, LayoutKind> = {
  qwerty: 'alpha',
  dvorak: 'alpha',
  colemak: 'alpha',
  'colemak-dh': 'alpha',
  workman: 'alpha',
  oonishi: 'alpha',
  'oonishi-custom': 'alpha',
  eucalyn: 'alpha',
  astarte: 'alpha',
  tomisuke: 'alpha',
  gallium: 'alpha',
  'semimak-jq': 'alpha',
  recurva: 'alpha',
  aptv3: 'alpha',
  norman: 'alpha',
  qgmlwy: 'alpha',
  'colemak-dh-ansi': 'alpha',
  'canary-ansi': 'alpha',
  canary: 'alpha',
  'sturdy-ansi': 'alpha',
  sturdy: 'alpha',
  graphite: 'alpha',
  halmak: 'alpha',
  mtgap: 'alpha',
  'naginata-v18': 'kana',
  nicola: 'kana',
  'shin-koume': 'kana',
  asuka: 'kana',
  'shin-jis-prefix': 'kana',
  'shin-jis-simultaneous': 'kana',
  shingeta: 'kana',
  'tsuki-2-263': 'kana',
  gekkou: 'kana',
  'tsuki-u9': 'kana',
  tsukimisou: 'kana',
  'tsukimisou-extract': 'kana',
  'tsuki-ex': 'kana',
  'tsuki-ringo': 'kana',
  yumi: 'kana',
  'kawasemi-plus': 'kana',
};

test('組み込み配列の種類は現状のAnalyzerのfixtureと一致する', () => {
  for (const [id, expected] of Object.entries(EXPECTED)) {
    assert.equal(builtInLayoutKind(id), expected, `layoutId=${id}`);
  }
});

test('未知のidはalpha扱いにする（英字系がほとんどのため）', () => {
  assert.equal(builtInLayoutKind('no-such-layout'), 'alpha');
});

test('自作配列の種類は、保存された種類の値で決まる', () => {
  const direct: UserLayout = {
    kind: 'kana',
    id: 'my-kana',
    name: 'かな配列',
    faces: [{ trigger: [], inputRole: 'layer', outputs: { a: 'あ' } }],
    composition: { dakuten: false, handakuten: false },
  };
  const romaji: UserLayout = {
    kind: 'alpha',
    id: 'my-alpha',
    name: 'ローマ字配列',
    rows: ['', '', '', ''],
    romaji: 'kunrei',
  };
  const alphaFaces: UserLayout = {
    kind: 'alpha',
    id: 'my-alpha-faces',
    name: '英字の面の配列',
    faces: [{ trigger: [], inputRole: 'layer', outputs: { a: 'a' } }],
    romaji: 'kunrei',
  };
  assert.equal(userLayoutKind(direct), 'kana');
  assert.equal(userLayoutKind(romaji), 'alpha');
  // 形（面か段か）では決まらない。面の形でも英字の種類になれる
  assert.equal(userLayoutKind(alphaFaces), 'alpha');
});

test('layoutKindは自作配列の一覧にあればそちらを優先し、無ければ組み込み表を使う', () => {
  const userLayouts = new Map<string, UserLayout>([
    [
      'my-kana',
      {
        kind: 'kana',
        id: 'my-kana',
        name: 'かな配列',
        faces: [{ trigger: [], inputRole: 'layer', outputs: { a: 'あ' } }],
        composition: { dakuten: false, handakuten: false },
      },
    ],
  ]);
  const myKanaLayout = { id: 'my-kana' } as unknown as Layout;
  const qwertyLayout = { id: 'qwerty' } as unknown as Layout;
  assert.equal(layoutKind(myKanaLayout, userLayouts), 'kana');
  assert.equal(layoutKind(qwertyLayout, userLayouts), 'alpha');
});
