import assert from 'node:assert/strict';
import test from 'node:test';
import { recordBaseTrace, recordRangeStatuses } from '#engine/keystroke-record.ts';
import { EMPTY_SETTINGS_OVERRIDES } from '#engine/settings-items.ts';
import { resolveEngineInput } from '#engine/resolved-input.ts';
import { LAYOUT_BY_ID } from '#input/layouts/index.ts';
import { PHYSICAL_SHAPES } from '#input/shapes/geometry.ts';
import type { Setup } from '#input/setup/index.ts';
import { SAMPLE_TEXT_JA } from '../../../test/kana-sample-text.ts';
import { mapWithKanjiDirectTables } from '../../../test/kanji-direct-tables.ts';
import { createWorkerComputer, type WorkerLike } from './record-computer.ts';
import { createRecordHandler } from './record-handler.ts';
import type { RecordWorkerRequest, RecordWorkerResponse } from './record-worker-protocol.ts';

/** メッセージをブラウザと同じ構造化複製に通して、記録の計算の入口へ渡す偽のWorker。 */
function createFakeWorker() {
  const handle = createRecordHandler();
  let terminated = false;
  const worker: WorkerLike = {
    onmessage: null,
    onerror: null,
    postMessage(message: RecordWorkerRequest) {
      const request = structuredClone(message);
      setImmediate(() => {
        if (terminated) return;
        const response: RecordWorkerResponse = structuredClone(handle(request));
        worker.onmessage?.({ data: response });
      });
    },
    terminate() {
      terminated = true;
    },
  };
  return { worker, isTerminated: () => terminated };
}

const KANA_SAMPLE = SAMPLE_TEXT_JA.replace(/\s+/g, '');

test('表から作った配列の記録は、Workerが止まって立て直した後も、表を送り直して計算結果が一致する', async () => {
  const layouts = mapWithKanjiDirectTables(LAYOUT_BY_ID);
  const setup: Setup = {
    id: 'setup-tcode',
    number: 1,
    layoutId: 'tcode',
    shapeId: 'row-staggered',
  };
  const resolution = resolveEngineInput({
    target: { kind: 'setup', setupId: setup.id },
    setups: new Map([[setup.id, setup]]),
    catalog: {
      layouts,
      shapes: new Map(Object.values(PHYSICAL_SHAPES).map((shape) => [shape.id, shape])),
    },
    userLayouts: new Map(),
    overrides: EMPTY_SETTINGS_OVERRIDES,
    text: KANA_SAMPLE,
    language: 'ja',
  });
  assert.ok(resolution.ok);
  const input = resolution.input;
  const expected = recordRangeStatuses(input, recordBaseTrace(input));

  const workers: Array<ReturnType<typeof createFakeWorker>> = [];
  const computer = createWorkerComputer(() => {
    const fake = createFakeWorker();
    workers.push(fake);
    return fake.worker;
  });
  assert.deepStrictEqual((await computer.ranges(input)).statuses, expected);
  assert.deepStrictEqual((await computer.ranges(input)).statuses, expected, '2度目は識別子だけで同じ結果になる');
  assert.equal(workers.length, 1);

  // Workerが止まったら、次の依頼で作り直す。新しいWorkerは配列を持たないので、表がもう一度届かなければ計算できない
  const first = workers[0]!;
  first.worker.onerror?.({ message: '止まりました' });
  assert.ok(first.isTerminated());
  assert.deepStrictEqual((await computer.ranges(input)).statuses, expected);
  assert.equal(workers.length, 2);
});
