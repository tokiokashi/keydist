import assert from 'node:assert/strict';
import test from 'node:test';
import { LAYOUT_BY_ID } from '#input/layouts/index.ts';
import { PHYSICAL_SHAPES, type PhysicalShape } from '#input/shapes/geometry.ts';
import type { Setup } from '#input/setup/index.ts';
import { createEngineCache } from '#engine/cache.ts';
import { EMPTY_SETTINGS_OVERRIDES } from '#engine/settings-items.ts';
import { resolveEngineInput } from '#engine/resolved-input.ts';
import type { ExtractionRequestState, TraceRequestState } from '#engine/engine-requests.ts';
import type { EngineScheduler } from '#engine/scheduler.ts';
import { bigramFlowDefinition, type BigramFlowExtracted } from '#analyzers/bigram-flow/extract.ts';
import { DEFAULT_BIGRAM_FLOW_OPTIONS, type BigramFlowOptions } from '#analyzers/bigram-flow/options.ts';
import { closeAnalyzerPaneChannels, syncAnalyzerPaneChannels, type AnalyzerPaneChannels } from './analyzer-channels.ts';

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

function resolutionFor(layoutId: string) {
  const setup: Setup = { id: 'setup-1', layoutId, shapeId: 'row-staggered', colorIndex: 0 };
  const result = resolveEngineInput({
    setup,
    catalog: CATALOG,
    userLayouts: new Map(),
    overrides: EMPTY_SETTINGS_OVERRIDES,
    text: 'あいうえお',
    language: 'ja',
  });
  assert.ok(result.ok);
  return result;
}

test('syncAnalyzerPaneChannels: optionsが同じ参照なら同じ抽出チャンネルを使い続ける', () => {
  const scheduler = createManualScheduler();
  const cache = createEngineCache();
  const resolution = resolutionFor('qwerty');
  const extractionStates: ExtractionRequestState<BigramFlowExtracted>[] = [];
  const traceStates: TraceRequestState[] = [];
  const options: BigramFlowOptions = DEFAULT_BIGRAM_FLOW_OPTIONS;

  let channels: AnalyzerPaneChannels<BigramFlowOptions> | undefined;
  channels = syncAnalyzerPaneChannels(channels, {
    cache,
    definition: bigramFlowDefinition,
    options,
    resolution,
    onExtraction: (s) => extractionStates.push(s),
    onTrace: (s) => traceStates.push(s),
    requestOptions: { scheduler },
  });
  const firstExtractionChannel = channels.extraction;
  scheduler.flush();
  assert.equal(extractionStates.at(-1)?.status, 'ready');

  // 同じoptions参照のまま、resolutionだけ渡し直す（例: テキストが再判定されたが
  // 中身は同じだった等）。抽出チャンネルは作り直さない。
  channels = syncAnalyzerPaneChannels(channels, {
    cache,
    definition: bigramFlowDefinition,
    options,
    resolution,
    onExtraction: (s) => extractionStates.push(s),
    onTrace: (s) => traceStates.push(s),
    requestOptions: { scheduler },
  });
  assert.equal(channels.extraction, firstExtractionChannel);

  closeAnalyzerPaneChannels(channels);
});

test('syncAnalyzerPaneChannels: 見た目だけの解析設定を変えてもdefinition.extractは再実行されない', () => {
  const scheduler = createManualScheduler();
  const cache = createEngineCache();
  const resolution = resolutionFor('qwerty');

  let extractCallCount = 0;
  const countingDefinition = {
    ...bigramFlowDefinition,
    extract(context: Parameters<typeof bigramFlowDefinition.extract>[0]) {
      extractCallCount += 1;
      return bigramFlowDefinition.extract(context);
    },
  };

  let channels: AnalyzerPaneChannels<BigramFlowOptions> | undefined;
  const request = (options: BigramFlowOptions) => {
    channels = syncAnalyzerPaneChannels(channels, {
      cache,
      definition: countingDefinition,
      options,
      resolution,
      onExtraction: () => {},
      onTrace: () => {},
      requestOptions: { scheduler },
    });
    scheduler.flush();
  };

  request(DEFAULT_BIGRAM_FLOW_OPTIONS);
  assert.equal(extractCallCount, 1);

  // lineScaleは見た目だけの設定（`bigramFlowExtractKeyOf`に含まれない。definition.tsxの
  // コメント参照）。optionsオブジェクトの参照は変わる（チャンネルは作り直す）が、
  // extractKeyOfが同じ値を返すのでEngineCacheがヒットし、extractは呼ばれない。
  request({ ...DEFAULT_BIGRAM_FLOW_OPTIONS, lineScale: 'log' });
  assert.equal(extractCallCount, 1, '見た目だけの変更でextractが再実行された');
  assert.notEqual(channels?.extraction, undefined);

  // sourceは抽出に効く設定（extractKeyOfに含まれる）。今度こそ再実行される。
  request({ ...DEFAULT_BIGRAM_FLOW_OPTIONS, source: 'within-hand' });
  assert.equal(extractCallCount, 2, '抽出に効く変更なのにextractが再実行されなかった');

  closeAnalyzerPaneChannels(channels);
});
