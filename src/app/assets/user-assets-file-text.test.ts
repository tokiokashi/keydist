import assert from 'node:assert/strict';
import test from 'node:test';
import { EMPTY_PERSONAL_SPEED } from '#interpretation/timing/calibration-codec.ts';
import { emptyCascadeOverrides } from '#input/settings/index.ts';
import { exportedText, importEntryText, importSummaryText, userAssetsFileName } from './user-assets-file-text.ts';

const NO_SETUPS = { setups: [], overrides: emptyCascadeOverrides() };
const NO_EXTRAS = { presetLibrary: { presets: [] }, workspaces: [], personalSpeed: EMPTY_PERSONAL_SPEED, standaloneAnalyzerOptions: {} };

test('ファイル名は日付を入れる', () => {
  assert.equal(userAssetsFileName(new Date(2026, 0, 5)), 'keydist-自作の資産-2026-01-05.json');
});

test('書き出しの文は、0件の種類を出さない', () => {
  const layout = { kind: 'alpha' as const, id: 'a', name: 'A', rows: ['', '', '', ''] as [string, string, string, string], romaji: 'kunrei' };
  const one = exportedText({
    userLayouts: [layout],
    userRomajiRules: [],
    fingerAssignments: [],
    setupLibrary: NO_SETUPS,
    textLibrary: { texts: [] },
    ...NO_EXTRAS,
  });
  assert.ok(one.includes('配列1件') && !one.includes('ローマ字規則'));
  const two = exportedText({
    userLayouts: [layout, { ...layout, id: 'b' }],
    userRomajiRules: [{ id: 'r', name: 'R', base: 'kunrei', overrides: {}, generateSokuon: true }],
    fingerAssignments: [],
    setupLibrary: NO_SETUPS,
    textLibrary: { texts: [] },
    ...NO_EXTRAS,
  });
  assert.ok(two.includes('配列2件') && two.includes('ローマ字規則1件'));
});

test('読み込みの行: 足した・別名で足した・足さなかった（名前が違う時は手元の名前を添える）', () => {
  assert.ok(importEntryText({ assetKind: 'layout', name: 'A', outcome: { kind: 'added' } }).includes('「A」'));
  const ownOverlap = importEntryText({
    assetKind: 'romaji-rule',
    name: 'R',
    outcome: { kind: 'added-renamed', addedName: 'R (2)', addedId: 'x', overlap: { with: 'own', name: '手元の名前' } },
  });
  assert.ok(ownOverlap.includes('「R (2)」') && ownOverlap.includes('「手元の名前」'));
  const builtinOverlap = importEntryText({
    assetKind: 'layout',
    name: 'A',
    outcome: { kind: 'added-renamed', addedName: 'A (2)', addedId: 'x', overlap: { with: 'builtin', name: 'QWERTY' } },
  });
  assert.ok(builtinOverlap.includes('「QWERTY」') && builtinOverlap.includes('「A (2)」'));
  assert.ok(importEntryText({ assetKind: 'finger-assignment', name: 'F', outcome: { kind: 'skipped-same', existingName: 'F' } }).includes('「F」'));
  const skippedOwn = importEntryText({ assetKind: 'layout', name: 'A', outcome: { kind: 'skipped-same', existingName: '手元' } });
  assert.ok(skippedOwn.includes('「A」') && skippedOwn.includes('「手元」'));
});

test('読み込みの見出し: 足した件数と足さなかった件数', () => {
  const added = { assetKind: 'layout', name: 'A', outcome: { kind: 'added' } } as const;
  const skipped = { assetKind: 'layout', name: 'B', outcome: { kind: 'skipped-same', existingName: 'B' } } as const;
  assert.ok(importSummaryText([added]).includes('1件'));
  const both = importSummaryText([added, skipped]);
  assert.equal(both.match(/1件/g)?.length, 2);
  assert.ok(importSummaryText([skipped]).includes('1件'));
});

test('Setupの行と書き出しの文', () => {
  assert.ok(
    exportedText({
      userLayouts: [],
      userRomajiRules: [],
      fingerAssignments: [],
      setupLibrary: { setups: [{ id: 's', number: 1, layoutId: 'qwerty', shapeId: 'row-staggered' }], overrides: {} },
      textLibrary: { texts: [] },
      ...NO_EXTRAS,
    }).includes('Setup1件'),
  );
  assert.ok(
    importEntryText({
      assetKind: 'setup',
      name: '練習用',
      outcome: { kind: 'added-renamed', addedName: '練習用', addedId: 'x', overlap: { with: 'own', name: '手元' } },
    }).includes('「練習用」'),
  );
  const skipped = importEntryText({ assetKind: 'setup', name: '練習用', outcome: { kind: 'skipped-same', existingName: '手元' } });
  assert.ok(skipped.includes('「練習用」') && skipped.includes('「手元」'));
});
