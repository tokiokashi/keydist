import assert from 'node:assert/strict';
import test from 'node:test';
import {
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

test('未知の配列への個別設定は読み込み時に捨てる', () => {
  const current = state();
  const bundle = conditionBundleFromState(current, [], [], { rules: [], assignments: {} }, []);
  const source = JSON.parse(serializeConditionBundle(bundle)) as { version: number; conditions: { perLayout: Record<string, unknown> } };
  source.conditions.perLayout.removed = { windowSize: 8 };
  const parsed = parseConditionBundle(JSON.stringify(source), bundle, current, choices);
  assert.equal(parsed.conditions.perLayout.removed, undefined);
});
