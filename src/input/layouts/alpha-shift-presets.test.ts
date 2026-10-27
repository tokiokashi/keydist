import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { keyId, resolveKeyId } from '../shapes/geometry.ts';
import { LAYOUTS, LAYOUTS_JA } from './index.ts';
import { fromRows, withShiftedOutputs, type Layout } from './types.ts';

/** 作者が記号のShiftの組を定めている英字配列。 */
const IDS = ['graphite', 'halmak', 'mtgap'] as const;

const layoutOf = (id: string): Layout => {
  const layout = LAYOUTS.find((entry) => entry.id === id);
  assert.ok(layout, `${id}が組み込みの英字配列に無い`);
  return layout;
};

/** 配列の刻印から、段・列のキーが単打で出す文字を引く。 */
const baseAt = (layout: Layout, row: number, col: number): string | undefined => layout.legends.get(keyId(row, col));

/** 段・列のキーに、Shiftを重ねて出る文字を集める（左右どちらのShiftでも同じ文字になる）。 */
function shiftedAt(layout: Layout, row: number, col: number): string[] {
  const key = resolveKeyId(keyId(row, col));
  const outputs: string[] = [];
  for (const [output, alternatives] of layout.canonicalInputs) {
    for (const alternative of alternatives) {
      const realization = alternative.baseRealizations[0];
      if (alternative.semanticInputs[0].aggregationGroupId !== 'layer:Shift') continue;
      if (realization.defaultOutputKeys[0] === key) outputs.push(output);
    }
  }
  return [...new Set(outputs)];
}

/** 作者の表（無Shiftの文字とShiftの文字の対）を、配列の段・列と突き合わせる。 */
function assertShiftTable(id: string, rows: ReadonlyArray<{ row: number; col: number; base: string; shifted: string }>): void {
  const layout = layoutOf(id);
  for (const { row, col, base, shifted } of rows) {
    assert.equal(baseAt(layout, row, col), base, `${id}: ${row}段${col}列の無Shift`);
    assert.deepEqual(shiftedAt(layout, row, col), [shifted], `${id}: ${row}段${col}列(${base})のShift`);
  }
}

/** 空白区切りの2つの行（無Shift・Shift）を、先頭の列を指定して対にする。 */
function pairRows(row: number, firstCol: number, base: string, shifted: string) {
  const bases = base.trim().split(/\s+/);
  const shifteds = shifted.trim().split(/\s+/);
  assert.equal(bases.length, shifteds.length);
  return bases.map((b, index) => ({ row, col: firstCol + index, base: b, shifted: shifteds[index] }));
}

// Graphiteの作者のREADMEのAscii Version（コミット5990356）。`` ` `` と `\` はモデル化していないキーなので、その2つの列は除く
test('graphite: Shiftの組が作者のREADMEのAscii Versionと一致する', () => {
  assertShiftTable('graphite', [
    ...pairRows(0, 0, '1 2 3 4 5 6 7 8 9 0 [ ]', '! @ # $ % ^ & * ( ) { }'),
    ...pairRows(1, 0, "b l d w z ' f o u j ; =", 'B L D W Z _ F O U J : +'),
    ...pairRows(2, 0, 'n r t s g y h a e i ,', 'N R T S G Y H A E I ?'),
    ...pairRows(3, 0, 'q x m c v k p . - /', 'Q X M C V K P > " <'),
  ]);
});

// Halmakの作者のXKB定義のHalmakの面（コミットf623ad3）。keysym名を文字に直して、キー位置ごとに突き合わせる
const KEYSYM: Readonly<Record<string, string>> = {
  exclam: '!',
  at: '@',
  numbersign: '#',
  dollar: '$',
  percent: '%',
  asciicircum: '^',
  ampersand: '&',
  asterisk: '*',
  parenleft: '(',
  parenright: ')',
  less: '<',
  greater: '>',
  minus: '-',
  underscore: '_',
  equal: '=',
  plus: '+',
  bracketleft: '[',
  braceleft: '{',
  bracketright: ']',
  braceright: '}',
  semicolon: ';',
  colon: ':',
  comma: ',',
  period: '.',
  slash: '/',
  question: '?',
  apostrophe: "'",
  quotedbl: '"',
};
const keysymChar = (name: string): string => KEYSYM[name] ?? name;

