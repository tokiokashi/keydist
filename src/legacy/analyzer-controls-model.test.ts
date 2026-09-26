import assert from 'node:assert/strict';
import test from 'node:test';
import { createAnalyzerControlsModel } from '#legacy/analyzer-controls-model.ts';

test('remaining controls model keeps catalog/status ephemeral and deduplicates catalog writes', () => {
  const model = createAnalyzerControlsModel();
  let notifications = 0;
  model.subscribe(() => { notifications += 1; });

  const layouts = {
    en: [{ id: 'qwerty', name: 'QWERTY', isRomaji: false, isUser: false, slot: 0 }],
    ja: [{ id: 'jis', name: 'JIS', isRomaji: true, isUser: false, slot: 0 }],
  };
  const geometries = [{ value: 'row-staggered' as const, label: 'ロウスタッガード' }];

  model.setCatalog(layouts, geometries, '現在: preset');
  assert.equal(notifications, 1);
  assert.equal(model.getSnapshot().revision, 1);

  model.setCatalog(layouts, geometries, '現在: preset');
  assert.equal(notifications, 1);

  model.setGeometryStatus('保存した');
  assert.equal(notifications, 2);
  assert.equal(model.getSnapshot().geometryStatus, '保存した');

  model.setCatalog(layouts, geometries, '現在: custom');
  assert.equal(model.getSnapshot().geometryStatus, '保存した');
  assert.equal(model.getSnapshot().geometrySummary, '現在: custom');
});
