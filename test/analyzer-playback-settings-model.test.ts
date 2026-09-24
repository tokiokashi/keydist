import assert from 'node:assert/strict';
import test from 'node:test';
import { createAnalyzerPlaybackSettingsModel } from '../src/analyzer-playback-settings-model.ts';

test('Playback settings bridge keeps only ephemeral markup', () => {
  const model = createAnalyzerPlaybackSettingsModel();
  let notifications = 0;
  model.subscribe(() => { notifications += 1; });

  model.setHtml('<form>settings</form>');
  assert.equal(model.getSnapshot().revision, 1);
  assert.equal(notifications, 1);

  model.setHtml('<form>settings</form>');
  assert.equal(notifications, 1);

  model.clear();
  assert.equal(model.getSnapshot().html, '');
  assert.equal(model.getSnapshot().revision, 2);
});
