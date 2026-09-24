import assert from 'node:assert/strict';
import test from 'node:test';
import { createAnalyzerPlaybackSurfaceModel } from '../src/analyzer-playback-surface-model.ts';

test('Playback surface bridge publishes markup revisions without durable state', () => {
  const model = createAnalyzerPlaybackSurfaceModel();
  let notifications = 0;
  model.subscribe(() => { notifications += 1; });

  model.setHtml('<div>one</div>');
  assert.equal(model.getSnapshot().revision, 1);
  assert.equal(notifications, 1);

  model.setHtml('<div>one</div>');
  assert.equal(model.getSnapshot().revision, 1);
  assert.equal(notifications, 1);

  model.clear();
  assert.equal(model.getSnapshot().html, '');
  assert.equal(model.getSnapshot().revision, 2);
});
