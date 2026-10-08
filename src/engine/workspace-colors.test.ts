import assert from 'node:assert/strict';
import test from 'node:test';
import { analysisTargetKey, type AnalysisTarget } from '#input/setup/index.ts';
import { COLOR_SLOT_COUNT } from './multi-target-selection.ts';
import {
  addWorkspacePane,
  closeWorkspacePane,
  createWorkspace,
  findWorkspace,
  followBinding,
  INITIAL_LINK_GROUP_ID,
  initialWorkspaceLibrary,
  withWorkspacePaneBinding,
  withWorkspaceTarget,
  type WorkspaceLibrary,
  type WorkspacePane,
  OWN_OPTIONS,
} from './workspace.ts';
import { WORKSPACE_LIBRARY_CODEC } from './workspace-codec.ts';

const layout = (layoutId: string): AnalysisTarget => ({ kind: 'layout', layoutId });
const A = layout('a');
const B = layout('b');
const C = layout('c');
const D = layout('d');

/** 対象の集合を固定で持つ、集合を見るペイン。 */
function fixedSetPane(id: string, targets: readonly AnalysisTarget[]): WorkspacePane {
  return {
    id,
    analyzerId: 'comparison',
    options: undefined,
    optionsBinding: OWN_OPTIONS,
    binding: { mode: 'fixed', target: { kind: 'set', selection: { targets, baseline: undefined } } },
  };
}

function withPanes(...panes: WorkspacePane[]): WorkspaceLibrary {
  let library = createWorkspace(initialWorkspaceLibrary(), () => 'w1').library;
  for (const pane of panes) library = addWorkspacePane(library, 'w1', pane, { w: 6, h: 10 });
  return library;
}

const colors = (library: WorkspaceLibrary) => findWorkspace(library, 'w1')!.colorSlots;
const slotOf = (library: WorkspaceLibrary, target: AnalysisTarget) => colors(library)[analysisTargetKey(target)];

test('同じ対象は、別のペインに違う順で入れても同じ色になる', () => {
  const library = withPanes(fixedSetPane('p1', [A, B, C]), fixedSetPane('p2', [C, A, D]));
  for (const target of [A, C]) assert.notEqual(slotOf(library, target), undefined);
  // どちらのペインから見ても、対象の色は1つ。Workspaceが対象ごとに1つしか持たない
  assert.equal(Object.keys(colors(library)).length, 4);
  // 加えた順（p1のA, B, C → p2で増えたD）に、互いに違う番号が並ぶ
  assert.deepEqual([A, B, C, D].map((t) => slotOf(library, t)), [0, 1, 2, 3]);
});

test('従う組の集合と、固定のペインの集合も同じ1つの集合として配る', () => {
  let library = withPanes({ id: 'p1', analyzerId: 'comparison', options: undefined, optionsBinding: OWN_OPTIONS, binding: followBinding(INITIAL_LINK_GROUP_ID) });
  library = withWorkspaceTarget(library, 'w1', INITIAL_LINK_GROUP_ID, { kind: 'set', selection: { targets: [A, B], baseline: undefined } });
  library = addWorkspacePane(library, 'w1', fixedSetPane('p2', [B, C]), { w: 6, h: 10 });
  assert.deepEqual([A, B, C].map((t) => slotOf(library, t)), [0, 1, 2]);
});

test('ペインの対象を外しても、他の対象の色は動かず、空いた色は次に加えた対象が使う', () => {
  let library = withPanes(fixedSetPane('p1', [A, B, C]));
  library = withWorkspacePaneBinding(library, 'w1', 'p1', fixedSetBinding([A, C]));
  assert.equal(slotOf(library, B), undefined);
  assert.deepEqual([A, C].map((t) => slotOf(library, t)), [0, 2]);
  library = withWorkspacePaneBinding(library, 'w1', 'p1', fixedSetBinding([A, C, D]));
  assert.equal(slotOf(library, D), 1);
  assert.deepEqual([A, C].map((t) => slotOf(library, t)), [0, 2]);
});

