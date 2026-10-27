import assert from 'node:assert/strict';
import test from 'node:test';
import { LAYOUT_BY_ID } from '#input/layouts/index.ts';
import { buildGeometry, JIS_FINGER_ASSIGNMENT, LEFT_COLUMN_KEYS, type Geometry, type PresetGeometryKind } from '#input/shapes/geometry.ts';
import { HEATMAP_KEY_SIZE, heatmapBounds, heatmapDrawnKeys, heatmapViewBox, sharedHeatmapBounds } from './heatmap-keys.ts';

const layoutOf = (id: string) => {
  const layout = LAYOUT_BY_ID.get(id);
  assert.ok(layout, `配列 ${id} が無い`);
  return layout;
};

const geometryOf = (kind: PresetGeometryKind): Geometry => buildGeometry(kind, kind.startsWith('jis-') ? JIS_FINGER_ASSIGNMENT : undefined);

/** Shiftを使うローマ字配列と、使わないかな配列 */
const withShift = layoutOf('qwerty');
const withoutShift = layoutOf('naginata-v18');

const ALWAYS = [...LEFT_COLUMN_KEYS, 'shift-l', 'shift-r'];

test('Shiftを使う配列・使わない配列のどちらでも、左端の列と左右のShiftを描く。使わない時は枠だけのキーになる', () => {
  const geometry = geometryOf('row-staggered');
  const used = new Map(heatmapDrawnKeys(withShift, geometry).map((item) => [item.key.id, item.unused]));
  const unused = new Map(heatmapDrawnKeys(withoutShift, geometry).map((item) => [item.key.id, item.unused]));
  for (const id of ALWAYS) {
    assert.ok(used.has(id), `Shiftを使う配列に ${id} が無い`);
    assert.ok(unused.has(id), `Shiftを使わない配列に ${id} が無い`);
  }
  assert.equal(used.get('shift-l'), false);
  assert.equal(used.get('shift-r'), false);
  for (const id of ALWAYS) assert.equal(unused.get(id), true, `${id} は使わないので枠だけ`);
  // 文字キーは使う・使わないによらず枠だけにしない
  assert.equal(unused.get('a'), false);
});

test('物理配列が持たないキーは補わず、あるキーだけを描く', () => {
  const base = geometryOf('row-staggered');
  const keys = new Map(base.keys);
  for (const id of ['tab', 'caps-lock', 'shift-r']) keys.delete(id);
  const geometry: Geometry = { ...base, id: 'custom-without-keys', keys };
  const ids = heatmapDrawnKeys(withoutShift, geometry).map((item) => item.key.id);
  for (const id of ['tab', 'caps-lock', 'shift-r']) assert.equal(ids.includes(id), false, `${id} を補っていない`);
  for (const id of ['backquote', 'shift-l']) assert.equal(ids.includes(id), true, `${id} は描く`);
});

test('組み込みのrow-staggeredは、左端の列が実寸の幅で左端が揃う', () => {
  for (const kind of ['row-staggered', 'jis-row-staggered'] as const) {
    const spans = new Map(heatmapDrawnKeys(withoutShift, geometryOf(kind)).map((item) => [item.key.id, item]));
    for (const [id, width] of [
      ['backquote', 1],
      ['tab', 1.5],
      ['caps-lock', 1.75],
      ['shift-l', 2.25],
    ] as const) {
      assert.equal(spans.get(id)!.left, -1, `${kind}の${id}の左端`);
      assert.equal(spans.get(id)!.width, width, `${kind}の${id}の幅`);
    }
  }
});

test('自作の物理配列は、row-staggeredの形でも1uに詰めて描く', () => {
  const base = geometryOf('row-staggered');
  const geometry: Geometry = { ...base, id: 'shape-custom' };
  const spans = new Map(heatmapDrawnKeys(withoutShift, geometry).map((item) => [item.key.id, item]));
  for (const id of ALWAYS) assert.equal(spans.get(id)!.width, 1, `${id}の幅`);
});

test('ortholinear・split-ortholinear・column-staggeredでは、足したキーも1uで描く', () => {
  for (const kind of [
    'ortholinear',
    'jis-ortholinear',
    'split-ortholinear',
    'jis-split-ortholinear',
    'column-staggered',
    'jis-column-staggered',
  ] as const) {
    const spans = new Map(heatmapDrawnKeys(withoutShift, geometryOf(kind)).map((item) => [item.key.id, item]));
    for (const id of ALWAYS) assert.equal(spans.get(id)!.width, 1, `${kind}の${id}の幅`);
  }
});

test('右のShiftは、ほかの段の右端のうち最も右にあるものを越えない', () => {
  for (const kind of ['row-staggered', 'jis-row-staggered'] as const) {
    const drawn = heatmapDrawnKeys(withoutShift, geometryOf(kind));
    const shift = drawn.find((item) => item.key.id === 'shift-r')!;
    const limit = Math.max(...drawn.filter((item) => item.key.row < 3).map((item) => item.left + item.width));
    assert.ok(shift.left + shift.width <= limit + 1e-9, `${kind}: ${shift.left + shift.width} > ${limit}`);
  }
});

test('共通の描く範囲は、各図の範囲の和になる', () => {
  const a = { minX: -10, minY: 0, maxX: 300, maxY: 150 };
  const b = { minX: 0, minY: -5, maxX: 340, maxY: 140 };
  assert.deepEqual(sharedHeatmapBounds([a, b]), { minX: -10, minY: -5, maxX: 340, maxY: 150 });
  assert.deepEqual(sharedHeatmapBounds([a]), a);
  assert.equal(sharedHeatmapBounds([]), undefined);
});

test('共通の描く範囲を使うと、図の幅が違っていても、キー1つの幅が全部の図で同じになる', () => {
  // 描く範囲が違う2つの図: 物理配列の違いで幅が変わる
  const figures = [heatmapDrawnKeys(withShift, geometryOf('row-staggered')), heatmapDrawnKeys(withoutShift, geometryOf('split-ortholinear'))];
  const own = figures.map((figure) => heatmapViewBox(heatmapBounds(figure)).width);
  assert.notEqual(own[0], own[1]);
  const view = heatmapViewBox(sharedHeatmapBounds(figures.map(heatmapBounds))!);
  assert.ok(own.every((width) => width <= view.width + 1e-9));
  // 置かれた領域の幅へ縮める倍率は、共通の範囲の幅だけで決まる
  const scale = 120 / view.width;
  const widths = figures.map((figure) => figure.find((item) => item.key.id === 'a')!.width * HEATMAP_KEY_SIZE * scale);
  assert.equal(widths[0], widths[1]);
});

test('同じ物理配列の図どうしで、同じキーは配列によらず同じ位置・同じ範囲に描く', () => {
  for (const kind of ['row-staggered', 'jis-row-staggered', 'ortholinear', 'column-staggered'] as const) {
    const geometry = geometryOf(kind);
    const [a, b] = [withShift, withoutShift].map((layout) => heatmapDrawnKeys(layout, geometry));
    for (const id of ['a', ...ALWAYS]) {
      const left = a!.find((item) => item.key.id === id)!;
      const right = b!.find((item) => item.key.id === id)!;
      assert.equal(left.left, right.left, `${kind}の${id}の左端`);
      assert.equal(left.width, right.width, `${kind}の${id}の幅`);
    }
    assert.deepEqual(heatmapBounds(a!), heatmapBounds(b!), `${kind}の描く範囲`);
  }
});
