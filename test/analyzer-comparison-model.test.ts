import assert from 'node:assert/strict';
import test from 'node:test';
import { createAnalyzerComparisonModel } from '../src/analyzer-comparison-model.ts';

test('comparison model only notifies when option content changes', () => {
  const model = createAnalyzerComparisonModel();
  let notifications = 0;
  const unsubscribe = model.subscribe(() => { notifications += 1; });

  model.setOptions(
    [{ value: '', label: '比較なし' }],
    [{ value: '1', label: '距離' }],
  );
  assert.equal(notifications, 1);

  model.setOptions(
    [{ value: '', label: '比較なし' }],
    [{ value: '1', label: '距離' }],
  );
  assert.equal(notifications, 1);

  model.setOptions(
    [{ value: '', label: '比較なし' }, { value: 'layout-a', label: 'A' }],
    [{ value: '1', label: '距離' }],
  );
  assert.equal(notifications, 2);
  assert.equal(model.getSnapshot().baselineOptions[1]?.value, 'layout-a');

  unsubscribe();
});
