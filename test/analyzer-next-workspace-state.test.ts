import assert from 'node:assert/strict';
import test from 'node:test';
import { ANALYSIS_VIEW_DEFINITIONS } from '../src/features/analyzer-next/view-registry.ts';
import {
  decodeAnalyzerWorkspace,
  duplicateWorkspaceInstance,
  removeWorkspaceInstance,
} from '../src/features/analyzer-next/analyzer-workspace-state.ts';

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
    root: {
      kind: 'split',
      orientation: 'horizontal',
      children: [
        { kind: 'tabs', instanceIds: ['flow-a'], activeInstanceId: 'flow-a' },
        { kind: 'tabs', instanceIds: ['heat-a'], activeInstanceId: 'heat-a' },
      ],
    },
  },
};

test('Analyzer Workspace restores renderer-independent split/tab layout', () => {
  const state = decodeAnalyzerWorkspace(saved, ANALYSIS_VIEW_DEFINITIONS);
  assert.equal(state.instances.length, 2);
  assert.deepEqual(state.layout.root, saved.layout.root);
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
    instanceIds: ['flow-a'],
    activeInstanceId: 'flow-a',
  });
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

test('duplicate and close preserve instance config while layout is sanitized', () => {
  const state = decodeAnalyzerWorkspace(saved, ANALYSIS_VIEW_DEFINITIONS);
  const duplicated = duplicateWorkspaceInstance(state, 'flow-a', 'flow-copy');
  assert.deepEqual(
    duplicated.instances.find((item) => item.id === 'flow-copy')?.config,
    duplicated.instances.find((item) => item.id === 'flow-a')?.config,
  );

  const closed = removeWorkspaceInstance(duplicated, 'flow-a', ANALYSIS_VIEW_DEFINITIONS);
  assert.equal(closed.instances.some((item) => item.id === 'flow-a'), false);
  assert.equal(JSON.stringify(closed.layout).includes('flow-a'), false);
});
