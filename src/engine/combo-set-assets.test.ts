import assert from 'node:assert/strict';
import test from 'node:test';
import { COMBO_SETS_CODEC, addComboToSet, buildComboEntry, removeComboFromSet, type ComboSet } from '#input/combo-set/combo-set.ts';
import { tableForRule } from '#input/romaji/rules.ts';
import { emptyCascadeOverrides } from '#input/settings/index.ts';
import type { SetupLibrary } from '#input/setup/index.ts';
import type { SettingsValueMap } from './settings-items.ts';
import {
  EMPTY_USER_ASSETS_BUNDLE,
  mergeUserAssets,
  parseUserAssetsFile,
  userAssetsBundleOf,
  userAssetsFileBody,
  USER_ASSETS_FILE_FORMAT,
  type UserAssetsHoldings,
} from './user-assets-file.ts';
import { emptyPresetLibrary } from '#input/presets/index.ts';
import { emptyTextLibrary } from '#input/text/library.ts';
import { EMPTY_PERSONAL_SPEED } from '#interpretation/timing/calibration-codec.ts';
import { workspaceAssetsOf } from './workspace-assets.ts';
import { addWorkspacePane, createWorkspace, initialWorkspaceLibrary, OWN_OPTIONS } from './workspace.ts';

const SET_A: ComboSet = { id: 'set-a', name: '組A', romajiRuleId: 'kunrei', combos: [{ keys: ['s', 't'], output: 'site' }] };
const SET_A_OTHER: ComboSet = { ...SET_A, combos: [{ keys: ['d', 's'], output: 'desu' }] };

const libraryOf = (setups: SetupLibrary<SettingsValueMap>['setups']): SetupLibrary<SettingsValueMap> => ({ setups, overrides: emptyCascadeOverrides() });

const holdings = (comboSets: readonly ComboSet[], setups: SetupLibrary<SettingsValueMap>['setups'] = []): UserAssetsHoldings => ({
  userLayouts: [],
  userRomajiRules: [],
  fingerAssignments: [],
  comboSets,
  setupLibrary: libraryOf(setups),
});

test('保存した組を読み戻すと同じ組になり、壊れたコンボは1件だけ捨てて診断を積む', () => {
  const encoded = COMBO_SETS_CODEC.encode([SET_A]);
  const decoded = COMBO_SETS_CODEC.decode(encoded);
  assert.ok(decoded.ok);
  if (!decoded.ok) return;
  assert.deepEqual(decoded.value, [SET_A]);

  const broken = COMBO_SETS_CODEC.decode({
    ...encoded,
    comboSets: [
      {
        ...SET_A,
        combos: [
          { keys: ['s', 't'], output: 'site' },
          { keys: ['s'], output: 'x' },
          { keys: ['s', 'S'], output: 'x' },
          { keys: ['s', 's'], output: 'x' },
        ],
      },
    ],
  });
  assert.ok(broken.ok);
  if (!broken.ok) return;
  assert.deepEqual(broken.value[0]!.combos, SET_A.combos);
  assert.equal(broken.diagnostics.length, 3);
});

test('かなで入力したコンボは、組の基準の綴りで展開して保存し、展開できないかなは作らない', () => {
  const kunrei = tableForRule('kunrei');
  const oonishi = tableForRule('oonishi');
  const built = buildComboEntry('st', 'しゃ', kunrei);
  assert.ok(built.ok);
  if (built.ok) assert.deepEqual(built.entry, { keys: ['s', 't'], output: 'sya' });
  // 同じかなでも、基準の綴りが違えば出力の綴りが違う
  const other = buildComboEntry('st', 'しゃ', oonishi);
  assert.ok(other.ok);
  if (other.ok) assert.equal(other.entry.output, 'sha');
  assert.equal(buildComboEntry('st', 'abc', kunrei).ok, false);
  assert.equal(buildComboEntry('s', 'し', kunrei).ok, false);
  assert.equal(buildComboEntry('ss', 'し', kunrei).ok, false);
  assert.equal(buildComboEntry('s1', 'し', kunrei).ok, false);
});

test('同じキーの集合と出力のコンボは重ねて足せず、外した後は組が元の参照を保つ', () => {
  const dup = addComboToSet([SET_A], 'set-a', { keys: ['t', 's'], output: 'site' });
  assert.equal(dup.ok, false);
  const sets = [SET_A];
  assert.equal(removeComboFromSet(sets, 'set-a', 5), sets);
  assert.deepEqual(removeComboFromSet(sets, 'set-a', 0)[0]!.combos, []);
});

