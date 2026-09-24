import assert from 'node:assert/strict';
import test from 'node:test';
import { createAnalyzerLayoutEditorModel } from '../src/analyzer-layout-editor-model.ts';

test('Layout editor model publishes romaji rules only when they change', () => {
  const model = createAnalyzerLayoutEditorModel([{ id: 'kunrei', name: '訓令式' }]);
  let notifications = 0;
  model.subscribe(() => { notifications += 1; });

  model.setRomajiRules([{ id: 'kunrei', name: '訓令式' }]);
  assert.equal(notifications, 0);

  model.setRomajiRules([
    { id: 'kunrei', name: '訓令式' },
    { id: 'custom-1', name: 'Custom' },
  ]);
  assert.equal(notifications, 1);
  assert.equal(model.getSnapshot().romajiRules[1]?.id, 'custom-1');
});
