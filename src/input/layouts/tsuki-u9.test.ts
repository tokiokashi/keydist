import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_TRACE_POLICY, generateTrace } from '#trace/generate.ts';
import { buildGeometry } from '../shapes/geometry.ts';
import { assertKanaLayout, assertKanaLayoutFixture } from '../../../test/kana-layout-helpers.ts';
import { LAYOUT_BY_ID } from './index.ts';

const layout = LAYOUT_BY_ID.get('tsuki-u9')!;

/**
 * 作者Uジローの「菱」用の定義ファイル `tsuki_U9.hh`（2013-01-11）の、層ごとの `キー=値` の行。
 * [0]は単打、[1]はシフト1、[2]はシフト2、[3]はシフト2の後に `v` を押す3打の面。
 * `S1` `S2` `S3` は層を切り替えるキー。文字コードはShift_JISで、0x5Cは `\\`、0x7Eは `~` として読める。
 */
const AUTHOR: Readonly<Record<'0' | '1' | '2' | '3', readonly string[]>> = {
  '0': [
    '{d12}=「',
    '{c12}=」',
    'q=ゅ',
    'w=と',
    'e=し',
    'r=こ',
    't=ょ',
    'y=つ',
    'u=ん',
    'i=い',
    'o=か',
    'p=り',
    '{d11}=ー',
    'a=は',
    's=S2',
    'd=S1',
    'f=て',
    'g=た',
    'h=く',
    'j=う',
    'k=S1',
    'l=S2',
    '{c10}=き',
    '{c11}=ち',
    'z=す',
    'x=を',
    'c=に',
    'v=な',
    'b=さ',
    'n=っ',
    'm=る',
    '{b08}=の',
    '{b09}=も',
    '{b10}=へ',
    '{b11}=・',
    '{b00}=・',
  ],
  '1': [
    '{Space}=、',
    '{Tab}=S0',
    'q=ぁ',
    'w=ゃ',
    'e=ね',
    'r=ら',
    't=め',
    'y=ぬ',
    'u=む',
    'i=み',
    'o=え',
    'p=ぇ',
    '{d11}=@',
    'a=ぃ',
    's=け',
    'd=、',
    'f=あ',
    'g=れ',
    'h=ま',
    'j=お',
    'k=ほ',
    'l=そ',
    '{c10}=ろ',
    '{c11}=:',
    'z=ぅ',
    'x=や',
    'c=せ',
    'v=よ',
    'b=ゆ',
    'n=ひ',
    'm=わ',
    '{b08}=ふ',
    '{b09}=ぃ',
    '{b10}=ぉ',
    '{b11}=\\',
    '{b00}=・',
    '1=!',
    '2="',
    '3=#',
    '4=$',
    '5=%',
    '6=&',
    "7='",
    '8=(',
    '9=)',
    '{e11}==',
    '{e12}=~',
    '{e13}=|',
  ],
  '2': [
    '{Space}=。',
    '{Tab}=S0',
    'q=!',
    'w=ど',
    'e=じ',
    'r=ご',
    't=~',
    'y=づ',
    'u=ぴ',
    'i=ぽ',
    'o=が',
    'p=?',
    'a=ば',
    's=げ',
    'd=。',
    'f=で',
    'g=だ',
    'h=ぐ',
    'j=ヴ',
    'k=ぼ',
    'l=ぞ',
    '{c10}=ぎ',
    '{c11}=ぢ',
    'z=ず',
    'x=ぱ',
    'c=ぜ',
    'v=S3',
    'b=ざ',
    'n=び',
    'm=ぷ',
    '{b08}=ぶ',
    '{b09}=ぺ',
    '{b10}=べ',
    '{b11}=_',
    '{b00}=・',
    '1=!',
    '2="',
    '3=#',
    '4=$',
    '5=%',
    '6=&',
    "7='",
    '8=(',
    '9=)',
    '{e11}==',
    '{e12}=~',
    '{e13}=|',
  ],
  '3': ['q=ぁ', 'w=ぃ', 'e=ぅ', 'r=ぇ', 't=ぉ', 'a=ふぁ', 's=ふぃ', 'd=ふぉ', 'f=ふぇ', 'z=でぃ', 'x=てぃ', 'c=ちぇ'],
};

