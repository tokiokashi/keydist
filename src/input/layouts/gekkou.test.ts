import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_TRACE_POLICY, generateTrace } from '#trace/generate.ts';
import { buildGeometry } from '../shapes/geometry.ts';
import { assertKanaLayout, assertKanaLayoutFixture } from '../../../test/kana-layout-helpers.ts';
import { LAYOUT_BY_ID } from './index.ts';

const layout = LAYOUT_BY_ID.get('gekkou')!;

/**
 * 作者tkenの記事（2021-06-01）が掲載するMS-IMEのローマ字テーブル `gc_20210517` のREG_BINARY値。
 * Shift_JISの `ローマ字=かな` をNULで区切った項目が並ぶ。
 */
const REGISTRY_HEX = [
  '2C3D8141002E3D8142003A3D815B003B3D814B00403D82C100613D82B500623D82B300633D82C900642C3D82D000642E',
  '3D82CA00642F3D82A700643A3D82E400643B3D82A60064613D82A10064623D82E20064633D82D60064653D82B9006466',
  '3D82E30064673D82E10064683D82A80064693D82E600646A3D82D300646C3D82F000646D3D82EB00646E3D82ED00646F',
  '3D82BF0064703D82A50064713D829F0064723D82D90064733D82AF0064743D82DF0064753D82DD0064763D82BB006477',
  '3D82EA0064783D82CB0064793D82DE00647A3D82A300653D82CD00663D82B100673D82BD00683D82AD00693D82A2006A',
  '3D82A4006B2C3D82D0006B2E3D82CA006B2F3D82A7006B3A3D82E4006B3B3D82A6006B613D82A1006B623D82E2006B63',
  '3D82D6006B653D82B9006B663D82E7006B673D82A0006B683D82A8006B693D82E6006B6A3D82D3006B6C3D82F0006B6D',
  '3D82EB006B6E3D82ED006B6F3D82BF006B703D82A5006B713D829F006B723D82D9006B733D82AF006B743D82DF006B75',
  '3D82DD006B763D82BB006B773D82EA006B783D82CB006B793D82DE006B7A3D82A3006C3D814A006D3D82E9006E3D82DC',
  '006F3D82CC00703D82E800713D82E000723D82C400733D82A900743D82E500753D82F100763D82C800773D82C600783D',
  '82AB00793D82C2007A3D82B70000',
].join('');

/**
 * mentaiko氏のかな配列テスターの定義（「中指シフト月光2021/4/24版」、清濁同置）。
 * かな1文字につき打鍵が1つだけ載る。かな以外の項目（空・改・退・ｋ・ｄ）は除いてある。
 * JISの `@` `:` はそのまま載っている。
 */
const TESTER: ReadonlyArray<readonly [string, string]> = [
  ['あ', 'kg'],
  ['い', 'i'],
  ['う', 'j'],
  ['え', 'd;'],
  ['お', 'dh'],
  ['か', 's'],
  ['き', 'x'],
  ['く', 'h'],
  ['け', 'ks'],
  ['こ', 'f'],
  ['さ', 'b'],
  ['し', 'a'],
  ['す', 'z'],
  ['せ', 'ke'],
  ['そ', 'kv'],
  ['た', 'g'],
  ['ち', 'dl'],
  ['つ', 'y'],
  ['て', 'r'],
  ['と', 'w'],
  ['な', 'v'],
  ['に', 'c'],
  ['ぬ', 'd.'],
  ['ね', 'kx'],
  ['の', 'o'],
  ['は', 'e'],
  ['ひ', 'd,'],
  ['ふ', 'dj'],
  ['へ', 'kc'],
  ['ほ', 'kr'],
  ['ま', 'n'],
  ['み', 'du'],
  ['む', 'dy'],
  ['め', 'kt'],
  ['も', 'q'],
  ['や', 'kb'],
  ['ゆ', 'd:'],
  ['よ', 'di'],
  ['ら', 'kf'],
  ['り', 'p'],
  ['る', 'm'],
  ['れ', 'kw'],
  ['ろ', 'dm'],
  ['わ', 'dn'],
  ['を', 'do'],
  ['ん', 'u'],
  ['ー', ':'],
  ['ヴ', 'jl'],
  ['ぁ', 'kq'],
  ['ぃ', 'ka'],
  ['ぅ', 'kz'],
  ['ぇ', 'dp'],
  ['ぉ', 'd/'],
  ['ゃ', 'dg'],
  ['ゅ', 'df'],
  ['ょ', 't'],
  ['っ', '@'],
  ['゛', 'l'],
  ['゜', ';'],
  ['が', 'sl'],
  ['ぎ', 'xl'],
  ['ぐ', 'hl'],
  ['げ', 'ksl'],
  ['ご', 'fl'],
  ['ざ', 'bl'],
  ['じ', 'al'],
  ['ず', 'zl'],
  ['ぜ', 'kel'],
  ['ぞ', 'kvl'],
  ['だ', 'gl'],
  ['ぢ', 'dll'],
  ['づ', 'yl'],
  ['で', 'rl'],
  ['ど', 'wl'],
  ['ば', 'el'],
  ['び', 'd,l'],
  ['ぶ', 'djl'],
  ['べ', 'kcl'],
  ['ぼ', 'krl'],
  ['ぱ', 'e;'],
  ['ぴ', 'd,;'],
  ['ぷ', 'dj;'],
  ['ぺ', 'kc;'],
  ['ぽ', 'kr;'],
  ['、', ','],
  ['。', '.'],
];

