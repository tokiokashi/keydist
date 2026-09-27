import assert from 'node:assert/strict';
import test from 'node:test';
import { LAYOUT_BY_ID } from '#input/layouts/index.ts';
import { PHYSICAL_SHAPES, type PhysicalShape } from '#input/shapes/geometry.ts';
import type { Setup } from '#input/setup/index.ts';
import { sampleText } from '#input/text/samples.ts';
import { defineSetAnalyzer, defineSingleAnalyzer, type SetAnalyzerDefinition, type SingleAnalyzerDefinition } from '#analyzers/contract.ts';
import { defineOptions } from '#analyzers/options.ts';
import { resolveEngineInput } from './resolved-input.ts';
import { createEngineCache } from './cache.ts';
import { EMPTY_SETTINGS_OVERRIDES } from './settings-items.ts';
import { createExtractRequest, createInterpretationRequest, createSetExtractRequest, createTraceRequest } from './engine-requests.ts';
import type { ExtractionRequestState, InterpretationRequestState } from './engine-requests.ts';

// 実際の`EngineCache` + `resolveEngineInput`を使った、依頼と購読APIの結線テスト。
// 個々の状態遷移の網羅は`request.test.ts`側が担う。ここでは「本物のcompute関数を
// 通しても同じ形で動く」ことと、engine層らしい2ケース（Trace単体の依頼、cache共有）を見る。

const CATALOG = {
  layouts: LAYOUT_BY_ID,
  shapes: new Map<string, PhysicalShape>(Object.values(PHYSICAL_SHAPES).map((shape) => [shape.id, shape])),
};

function resolveFor(id: string, text: string) {
  const setup: Setup = { id, layoutId: 'qwerty', shapeId: 'row-staggered', colorIndex: 0 };
  return resolveEngineInput({
    setup,
    catalog: CATALOG,
    userLayouts: new Map(),
    overrides: EMPTY_SETTINGS_OVERRIDES,
    text,
    language: 'en',
  });
}

test('createInterpretationRequest: 実物のEngineCacheを通してもreadyまで届く', async () => {
  const cache = createEngineCache();
  const states: InterpretationRequestState[] = [];
  const channel = createInterpretationRequest(cache, (s) => states.push(s));

  channel.request(resolveFor('a', sampleText('en', 'default')));
  await Promise.resolve();
  await Promise.resolve();

  const last = states.at(-1);
  assert.ok(last?.status === 'ready');
  if (last?.status === 'ready') {
    assert.ok(last.value.metrics.totalUnits >= 0);
  }
  channel.unsubscribe();
});

test('createTraceRequest: Trace単体の依頼も同じ形で動く', async () => {
  const cache = createEngineCache();
  const seen: string[] = [];
  const channel = createTraceRequest(cache, (s) => seen.push(s.status));

  channel.request(resolveFor('a', sampleText('en', 'default')));
  await Promise.resolve();
  await Promise.resolve();

  assert.deepEqual(seen, ['computing', 'ready']);
  channel.unsubscribe();
});

test('2つの依頼窓口が同じ中身のSetupを依頼すると、EngineCache側で計算を共有する', async () => {
  const cache = createEngineCache();
  const text = sampleText('en', 'default');
  const readyA: InterpretationRequestState[] = [];
  const readyB: InterpretationRequestState[] = [];
  const channelA = createInterpretationRequest(cache, (s) => readyA.push(s));
  const channelB = createInterpretationRequest(cache, (s) => readyB.push(s));

  // idだけ違う2つのSetup（中身は同じ）。resolved-input.test.ts / cache.test.ts と同じ前提。
  channelA.request(resolveFor('setup-a', text));
  channelB.request(resolveFor('setup-b', text));
  await Promise.resolve();
  await Promise.resolve();

  const lastA = readyA.at(-1);
  const lastB = readyB.at(-1);
  assert.ok(lastA?.status === 'ready' && lastB?.status === 'ready');
  if (lastA?.status === 'ready' && lastB?.status === 'ready') {
    // 中身が同じキーはTrace/解釈を共有するので、同一オブジェクトが返る（cache.test.tsと同じ観点）。
    assert.equal(lastA.value, lastB.value);
  }
  assert.equal(cache.size.interpretation, 1);

  channelA.unsubscribe();
  channelB.unsubscribe();
});

// `SingleAnalyzerDefinition`はブランド付きの型で、`defineSingleAnalyzer`経由でしか作れない
// （#544レビュー対応A）。この2つのフィクスチャはoptionsの中身を使わないので、
// 項目0件の宣言（`defineOptions({})`。`defaultOptions`は`{}`）で足りる。
const emptyOptions = defineOptions({});

