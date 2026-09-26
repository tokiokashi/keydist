import assert from 'node:assert/strict';
import test from 'node:test';
import { ANALYSIS_VIEW_DEFINITIONS } from './view-registry.ts';
import {
  decodeAnalyzerWorkspace,
  duplicateWorkspaceInstance,
  removeWorkspaceInstance,
  setWorkspaceInstanceVisibility,
  workspaceLayoutInstanceIds,
} from './analyzer-workspace-state.ts';

const saved = {
  version: 1,
  instances: [
    {
      id: 'flow-a',
      type: 'bigram-flow',
      binding: { kind: 'layout', mode: 'ja', id: 'shingeta' },
      config: { source: 'actual' },
      configVersion: 1,
    },
    {
      id: 'heat-a',
      type: 'heatmap',
      binding: { kind: 'focused-layout' },
      config: { colorScale: 'log' },
      configVersion: 1,
    },
  ],
  layout: {
    version: 1,
    activeInstanceId: 'heat-a',
    root: {
      kind: 'split',
      orientation: 'horizontal',
      children: [
        {
          weight: 0.7,
          node: { kind: 'tabs', instanceIds: ['flow-a'], activeInstanceId: 'flow-a' },
        },
        {
          weight: 0.3,
          node: { kind: 'tabs', instanceIds: ['heat-a'], activeInstanceId: 'heat-a' },
        },
      ],
    },
  },
};

test('Analyzer Workspace restores renderer-independent split/tab layout with pane weights and active group', () => {
  const state = decodeAnalyzerWorkspace(saved, ANALYSIS_VIEW_DEFINITIONS);
  assert.equal(state.instances.length, 2);
  assert.deepEqual(state.layout.root, saved.layout.root);
  assert.equal(state.layout.activeInstanceId, 'heat-a');
});

test('split weights are sanitized and normalized so viewport size does not become persisted state', () => {
  const state = decodeAnalyzerWorkspace({
    ...saved,
    layout: {
      version: 1,
      root: {
        kind: 'split',
        orientation: 'horizontal',
        children: [
          { weight: 700, node: { kind: 'tabs', instanceIds: ['flow-a'] } },
          { weight: Number.NaN, node: { kind: 'tabs', instanceIds: ['heat-a'] } },
        ],
      },
    },
  }, ANALYSIS_VIEW_DEFINITIONS);

  assert.equal(state.layout.root?.kind, 'split');
  if (state.layout.root?.kind !== 'split') return;
  const weights = state.layout.root.children.map((child) => child.weight);
  assert.ok(weights.every((weight) => Number.isFinite(weight) && weight > 0));
  assert.ok(Math.abs(weights.reduce((sum, weight) => sum + weight, 0) - 1) < 1e-12);
  assert.ok(weights[0]! > weights[1]!);
  assert.equal(JSON.stringify(state.layout).includes('width'), false);
  assert.equal(JSON.stringify(state.layout).includes('height'), false);
});

test('pane visibility is persisted and global active pane falls back to a visible instance', () => {
  const state = decodeAnalyzerWorkspace({
    ...saved,
    layout: {
      version: 1,
      activeInstanceId: 'flow-a',
      root: {
        kind: 'tabs',
        instanceIds: ['flow-a', 'heat-a'],
        activeInstanceId: 'flow-a',
        hiddenInstanceIds: ['flow-a', 'missing'],
      },
    },
  }, ANALYSIS_VIEW_DEFINITIONS);

  assert.deepEqual(state.layout.root, {
    kind: 'tabs',
    instanceIds: ['flow-a', 'heat-a'],
    activeInstanceId: 'heat-a',
    hiddenInstanceIds: ['flow-a'],
  });
  assert.equal(state.layout.activeInstanceId, 'heat-a');

  const visible = setWorkspaceInstanceVisibility(state, 'flow-a', true);
  assert.equal(JSON.stringify(visible.layout).includes('hiddenInstanceIds'), false);
});

test('duplicate tree references keep the first occurrence and orphan instances are recovered exactly once', () => {
  const state = decodeAnalyzerWorkspace({
    ...saved,
    instances: [
      ...saved.instances,
      {
        id: 'play-a',
        type: 'playback',
        binding: { kind: 'focused-layout' },
        config: {},
        configVersion: 1,
      },
    ],
    layout: {
      version: 1,
      activeInstanceId: 'flow-a',
      root: {
        kind: 'split',
        orientation: 'horizontal',
        children: [
          { weight: 1, node: { kind: 'tabs', instanceIds: ['flow-a', 'heat-a'] } },
          { weight: 1, node: { kind: 'tabs', instanceIds: ['flow-a'] } },
        ],
      },
    },
  }, ANALYSIS_VIEW_DEFINITIONS);

  const ids = workspaceLayoutInstanceIds(state);
  assert.deepEqual([...ids].sort(), ['flow-a', 'heat-a', 'play-a']);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(state.layout.activeInstanceId, 'flow-a');
});

test('unknown View types and broken layout references are pruned', () => {
  const state = decodeAnalyzerWorkspace({
    version: 1,
    instances: [
      ...saved.instances,
      {
        id: 'old',
        type: 'removed-view',
        binding: { kind: 'focused-layout' },
        config: {},
        configVersion: 1,
      },
    ],
    layout: {
      version: 1,
      root: {
        kind: 'tabs',
        instanceIds: ['old', 'flow-a', 'missing'],
        activeInstanceId: 'old',
      },
    },
  }, ANALYSIS_VIEW_DEFINITIONS);

  assert.deepEqual(state.instances.map((item) => item.id), ['flow-a', 'heat-a']);
  assert.deepEqual(state.layout.root, {
    kind: 'tabs',
    instanceIds: ['flow-a', 'heat-a'],
    activeInstanceId: 'flow-a',
  });
  assert.equal(state.layout.activeInstanceId, 'flow-a');
});

test('corrupted workspace falls back without leaking library-specific schema', () => {
  assert.deepEqual(
    decodeAnalyzerWorkspace({ version: 99, dockview: { panels: 'broken' } }, ANALYSIS_VIEW_DEFINITIONS),
    {
      version: 1,
      instances: [],
      layout: { version: 1 },
    },
  );
});

test('duplicate inserts beside the source, activates it globally, and close removes all references', () => {
  const state = decodeAnalyzerWorkspace(saved, ANALYSIS_VIEW_DEFINITIONS);
  const duplicated = duplicateWorkspaceInstance(state, 'flow-a', 'flow-copy');
  assert.deepEqual(
    duplicated.instances.find((item) => item.id === 'flow-copy')?.config,
    duplicated.instances.find((item) => item.id === 'flow-a')?.config,
  );
  assert.equal(duplicated.layout.activeInstanceId, 'flow-copy');
  assert.equal(JSON.stringify(duplicated.layout).includes('flow-copy'), true);

  assert.equal(duplicated.layout.root?.kind, 'split');
  if (duplicated.layout.root?.kind === 'split') {
    const first = duplicated.layout.root.children[0]!.node;
    assert.equal(first.kind, 'tabs');
    if (first.kind === 'tabs') {
      assert.deepEqual(first.instanceIds, ['flow-a', 'flow-copy']);
      assert.equal(first.activeInstanceId, 'flow-copy');
    }
  }

  const closed = removeWorkspaceInstance(duplicated, 'flow-a', ANALYSIS_VIEW_DEFINITIONS);
  assert.equal(closed.instances.some((item) => item.id === 'flow-a'), false);
  assert.equal(JSON.stringify(closed.layout).includes('flow-a'), false);
  assert.equal(JSON.stringify(closed.layout).includes('flow-copy'), true);
});
