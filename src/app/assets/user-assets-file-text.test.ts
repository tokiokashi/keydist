import assert from 'node:assert/strict';
import test from 'node:test';
import { exportedText, importEntryText, importSummaryText, userAssetsFileName } from './user-assets-file-text.ts';

test('ファイル名は日付を入れる', () => {
  assert.equal(userAssetsFileName(new Date(2026, 0, 5)), 'keydist-自作の資産-2026-01-05.json');
});

test('書き出しの文は、0件の種類を出さない', () => {
  const layout = { id: 'a', name: 'A', rows: ['', '', '', ''] as [string, string, string, string], romaji: 'kunrei' };
  assert.equal(exportedText({ userLayouts: [layout], userRomajiRules: [], fingerAssignments: [] }), '配列1件を書き出した');
  assert.equal(
    exportedText({ userLayouts: [layout, { ...layout, id: 'b' }], userRomajiRules: [{ id: 'r', name: 'R', base: 'kunrei', overrides: {}, generateSokuon: true }], fingerAssignments: [] }),
    '配列2件、ローマ字規則1件を書き出した',
  );
});

test('読み込みの行: 足した・別名で足した・足さなかった（名前が違う時は手元の名前を添える）', () => {
  assert.equal(importEntryText({ assetKind: 'layout', name: 'A', outcome: { kind: 'added' } }), '配列「A」を足した');
  assert.equal(
    importEntryText({ assetKind: 'romaji-rule', name: 'R', outcome: { kind: 'added-renamed', addedName: 'R (2)', addedId: 'x', overlap: { with: 'own', name: '手元の名前' } } }),
    'ローマ字規則「R」は、手元の「手元の名前」と重なり中身が違うため、「R (2)」として足した',
  );
  assert.equal(
    importEntryText({ assetKind: 'layout', name: 'A', outcome: { kind: 'added-renamed', addedName: 'A (2)', addedId: 'x', overlap: { with: 'builtin', name: 'QWERTY' } } }),
    '組み込みの配列「QWERTY」と重なるため、配列「A (2)」として足した',
  );
  assert.equal(
    importEntryText({ assetKind: 'finger-assignment', name: 'F', outcome: { kind: 'skipped-same', existingName: 'F' } }),
    '指の割り当て「F」は、手元と同じ中身なので足さなかった',
  );
  assert.equal(
    importEntryText({ assetKind: 'layout', name: 'A', outcome: { kind: 'skipped-same', existingName: '手元' } }),
    '配列「A」は、手元の「手元」と同じ中身なので足さなかった',
  );
});

test('読み込みの見出し: 足した件数と足さなかった件数', () => {
  const added = { assetKind: 'layout', name: 'A', outcome: { kind: 'added' } } as const;
  const skipped = { assetKind: 'layout', name: 'B', outcome: { kind: 'skipped-same', existingName: 'B' } } as const;
  assert.equal(importSummaryText([added]), '1件を足した');
  assert.equal(importSummaryText([added, skipped]), '1件を足した。1件は手元と同じ中身なので足さなかった');
  assert.equal(importSummaryText([skipped]), '手元と同じ中身なので、足したものはありません（1件）');
});
