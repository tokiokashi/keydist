import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_TRACE_POLICY, generateTrace } from '#trace/generate.ts';
import { buildGeometry } from '../shapes/geometry.ts';
import { assertKanaLayout, assertKanaLayoutFixture } from '../../../test/kana-layout-helpers.ts';
import { LAYOUT_BY_ID } from './index.ts';

const layout = LAYOUT_BY_ID.get('yumi')!;

/**
 * 作者sleepwlkの記事「弓配列1.0.2 (Stable)」（2015-05-18）の文字配置のうち、単打と、★☆◆◇に続けて入力する4面。
 * 各面は4行で、左手と右手の間に全角の空白が2つ入る。`＿` は空欄。
 * 1行目は `1`〜`0` `-` `^` `¥`、2行目は `q`〜`p` `@` `[`、3行目は `a`〜`l` `;` `:` `]`、4行目は `z`〜`m` `,` `.` `/` `ろ` のキー。
 */
const AUTHOR_GRID: Readonly<Record<'単打' | '★' | '☆' | '◆' | '◇', readonly string[]>> = {
  単打: ['１２３４５　　６７８９０ふ〜｀', 'どのかとあ　　むういしーじ・', 'す☆★てた　　きん◆◇でち＼', 'ょゅまにゃ　　くっ、。ヴ＿'],
  '★': ['＿＿＿＿＿　　＿＿＿＿＿―≠´', 'ヶ＿♂□◇　　×ぎれみ？「」', 'ぇぞ＿ぉ☆　　ひりこはよ“ｄ', '♡▽△○◎　　ぱぷ（）÷￣'],
  '☆': ['＿＿＿＿＿　　＿＿＿＿＿−＝｀', 'ヵ♀ゎ■◆　　※ぐおや！『』', 'ぃ＿ぽぁ★　　ずるつそさ”ｓ', '♥▼▲●♪　　ざぺ，．／＿'],
  '◆': ['＿＿＿＿＿　　＿＿＿＿＿〔〕＿', '゛めえごげ　　∞‘↑’；〈〉', 'をがもらば　　←わ＿ぢぴ→ｋ', 'ぜぼゆねゐ　　【】↓〒￥＿'],
  '◇': ['＿＿＿＿＿　　＿＿＿＿＿≪≫＿', '゜ほろへ＋　　‡§¶〃：《》', 'せだけなぶ　　†ぅび＿ぬ⇒ｌ', 'べ＠…づゑ　　［］≦≧＼＿'],
};

/** 同じ記事の、拗音・外来音拡張の表。 `最初のキーの文字 + 後置のキーの文字: 出力` の形。 */
const AUTHOR_YOUON: readonly string[] = [
  'くゃ: ひゃ',
  'くゅ: ひゅ',
  'くょ: ひょ',
  'ーゃ: みゃ',
  'ーゅ: みゅ',
  'ーょ: みょ',
  'んゃ: りゃ',
  'んゅ: りゅ',
  'んょ: りょ',
  'うゃ: ぎゃ',
  'うゅ: ぎゅ',
  'うょ: ぎょ',
  '６ゃ: ぢゃ',
  '６ゅ: ぢゅ',
  '６ょ: ぢょ',
  'っゃ: びゃ',
  'っゅ: びゅ',
  'っょ: びょ',
  '、ゃ: ぴゃ',
  '、ゅ: ぴゅ',
  '、ょ: ぴょ',
  '８ゃ: うぁ',
  '７ょ: うぃ',
  '８ゅ: うぇ',
  '８ょ: うぉ',
  'むゃ: くぁ',
  '９ょ: くぃ',
  'むゅ: くぇ',
  'むょ: くぉ',
  '＿ゃ: つぁ',
  '＼ょ: つぃ',
  '＿ゅ: つぇ',
  '＿ゃ: つぉ',
  'ふゃ: ふぁ',
  '〜ょ: ふぃ',
  '〜ゅ: ふぇ',
  'ふょ: ふぉ',
  'ヴゃ: ヴぁ',
  '。ょ: ヴぃ',
  '。ゅ: ヴぇ',
  'ヴょ: ヴぉ',
  'てょ: てぃ',
  'でょ: でぃ',
  'てゃ: とぅ',
  'でゃ: どぅ',
  '０ゅ: しぇ',
  '９ゅ: じぇ',
  '＼ゅ: ちぇ',
  'いゅ: いぇ',
  '７ゅ: ひぇ',
  'まゅ: ぴぇ',
  '０ょ: すぃ',
  'まょ: ずぃ',
  '７ゃ: ぐぁ',
];

/** 作者の表のキーの文字（全角）を、ANSIのキーに写す。JIS専用のキーは `jis-` を付ける。 */
const GRID_KEYS: readonly (readonly string[])[] = [
  [...'1234567890-=', 'jis-yen'],
  [...'qwertyuiop[]'],
  [..."asdfghjkl;'", 'jis-]'],
  [...'zxcvbnm,./', 'jis-ro'],
];

