import assert from 'node:assert/strict';
import test from 'node:test';
import { emptyCascadeOverrides } from '#input/settings/index.ts';
import { exportedText, importEntryText, importSummaryText, userAssetsFileName } from './user-assets-file-text.ts';

const NO_SETUPS = { setups: [], overrides: emptyCascadeOverrides() };

test('ファイル名は日付を入れる', () => {
  assert.equal(userAssetsFileName(new Date(2026, 0, 5)), 'keydist-自作の資産-2026-01-05.json');
});

test('書き出しの文は、0件の種類を出さない', () => {
  const layout = { kind: 'alpha' as const, id: 'a', name: 'A', rows: ['', '', '', ''] as [string, string, string, string], romaji: 'kunrei' };
  assert.equal(exportedText({ userLayouts: [layout], userRomajiRules: [], fingerAssignments: [], setupLibrary: NO_SETUPS }), '配列1件を書き出しました');
  assert.equal(
    exportedText({
      userLayouts: [layout, { ...layout, id: 'b' }],
      userRomajiRules: [{ id: 'r', name: 'R', base: 'kunrei', overrides: {}, generateSokuon: true }],
      fingerAssignments: [],
      setupLibrary: NO_SETUPS,
    }),
    '配列2件、ローマ字規則1件を書き出しました',
  );
});

test('読み込みの行: 足した・別名で足した・足さなかった（名前が違う時は手元の名前を添える）', () => {
  assert.equal(importEntryText({ assetKind: 'layout', name: 'A', outcome: { kind: 'added' } }), '配列「A」を足しました');
  assert.equal(
    importEntryText({
      assetKind: 'romaji-rule',
      name: 'R',
      outcome: { kind: 'added-renamed', addedName: 'R (2)', addedId: 'x', overlap: { with: 'own', name: '手元の名前' } },
    }),
    'ローマ字規則「R」は、手元の「手元の名前」と重なり中身が違うため、「R (2)」として足しました',
  );
  assert.equal(
    importEntryText({
      assetKind: 'layout',
      name: 'A',
      outcome: { kind: 'added-renamed', addedName: 'A (2)', addedId: 'x', overlap: { with: 'builtin', name: 'QWERTY' } },
    }),
    '組み込みの配列「QWERTY」と重なるため、配列「A (2)」として足しました',
  );
  assert.equal(
    importEntryText({ assetKind: 'finger-assignment', name: 'F', outcome: { kind: 'skipped-same', existingName: 'F' } }),
    '指の割り当て「F」は、手元と同じ中身なので足しませんでした',
  );
  assert.equal(
    importEntryText({ assetKind: 'layout', name: 'A', outcome: { kind: 'skipped-same', existingName: '手元' } }),
    '配列「A」は、手元の「手元」と同じ中身なので足しませんでした',
  );
});

test('読み込みの見出し: 足した件数と足さなかった件数', () => {
  const added = { assetKind: 'layout', name: 'A', outcome: { kind: 'added' } } as const;
  const skipped = { assetKind: 'layout', name: 'B', outcome: { kind: 'skipped-same', existingName: 'B' } } as const;
  assert.equal(importSummaryText([added]), '1件を足しました');
  assert.equal(importSummaryText([added, skipped]), '1件を足しました。1件は手元と同じ中身なので足しませんでした');
  assert.equal(importSummaryText([skipped]), '手元と同じ中身なので、足したものはありません（1件）');
});

test('Setupの行と書き出しの文', () => {
  assert.equal(
    exportedText({
      userLayouts: [],
      userRomajiRules: [],
      fingerAssignments: [],
      setupLibrary: { setups: [{ id: 's', number: 1, layoutId: 'qwerty', shapeId: 'row-staggered' }], overrides: {} },
    }),
    'Setup1件を書き出しました',
  );
  assert.equal(
    importEntryText({
      assetKind: 'setup',
      name: '練習用',
      outcome: { kind: 'added-renamed', addedName: '練習用', addedId: 'x', overlap: { with: 'own', name: '手元' } },
    }),
    'Setup「練習用」は、手元の別のSetupと重なり中身が違うため、新しいSetupとして足しました',
  );
  assert.equal(
    importEntryText({ assetKind: 'setup', name: '練習用', outcome: { kind: 'skipped-same', existingName: '手元' } }),
    'Setup「練習用」は、手元の「手元」と同じ中身なので足しませんでした',
  );
});