/** テスターの定義と、レジストリの定義が違うかな。ち と を の位置が入れ替わっている。 */
const TESTER_DIFFERENCES: ReadonlyMap<string, { tester: string; registry: string }> = new Map([
  ['ち', { tester: 'dl', registry: 'do' }],
  ['を', { tester: 'do', registry: 'dl' }],
  ['ぢ', { tester: 'dll', registry: 'dol' }],
]);

/** JISの `@` `:` を、ANSIの同じ位置のキーに写す。 */
const toAnsi = (keys: string): string => keys.replace(/@/g, '[').replace(/:/g, "'");

function decodeRegistry(): Array<readonly [string, string]> {
  const bytes = Uint8Array.from(REGISTRY_HEX.match(/../g)!, (pair) => Number.parseInt(pair, 16));
  const decoder = new TextDecoder('shift_jis');
  const entries: Array<readonly [string, string]> = [];
  let start = 0;
  for (let i = 0; i < bytes.length; i += 1) {
    if (bytes[i] !== 0) continue;
    if (i > start) {
      const item = bytes.subarray(start, i);
      const equal = item.indexOf(0x3d);
      entries.push([decoder.decode(item.subarray(0, equal)), decoder.decode(item.subarray(equal + 1))]);
    }
    start = i + 1;
  }
  return entries;
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

const registry = decodeRegistry();
/** かな1文字を出す項目（ASCIIの全角の項目は数えない）。 */
const registryKana = registry.filter(([, output]) => /^[ぁ-ゖー、。゛゜]$/.test(output));

test('レジストリの値を復号すると、かな1文字を出す87項目になる', () => {
  assert.equal(registryKana.length, 87);
  assert.equal(registryKana.length, registry.length);
});

test('レジストリの全項目が、その打鍵で打てる', () => {
  for (const [romaji, kana] of registryKana) {
    assert.ok(typedKeys(kana).includes(toAnsi(romaji)), `${kana} を ${toAnsi(romaji)} で打てない`);
  }
});

test('面から作った打鍵は、レジストリの項目と過不足なく一致する', () => {
  const fromFaces = new Set<string>();
  for (const [kana, alternatives] of layout.canonicalInputs) {
    alternatives.forEach((alternative, index) => {
      if (alternative.origin === 'face') fromFaces.add(`${kana}=${typedKeys(kana)[index]}`);
    });
  }
  const expected = new Set(registryKana.map(([romaji, kana]) => `${kana}=${toAnsi(romaji)}`));
  assert.deepEqual([...fromFaces].sort(), [...expected].sort());
});

test('dとkはシフトのキーとしてだけ使い、単打ではかなを出さない', () => {
  assert.deepEqual(typedKeys('ひ').sort(), ['d,', 'k,']);
  const singles = [...layout.map].filter(([, sequence]) => sequence.length === 1 && sequence[0].length === 1).map(([, sequence]) => sequence[0][0]);
  assert.ok(!singles.includes('d'));
  assert.ok(!singles.includes('k'));
});

test('テスターの定義と、ち・を・ぢ 以外の全ての項目で一致する', () => {
  for (const [kana, keys] of TESTER) {
    const difference = TESTER_DIFFERENCES.get(kana);
    const ansi = toAnsi(keys);
    if (difference !== undefined) {
      assert.equal(ansi, toAnsi(difference.tester));
      assert.ok(!typedKeys(kana).includes(ansi), `${kana} はテスターと違う位置のはず`);
      assert.ok(typedKeys(kana).includes(difference.registry), `${kana} をレジストリの ${difference.registry} で打てない`);
      continue;
    }
    assert.ok(typedKeys(kana).includes(ansi), `${kana} をテスターの ${ansi} で打てない`);
  }
});

test('う の濁音は片仮名のヴで、ゔ は打てない', () => {
  assert.deepEqual(typedKeys('ヴ'), ['jl']);
  assert.equal(layout.map.has('ゔ'), false);
});

test('同じ手のシフトでしか打てないのは ゅ と ゃ だけで、ほかは反対の手のシフトが既定', () => {
  const preferred = new Map<string, string>();
  for (const [kana, sequence] of layout.map) preferred.set(kana, sequence.map((step) => step.join('')).join(''));
  for (const [kana, keys] of TESTER) {
    if (TESTER_DIFFERENCES.has(kana)) continue;
    assert.equal(preferred.get(kana), toAnsi(keys), kana);
  }
  assert.deepEqual(typedKeys('ゅ'), ['df']);
  assert.deepEqual(typedKeys('ゃ'), ['dg']);
});

test('清音に続けて ゛ ゜ を打つ', () => {
  const geometry = buildGeometry('row-staggered');
  const keysOf = (text: string) =>
    generateTrace(text, layout, geometry, DEFAULT_TRACE_POLICY).strokes.map((stroke) =>
      stroke.presses.flatMap((press) => press.keys.map((key) => key.id)).join(''),
    );
  assert.deepEqual(keysOf('が'), ['s', 'l']);
  assert.deepEqual(keysOf('ぱ'), ['e', ';']);
  assert.deepEqual(keysOf('ヴ'), ['j', 'l']);
});

test('定義の全セルが出典から作った面と一致し、標準的なかなを打てる', () => {
  assertKanaLayoutFixture(layout);
  assertKanaLayout(layout, ['ゎ']);
});
