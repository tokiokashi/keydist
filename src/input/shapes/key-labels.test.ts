import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGeometry, DEFAULT_FINGER_ASSIGNMENT, PHYSICAL_SHAPES } from './geometry.ts';
import {
  keyboardStandardForGeometryId,
  physicalKeyDisplayLabel,
  physicalKeyEngraving,
} from './key-labels.ts';
import { sanitizeGeometrySettings, sanitizePhysicalShape } from './settings.ts';

test('名前付きの物理キーは内部idではなく表示名になる', () => {
  assert.equal(physicalKeyDisplayLabel('thumb-l'), '左親指');
  assert.equal(physicalKeyDisplayLabel('thumb-r'), '右親指');
  assert.equal(physicalKeyDisplayLabel('shift-l'), '左Shift');
  assert.equal(physicalKeyDisplayLabel('shift-r'), '右Shift');
  assert.equal(physicalKeyDisplayLabel('tab'), 'Tab');
  assert.equal(physicalKeyDisplayLabel('escape'), 'Esc');
  assert.equal(physicalKeyDisplayLabel('caps-lock'), 'Caps Lock');
});

test('ANSIのbackquote・backslashは刻印になる', () => {
  assert.equal(physicalKeyDisplayLabel('backquote', 'ansi'), '`');
  assert.equal(physicalKeyDisplayLabel('backslash', 'ansi'), '\\');
});

test('JIS形状の追加キーは刻印になる', () => {
  assert.equal(physicalKeyDisplayLabel('r0c12', 'jis'), '¥');
  assert.equal(physicalKeyDisplayLabel('r2c11', 'jis'), ']');
  assert.equal(physicalKeyDisplayLabel('r3c10', 'jis'), '\\');
  assert.equal(physicalKeyDisplayLabel('backquote', 'jis'), '半角/全角');
});

test('規格が分からない時は位置で呼ぶ', () => {
  assert.equal(physicalKeyDisplayLabel('r0c12'), '1段目13列');
  assert.equal(physicalKeyDisplayLabel('r2c11'), '3段目12列');
  assert.equal(physicalKeyDisplayLabel('r3c10'), '4段目11列');
  // JISの刻印に引き直さない（ANSI由来の自作形状もあり得る）
  assert.equal(physicalKeyEngraving(']'), ']');
  assert.equal(physicalKeyEngraving('backquote'), '`');
});

test('Testerの経路: 自作形状は規格未指定になり、追加キーを位置で呼ぶ', () => {
  const custom = sanitizePhysicalShape({
    ...PHYSICAL_SHAPES['jis-row-staggered'],
    id: 'user-jis-sized',
    name: '自作',
  }, PHYSICAL_SHAPES['jis-row-staggered']);
  const standard = keyboardStandardForGeometryId(custom.id);
  assert.equal(standard, undefined);
  // Testerと同じく、自作形状は既定の指割り当てとともにsanitizeしてから組み立てる
  const settings = sanitizeGeometrySettings({
    shape: custom,
    assignment: DEFAULT_FINGER_ASSIGNMENT,
  });
  const geometry = buildGeometry(settings.shape, settings.assignment);
  const labels = [...geometry.grid.flat()].map((key) => physicalKeyEngraving(key.id, standard));
  // JIS大の自作形状でも、同じ刻印が2つのキーに出ない
  assert.equal(new Set(labels).size, labels.length);
  assert.equal(physicalKeyEngraving('r2c11', standard), '3段目12列');

  assert.equal(keyboardStandardForGeometryId('jis-row-staggered'), 'jis');
  assert.equal(keyboardStandardForGeometryId('row-staggered'), 'ansi');
});

test('JIS形状ではANSIと刻印が違うキーを引き直し、同じ刻印が2つのキーに出ない', () => {
  assert.equal(physicalKeyEngraving('=', 'jis'), '^');
  assert.equal(physicalKeyEngraving('[', 'jis'), '@');
  assert.equal(physicalKeyEngraving(']', 'jis'), '[');
  assert.equal(physicalKeyEngraving("'", 'jis'), ':');

  const jisKeys = [
    ...'1234567890-=', 'r0c12',
    ...'qwertyuiop[]',
    ...'asdfghjkl;\'', 'r2c11',
    ...'zxcvbnm,./', 'r3c10',
  ];
  const labels = jisKeys.map((key) => physicalKeyEngraving(key, 'jis'));
  assert.equal(new Set(labels).size, labels.length);
});

test('ANSI形状ではQWERTY刻印をそのまま使う', () => {
  assert.equal(physicalKeyEngraving('[', 'ansi'), '[');
  assert.equal(physicalKeyEngraving(']'), ']');
  assert.equal(physicalKeyEngraving("'", 'ansi'), "'");
});

test('文字キーは表示名では大文字、刻印では小文字のまま', () => {
  assert.equal(physicalKeyDisplayLabel('d'), 'D');
  assert.equal(physicalKeyEngraving('d'), 'd');
  assert.equal(physicalKeyDisplayLabel('1'), '1');
});

test('刻印を持たない自作形状の追加キーは位置で呼ぶ', () => {
  assert.equal(physicalKeyDisplayLabel('r0c12', 'ansi'), '1段目13列');
  assert.equal(physicalKeyDisplayLabel('r4c15', 'jis'), '5段目16列');
});