/** 前置シフトのキー。 */
const SHIFT_KEYS = { '★': 'd', '☆': 's', '◆': 'k', '◇': 'l' } as const;

/** 後置の拗音・外来音のキー。 */
const YOUON_KEYS: Readonly<Record<string, string>> = { ゃ: 'b', ゅ: 'x', ょ: 'z' };

/** keydistが文字として持つ出力。かな・長音・、。・括弧・？！・―・…・・。ほかの記号は表さない。 */
const KEPT_OUTPUT = /^[ぁ-ゖァ-ヺー、。「」（）？！―…・]$/;

interface Cell {
  readonly key: string;
  readonly output: string;
}

/** 面の4行を、キーと出力の組にする。`＿` は空欄として除く。 */
function cellsOf(rows: readonly string[]): Cell[] {
  const cells: Cell[] = [];
  rows.forEach((row, rowIndex) => {
    [...row.replace(/　/g, '')].forEach((output, column) => {
      if (output !== '＿') cells.push({ key: GRID_KEYS[rowIndex]![column]!, output });
    });
  });
  return cells;
}

/** 単打面で、最初のキーの文字から、そのキーを引く。数字の `１`〜`０` と `〜` はキーの位置で引く。 */
function firstKeys(): Map<string, string> {
  const map = new Map<string, string>();
  AUTHOR_GRID.単打.forEach((row, rowIndex) => {
    [...row.replace(/　/g, '')].forEach((output, column) => {
      map.set(output, GRID_KEYS[rowIndex]![column]!);
    });
  });
  return map;
}

interface Route {
  readonly output: string;
  readonly keys: string;
}

