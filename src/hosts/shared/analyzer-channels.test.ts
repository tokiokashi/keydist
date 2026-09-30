import assert from 'node:assert/strict';
import test from 'node:test';
import { LAYOUT_BY_ID } from '#input/layouts/index.ts';
import { PHYSICAL_SHAPES, type PhysicalShape } from '#input/shapes/geometry.ts';
import type { Setup } from '#input/setup/index.ts';
import { createEngineCache } from '#engine/cache.ts';
import { EMPTY_SETTINGS_OVERRIDES } from '#engine/settings-items.ts';
import { resolveEngineInput } from '#engine/resolved-input.ts';
import type { ExtractionRequestState, TraceRequestState } from '#engine/engine-requests.ts';
import type { EngineComputer } from '#engine/computer.ts';
import { singleExtractionKeyOf, traceKeyOf } from '#engine/keys.ts';
import type { ResolvedInput } from '#engine/resolved-input.ts';
import type { EngineScheduler } from '#engine/scheduler.ts';
import { bigramFlowDefinition, type BigramFlowExtracted } from '#analyzers/bigram-flow/extract.ts';
import { DEFAULT_BIGRAM_FLOW_OPTIONS, type BigramFlowOptions } from '#analyzers/bigram-flow/options.ts';
import { closeAnalyzerPaneChannels, foldExtractionState, syncAnalyzerPaneChannels, type AnalyzerPaneChannels } from './analyzer-channels.ts';

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
  const setup: Setup = { id: 'setup-1', layoutId, shapeId: 'row-staggered' };
  const result = resolveEngineInput({
    target: { kind: 'setup', setupId: setup.id },
    setups: new Map([[setup.id, setup]]),
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

test('結果を同期に引ける計算機では、解決し直した同じ中身の入力で依頼を出し直さず、計算中も挟まない', () => {
  const scheduler = createManualScheduler();
  const cache = createEngineCache();
  const requested: string[] = [];
  // 計算のたびに記録し、結果は入力の中身のキーで`peek`からも引ける計算機（メインスレッドに結果を写すWorker側の形）
  const remembered = new Map<string, unknown>();
  const traceKey = (input: ResolvedInput) => traceKeyOf(input);
  const extractionKey = (input: ResolvedInput) => singleExtractionKeyOf(input, bigramFlowDefinition.id, bigramFlowDefinition.extractKeyOf(DEFAULT_BIGRAM_FLOW_OPTIONS));
  const computer: EngineComputer = {
    getTrace: (input) => {
      requested.push('trace');
      const result = cache.getTrace(input);
      remembered.set(traceKey(input), result);
      return result;
    },
    getExtraction: (input, definition, options) => {
      requested.push('extraction');
      const result = cache.getExtraction(input, definition, options);
      remembered.set(extractionKey(input), result);
      return result;
    },
    getSetExtraction: (members, definition, options) => cache.getSetExtraction(members, definition, options),
    peekTrace: (input) => remembered.get(traceKey(input)) as never,
    peekExtraction: (input) => remembered.get(extractionKey(input)) as never,
  };
  const extractionStates: ExtractionRequestState<BigramFlowExtracted>[] = [];
  const traceStates: TraceRequestState[] = [];
  const params = (resolution: ReturnType<typeof resolutionFor>) => ({
    cache: computer,
    definition: bigramFlowDefinition,
    options: DEFAULT_BIGRAM_FLOW_OPTIONS,
    resolution,
    onExtraction: (state: ExtractionRequestState<BigramFlowExtracted>) => extractionStates.push(state),
    onTrace: (state: TraceRequestState) => traceStates.push(state),
    requestOptions: { scheduler },
  });

  let channels = syncAnalyzerPaneChannels<BigramFlowOptions, BigramFlowExtracted>(undefined, params(resolutionFor('qwerty')));
  scheduler.flush();
  assert.deepEqual(requested, ['trace', 'extraction']);

  // 参照だけ違う同じ中身の入力（他のペインの選び直しで解決が走り直った時）
  extractionStates.length = 0;
  traceStates.length = 0;
  channels = syncAnalyzerPaneChannels(channels, params(resolutionFor('qwerty')));
  scheduler.flush();
  assert.deepEqual(requested, ['trace', 'extraction'], '計算機へ依頼を出し直した');
  assert.deepEqual(extractionStates.map((s) => s.status), ['ready']);
  assert.deepEqual(traceStates.map((s) => s.status), ['ready']);

  // 中身が違う入力は引けないので、依頼が出て計算中を経る
  extractionStates.length = 0;
  channels = syncAnalyzerPaneChannels(channels, params(resolutionFor('dvorak')));
  scheduler.flush();
  assert.deepEqual(requested, ['trace', 'extraction', 'trace', 'extraction']);
  assert.ok(extractionStates.some((s) => s.status === 'stale'));
  closeAnalyzerPaneChannels(channels);
});

test('foldExtractionState: 直前の結果がある時の computing は stale に置き換え、無ければそのまま', () => {
  type State = Parameters<typeof foldExtractionState<string>>[0];
  const computing = { status: 'computing' } as unknown as State;
  assert.deepEqual(foldExtractionState({ status: 'ready', value: 'a' } as unknown as State, computing), { status: 'stale', value: 'a' });
  assert.deepEqual(foldExtractionState({ status: 'stale', value: 'b' } as unknown as State, computing), { status: 'stale', value: 'b' });
  assert.deepEqual(foldExtractionState({ status: 'idle' } as unknown as State, computing), computing);
  assert.deepEqual(foldExtractionState({ status: 'ready', value: 'a' } as unknown as State, { status: 'ready', value: 'c' } as unknown as State), { status: 'ready', value: 'c' });
});
