import assert from 'node:assert/strict';
import { test } from 'node:test';
import { builtInLayoutKind, layoutKind, userLayoutKind, type LayoutKind } from './kind.ts';
import type { Layout } from './types.ts';
import type { UserLayout } from './user-layouts.ts';

// test/analyzer-regression.test.ts のfixture（旧Analyzerの実測値）に記録された
// romajiRuleId の有無から逆算した「現状のAnalyzerが各配列をどう扱っているか」の表。
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
  'naginata-v18': 'kana',
  nicola: 'kana',
  'shin-koume': 'kana',
  asuka: 'kana',
  'shin-jis-prefix': 'kana',
  'shin-jis-simultaneous': 'kana',
  shingeta: 'kana',
  'tsuki-2-263': 'kana',
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

test('自作配列はdirect:trueならkana、それ以外はalpha', () => {
  const direct: UserLayout = {
    id: 'my-kana', name: 'かな配列', rows: ['', '', '', ''], romaji: 'kunrei', direct: true,
  };
  const romaji: UserLayout = {
    id: 'my-alpha', name: 'ローマ字配列', rows: ['', '', '', ''], romaji: 'kunrei',
  };
  assert.equal(userLayoutKind(direct), 'kana');
  assert.equal(userLayoutKind(romaji), 'alpha');
});

test('layoutKindは自作配列の一覧にあればそちらを優先し、無ければ組み込み表を使う', () => {
  const userLayouts = new Map<string, UserLayout>([
    ['my-kana', { id: 'my-kana', name: 'かな配列', rows: ['', '', '', ''], romaji: 'kunrei', direct: true }],
  ]);
  const myKanaLayout = { id: 'my-kana' } as unknown as Layout;
  const qwertyLayout = { id: 'qwerty' } as unknown as Layout;
  assert.equal(layoutKind(myKanaLayout, userLayouts), 'kana');
  assert.equal(layoutKind(qwertyLayout, userLayouts), 'alpha');
});