const XKB_ROW: Readonly<Record<string, number>> = { AE: 0, AD: 1, AC: 2, AB: 3 };

test('halmak: 並びとShiftの組が作者のXKB定義のHalmakの面と一致する', () => {
  const xkb = readFileSync(new URL('../../../test/fixtures/sources/halmak.xkb', import.meta.url), 'utf8');
  const entries = [...xkb.matchAll(/key <(A[EDCB])(\d\d)>\s*\{\[([^\]]*)\]\}/g)];
  // 数字段12 + 上段12 + ホーム段11 + 下段10
  assert.equal(entries.length, 45);
  const rows = entries.map(([, kind, number, symbols]) => {
    const levels = symbols.split(',').map((symbol) => symbol.trim());
    const base = keysymChar(levels[2]);
    const shifted = keysymChar(levels[3]);
    return { row: XKB_ROW[kind], col: Number(number) - 1, base, shifted };
  });
  assertShiftTable('halmak', rows);
  assert.equal(rows.filter((row) => /^[a-z]$/.test(row.base)).length, 26);
});

// MTGAPの作者のソフトウェアが持つ配列表（`MTGandP/Typing` の `doc/layoutStore.txt`、コミットb4431cb）の `MTGAP 3.14` の行。
// 先頭30字が3段×10列の無Shift、続く30字が同じ並びのShift
const MTGAP_STORE = 'ypoujkdlcwinea,mhtsrqz/.:bfgvxYPOUJKDLCWINEA;MHTSRQZ<>?BFGVX';

test('mtgap: 30キーと作者のShiftの組が作者の配列表と一致する', () => {
  const rows = [...MTGAP_STORE.slice(0, 30)].map((base, index) => ({
    row: 1 + Math.floor(index / 10),
    col: index % 10,
    base,
    shifted: MTGAP_STORE[30 + index],
  }));
  assertShiftTable('mtgap', rows);
});

// Paalon「キーボード配列まとめ」の転記（2024-01-12更新）のMTGAP。作者の配列表と同じShiftの組を持つ
test('mtgap: Paalonの転記と一致する', () => {
  const base = ['y p o u j  k d l c w', 'i n e a ,  m h t s r', 'q z / . :  b f g v x'];
  const shifted = ['Y P O U J  K D L C W', 'I N E A ;  M H T S R', 'Q Z < > ?  B F G V X'];
  assertShiftTable(
    'mtgap',
    base.flatMap((line, index) => pairRows(1 + index, 0, line, shifted[index])),
  );
});

// genkeyの `layouts/mtgap30`（コミットf1f4173）。`:` を `;` に置き換えて、USのShiftの組で近似している
test('mtgap: genkeyの定義と、`:` の1キーを除いて一致する', () => {
  const genkey = ['y p o u j k d l c w', 'i n e a , m h t s r', 'q z / . ; b f g v x'];
  const layout = layoutOf('mtgap');
  const differing: string[] = [];
  genkey.forEach((line, index) => {
    line.split(' ').forEach((base, col) => {
      const ours = baseAt(layout, 1 + index, col);
      if (ours !== base) differing.push(`${ours}/${base}`);
    });
  });
  assert.deepEqual(differing, [':/;']);
});

// genkeyの `layouts/halmak`（コミットf1f4173）。30キーが作者のXKB定義と一致する
test('halmak: 30キーがgenkeyの定義と一致する', () => {
  const genkey = ['w l r b z ; q u d j', 's h n t , . a e o i', 'f m v c / g p x k y'];
  const layout = layoutOf('halmak');
  genkey.forEach((line, index) => {
    line.split(' ').forEach((base, col) => {
      assert.equal(baseAt(layout, 1 + index, col), base, `${1 + index}段${col}列`);
    });
  });
});