const ANSI_ROUTE = /^[a-z0-9;,./=\-[\]']+$/;
const usesAnsiKeys = (keys: string): boolean => !keys.includes('jis-') && ANSI_ROUTE.test(keys);

/** 作者の表にある、keydistが持つ文字を出す全ての経路。JIS専用のキーを使う経路は含まない。 */
function authorRoutes(): Route[] {
  const routes: Route[] = [];
  for (const cell of cellsOf(AUTHOR_GRID.単打)) {
    if (KEPT_OUTPUT.test(cell.output) && usesAnsiKeys(cell.key)) routes.push({ output: cell.output, keys: cell.key });
  }
  for (const [symbol, shift] of Object.entries(SHIFT_KEYS)) {
    for (const cell of cellsOf(AUTHOR_GRID[symbol as keyof typeof SHIFT_KEYS])) {
      if (KEPT_OUTPUT.test(cell.output) && usesAnsiKeys(cell.key)) routes.push({ output: cell.output, keys: `${shift}${cell.key}` });
    }
  }
  const first = firstKeys();
  for (const line of AUTHOR_YOUON) {
    const [from, output] = line.split(': ') as [string, string];
    const key = first.get(from[0]!)!;
    const keys = `${key}${YOUON_KEYS[from[1]!]}`;
    if (usesAnsiKeys(keys)) routes.push({ output, keys });
  }
  return routes;
}

/** そのかなを打つ全ての経路を、打鍵の列（キーを順に並べた文字列）で返す。 */
function typedKeys(kana: string): string[] {
  return (layout.canonicalInputs.get(kana) ?? []).map((alternative) =>
    alternative.baseRealizations
      .flatMap((realization) => realization.actions)
      .map((step) => step.join(''))
      .join(''),
  );
}

const keysOf = (text: string): string[] =>
  generateTrace(text, layout, buildGeometry('row-staggered'), DEFAULT_TRACE_POLICY).strokes.map((stroke) =>
    stroke.presses.flatMap((press) => press.keys.map((key) => key.id)).join(''),
  );

/**
 * mentaiko氏のかな配列テスターの定義（「弓配列 1.0.2 (Stable)　sleepwlk氏作」）のうち、かな・長音・句読点・括弧の項目。
 * 打鍵はJISの刻印で書かれていて、`@` はANSIの `[`、`:` は `'`、`[` は `]`、`_` はJIS専用のキーに当たる。
 */
const TESTER: ReadonlyArray<readonly [string, string]> = [
  ['―', 'd-'],
  ['・', '['],
  ['、', ','],
  ['！', 'sp'],
  ['？', 'dp'],
  ['…', 'lc'],
  ['。', '.'],
  ['（', 'd,'],
  ['）', 'd.'],
  ['「', 'd@'],
  ['」', 'd['],
  ['あ', 't'],
  ['ぁ', 'sf'],
  ['い', 'i'],
  ['ぃ', 'sa'],
  ['いぇ', 'ix'],
  ['う', 'u'],
  ['ぅ', 'lj'],
  ['ヴ', '/'],
  ['うぁ', '8b'],
  ['ヴぁ', '/b'],
  ['うぃ', '7z'],
  ['ヴぃ', '.z'],
  ['うぇ', '8x'],
  ['ヴぇ', '.x'],
  ['うぉ', '8z'],
  ['ヴぉ', '/z'],
  ['ぇ', 'da'],
  ['え', 'ke'],
  ['ぉ', 'df'],
  ['お', 'si'],
  ['か', 'e'],
  ['ヵ', 'sq'],
  ['が', 'ks'],
  ['き', 'h'],
  ['ぎ', 'du'],
  ['ぎゃ', 'ub'],
  ['ぎゅ', 'ux'],
  ['ぎょ', 'uz'],
  ['く', 'n'],
  ['ぐ', 'su'],
  ['くぁ', 'yb'],
  ['ぐぁ', '7b'],
  ['くぃ', '9z'],
  ['くぇ', 'yx'],
  ['くぉ', 'yz'],
  ['ヶ', 'dq'],
  ['け', 'ld'],
  ['げ', 'kt'],
  ['こ', 'dk'],
  ['ご', 'kr'],
  ['さ', 's;'],
  ['ざ', 'sn'],
  ['し', 'o'],
  ['じ', '@'],
  ['しぇ', '0x'],
  ['じぇ', '9x'],
  ['す', 'a'],
  ['ず', 'sh'],
  ['すぃ', '0z'],
  ['ずぃ', 'cz'],
  ['せ', 'la'],
  ['ぜ', 'kz'],
  ['そ', 'sl'],
  ['ぞ', 'ds'],
  ['た', 'g'],
  ['だ', 'ls'],
  ['ち', ':'],
  ['ぢ', 'kl'],
  ['ぢゃ', '6b'],
  ['ぢゅ', '6x'],
  ['ぢょ', '6z'],
  ['っ', 'm'],
  ['つ', 'sk'],
  ['づ', 'lv'],
  ['つぁ', '_b'],
  ['つぇ', '_x'],
  ['つぉ', '_z'],
  ['て', 'f'],
  ['で', ';'],
  ['てぃ', 'fz'],
  ['でぃ', ';z'],
  ['と', 'r'],
  ['ど', 'q'],
  ['とぅ', 'fb'],
  ['どぅ', ';b'],
  ['な', 'lf'],
  ['に', 'v'],
  ['ぬ', 'l;'],
  ['ね', 'kv'],
  ['の', 'w'],
  ['は', 'dl'],
  ['ば', 'kg'],
  ['ぱ', 'dn'],
  ['ひ', 'dh'],
  ['び', 'lk'],
  ['ぴ', 'k;'],
  ['ひぇ', '7x'],
  ['ぴぇ', 'cx'],
  ['ひゃ', 'nb'],
  ['びゃ', 'mb'],
  ['ぴゃ', ',b'],
  ['ひゅ', 'nx'],
  ['びゅ', 'mx'],
  ['ぴゅ', ',x'],
  ['ひょ', 'nz'],
  ['びょ', 'mz'],
  ['ぴょ', ',z'],
  ['ふ', '-'],
  ['ぶ', 'lg'],
  ['ぷ', 'dm'],
  ['ふぁ', '-b'],
  ['ふぉ', '-z'],
  ['へ', 'lr'],
  ['べ', 'lz'],
  ['ぺ', 'sm'],
  ['ほ', 'lw'],
  ['ぼ', 'kx'],
  ['ぽ', 'sd'],
  ['ま', 'c'],
  ['み', 'do'],
  ['みゃ', 'pb'],
  ['みゅ', 'px'],
  ['みょ', 'pz'],
  ['む', 'y'],
  ['め', 'kw'],
  ['も', 'kd'],
  ['ゃ', 'b'],
  ['や', 'so'],
  ['ゅ', 'x'],
  ['ゆ', 'kc'],
  ['ょ', 'z'],
  ['よ', 'd;'],
  ['ら', 'kf'],
  ['り', 'dj'],
  ['りゃ', 'jb'],
  ['りゅ', 'jx'],
  ['りょ', 'jz'],
  ['る', 'sj'],
  ['れ', 'di'],
  ['ろ', 'le'],
  ['ゎ', 'se'],
  ['わ', 'kj'],
  ['ゐ', 'kb'],
  ['ゑ', 'lb'],
  ['を', 'ka'],
  ['ん', 'j'],
  ['ー', 'p'],
];

const TESTER_KEYS: Readonly<Record<string, string>> = { '@': '[', ':': "'", '[': ']', ']': 'jis-]', _: 'jis-ro', '^': '=' };

/** テスターの打鍵を、ANSIのキーの列に直す。 */
const testerKeys = (keys: string): string => [...keys].map((key) => TESTER_KEYS[key] ?? key).join('');

const routes = authorRoutes();

test('作者の表は、拗音・外来音拡張が54行で、そのうち5行がJIS専用のキーから始まる', () => {
  assert.equal(AUTHOR_YOUON.length, 54);
  const jisOnly = AUTHOR_YOUON.filter((line) => /^[＿＼]/.test(line));
  assert.deepEqual(jisOnly.sort(), ['＿ゃ: つぁ', '＿ゅ: つぇ', '＿ゃ: つぉ', '＼ょ: つぃ', '＼ゅ: ちぇ'].sort());
});

test('作者の表で、＿ゃ が つぁ と つぉ の2行になっているのは、つぉ が ＿ょ の誤記と読める', () => {
  assert.equal(AUTHOR_YOUON.filter((line) => line.startsWith('＿ゃ: ')).length, 2);
  assert.equal(AUTHOR_YOUON.filter((line) => line.startsWith('＿ょ: ')).length, 0);
});

test('JIS専用のキーを最初のキーにする5件は表さない', () => {
  for (const kana of ['つぁ', 'つぃ', 'つぇ', 'つぉ', 'ちぇ']) assert.equal(layout.map.has(kana), false, kana);
});

test('面で書ける経路は、その打鍵で打てる', () => {
  assert.equal(routes.length, 30 + 20 + 16 + 17 + 15 + 49);
  for (const route of routes) {
    assert.ok(typedKeys(route.output).includes(route.keys), `${route.output} を ${route.keys} で打てない`);
  }
});

test('面から作った打鍵は、作者の表の経路と過不足なく一致する', () => {
  const fromFaces = new Set<string>();
  for (const [kana, alternatives] of layout.canonicalInputs) {
    alternatives.forEach((alternative, index) => {
      if (alternative.origin === 'face') fromFaces.add(`${kana}=${typedKeys(kana)[index]}`);
    });
  }
  const expected = new Set(routes.map((route) => `${route.output}=${route.keys}`));
  assert.deepEqual([...fromFaces].sort(), [...expected].sort());
});

test('同じ文字を2通りに打てる経路は無い', () => {
  for (const [kana, alternatives] of layout.canonicalInputs) assert.equal(alternatives.length, 1, kana);
});

test('テスターの定義と、テスターに無い ふぃ・ふぇ を除いて一致する', () => {
  const testerOutputs = new Set(TESTER.map(([kana]) => kana));
  for (const [kana, rawKeys] of TESTER) {
    const keys = testerKeys(rawKeys);
    if (keys.includes('jis-')) continue;
    assert.ok(typedKeys(kana).includes(keys), `${kana} をテスターの ${keys} で打てない`);
  }
  const missing = routes.map((route) => route.output).filter((output) => !testerOutputs.has(output));
  assert.deepEqual(missing.sort(), ['ふぃ', 'ふぇ'].sort());
  assert.deepEqual(typedKeys('ふぃ'), ['=z']);
  assert.deepEqual(typedKeys('ふぇ'), ['=x']);
});

test('拗音の後置は1字として打ち、く と ゃ を続けて出す時は間に確定の打鍵を入れる', () => {
  assert.deepEqual(typedKeys('ひゃ'), ['nb']);
  assert.deepEqual(keysOf('ひゃ'), ['n', 'b']);
  assert.deepEqual(keysOf('ひゃく'), ['n', 'b', 'n']);
  assert.deepEqual(keysOf('ぎょう'), ['u', 'z', 'u']);
  assert.deepEqual(keysOf('ひ'), ['d', 'h']);
  assert.deepEqual(keysOf('ゃ'), ['b']);
  // く と ゃ を続けて打つと ひゃ と読まれるので、間に右親指の確定の打鍵が入る
  assert.deepEqual(keysOf('くゃ'), ['n', 'thumb-r', 'b']);
});

test('後置のキーb x zは、単打でも ゃ ゅ ょ を出す', () => {
  assert.deepEqual(typedKeys('ゃ'), ['b']);
  assert.deepEqual(typedKeys('ゅ'), ['x']);
  assert.deepEqual(typedKeys('ょ'), ['z']);
});

test('外来音の後置は、最初のキーの後に押して1字として打つ', () => {
  assert.deepEqual(keysOf('ふぁ'), ['-', 'b']);
  assert.deepEqual(keysOf('ふぃ'), ['=', 'z']);
  assert.deepEqual(keysOf('ヴぁ'), ['/', 'b']);
  assert.deepEqual(keysOf('てぃ'), ['f', 'z']);
});

test('定義の全セルが出典から作った面と一致し、標準的なかなを打てる', () => {
  assertKanaLayoutFixture(layout);
  assertKanaLayout(layout);
});
