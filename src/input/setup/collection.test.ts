import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  defineItem,
  emptyCascadeOverrides,
  setOverride,
  type CascadeOverrides,
  type ItemRegistry,
} from '#input/settings/index.ts';
import { createSetup, duplicateSetup, deleteSetup, relabelSetup, type SetupLibrary } from './collection.ts';

// Setup固有の上書き（カスケードのsetupレベル）が複製・削除に追従することを検証するための
// 最小レジストリ。overrides.tsの判断（Setupの上書きはSetupオブジェクトではなくカスケードに
// 置く）が実際に機能することを、このテストで確かめる。
const ITEMS = {
  windowSize: defineItem<number>({
    id: 'windowSize',
    allowedLevels: new Set(['global', 'setup']),
    defaultValue: 3,
  }),
} as const satisfies ItemRegistry;

type V = { windowSize: number };
type Overrides = CascadeOverrides<V>;

let idCounter = 0;
function nextId(): string {
  idCounter += 1;
  return `setup-${idCounter}`;
}

function emptyLibrary(): SetupLibrary<V> {
  return { setups: [], overrides: emptyCascadeOverrides() };
}

test('createSetup: 新しいSetupが追加され、上書きは変わらない', () => {
  idCounter = 0;
  const library = createSetup(emptyLibrary(), 'qwerty', 'row-staggered', nextId);
  assert.equal(library.setups.length, 1);
  assert.deepEqual(library.setups[0], { id: 'setup-1', layoutId: 'qwerty', shapeId: 'row-staggered', colorIndex: 0 });
});

test('createSetup: ラベル付きで作れる', () => {
  idCounter = 0;
  const library = createSetup(emptyLibrary(), 'qwerty', 'row-staggered', nextId, '実験用');
  assert.equal(library.setups[0].label, '実験用');
});

test('createSetup: 追加するたびに、その時点で最も使われていない色を割り当てる', () => {
  idCounter = 0;
  let library = emptyLibrary();
  library = createSetup(library, 'qwerty', 'row-staggered', nextId);
  library = createSetup(library, 'dvorak', 'row-staggered', nextId);
  library = createSetup(library, 'colemak', 'row-staggered', nextId);
  assert.deepEqual(library.setups.map((s) => s.colorIndex), [0, 1, 2]); // 手持ちが空から増えるので0番から順
});

test('duplicateSetup: 配列・形状・上書きをコピーした独立のSetupができる', () => {
  idCounter = 0;
  let library = createSetup(emptyLibrary(), 'qwerty', 'row-staggered', nextId);
  const sourceId = library.setups[0].id;

  const written = setOverride(ITEMS, library.overrides, { kind: 'setup', setupId: sourceId }, 'windowSize', 7);
  assert.ok(written.ok);
  library = { ...library, overrides: written.overrides as Overrides };

  library = duplicateSetup(library, sourceId, nextId);
  assert.equal(library.setups.length, 2);
  const copyId = library.setups[1].id;
  assert.equal(library.setups[1].layoutId, 'qwerty');
  assert.equal(library.setups[1].shapeId, 'row-staggered');

  // 複製直後は元と同じ上書きを持つ。
  assert.deepEqual(
    library.overrides.setup?.[copyId],
    library.overrides.setup?.[sourceId],
  );
  // ただし別オブジェクト（以後独立して書き換えられる）。
  const rewritten = setOverride(ITEMS, library.overrides, { kind: 'setup', setupId: copyId }, 'windowSize', 9);
  assert.ok(rewritten.ok);
  const overrides = rewritten.overrides as Overrides;
  assert.equal(overrides.setup?.[sourceId]?.windowSize, 7); // 元は変わらない
  assert.equal(overrides.setup?.[copyId]?.windowSize, 9);
});

test('duplicateSetup: 複製元と別の色になる（同じ配列・形状の2つを色でも区別できる）', () => {
  idCounter = 0;
  let library = createSetup(emptyLibrary(), 'qwerty', 'row-staggered', nextId);
  const sourceId = library.setups[0].id;
  const sourceColorIndex = library.setups[0].colorIndex;

  library = duplicateSetup(library, sourceId, nextId);
  const copyColorIndex = library.setups[1].colorIndex;
  assert.notEqual(copyColorIndex, sourceColorIndex);
});

test('duplicateSetup: 存在しないidの複製は何もしない（例外にしない）', () => {
  idCounter = 0;
  const library = emptyLibrary();
  const result = duplicateSetup(library, 'no-such-setup', nextId);
  assert.equal(result, library);
});

test('deleteSetup: Setup自体とカスケードのsetupレベルの上書きが両方消える', () => {
  idCounter = 0;
  let library = createSetup(emptyLibrary(), 'qwerty', 'row-staggered', nextId);
  const id = library.setups[0].id;
  const written = setOverride(ITEMS, library.overrides, { kind: 'setup', setupId: id }, 'windowSize', 7);
  assert.ok(written.ok);
  library = { ...library, overrides: written.overrides as Overrides };

  library = deleteSetup(library, id);
  assert.equal(library.setups.length, 0);
  assert.equal(library.overrides.setup?.[id], undefined);
  assert.deepEqual(library.overrides, emptyCascadeOverrides());
});

test('deleteSetup: 他のSetupの上書きは残る', () => {
  idCounter = 0;
  let library = createSetup(emptyLibrary(), 'qwerty', 'row-staggered', nextId);
  library = createSetup(library, 'dvorak', 'row-staggered', nextId);
  const [keep, remove] = library.setups;

  let overrides = (setOverride(ITEMS, library.overrides, { kind: 'setup', setupId: keep.id }, 'windowSize', 4) as { ok: true; overrides: Overrides }).overrides;
  overrides = (setOverride(ITEMS, overrides, { kind: 'setup', setupId: remove.id }, 'windowSize', 8) as { ok: true; overrides: Overrides }).overrides;
  library = { ...library, overrides };

  library = deleteSetup(library, remove.id);
  assert.equal(library.overrides.setup?.[keep.id]?.windowSize, 4);
  assert.equal(library.overrides.setup?.[remove.id], undefined);
});

test('relabelSetup: ラベルを付ける・変える・外す', () => {
  idCounter = 0;
  let library = createSetup(emptyLibrary(), 'qwerty', 'row-staggered', nextId);
  const id = library.setups[0].id;

  library = relabelSetup(library, id, 'メイン');
  assert.equal(library.setups[0].label, 'メイン');

  library = relabelSetup(library, id, 'サブ');
  assert.equal(library.setups[0].label, 'サブ');

  library = relabelSetup(library, id, undefined);
  assert.equal('label' in library.setups[0], false);
});
