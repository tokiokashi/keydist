import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CONDITION_BUNDLE_VERSION,
  conditionBundleFromState,
  parseConditionBundle,
  serializeConditionBundle,
} from '../src/condition-bundle.ts';
import {
  createDefaultUiState,
  type UiStateChoices,
} from '../src/ui-state.ts';
import type { UserLayout } from '../src/user-layouts.ts';

const choices: UiStateChoices = {
  layouts: { en: ['qwerty'], ja: ['qwerty'] },
  samples: { en: ['default'], ja: ['modern'] },
};

const state = () => createDefaultUiState({
  textPanelOpen: true,
  usePlaybackCalibration: false,
  selectedLayouts: { en: ['qwerty'], ja: ['qwerty'] },
});

test('semantic trigger grouping対応でcondition bundle versionを4へ上げる', () => {
  assert.equal(CONDITION_BUNDLE_VERSION, 4);

  const current = state();
  const bundle = conditionBundleFromState(current, [], [], { rules: [], assignments: {} }, []);
  const source = JSON.parse(serializeConditionBundle(bundle)) as { version: number };
  source.version = 1;

  assert.throws(
    () => parseConditionBundle(JSON.stringify(source), bundle, current, choices),
    /バージョンが違う/,
  );
});

test('条件の個別設定が空でもチェック状態を保存・復元する', () => {
  const current = state();
  current.conditions.perLayout = { qwerty: {} };
  const bundle = conditionBundleFromState(current, [], [], { rules: [], assignments: {} }, []);
  const parsed = parseConditionBundle(serializeConditionBundle(bundle), bundle, current, choices);
  assert.deepEqual(parsed.conditions.perLayout, { qwerty: {} });
});

test('条件と自作配列をJSONで往復でき、配列ごとのローマ字規則も残る', () => {
  const current = state();
  current.conditions.perLayout = { 'user-test': { romajiRule: 'azik', windowSize: 7 } };
  const layout: UserLayout = {
    id: 'user-test', name: 'テスト配列', rows: ['', 'asdf', 'jkl;', 'zxcv'], romaji: 'kunrei',
  };
  const bundle = conditionBundleFromState(
    current,
    [layout],
    [],
    { rules: [], assignments: {} },
    [],
  );
  const parsed = parseConditionBundle(serializeConditionBundle(bundle), bundle, current, choices);
  assert.equal(parsed.layouts[0].id, 'user-test');
  assert.deepEqual(parsed.conditions.perLayout['user-test'], { romajiRule: 'azik', windowSize: 7 });
});

test('ArpeggioPolicyはglobal / per-layoutともcondition bundleで往復する', () => {
  const current = state();
  current.conditions.defaults.arpeggioPolicy = {
    includeThumb: true,
    bridgeSameFinger: false,
    includeSingleRedirectTail: true,
  };
  current.conditions.perLayout.qwerty = {
    arpeggioPolicy: {
      includeThumb: false,
      bridgeSameFinger: true,
      includeSingleRedirectTail: false,
    },
  };
  const bundle = conditionBundleFromState(current, [], [], { rules: [], assignments: {} }, []);
  const parsed = parseConditionBundle(serializeConditionBundle(bundle), bundle, current, choices);

  assert.deepEqual(parsed.conditions.defaults.arpeggioPolicy, current.conditions.defaults.arpeggioPolicy);
  assert.deepEqual(
    parsed.conditions.perLayout.qwerty.arpeggioPolicy,
    current.conditions.perLayout.qwerty.arpeggioPolicy,
  );
});

test('TriggerRealizationPolicyはglobal / per-layoutともcondition bundleで往復する', () => {
  const current = state();
  current.conditions.defaults.triggerRealization = { useHold: true };
  current.conditions.perLayout.qwerty = {
    triggerRealization: { useHold: false },
  };
  const bundle = conditionBundleFromState(current, [], [], { rules: [], assignments: {} }, []);
  const parsed = parseConditionBundle(serializeConditionBundle(bundle), bundle, current, choices);

  assert.deepEqual(parsed.conditions.defaults.triggerRealization, { useHold: true });
  assert.deepEqual(parsed.conditions.perLayout.qwerty.triggerRealization, { useHold: false });
});

test('ActionRealizationPolicyはglobal / per-layoutともcondition bundleで往復する', () => {
  const current = state();
  current.conditions.defaults.actionRealization = {
    triggerActivation: 'semantic',
    triggerActivationClassOverrides: { 'order-free': 'separate' },
    triggerActivationOverrides: [{
      selector: {
        modifierGroupIds: ['SandS'],
        triggerKeys: ['thumb-r'],
      },
      grouping: 'separate' as const,
    }],
  };
  current.conditions.perLayout.qwerty = {
    actionRealization: {
      triggerActivation: 'disabled',
      triggerActivationClassOverrides: { 'prepress-required': 'combined' },
      triggerActivationOverrides: [{
        selector: { modifierGroupIds: ['濁音'], triggerKeys: ['j'] },
        grouping: 'separate',
      }],
    },
  };
  const bundle = conditionBundleFromState(current, [], [], { rules: [], assignments: {} }, []);
  const parsed = parseConditionBundle(serializeConditionBundle(bundle), bundle, current, choices);

  assert.deepEqual(parsed.conditions.defaults.actionRealization, current.conditions.defaults.actionRealization);
  assert.deepEqual(
    parsed.conditions.perLayout.qwerty.actionRealization,
    current.conditions.perLayout.qwerty.actionRealization,
  );
});

test('未知の配列への個別設定は読み込み時に捨てる', () => {
  const current = state();
  const bundle = conditionBundleFromState(current, [], [], { rules: [], assignments: {} }, []);
  const source = JSON.parse(serializeConditionBundle(bundle)) as { version: number; conditions: { perLayout: Record<string, unknown> } };
  source.conditions.perLayout.removed = { windowSize: 8 };
  const parsed = parseConditionBundle(JSON.stringify(source), bundle, current, choices);
  assert.equal(parsed.conditions.perLayout.removed, undefined);
});


test('Condition Bundle remains domain-scoped and does not export AppState UI slices', () => {
  const current = state();
  const serialized = JSON.parse(serializeConditionBundle(
    conditionBundleFromState(current, [], [], { rules: [], assignments: {} }, []),
  )) as Record<string, unknown>;

  assert.deepEqual(Object.keys(serialized).sort(), [
    'conditions',
    'geometryShapes',
    'layouts',
    'presets',
    'romajiSettings',
    'version',
  ]);
  for (const key of ['workspace', 'inputConverter', 'analyzer', 'playback']) {
    assert.equal(key in serialized, false);
  }
});