/** 定義ファイルのキー名を、ANSIのキーに写す。JIS専用のキーは `jis-` を付けた名前で残す。 */
const KEY_NAMES: Readonly<Record<string, string>> = {
  '{d11}': '[',
  '{d12}': ']',
  '{c10}': ';',
  '{c11}': "'",
  '{c12}': 'jis-]',
  '{b08}': ',',
  '{b09}': '.',
  '{b10}': '/',
  '{b11}': 'jis-ro',
  '{b00}': 'iso-extra',
  '{Space}': 'Space',
  '{Tab}': 'Tab',
  '{e11}': 'jis--',
  '{e12}': 'jis-^',
  '{e13}': 'jis-yen',
};

function parse(lines: readonly string[]): Array<readonly [string, string]> {
  return lines.map((line) => {
    const equal = line.indexOf('=', 1);
    const name = line.slice(0, equal);
    return [KEY_NAMES[name] ?? name, line.slice(equal + 1)] as const;
  });
}

const SHIFTS: Readonly<Record<'1' | '2', readonly string[]>> = { '1': ['d', 'k'], '2': ['s', 'l'] };
const LEFT_KEYS = new Set([...'12345qwertasdfgzxcvb']);
const handOf = (key: string): 'left' | 'right' => (LEFT_KEYS.has(key) ? 'left' : 'right');

