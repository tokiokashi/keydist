import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { PresetLibrary } from '#input/presets/index.ts';
import type { SettingsCascadeOverrides, SettingsValueMap } from '#engine/settings-items.ts';
import { conditionItemLabel } from './condition-summary.ts';
import {
  applyResultText,
  changedGlobalItemCount,
  isSavableName,
  presetRows,
  skippedItemsText,
} from './preset-panel.ts';

const LIBRARY: PresetLibrary<SettingsValueMap> = {
  presets: [
    { id: 'a', name: '厳しめ', values: { windowSize: 5, sfbHomeCost: false } },
    { id: 'b', name: '全部既定', values: {} },
    { id: 'c', name: '既定と同じ値を含む', values: { windowSize: 3 } },
  ],
};

test('presetRows: 全体の上書きが流し込み後と同じ行にだけ「今の値と同じ」が付く', () => {
  const overrides: SettingsCascadeOverrides = { global: { windowSize: 5, sfbHomeCost: false } };
  const rows = presetRows(LIBRARY, overrides);
  assert.deepEqual(rows.map((row) => [row.name, row.sameAsCurrent]), [
    ['厳しめ', true],
    ['全部既定', false],
    ['既定と同じ値を含む', false],
  ]);
});

test('presetRows: 上書きが無ければ、空の値と、既定と同じ値だけのプリセットが同じになる', () => {
  const rows = presetRows(LIBRARY, {});
  assert.deepEqual(rows.map((row) => row.sameAsCurrent), [false, true, true]);
});

test('presetRows: キーの並びが違っても同じ値なら同じとみなす', () => {
  const rows = presetRows(LIBRARY, { global: { sfbHomeCost: false, windowSize: 5 } });
  assert.equal(rows[0]?.sameAsCurrent, true);
});

test('changedGlobalItemCount: 増えた・消えた・変わった項目を数え、同じ値は数えない', () => {
  const before: SettingsCascadeOverrides = { global: { windowSize: 5, sfbHomeCost: false, preferOppositeThumb: true } };
  const after: SettingsCascadeOverrides = { global: { windowSize: 5, sfbHomeCost: true, romajiRuleId: 'azik' } };
  // sfbHomeCost=変更、preferOppositeThumb=消えた、romajiRuleId=増えた。windowSizeは同じ
  assert.equal(changedGlobalItemCount(before, after), 3);
  assert.equal(changedGlobalItemCount(before, before), 0);
  assert.equal(changedGlobalItemCount({}, {}), 0);
});

test('changedGlobalItemCount: 全体以外のレベルは数えない', () => {
  const before: SettingsCascadeOverrides = { layout: { qwerty: { windowSize: 2 } } };
  assert.equal(changedGlobalItemCount(before, {}), 0);
});

test('applyResultText: 変わった項目数を出し、元に戻せる', () => {
  assert.deepEqual(applyResultText('厳しめ', 4, []), { text: '「厳しめ」の値にした（4項目が変わった）', undoable: true });
});

test('applyResultText: 変わる項目が無ければ元に戻せない', () => {
  const result = applyResultText('厳しめ', 0, []);
  assert.equal(result.undoable, false);
  assert.match(result.text, /変わった項目は無い/);
});

test('skippedItemsText: 行の名前へ写し、写せない項目は件数にする。内部のidは出さない', () => {
  assert.equal(skippedItemsText([]), undefined);
  assert.equal(skippedItemsText(['windowSize', 'romajiRuleId']), '入れなかった項目: 先読みN、ローマ字規則');
  const mixed = skippedItemsText(['windowSize', 'playbackRateWindow', 'unknownItem']);
  assert.equal(mixed, '入れなかった項目: 先読みN、ほか2項目');
  assert.doesNotMatch(mixed ?? '', /playbackRate|unknownItem/);
});

test('applyResultText: 入れなかった項目があれば結果の行に添える', () => {
  assert.equal(
    applyResultText('厳しめ', 2, ['windowSize']).text,
    '「厳しめ」の値にした（2項目が変わった）。入れなかった項目: 先読みN',
  );
});

test('conditionItemLabel: モーダルの行の名前と一致する', () => {
  assert.equal(conditionItemLabel('chainInterpretation'), 'チェーンの区切り');
  assert.equal(conditionItemLabel('arpeggioInterpretation'), 'アルペジオ');
  assert.equal(conditionItemLabel('nothing'), undefined);
});

test('isSavableName: 空白だけの名前は保存できない', () => {
  assert.equal(isSavableName(''), false);
  assert.equal(isSavableName('  　 '), false);
  assert.equal(isSavableName(' 厳しめ '), true);
});

const WORKSPACE = { kind: 'workspace' } as const;

test('presetRows: Workspaceは解決した値で比べる。全体N=7の画面で、全体の既定のプリセットは「同じ」ではない', () => {
  const view: SettingsCascadeOverrides = { global: { windowSize: 7 } };
  const rows = presetRows(LIBRARY, view, WORKSPACE);
  // 厳しめ(N=5・sfbHomeCost=false)・全部既定・N=3のどれも、今の値（N=7）とは違う
  assert.deepEqual(rows.map((row) => row.sameAsCurrent), [false, false, false]);
  // 全体がN=7、WorkspaceがN=3の時は、N=3の既定と同じ値のプリセットが同じ
  const withWorkspace: SettingsCascadeOverrides = { global: { windowSize: 7 }, workspace: { windowSize: 3 } };
  assert.deepEqual(presetRows(LIBRARY, withWorkspace, WORKSPACE).map((row) => row.sameAsCurrent), [false, true, true]);
  // Workspaceに値が無く全体が既定なら、既定のプリセットは同じ
  assert.deepEqual(presetRows(LIBRARY, {}, WORKSPACE).map((row) => row.sameAsCurrent), [false, true, true]);
});

test('changedGlobalItemCount: Workspaceは継承した値で比べ、全体と同じ値の上書きの有無は数えない', () => {
  const before: SettingsCascadeOverrides = { global: { windowSize: 7 } };
  const after: SettingsCascadeOverrides = { global: { windowSize: 7 }, workspace: { windowSize: 7 } };
  assert.equal(changedGlobalItemCount(before, after, WORKSPACE), 0);
  const changed: SettingsCascadeOverrides = { global: { windowSize: 7 }, workspace: { windowSize: 3 } };
  assert.equal(changedGlobalItemCount(before, changed, WORKSPACE), 1);
});
