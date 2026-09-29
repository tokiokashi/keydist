import assert from 'node:assert/strict';
import test from 'node:test';
import { LAYOUT_BY_ID } from '#input/layouts/index.ts';
import { PHYSICAL_SHAPES, type PhysicalShape } from '#input/shapes/geometry.ts';
import type { AnalysisTarget, Setup } from '#input/setup/index.ts';
import { createEngineCache } from '#engine/cache.ts';
import { EMPTY_SETTINGS_OVERRIDES } from '#engine/settings-items.ts';
import { resolveEngineInput } from '#engine/resolved-input.ts';
import type { ExtractionRequestState } from '#engine/engine-requests.ts';
import type { EngineScheduler } from '#engine/scheduler.ts';
import type { EngineSetMemberInput } from '#engine/request.ts';
import { comparisonDefinition, type ComparisonExtracted } from '#analyzers/comparison/extract.ts';
import { DEFAULT_COMPARISON_OPTIONS, type ComparisonOptions } from '#analyzers/comparison/options.ts';
import {
  closeAnalyzerSetPaneChannels,
  syncAnalyzerSetPaneChannels,
  type AnalyzerSetPaneChannels,
} from './analyzer-set-channels.ts';

/** `request.test.ts`と同じ、flush()するまで実行しない決定的なスケジューラ。 */
function createManualScheduler(): EngineScheduler & { flush(): void } {
  let queue: Array<{ cancelled: boolean; task: () => void }> = [];
  return {
    schedule(task) {
      const entry = { cancelled: false, task };
      queue.push(entry);
      return () => { entry.cancelled = true; };
    },
    flush() {
      const toRun = queue;
      queue = [];
      for (const entry of toRun) if (!entry.cancelled) entry.task();
    },
  };
}

const CATALOG = {
  layouts: LAYOUT_BY_ID,
  shapes: new Map<string, PhysicalShape>(Object.values(PHYSICAL_SHAPES).map((shape) => [shape.id, shape])),
};

function memberFor(setupId: string, layoutId: string): EngineSetMemberInput {
  const setup: Setup = { id: setupId, layoutId, shapeId: 'row-staggered' };
  const target: AnalysisTarget = { kind: 'setup', setupId: setup.id };
  const resolution = resolveEngineInput({
    target,
    setups: new Map([[setup.id, setup]]),
    catalog: CATALOG,
    userLayouts: new Map(),
    overrides: EMPTY_SETTINGS_OVERRIDES,
    text: 'hello world',
    language: 'en',
  });
  assert.ok(resolution.ok);
  return { target, resolution };
}

test('syncAnalyzerSetPaneChannels: optionsが同じ参照なら同じ抽出チャンネルを使い続ける', () => {
  const scheduler = createManualScheduler();
  const cache = createEngineCache();
  const members = [memberFor('a', 'qwerty'), memberFor('b', 'dvorak')];
  const states: ExtractionRequestState<ComparisonExtracted>[] = [];
  const options: ComparisonOptions = DEFAULT_COMPARISON_OPTIONS;

  let channels: AnalyzerSetPaneChannels<ComparisonOptions> | undefined;
  channels = syncAnalyzerSetPaneChannels(channels, {
    cache,
    definition: comparisonDefinition,
    options,
    members,
    onExtraction: (s) => states.push(s),
    requestOptions: { scheduler },
  });
  const firstChannel = channels.extraction;
  scheduler.flush();
  assert.equal(states.at(-1)?.status, 'ready');
  if (states.at(-1)?.status === 'ready') {
    const ready = states.at(-1) as { status: 'ready'; value: { extracted: ComparisonExtracted } };
    assert.equal(ready.value.extracted.rows.length, 2);
  }

  channels = syncAnalyzerSetPaneChannels(channels, {
    cache,
    definition: comparisonDefinition,
    options,
    members,
    onExtraction: (s) => states.push(s),
    requestOptions: { scheduler },
  });
  assert.equal(channels.extraction, firstChannel, 'optionsの参照が同じならチャンネルを使い回す');
  closeAnalyzerSetPaneChannels(channels);
});

test('syncAnalyzerSetPaneChannels: optionsの参照が変わると抽出チャンネルを作り直す', () => {
  const scheduler = createManualScheduler();
  const cache = createEngineCache();
  const members = [memberFor('a', 'qwerty')];
  const states: ExtractionRequestState<ComparisonExtracted>[] = [];

  let channels: AnalyzerSetPaneChannels<ComparisonOptions> | undefined;
  channels = syncAnalyzerSetPaneChannels(channels, {
    cache,
    definition: comparisonDefinition,
    options: DEFAULT_COMPARISON_OPTIONS,
    members,
    onExtraction: (s) => states.push(s),
    requestOptions: { scheduler },
  });
  const firstChannel = channels.extraction;

  const nextOptions: ComparisonOptions = { ...DEFAULT_COMPARISON_OPTIONS, showBaselineRatio: false };
  channels = syncAnalyzerSetPaneChannels(channels, {
    cache,
    definition: comparisonDefinition,
    options: nextOptions,
    members,
    onExtraction: (s) => states.push(s),
    requestOptions: { scheduler },
  });
  assert.notEqual(channels.extraction, firstChannel);
  closeAnalyzerSetPaneChannels(channels);
});

test('syncAnalyzerSetPaneChannels: 一部メンバーが解決に失敗しても、依頼はfailedにならない', () => {
  const scheduler = createManualScheduler();
  const cache = createEngineCache();
  const okMember = memberFor('a', 'qwerty');
  const missingTarget: AnalysisTarget = { kind: 'setup', setupId: 'missing' };
  const failingMember: EngineSetMemberInput = {
    target: missingTarget,
    resolution: { ok: false, error: { kind: 'target-missing', target: missingTarget } },
  };
  const states: ExtractionRequestState<ComparisonExtracted>[] = [];

  let channels: AnalyzerSetPaneChannels<ComparisonOptions> | undefined;
  channels = syncAnalyzerSetPaneChannels(channels, {
    cache,
    definition: comparisonDefinition,
    options: DEFAULT_COMPARISON_OPTIONS,
    members: [okMember, failingMember],
    onExtraction: (s) => states.push(s),
    requestOptions: { scheduler },
  });
  scheduler.flush();
  const last = states.at(-1);
  assert.equal(last?.status, 'ready');
  if (last?.status === 'ready') {
    const rows = last.value.extracted.rows;
    assert.deepEqual(rows.map((row) => row.targetKey).sort(), ['setup:a', 'setup:missing']);
    assert.equal(rows.find((row) => row.targetKey === 'setup:missing')?.kind, 'failed');
  }
  closeAnalyzerSetPaneChannels(channels);
});