/** keydistが文字として持つ出力。かな・長音・、。・「・! ?。ほかの記号は表さない。 */
const KEPT_OUTPUT = /^[ぁ-ゖァ-ヺー、。「!?]$/;
/** ANSIの物理配列にあるキー（数字段の記号は表さないので、英字と記号のキーだけ）。 */
const ANSI_KEY = /^[a-z;,./[\]']$/;

interface Route {
  readonly output: string;
  readonly keys: string;
  /** 面で書けない入力。 */
  readonly excluded?: 'self' | 'space';
}

/** 作者の定義にある、かな・句読点を出す全ての経路。 */
function authorRoutes(): Route[] {
  const routes: Route[] = [];
  for (const [key, output] of parse(AUTHOR['0'])) {
    if (KEPT_OUTPUT.test(output) && ANSI_KEY.test(key)) routes.push({ output, keys: key });
  }
  for (const layer of ['1', '2'] as const) {
    for (const shift of SHIFTS[layer]) {
      for (const [key, output] of parse(AUTHOR[layer])) {
        if (!KEPT_OUTPUT.test(output)) continue;
        if (key === 'Space') routes.push({ output, keys: `${shift}Space`, excluded: 'space' });
        else if (!ANSI_KEY.test(key)) continue;
        else if (key === shift) routes.push({ output, keys: `${shift}${key}`, excluded: 'self' });
        else routes.push({ output, keys: `${shift}${key}` });
      }
    }
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
 * mentaiko氏のかな配列テスターの定義（「月配列（Ｕ９版）　Uジロー氏作」）のうち、かな・長音・句読点・括弧の項目。
 * 打鍵はJISの刻印で書かれていて、`@` はANSIの `[`、`:` は `'` に当たる。
 * `.` のキーだけは `0` と書かれ、JISの `ろ` のキーは `_` と書かれている。
 */
const TESTER: ReadonlyArray<readonly [string, string]> = [
  ['ゅ', 'q'],
  ['と', 'w'],
  ['し', 'e'],
  ['こ', 'r'],
  ['ょ', 't'],
  ['つ', 'y'],
  ['ん', 'u'],
  ['い', 'i'],
  ['か', 'o'],
  ['り', 'p'],
  ['ー', '@'],
  ['は', 'a'],
  ['。', 's'],
  ['、', 'd'],
  ['て', 'f'],
  ['た', 'g'],
  ['く', 'h'],
  ['う', 'j'],
  ['、', 'k'],
  ['。', 'l'],
  ['き', ';'],
  ['ち', ':'],
  ['す', 'z'],
  ['を', 'x'],
  ['に', 'c'],
  ['な', 'v'],
  ['さ', 'b'],
  ['っ', 'n'],
  ['る', 'm'],
  ['の', ','],
  ['も', '0'],
  ['へ', '/'],
  ['・', '_'],
  ['ぁ', 'kq'],
  ['ゃ', 'kw'],
  ['ね', 'ke'],
  ['ら', 'kr'],
  ['め', 'kt'],
  ['ぬ', 'dy'],
  ['む', 'du'],
  ['み', 'di'],
  ['え', 'do'],
  ['ぇ', 'dp'],
  ['ぃ', 'ka'],
  ['け', 'ks'],
  ['、', 'kd'],
  ['あ', 'kf'],
  ['れ', 'kg'],
  ['ま', 'dh'],
  ['お', 'dj'],
  ['ほ', 'dk'],
  ['そ', 'dl'],
  ['ろ', 'd;'],
  ['ぅ', 'kz'],
  ['や', 'kx'],
  ['せ', 'kc'],
  ['よ', 'kv'],
  ['ゆ', 'kb'],
  ['ひ', 'dn'],
  ['わ', 'dm'],
  ['ふ', 'd,'],
  ['ぃ', 'd0'],
  ['ぉ', 'd/'],
  ['！', 'lq'],
  ['ど', 'lw'],
  ['じ', 'le'],
  ['ご', 'lr'],
  ['づ', 'sy'],
  ['ぴ', 'su'],
  ['ぽ', 'si'],
  ['が', 'so'],
  ['？', 'sp'],
  ['ば', 'la'],
  ['げ', 'ls'],
  ['。', 'ld'],
  ['で', 'lf'],
  ['だ', 'lg'],
  ['ぐ', 'sh'],
  ['ヴ', 'sj'],
  ['ぼ', 'sk'],
  ['ぞ', 'sl'],
  ['ぎ', 's;'],
  ['ぢ', 's:'],
  ['ず', 'lz'],
  ['ぱ', 'lx'],
  ['ぜ', 'lc'],
  ['び', 'lb'],
  ['や', 'sn'],
  ['ぷ', 'sm'],
  ['ぶ', 's,'],
  ['ぺ', 's0'],
  ['べ', 's/'],
  ['ぁ', 'lvq'],
  ['ぃ', 'lvw'],
  ['ぅ', 'lve'],
  ['ぇ', 'lvr'],
  ['ぉ', 'lvt'],
  ['ふぁ', 'lva'],
  ['ふぃ', 'lvs'],
  ['ふぇ', 'lvd'],
  ['ふぉ', 'lvf'],
  ['でぃ', 'lvz'],
  ['てぃ', 'lvx'],
  ['ちぇ', 'lvc'],
];

/** テスターの打鍵を、ANSIのキーの列に直す。 */
const testerKeys = (keys: string): string => keys.replace(/@/g, '[').replace(/:/g, "'").replace(/0/g, '.').replace(/_/g, 'jis-ro');

/** テスターは ! ? を全角で持ち、作者の定義は半角で持つ。 */
const HALF_WIDTH: ReadonlyMap<string, string> = new Map([
  ['！', '!'],
  ['？', '?'],
]);

const routes = authorRoutes();
const usable = routes.filter((route) => route.excluded === undefined);

test('定義ファイルから読んだ経路は、単打と、4つのシフトキーに続く面になる', () => {
  assert.equal(parse(AUTHOR['0']).filter(([, output]) => KEPT_OUTPUT.test(output)).length, 29);
  assert.equal(routes.filter((route) => route.excluded === 'self').length, 4);
  assert.equal(routes.filter((route) => route.excluded === 'space').length, 4);
});

test('面で書ける経路は、その打鍵で打てる', () => {
  for (const route of usable) {
    assert.ok(typedKeys(route.output).includes(route.keys), `${route.output} を ${route.keys} で打てない`);
  }
});

test('面から作った打鍵は、面で書ける経路と過不足なく一致する', () => {
  const fromFaces = new Set<string>();
  for (const [kana, alternatives] of layout.canonicalInputs) {
    alternatives.forEach((alternative, index) => {
      if (alternative.origin === 'face') fromFaces.add(`${kana}=${typedKeys(kana)[index]}`);
    });
  }
  const expected = new Set(usable.map((route) => `${route.output}=${route.keys}`));
  assert.deepEqual([...fromFaces].sort(), [...expected].sort());
});

test('シフトのキー自身を対象にする入力と、シフトとSpaceの入力は表さない', () => {
  for (const route of routes.filter((entry) => entry.excluded !== undefined)) {
    assert.ok(!typedKeys(route.output).includes(route.keys), `${route.output} を ${route.keys} で打てる`);
  }
  assert.deepEqual(typedKeys('、'), ['kd']);
  assert.deepEqual(typedKeys('。'), ['ld', 'sd']);
  assert.deepEqual(typedKeys('ほ'), ['dk']);
  assert.deepEqual(typedKeys('げ'), ['ls']);
  assert.deepEqual(typedKeys('ぞ'), ['sl']);
});

test('作者の定義にある全てのかなと句読点を、反対の手のシフトで打てる', () => {
  for (const output of new Set(routes.map((route) => route.output))) {
    const crossRoutes = typedKeys(output).filter((keys) => keys.length === 1 || handOf(keys[0]!) !== handOf(keys[1]!));
    assert.ok(crossRoutes.length > 0, `${output} を反対の手のシフトか単打で打てない`);
  }
});

test('反対の手のシフトで打てるかなは、それが既定の打ち方', () => {
  for (const [kana, sequence] of layout.map) {
    const keys = sequence.map((step) => step.join('')).join('');
    if (keys.length === 2) assert.notEqual(handOf(keys[0]!), handOf(keys[1]!), `${kana} の既定が同じ手のシフト`);
  }
  assert.deepEqual(typedKeys('ぃ'), ['ka', 'd.', 'da', 'k.']);
});

test('d k s lは単打ではかなを出さない', () => {
  const singles = [...layout.map].filter(([, sequence]) => sequence.length === 1 && sequence[0].length === 1).map(([, sequence]) => sequence[0][0]);
  for (const shift of ['d', 'k', 's', 'l']) assert.ok(!singles.includes(shift), shift);
});

test('シフト2の後にvを押す3打の面は表さず、7字は分けて打つ', () => {
  const threeStrokes = parse(AUTHOR['3']).filter(([, output]) => output.length === 2 || output === 'ちぇ');
  assert.deepEqual(
    threeStrokes.map(([, output]) => output),
    ['ふぁ', 'ふぃ', 'ふぉ', 'ふぇ', 'でぃ', 'てぃ', 'ちぇ'],
  );
  for (const [, output] of threeStrokes) assert.equal(layout.map.has(output), false, output);
  assert.deepEqual(keysOf('ふぁ'), ['d', ',', 'k', 'q']);
  assert.deepEqual(keysOf('でぃ'), ['l', 'f', 'k', 'a']);
  assert.deepEqual(keysOf('ちぇ'), ["'", 'd', 'p']);
});

test('テスターの定義と、JIS専用キー・3打の面・l b・s n・単打面のd k s l以外の項目で一致する', () => {
  for (const [kana, rawKeys] of TESTER) {
    const keys = testerKeys(rawKeys);
    if (keys.length === 3 && keys.startsWith('lv')) continue;
    if (keys.includes('jis-')) continue;
    if (keys === 'lb' || keys === 'sn') continue;
    if (['d', 'k', 's', 'l'].includes(keys)) continue;
    assert.ok(typedKeys(HALF_WIDTH.get(kana) ?? kana).includes(keys), `${kana} をテスターの ${keys} で打てない`);
  }
});

test('テスターはl bを び、s nを や、3打の面の ふぉ と ふぇ を逆、単打面のd k s lを句読点にしていて、作者の定義と違う', () => {
  const tester = new Map(TESTER.map(([kana, keys]) => [testerKeys(keys), kana] as const));
  assert.equal(tester.get('lb'), 'び');
  assert.deepEqual(typedKeys('ざ'), ['lb', 'sb']);
  assert.ok(!typedKeys('び').includes('lb'));
  assert.equal(tester.get('sn'), 'や');
  assert.ok(!typedKeys('や').includes('sn'));
  assert.ok(typedKeys('び').includes('sn'));
  const author3 = new Map(parse(AUTHOR['3']));
  assert.equal(author3.get('d'), 'ふぉ');
  assert.equal(author3.get('f'), 'ふぇ');
  assert.equal(tester.get('lvd'), 'ふぇ');
  assert.equal(tester.get('lvf'), 'ふぉ');
  const author0 = new Map(parse(AUTHOR['0']));
  for (const shift of ['d', 'k', 's', 'l']) {
    assert.ok(tester.has(shift), `テスターは ${shift} の単打に句読点を持つ`);
    assert.equal(author0.get(shift), shift === 'd' || shift === 'k' ? 'S1' : 'S2');
    assert.ok(!typedKeys(tester.get(shift)!).includes(shift));
  }
});

test('定義の全セルが出典から作った面と一致し、標準的なかなを打てる', () => {
  assertKanaLayoutFixture(layout);
  assertKanaLayout(layout, ['ゎ']);
});
