import assert from 'node:assert/strict';
import test from 'node:test';
import { createAnalyzerBigramFlowModel } from '../src/analyzer-bigram-flow-model.ts';
import type { AnalyzerBigramFlowData } from '../src/analyzer-bigram-flow-model.ts';

test('Bigram Flow model publishes Analyzer detail data without persistence', () => {
  const model = createAnalyzerBigramFlowModel();
  let notifications = 0;
  model.subscribe(() => { notifications += 1; });

  const data = {
    layout: { id: 'layout' },
    trace: { strokes: [] },
    geometry: { id: 'geometry' },
  } as unknown as AnalyzerBigramFlowData;

  model.setData(data);
  assert.equal(model.getSnapshot().data, data);
  assert.equal(model.getSnapshot().revision, 1);
  assert.equal(notifications, 1);

  model.clear();
  assert.equal(model.getSnapshot().data, null);
  assert.equal(model.getSnapshot().revision, 2);
  assert.equal(notifications, 2);
});
