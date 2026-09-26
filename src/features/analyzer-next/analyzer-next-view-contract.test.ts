import assert from 'node:assert/strict';
import test from 'node:test';
import {
  decodeViewInstance,
  normalizeSessionFocus,
  resolveViewBinding,
  type AnalysisBindingSession,
  type AnalysisViewDefinition,
  type AnalysisViewType,
} from '../src/features/analyzer-next/view-contract.ts';

const session = (overrides: Partial<AnalysisBindingSession> = {}): AnalysisBindingSession => ({
  mode: 'ja',
  selectedLayoutIds: ['shingeta', 'naginata-v18', 'qwerty'],
  focusLayoutId: 'shingeta',
  availableLayoutIdsByMode: {
    en: ['qwerty', 'colemak'],
    ja: ['shingeta', 'naginata-v18', 'qwerty'],
  },
  ...overrides,
});

test('focused single-layout view follows Session focus', () => {
  assert.deepEqual(
    resolveViewBinding(session(), 'single', { kind: 'focused-layout' }),
    { status: 'ok', mode: 'ja', layoutIds: ['shingeta'] },
  );
});

test('focus normalizes to the first selected layout when the old focus is removed', () => {
  assert.equal(normalizeSessionFocus(['naginata-v18'], 'shingeta'), 'naginata-v18');
  assert.deepEqual(
    resolveViewBinding(
      session({ selectedLayoutIds: ['naginata-v18'], focusLayoutId: 'shingeta' }),
      'single',
      { kind: 'focused-layout' },
    ),
    { status: 'ok', mode: 'ja', layoutIds: ['naginata-v18'] },
  );
});

test('two instances of the same single-layout View can pin different layouts', () => {
  assert.deepEqual(
    resolveViewBinding(session(), 'single', { kind: 'layout', mode: 'ja', id: 'shingeta' }),
    { status: 'ok', mode: 'ja', layoutIds: ['shingeta'] },
  );
  assert.deepEqual(
    resolveViewBinding(session(), 'single', { kind: 'layout', mode: 'ja', id: 'naginata-v18' }),
    { status: 'ok', mode: 'ja', layoutIds: ['naginata-v18'] },
  );
});

test('set View resolves the full selected layout set without expanding it', () => {
  assert.deepEqual(
    resolveViewBinding(session(), 'set', { kind: 'session' }),
    {
      status: 'ok',
      mode: 'ja',
      layoutIds: ['shingeta', 'naginata-v18', 'qwerty'],
    },
  );
});

test('pin outside the selected set becomes not-selected instead of mutating Session', () => {
  assert.deepEqual(
    resolveViewBinding(
      session({
        selectedLayoutIds: ['shingeta'],
        availableLayoutIdsByMode: {
          en: ['qwerty'],
          ja: ['shingeta', 'naginata-v18'],
        },
      }),
      'single',
      { kind: 'layout', mode: 'ja', id: 'naginata-v18' },
    ),
    { status: 'unavailable', reason: 'not-selected' },
  );
});

test('pin keeps its mode and does not silently resolve the same id in another mode', () => {
  assert.deepEqual(
    resolveViewBinding(
      session({ mode: 'en', selectedLayoutIds: ['qwerty'], focusLayoutId: 'qwerty' }),
      'single',
      { kind: 'layout', mode: 'ja', id: 'qwerty' },
    ),
    { status: 'unavailable', reason: 'other-mode' },
  );
});

test('deleted pinned layout becomes a reasoned placeholder', () => {
  assert.deepEqual(
    resolveViewBinding(session(), 'single', { kind: 'layout', mode: 'ja', id: 'removed-layout' }),
    { status: 'unavailable', reason: 'deleted' },
  );
});

test('empty selection is explicit for both single and set Views', () => {
  const empty = session({ selectedLayoutIds: [], focusLayoutId: undefined });
  assert.deepEqual(
    resolveViewBinding(empty, 'single', { kind: 'focused-layout' }),
    { status: 'unavailable', reason: 'empty-selection' },
  );
  assert.deepEqual(
    resolveViewBinding(empty, 'set', { kind: 'session' }),
    { status: 'unavailable', reason: 'empty-selection' },
  );
});