// cyanophageの比較表（コミットb02780b）の30キー。作者の定義の外側と `:` の扱いが違うので、英字26文字の位置だけを比べる
test('graphite・mtgap・halmak: 英字の位置がcyanophageの比較表と一致する', () => {
  const cyanophage: Record<string, string[]> = {
    graphite: ["bldwz'fouj;", 'nrtsgyhaei,', 'qxmcvkp.-/'],
    mtgap: ['ypoujkdlcw-', "inea,mhtsr'", 'qz/.;bfgvx'],
  };
  for (const [id, rows] of Object.entries(cyanophage)) {
    const layout = layoutOf(id);
    rows.forEach((line, index) => {
      [...line].forEach((expected, col) => {
        if (!/^[a-z]$/.test(expected)) return;
        assert.equal(baseAt(layout, 1 + index, col), expected, `${id}: ${1 + index}段${col}列`);
      });
    });
  }
});

test('作者のShiftの組を持つ3配列は、英字26文字を大文字までShift経由で打てる', () => {
  for (const id of IDS) {
    const layout = layoutOf(id);
    for (const letter of 'abcdefghijklmnopqrstuvwxyz') {
      assert.ok(layout.canonicalInputs.has(letter), `${id}: ${letter}`);
      assert.ok(layout.canonicalInputs.has(letter.toUpperCase()), `${id}: ${letter.toUpperCase()}`);
    }
  }
});

// 作者の組がUS配列の組を置き換えた結果、どのキーでも打てなくなった文字が無い。`~` `` ` `` `|` `\` はモデル化していないキーなので全配列で打てない
test('作者のShiftの組を持つ3配列は、USの記号を置き換えても打てなくなる文字が無い', () => {
  const printable = [...'!"#$%&\'()*+,-./0123456789:;<=>?@[]^_{}'];
  for (const id of IDS) {
    const layout = layoutOf(id);
    const missing = printable.filter((char) => !layout.canonicalInputs.has(char));
    assert.deepEqual(missing, [], id);
  }
});

test('作者のShiftの組を持つ配列だけが、USの組と違う記号を出す', () => {
  // US配列の組のままの配列と、作者の組を持つ配列で、`,` のShiftが違う
  assert.deepEqual(shiftedAt(layoutOf('qwerty'), 3, 7), ['<']);
  assert.deepEqual(shiftedAt(layoutOf('halmak'), 2, 4), ['(']);
  assert.deepEqual(shiftedAt(layoutOf('graphite'), 2, 10), ['?']);
  assert.deepEqual(shiftedAt(layoutOf('mtgap'), 2, 4), [';']);
});

test('Shiftの組を渡さない既存の配列の出力は、USの組のまま', () => {
  const qwerty = layoutOf('qwerty');
  const expected: Record<string, string> = {
    '1': '!',
    '9': '(',
    '0': ')',
    '-': '_',
    '=': '+',
    ';': ':',
    "'": '"',
    ',': '<',
    '.': '>',
    '/': '?',
  };
  const rows = ['1234567890-=', 'qwertyuiop[]', "asdfghjkl;'", 'zxcvbnm,./'];
  rows.forEach((line, row) => {
    [...line].forEach((base, col) => {
      const want = expected[base] ?? (/^[a-z]$/.test(base) ? base.toUpperCase() : undefined);
      if (want === undefined) return;
      assert.deepEqual(shiftedAt(qwerty, row, col), [want], `qwerty: ${base}`);
    });
  });
});

test('Shiftの組が2つのキーで同じ文字になる指定は弾く', () => {
  const layout = fromRows('dup', 'dup', ['1234567890-=', 'qwertyuiop[]', "asdfghjkl;'", 'zxcvbnm,./']);
  assert.throws(() => withShiftedOutputs(layout, undefined, { ',': '?' }), /重複/);
  assert.throws(() => withShiftedOutputs(layout, undefined, { ',': '<<' }), /1文字/);
});

test('3配列は日本語のテキスト用の一覧にも入り、Shiftの組が同じ', () => {
  for (const id of IDS) {
    const ja = LAYOUTS_JA.find((entry) => entry.id === id);
    assert.ok(ja, id);
    assert.deepEqual([...ja.canonicalInputs.keys()].sort(), [...layoutOf(id).canonicalInputs.keys()].sort());
  }
});
