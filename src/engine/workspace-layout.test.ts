import assert from 'node:assert/strict';
import test from 'node:test';
import {
  layoutPaneIds,
  layoutWithPane,
  layoutWithPaneNextTo,
  layoutWithoutPane,
  normalizeLayout,
  sameLayout,
  sameLayoutExactly,
  type WorkspaceLayout,
  type WorkspaceLayoutNode,
} from './workspace-layout.ts';

const group = (paneIds: readonly string[], weight = 1, activePaneId?: string): WorkspaceLayoutNode => ({
  kind: 'group',
  paneIds,
  ...(activePaneId === undefined ? {} : { activePaneId }),
  weight,
});
const split = (direction: 'row' | 'column', children: readonly WorkspaceLayoutNode[], weight = 1): WorkspaceLayoutNode => ({
  kind: 'split',
  direction,
  children,
  weight,
});

test('layoutWithPane: 空の配置には1つのgroup、続けて足すと右へ横に並ぶ', () => {
  const one = layoutWithPane(undefined, 'a');
  assert.deepEqual(one, group(['a']));
  const two = layoutWithPane(one, 'b');
  assert.deepEqual(two, split('row', [group(['a']), group(['b'])]));
  const three = layoutWithPane(two, 'c');
  assert.deepEqual(layoutPaneIds(three), ['a', 'b', 'c']);
  assert.equal(three?.kind, 'split');
  // 3つ目も同じ階層の横並びに入る（入れ子にしない）
  assert.equal(three?.kind === 'split' ? three.children.length : 0, 3);
});

test('layoutWithPane: 新しい枠の重みは既存の平均になる（急に細く・太くならない）', () => {
  const layout = split('row', [group(['a'], 3), group(['b'], 1)]);
  const next = layoutWithPane(layout, 'c');
  assert.ok(next?.kind === 'split');
  assert.equal(next.children[2]!.weight, 2);
});

test('layoutWithoutPane: 最後の1つを閉じると木ごと無くなり、2つ残る時は1つのgroupへ畳む', () => {
  assert.equal(layoutWithoutPane(group(['a']), 'a'), undefined);
  const two = split('row', [group(['a']), group(['b'])]);
  assert.deepEqual(layoutWithoutPane(two, 'a'), group(['b']));
  // 存在しないペインを取り除いても他は変わらない
  assert.deepEqual(layoutPaneIds(layoutWithoutPane(two, 'zzz')), ['a', 'b']);
});

test('layoutWithoutPane: 残りの重みの比は保つ', () => {
  const three = split('row', [group(['a'], 1), group(['b'], 2), group(['c'], 1)]);
  const next = layoutWithoutPane(three, 'a');
  assert.ok(next?.kind === 'split');
  assert.deepEqual(next.children.map((c) => c.weight), [2, 1]);
});

test('layoutWithoutPane: タブの組から1つ抜いても組は残る', () => {
  const tabs = split('row', [group(['a', 'b'], 1, 'b'), group(['c'])]);
  const next = layoutWithoutPane(tabs, 'b');
  assert.deepEqual(next, split('row', [group(['a']), group(['c'])]));
});

test('layoutWithPaneNextTo: 参照先の右隣に置く。縦の分割の中では、その枠を横に割る', () => {
  const row = split('row', [group(['a']), group(['b'])]);
  const next = layoutWithPaneNextTo(row, 'a', 'x');
  assert.deepEqual(layoutPaneIds(next), ['a', 'x', 'b']);

  const column = split('column', [group(['a']), group(['b'])]);
  const nested = layoutWithPaneNextTo(column, 'a', 'x');
  assert.ok(nested?.kind === 'split' && nested.direction === 'column');
  assert.deepEqual(layoutPaneIds(nested), ['a', 'x', 'b']);
  const first = nested.children[0]!;
  assert.ok(first.kind === 'split' && first.direction === 'row');

  // 参照先が無ければ末尾
  assert.deepEqual(layoutPaneIds(layoutWithPaneNextTo(row, 'none', 'x')), ['a', 'b', 'x']);
});

test('layoutWithPaneNextTo: 1つのgroupだけの配置でも横に並べる', () => {
  assert.deepEqual(layoutWithPaneNextTo(group(['a'], 1), 'a', 'x'), split('row', [group(['a'], 0.5), group(['x'], 0.5)]));
});

test('normalizeLayout: 未知のペイン・重複を捨て、載っていないペインは右端へ足す', () => {
  const broken = split('row', [group(['a', 'ghost']), group(['a']), group([])]);
  const fixed = normalizeLayout(broken, ['a', 'b']);
  assert.deepEqual(layoutPaneIds(fixed), ['a', 'b']);
});

test('normalizeLayout: ペインがあるのに木が無ければ横に並べる。ペインが無ければ木も無い', () => {
  assert.deepEqual(layoutPaneIds(normalizeLayout(undefined, ['a', 'b'])), ['a', 'b']);
  assert.equal(normalizeLayout(group(['a']), []), undefined);
});

test('normalizeLayout: 同じ向きの入れ子は親へ畳み、重みを按分する', () => {
  const nested = split('row', [group(['a'], 1), split('row', [group(['b'], 1), group(['c'], 3)], 2)]);
  const fixed = normalizeLayout(nested, ['a', 'b', 'c']);
  assert.ok(fixed?.kind === 'split');
  assert.deepEqual(fixed.children.map((c) => c.weight), [1, 0.5, 1.5]);
});

test('normalizeLayout: 不正な重みは1にし、前面のペインがgroupに無ければ外す', () => {
  const fixed = normalizeLayout(split('row', [group(['a'], -3, 'zzz'), group(['b'], Number.NaN)]), ['a', 'b']);
  assert.ok(fixed?.kind === 'split');
  assert.deepEqual(fixed.children.map((c) => c.weight), [1, 1]);
  assert.equal((fixed.children[0] as { activePaneId?: string }).activePaneId, undefined);
});

test('normalizeLayout: 根の重みは常に1', () => {
  assert.equal(normalizeLayout(group(['a'], 5), ['a'])?.weight, 1);
});

test('sameLayout: 重みの比が許容内なら同じ、外れれば違う。並びや前面が違えば違う', () => {
  const a: WorkspaceLayout = split('row', [group(['a'], 1), group(['b'], 1)]);
  const near: WorkspaceLayout = split('row', [group(['a'], 100), group(['b'], 101)]);
  const far: WorkspaceLayout = split('row', [group(['a'], 1), group(['b'], 2)]);
  assert.ok(sameLayout(a, near));
  assert.ok(!sameLayoutExactly(a, near));
  assert.ok(!sameLayout(a, far));
  assert.ok(!sameLayout(a, split('column', [group(['a']), group(['b'])])));
  assert.ok(!sameLayout(a, split('row', [group(['b']), group(['a'])])));
  assert.ok(!sameLayout(group(['a', 'b'], 1, 'a'), group(['a', 'b'], 1, 'b')));
  // 前面の指定が無ければ先頭とみなす
  assert.ok(sameLayout(group(['a', 'b']), group(['a', 'b'], 1, 'a')));
  assert.ok(sameLayout(undefined, undefined));
  assert.ok(!sameLayout(undefined, group(['a'])));
});