test('cardinality forbids session binding on single Views and pin binding on set Views', () => {
  assert.throws(
    () => resolveViewBinding(session(), 'single', { kind: 'session' }),
    /incompatible/,
  );
  assert.throws(
    () => resolveViewBinding(session(), 'set', { kind: 'layout', mode: 'ja', id: 'shingeta' }),
    /incompatible/,
  );
});

test('persisted View instance uses definition codec and rejects unknown types', () => {
  const definition: AnalysisViewDefinition<{ source: string }> = {
    type: 'bigram-flow',
    title: 'Bigram Flow',
    cardinality: 'single',
    canDuplicate: true,
    configCodec: {
      version: 2,
      defaults: { source: 'actual' },
      decode(raw, savedVersion) {
        const source = typeof raw === 'object' && raw !== null
          ? raw as Record<string, unknown>
          : {};
        if (savedVersion === 1 && source.legacySource === 'within-hand') {
          return { source: 'within-hand' };
        }
        if (savedVersion === 2 && source.source === 'within-hand') {
          return { source: 'within-hand' };
        }
        return { source: 'actual' };
      },
    },
  };
  const definitions = new Map<AnalysisViewType, AnalysisViewDefinition>([
    ['bigram-flow', definition as AnalysisViewDefinition],
  ]);

  assert.deepEqual(
    decodeViewInstance({
      id: 'opaque-1',
      type: 'bigram-flow',
      binding: { kind: 'layout', mode: 'ja', id: 'shingeta' },
      config: { legacySource: 'within-hand' },
      configVersion: 1,
    }, definitions),
    {
      id: 'opaque-1',
      type: 'bigram-flow',
      binding: { kind: 'layout', mode: 'ja', id: 'shingeta' },
      config: { source: 'within-hand' },
      configVersion: 2,
    },
  );

  assert.equal(
    decodeViewInstance({
      id: 'opaque-2',
      type: 'removed-view',
      binding: { kind: 'focused-layout' },
      config: {},
      configVersion: 1,
    }, definitions),
    undefined,
  );
});


test('View config version distinguishes migration from current corruption and rejects future versions', () => {
  const definition: AnalysisViewDefinition<{ value: string }> = {
    type: 'heatmap',
    title: 'Heatmap',
    cardinality: 'single',
    canDuplicate: true,
    configCodec: {
      version: 2,
      defaults: { value: 'default' },
      decode(raw, savedVersion) {
        const source = typeof raw === 'object' && raw !== null
          ? raw as Record<string, unknown>
          : {};
        if (savedVersion === 1 && typeof source.oldValue === 'string') {
          return { value: source.oldValue };
        }
        if (savedVersion === 2 && typeof source.value === 'string') {
          return { value: source.value };
        }
        return { value: 'default' };
      },
    },
  };
  const definitions = new Map<AnalysisViewType, AnalysisViewDefinition>([
    ['heatmap', definition as AnalysisViewDefinition],
  ]);
  const base = {
    id: 'heat-1',
    type: 'heatmap',
    binding: { kind: 'focused-layout' },
  };

  assert.equal(
    (decodeViewInstance({
      ...base,
      config: { oldValue: 'migrated' },
      configVersion: 1,
    }, definitions)?.config as { value: string }).value,
    'migrated',
  );
  assert.equal(
    (decodeViewInstance({
      ...base,
      config: { oldValue: 'must-not-be-v2-migration' },
      configVersion: 2,
    }, definitions)?.config as { value: string }).value,
    'default',
  );
  assert.equal(
    decodeViewInstance({
      ...base,
      config: { value: 'future' },
      configVersion: 3,
    }, definitions),
    undefined,
  );
});


test('binding resolver never exposes a selected/focused layout absent from the current mode catalog', () => {
  const invalid = session({
    mode: 'en',
    selectedLayoutIds: ['shingeta'],
    focusLayoutId: 'shingeta',
  });
  assert.deepEqual(
    resolveViewBinding(invalid, 'single', { kind: 'focused-layout' }),
    { status: 'unavailable', reason: 'deleted' },
  );
  assert.deepEqual(
    resolveViewBinding(invalid, 'set', { kind: 'session' }),
    { status: 'unavailable', reason: 'deleted' },
  );
});
