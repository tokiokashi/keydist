import assert from 'node:assert/strict';
import test from 'node:test';
import { LAYOUT_BY_ID } from '#input/layouts/index.ts';
import { PHYSICAL_SHAPES, type PhysicalShape } from '#input/shapes/geometry.ts';
import type { Setup } from '#input/setup/index.ts';
import { sampleText } from '#input/text/samples.ts';
import { resolveEngineInput } from './resolved-input.ts';
import { createEngineCache } from './cache.ts';
import { EMPTY_SETTINGS_OVERRIDES } from './settings-items.ts';
import { createInterpretationRequest, createTraceRequest } from './engine-requests.ts';
import type { InterpretationRequestState } from './engine-requests.ts';

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