test('別のペインにも居る対象は、片方のペインから外しても色を失わない', () => {
  let library = withPanes(fixedSetPane('p1', [A, B]), fixedSetPane('p2', [B, C]));
  const before = colors(library);
  library = withWorkspacePaneBinding(library, 'w1', 'p1', fixedSetBinding([A]));
  assert.equal(slotOf(library, B), before[analysisTargetKey(B)]);
  assert.equal(slotOf(library, C), before[analysisTargetKey(C)]);
});

test('並べ替えでも、色は対象に付いて動く', () => {
  let library = withPanes(fixedSetPane('p1', [A, B, C]));
  const before = colors(library);
  library = withWorkspacePaneBinding(library, 'w1', 'p1', fixedSetBinding([C, B, A]));
  assert.deepEqual(colors(library), before);
});

test('ペインを閉じると、そのペインだけに居た対象の色は空き、他のペインの対象の色は動かない', () => {
  let library = withPanes(fixedSetPane('p1', [A, B]), fixedSetPane('p2', [B, C]));
  library = closeWorkspacePane(library, 'w1', 'p1');
  // Aは和から消える。Bは別のペインに居るので色を保つ
  assert.equal(slotOf(library, A), undefined);
  assert.deepEqual([B, C].map((t) => slotOf(library, t)), [1, 2]);
  // 空いた0番は、次に加えた対象が使う
  library = addWorkspacePane(library, 'w1', fixedSetPane('p3', [D]), { w: 6, h: 10 });
  assert.equal(slotOf(library, D), 0);
});

test('対象が変わらない書き込みは、Workspaceの参照を変えない', () => {
  const library = withPanes(fixedSetPane('p1', [A, B]));
  assert.equal(withWorkspacePaneBinding(library, 'w1', 'p1', fixedSetBinding([A, B])), library);
});

test('色の番号は保存して読み直すと戻り、壊れた番号は配り直す', () => {
  const library = withPanes(fixedSetPane('p1', [A, B]), fixedSetPane('p2', [C, A]));
  const json: unknown = JSON.parse(JSON.stringify(WORKSPACE_LIBRARY_CODEC.encode(library)));
  const decoded = WORKSPACE_LIBRARY_CODEC.decode(json);
  assert.ok(decoded.ok);
  assert.deepEqual(decoded.value, library);

  const broken = JSON.parse(JSON.stringify(json)) as { workspaces: { colorSlots: Record<string, unknown> }[] };
  broken.workspaces[0]!.colorSlots = { [analysisTargetKey(A)]: 99, [analysisTargetKey(B)]: 'x' };
  const redecoded = WORKSPACE_LIBRARY_CODEC.decode(broken);
  assert.ok(redecoded.ok);
  const slots = Object.values(findWorkspace(redecoded.value, 'w1')!.colorSlots);
  assert.equal(slots.length, 3);
  assert.ok(slots.every((slot) => Number.isInteger(slot) && slot >= 0 && slot < COLOR_SLOT_COUNT));
  assert.equal(new Set(slots).size, 3);
});

test('個別画面で配っていた色を引き継いでWorkspaceを作れる', () => {
  const created = createWorkspace(
    initialWorkspaceLibrary(),
    () => 'w1',
    undefined,
    { single: { target: undefined }, set: { targets: [A, B], baseline: undefined } },
    new Map([[analysisTargetKey(A), 5], [analysisTargetKey(B), 2]]),
  ).created;
  assert.deepEqual(created.colorSlots, { [analysisTargetKey(A)]: 5, [analysisTargetKey(B)]: 2 });
});

function fixedSetBinding(targets: readonly AnalysisTarget[]) {
  return { mode: 'fixed', target: { kind: 'set', selection: { targets, baseline: undefined } } } as const;
}
