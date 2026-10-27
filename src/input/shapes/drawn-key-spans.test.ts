import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildGeometry,
  JIS_FINGER_ASSIGNMENT,
  LEFT_COLUMN_KEYS,
  PHYSICAL_SHAPES,
  presetGeometryStandard,
  THUMB_ROW,
  type Key,
  type PresetGeometryKind,
} from './geometry.ts';
import { drawnKeySpans } from './drawn-key-spans.ts';

const near = (a: number, b: number, msg: string) => assert.ok(Math.abs(a - b) < 1e-9, `${msg}: expected ${b}, got ${a}`);

const kinds = Object.keys(PHYSICAL_SHAPES) as PresetGeometryKind[];

test('組み込みの物理配列は8種ある', () => {
  assert.equal(kinds.length, 8);
});

for (const kind of kinds) {
  test(`${kind}: 段の端のShiftを隣の文字キーの外側に1uで描き、文字キーと親指は実寸の位置のまま`, () => {
    const geometry = buildGeometry(kind, presetGeometryStandard(kind) === 'jis' ? JIS_FINGER_ASSIGNMENT : undefined);
    const keys = [...geometry.keys.values()];
    const spans = drawnKeySpans(keys);

    for (const key of keys) {
      const span = spans.get(key.id)!;
      if (key.id === 'shift-l' || key.id === 'shift-r' || LEFT_COLUMN_KEYS.includes(key.id as (typeof LEFT_COLUMN_KEYS)[number])) continue;
      const width = key.width ?? (key.row === THUMB_ROW ? 1.9 : 1);
      near(span.width, width, `${key.id}の幅`);
      near(span.left, key.x + 0.5 - width / 2, `${key.id}の左端`);
    }

    const bottom = geometry.grid[3]!;
    const shiftL = spans.get('shift-l')!;
    const shiftR = spans.get('shift-r')!;
    const z = spans.get(bottom[0]!.id)!;
    const slash = spans.get(bottom.at(-1)!.id)!;
    near(shiftL.width, 1, 'shift-lの幅');
    near(shiftR.width, 1, 'shift-rの幅');
    near(shiftL.left + shiftL.width, z.left, 'shift-l は最初の文字キーの左隣');
    near(shiftR.left, slash.left + slash.width, 'shift-rは最後の文字キーの右隣');

    // 左端の列のキーも1uで、段の最初の文字キーの左隣に詰める
    for (const [id, row] of [
      ['backquote', 0],
      ['tab', 1],
      ['caps-lock', 2],
    ] as const) {
      const span = spans.get(id)!;
      near(span.width, 1, `${id}の幅`);
      near(span.left + span.width, spans.get(geometry.grid[row]![0]!.id)!.left, `${id}は段の最初の文字キーの左隣`);
    }

    // 計算上の座標と実寸は変えない
    near(geometry.keys.get('shift-l')!.width!, 2.25, 'shift-lの実寸');
    near(geometry.keys.get('shift-r')!.width!, 2.75, 'shift-rの実寸');
  });
}

const key = (id: string, row: number, x: number, width?: number): Key => ({
  id,
  row,
  col: 0,
  x,
  y: row,
  finger: 'LP',
  ...(width === undefined ? {} : { width }),
});

test('自作の物理配列: 段の端のTabとBackspaceも1uで詰め、端でない位置の幅の広いキーは実寸のまま', () => {
  const spans = drawnKeySpans([
    key('tab', 1, -1.5, 2),
    key('q', 1, 0.5),
    key('w', 1, 1.5),
    key('bs', 1, 3.5, 2),
    key('a', 2, 0),
    key('wide', 2, 1, 3),
    key('s', 2, 4.5),
  ]);
  // 左端のTabはQの左隣、右端のBackspaceはWの右隣
  assert.deepEqual(spans.get('tab'), { left: -0.5, width: 1 });
  assert.deepEqual(spans.get('bs'), { left: 2.5, width: 1 });
  assert.deepEqual(spans.get('wide'), { left: 0, width: 3 });
});

test('段に1個しか無い幅の広いキーは実寸のまま描く', () => {
  const spans = drawnKeySpans([key('bs', 0, 0, 2), key('a', 1, 0)]);
  assert.deepEqual(spans.get('bs'), { left: -0.5, width: 2 });
});

const rowStaggeredKinds = kinds.filter((kind) => kind.endsWith('row-staggered') && !kind.endsWith('column-staggered'));

for (const kind of rowStaggeredKinds) {
  test(`${kind}: 実寸で描くと、左端の列と左Shiftが実寸の幅で左端が揃い、右Shiftはほかの段の右端を越えない`, () => {
    const geometry = buildGeometry(kind, presetGeometryStandard(kind) === 'jis' ? JIS_FINGER_ASSIGNMENT : undefined);
    const keys = [...geometry.keys.values()];
    const spans = drawnKeySpans(keys, { actualRowStart: true });

    const expected = [
      ['backquote', 1],
      ['tab', 1.5],
      ['caps-lock', 1.75],
      ['shift-l', 2.25],
    ] as const;
    for (const [id, width] of expected) {
      const span = spans.get(id)!;
      near(span.width, width, `${id}の幅`);
      near(span.left, -1, `${id}の左端`);
    }

    // 右端: 右Shiftは最後の文字キーの右隣から始まり、ほかの段の右端のうち最も右にあるものを越えない
    const shiftR = spans.get('shift-r')!;
    const slash = spans.get(geometry.grid[3]!.at(-1)!.id)!;
    near(shiftR.left, slash.left + slash.width, 'shift-rは最後の文字キーの右隣');
    let limit = -Infinity;
    for (const row of [0, 1, 2]) {
      const last = spans.get(geometry.grid[row]!.at(-1)!.id)!;
      limit = Math.max(limit, last.left + last.width);
    }
    near(shiftR.left + shiftR.width, limit, 'shift-rの右端は、ほかの段の右端のうち最も右にあるものに合う');
    // ANSIは1.25u、JISは0.75u（1u未満）
    near(shiftR.width, presetGeometryStandard(kind) === 'jis' ? 0.75 : 1.25, 'shift-rの幅');

    // 実寸で描かない時と、文字キー・親指の範囲は同じ
    const compact = drawnKeySpans(keys);
    for (const k of keys) {
      if (LEFT_COLUMN_KEYS.includes(k.id as (typeof LEFT_COLUMN_KEYS)[number]) || k.id === 'shift-l' || k.id === 'shift-r') continue;
      assert.deepEqual(spans.get(k.id), compact.get(k.id), `${k.id}の範囲`);
    }
  });
}

for (const kind of kinds.filter((value) => !rowStaggeredKinds.includes(value))) {
  test(`${kind}: 左端の列の3つのキーは幅の指定を持たず1u`, () => {
    const geometry = buildGeometry(kind, presetGeometryStandard(kind) === 'jis' ? JIS_FINGER_ASSIGNMENT : undefined);
    for (const id of LEFT_COLUMN_KEYS) assert.equal(geometry.keys.get(id)!.width, undefined, `${id}の幅`);
  });
}

test('実寸で描く指定でも、ほかの段が無ければ右端の幅の広いキーは1uに詰める', () => {
  const spans = drawnKeySpans([key('a', 0, 0), key('wide', 0, 3, 3)], { actualRowStart: true });
  assert.deepEqual(spans.get('wide'), { left: 1, width: 1 });
});
