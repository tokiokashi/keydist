import assert from 'node:assert/strict';
import test from 'node:test';
import type { LinkGroup } from '#engine/workspace.ts';
import { EMPTY_SETTINGS_OVERRIDES } from '#engine/settings-items.ts';
import { LAYOUT_BY_ID } from '#input/layouts/index.ts';
import { PHYSICAL_SHAPES, type PhysicalShape } from '#input/shapes/geometry.ts';
import type { AnalysisTarget, Setup } from '#input/setup/index.ts';
import type { ResolvedText } from '#input/text/resolve.ts';
import type { PaneEnvironment } from '#hosts/shared/panes/pane-environment.ts';
import type { PaneCatalog } from '#hosts/shared/resolve-pane-input.ts';
import { summarizeLinkGroups, summarizeNames } from './group-summary.ts';

test('summarizeNames: 0件は未選択、2件までは並べ、3件以上は先頭2件と他N件に畳む', () => {
  assert.equal(summarizeNames([]), '未選択');
  assert.equal(summarizeNames(['QWERTY']), 'QWERTY');
  assert.equal(summarizeNames(['QWERTY', 'Colemak-DH']), 'QWERTY、Colemak-DH');
  assert.equal(summarizeNames(['A', 'B', 'C']), 'A、B 他1件');
  assert.equal(summarizeNames(['A', 'B', 'C', 'D', 'E']), 'A、B 他3件');
});

const CATALOG: PaneCatalog = {
  setupCatalog: {
    layouts: LAYOUT_BY_ID,
    shapes: new Map<string, PhysicalShape>(Object.values(PHYSICAL_SHAPES).map((shape) => [shape.id, shape])),
  },
  userLayouts: new Map(),
};

const EN_TEXT: ResolvedText = {
  ref: { kind: 'user', id: 'test-text' },
  name: 'テスト用テキスト',
  text: 'hello world',
  language: 'en',
  languageOverride: undefined,
  isBuiltin: false,
  readingCorrections: {},
};

function envWith(setups: readonly Setup[]): PaneEnvironment {
  return { setups, overrides: EMPTY_SETTINGS_OVERRIDES, catalog: CATALOG, resolvedText: EN_TEXT } as unknown as PaneEnvironment;
}

function groupOf(id: string, single: AnalysisTarget, set: readonly AnalysisTarget[] = []): LinkGroup {
  return { id, target: { single: { target: single }, set: { targets: set, baseline: undefined } } };
}

test('summarizeLinkGroups: 配列名が同じで物理配列だけが違う組は、メニュー上で名前が分かれる', () => {
  const a: Setup = { id: 'a', number: 1, layoutId: 'qwerty', shapeId: 'row-staggered' };
  const b: Setup = { id: 'b', number: 2, layoutId: 'qwerty', shapeId: 'ortholinear' };
  const targetA: AnalysisTarget = { kind: 'setup', setupId: 'a' };
  const targetB: AnalysisTarget = { kind: 'setup', setupId: 'b' };
  const summaries = summarizeLinkGroups(envWith([a, b]), [groupOf('g1', targetA, [targetA]), groupOf('g2', targetB, [targetB])]);
  assert.notEqual(summaries[0]!.single, summaries[1]!.single);
  assert.notEqual(summaries[0]!.set, summaries[1]!.set);
  assert.match(summaries[1]!.single, new RegExp(PHYSICAL_SHAPES.ortholinear!.name));
});

test('summarizeLinkGroups: 区別の要らない組と、同じ対象を持つ組は、配列名だけのまま', () => {
  const qwerty: AnalysisTarget = { kind: 'layout', layoutId: 'qwerty' };
  const colemak: AnalysisTarget = { kind: 'layout', layoutId: 'colemak-dh' };
  const summaries = summarizeLinkGroups(envWith([]), [groupOf('g1', qwerty), groupOf('g2', colemak), groupOf('g3', qwerty)]);
  assert.deepEqual(
    summaries.map((summary) => summary.single),
    [LAYOUT_BY_ID.get('qwerty')!.name, LAYOUT_BY_ID.get('colemak-dh')!.name, LAYOUT_BY_ID.get('qwerty')!.name],
  );
});