test('書き出して読み込むと、組が運ばれ、Setupが選んだ組への参照も残る', () => {
  const own = holdings([SET_A], [{ id: 's1', number: 1, layoutId: 'qwerty', shapeId: 'row-staggered', comboSetId: 'set-a' }]);
  const body = userAssetsFileBody({
    ...own,
    presetLibrary: emptyPresetLibrary<SettingsValueMap>(),
    workspaces: [],
    personalSpeed: EMPTY_PERSONAL_SPEED,
    standaloneAnalyzerOptions: {},
    textLibrary: emptyTextLibrary(),
  });
  const parsed = parseUserAssetsFile(JSON.stringify({ format: USER_ASSETS_FILE_FORMAT, ...body }));
  assert.ok(parsed.ok);
  if (!parsed.ok) return;
  assert.deepEqual(parsed.bundle.comboSets, [SET_A]);
  assert.equal(parsed.bundle.setups[0]!.comboSetId, 'set-a');
});

test('書き出しは、同梱しない組を選んでいるSetupの参照を外す', () => {
  const own = holdings([], [{ id: 's1', number: 1, layoutId: 'qwerty', shapeId: 'row-staggered', comboSetId: 'ない' }]);
  assert.equal(userAssetsBundleOf(own).setups[0]!.comboSetId, undefined);
});

test('読み込み: 中身が同じ組は足さず、同じidで中身が違う組は別のidで足し、Setupは足した組を指す', () => {
  const current = holdings([SET_A]);
  const same = mergeUserAssets(current, { ...EMPTY_USER_ASSETS_BUNDLE, comboSets: [{ ...SET_A, name: '別の名前' }] }, 'st');
  assert.equal(same.assets.comboSets, current.comboSets);
  assert.equal(same.entries[0]!.outcome.kind, 'skipped-same');

  const renamed = mergeUserAssets(
    holdings([SET_A_OTHER]),
    {
      ...EMPTY_USER_ASSETS_BUNDLE,
      comboSets: [SET_A],
      setups: [{ id: 'fs', layoutId: 'qwerty', shapeId: 'row-staggered', comboSetId: 'set-a' }],
    },
    'st',
  );
  assert.equal(renamed.assets.comboSets.length, 2);
  assert.equal(renamed.entries[0]!.outcome.kind, 'added-renamed');
  const addedId = renamed.assets.comboSets[1]!.id;
  assert.notEqual(addedId, 'set-a');
  assert.deepEqual(renamed.assets.comboSets[0], SET_A_OTHER);
  assert.equal(renamed.assets.setupLibrary.setups[0]!.comboSetId, addedId);
});

test('読み込み: ファイルに無い組を選んでいるSetupは、手元の同じidの別の組に結び付けず、参照を外す', () => {
  const merged = mergeUserAssets(
    holdings([SET_A_OTHER]),
    {
      ...EMPTY_USER_ASSETS_BUNDLE,
      setups: [{ id: 'fs', layoutId: 'qwerty', shapeId: 'row-staggered', comboSetId: 'set-a' }],
    },
    'st',
  );
  assert.equal(merged.assets.setupLibrary.setups[0]!.comboSetId, undefined);
});

test('Workspaceの書き出しは、同梱するSetupが選んだ組を運ぶ', () => {
  const own = holdings([SET_A, { ...SET_A, id: 'set-b' }], [{ id: 's1', number: 1, layoutId: 'qwerty', shapeId: 'row-staggered', comboSetId: 'set-a' }]);
  const workspace = addWorkspacePane(
    [createWorkspace(initialWorkspaceLibrary(), () => 'w1', '比較').created],
    'w1',
    {
      id: 'fixed',
      analyzerId: 'compare-table',
      options: undefined,
      optionsBinding: OWN_OPTIONS,
      binding: { mode: 'fixed', target: { kind: 'single', target: { kind: 'setup', setupId: 's1' } } },
    },
    { w: 6, h: 4 },
  )[0]!;
  const bundle = workspaceAssetsOf([workspace], own);
  assert.deepEqual(
    bundle.comboSets.map((set) => set.id),
    ['set-a'],
  );
});