// 項目0件の宣言なので`optionsDiscipline`の中身は自明（違反しようが無い）。実際の`extract`を
// 再現する必要も無く、ダミー値を返すだけでよい。
function emptyOptionsDiscipline<Extracted>(dummy: Extracted): {
  readonly sample: typeof emptyOptions.defaultOptions;
  readonly alternates: typeof emptyOptions.defaultOptions;
  readonly extractForTest: (options: typeof emptyOptions.defaultOptions) => Extracted;
} {
  return {
    sample: emptyOptions.defaultOptions,
    alternates: emptyOptions.defaultOptions,
    extractForTest: () => dummy,
  };
}

function createFailingDefinition(): SingleAnalyzerDefinition<typeof emptyOptions.defaultOptions, never> {
  return defineSingleAnalyzer({
    id: 'failing-analyzer',
    options: emptyOptions,
    extract() {
      throw new Error('抽出が失敗した');
    },
    optionsDiscipline: emptyOptionsDiscipline<never>(undefined as never),
  });
}

test('createExtractRequest: 実物のEngineCacheを通してreadyまで届く', async () => {
  const cache = createEngineCache();
  const definition: SingleAnalyzerDefinition<typeof emptyOptions.defaultOptions, number> = defineSingleAnalyzer({
    id: 'total-units',
    options: emptyOptions,
    extract: (context) => context.metrics.totalUnits,
    optionsDiscipline: emptyOptionsDiscipline(0),
  });
  const states: ExtractionRequestState<number>[] = [];
  const channel = createExtractRequest(cache, definition, emptyOptions.defaultOptions, (s) => states.push(s));

  channel.request(resolveFor('a', sampleText('en', 'default')));
  await Promise.resolve();
  await Promise.resolve();

  const last = states.at(-1);
  assert.ok(last?.status === 'ready');
  if (last?.status === 'ready') {
    assert.ok(last.value.extracted >= 0);
  }
  channel.unsubscribe();
});

test('createExtractRequest: extractが例外を投げたらfailed（kind: exception）になる', async () => {
  const cache = createEngineCache();
  const states: ExtractionRequestState<never>[] = [];
  const channel = createExtractRequest(cache, createFailingDefinition(), emptyOptions.defaultOptions, (s) => states.push(s));

  channel.request(resolveFor('a', sampleText('en', 'default')));
  await Promise.resolve();
  await Promise.resolve();

  const last = states.at(-1);
  assert.ok(last?.status === 'failed');
  if (last?.status === 'failed') {
    assert.equal(last.error.kind, 'exception');
  }
  channel.unsubscribe();
});

function createSetTotalUnitsDefinition(): SetAnalyzerDefinition<typeof emptyOptions.defaultOptions, number> {
  return defineSetAnalyzer({
    id: 'set-total-units',
    options: emptyOptions,
    extract: (context) => context.members.reduce((sum, member) => sum + member.metrics.totalUnits, 0),
    optionsDiscipline: emptyOptionsDiscipline(0),
  });
}

test('createSetExtractRequest: 実物のEngineCacheを通してreadyまで届く', async () => {
  const cache = createEngineCache();
  const definition = createSetTotalUnitsDefinition();
  const states: ExtractionRequestState<number>[] = [];
  const channel = createSetExtractRequest(cache, definition, emptyOptions.defaultOptions, (s) => states.push(s));

  channel.request([
    { setupId: 'a', resolution: resolveFor('a', sampleText('en', 'default')) },
    { setupId: 'b', resolution: resolveFor('b', sampleText('en', 'default')) },
  ]);
  await Promise.resolve();
  await Promise.resolve();

  const last = states.at(-1);
  assert.ok(last?.status === 'ready');
  if (last?.status === 'ready') {
    assert.ok(last.value.extracted >= 0);
  }
  channel.unsubscribe();
});

test('createSetExtractRequest: メンバー1件の解決失敗だけでは依頼全体をfailedにしない', async () => {
  const cache = createEngineCache();
  const definition = createSetTotalUnitsDefinition();
  const states: ExtractionRequestState<number>[] = [];
  const channel = createSetExtractRequest(cache, definition, emptyOptions.defaultOptions, (s) => states.push(s));

  const setup = { id: 'missing', layoutId: 'no-such-layout', shapeId: 'row-staggered', colorIndex: 0 };
  const failingResolution = resolveEngineInput({
    setup,
    catalog: CATALOG,
    userLayouts: new Map(),
    overrides: EMPTY_SETTINGS_OVERRIDES,
    text: sampleText('en', 'default'),
    language: 'en',
  });
  assert.equal(failingResolution.ok, false);

  channel.request([
    { setupId: 'a', resolution: resolveFor('a', sampleText('en', 'default')) },
    { setupId: 'missing', resolution: failingResolution },
  ]);
  await Promise.resolve();
  await Promise.resolve();

  const last = states.at(-1);
  assert.ok(last?.status === 'ready', '1メンバーの解決失敗では全体はfailedにならない');
  channel.unsubscribe();
});
