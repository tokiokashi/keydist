import assert from 'node:assert/strict';
import test from 'node:test';
import { createAnalyzerRomajiDialogModel } from './analyzer-romaji-dialog-model.ts';
import type { RomajiSettings } from '#input/romaji/rules.ts';
import type { UserLayout } from '#input/layouts/user-layouts.ts';

test('romaji dialog model commits rules and assignments without owning DOM state', () => {
  let settings: RomajiSettings = { rules: [], assignments: {} };
  let layouts: UserLayout[] = [{
    id: 'custom-layout',
    name: '自作配列',
    rows: ['', 'qwertyuiop', 'asdfghjkl', 'zxcvbnm'],
    romaji: 'kunrei',
  }];
  let rulesChanged = false;
  let applied = 0;

  const model = createAnalyzerRomajiDialogModel({
    getRomajiSettings: () => settings,
    getUserLayouts: () => layouts,
    commitRomajiSettings(next, changed) {
      settings = next;
      rulesChanged = changed;
    },
    commitUserLayouts(next) {
      layouts = next;
    },
    onApplied() {
      applied += 1;
    },
  });

  model.saveRule({
    id: 'custom-test',
    name: 'テスト',
    base: 'kunrei',
    overrides: { し: 'shi' },
    generateSokuon: true,
  });
  assert.equal(settings.rules[0]?.id, 'custom-test');
  assert.equal(rulesChanged, true);
  assert.equal(model.getSnapshot().settings.rules[0]?.overrides.し, 'shi');

  model.setBuiltinAssignment('jis', 'custom-test');
  assert.equal(settings.assignments.jis, 'custom-test');
  assert.equal(rulesChanged, false);

  model.setUserAssignment('custom-layout', 'custom-test');
  assert.equal(layouts[0]?.romaji, 'custom-test');
  assert.equal(model.getSnapshot().userLayouts[0]?.romaji, 'custom-test');
  assert.equal(applied, 3);

  const beforeRefresh = model.getSnapshot().refreshRevision;
  model.refresh();
  assert.equal(model.getSnapshot().refreshRevision, beforeRefresh + 1);
});
