import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolveSettings } from './settings-items.ts';
import { SETTINGS_CASCADE_OVERRIDES_CODEC } from './settings-codec.ts';
import type { CascadeContext } from '#input/settings/index.ts';
import { LAYOUTS } from '#input/layouts/index.ts';
import { PHYSICAL_SHAPES } from '#input/shapes/geometry.ts';

const context: CascadeContext = {
  shapeId: PHYSICAL_SHAPES['row-staggered'].id,
  shape: PHYSICAL_SHAPES['row-staggered'],
  inputMethod: 'direct',
  layoutId: LAYOUTS[0].id,
  layout: LAYOUTS[0],
  setupId: 'setup-1',
};

test('decode: versionが無ければmissing-versionで失敗する', () => {
  const result = SETTINGS_CASCADE_OVERRIDES_CODEC.decode({ global: { windowSize: 3 } });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason.kind, 'missing-version');
});

test('decode: このアプリより新しいversionはfuture-versionとして報告する（黙って切り捨てない）', () => {
  const result = SETTINGS_CASCADE_OVERRIDES_CODEC.decode({ version: 999, global: {} });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.deepEqual(result.reason, { kind: 'future-version', version: 999, currentVersion: 1 });
  }
});

test('decode: 妥当な上書きはそのまま読める（全11項目）', () => {
  const raw = {
    version: 1,
    global: {
      windowSize: 4,
      sfbHomeCost: false,
      chainInterpretation: {
        breakOnSameFinger: true, breakOnTriggerOnly: false, breakOnThumbOnly: true, breakOnOppositeHandSimultaneous: false,
      },
      arpeggioInterpretation: { includeThumb: true, bridgeSameFinger: false, includeSingleRedirectTail: true },
      playbackRateAverage: 'ewma',
      playbackRateWindow: 5,
      playbackRateHalfLifeSeconds: 2,
    },
    layout: {
      [LAYOUTS[0].id]: {
        preferOppositeThumb: true,
        triggerRealizationPolicy: { useHold: true },
        actionRealizationPolicy: { triggerActivation: 'semantic', triggerActivationOverrides: [] },
        romajiRuleId: 'kunrei',
      },
    },
  };
  const result = SETTINGS_CASCADE_OVERRIDES_CODEC.decode(raw);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.diagnostics, []);
  assert.equal(result.value.global?.windowSize, 4);
  assert.equal(result.value.layout?.[LAYOUTS[0].id]?.preferOppositeThumb, true);
});

test('decode: 未知の項目idは捨てて診断を積む（将来バージョンが足した項目・削除済みの項目の両方を想定）', () => {
  const result = SETTINGS_CASCADE_OVERRIDES_CODEC.decode({
    version: 1,
    global: { windowSize: 3, notYetInvented: true },
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.value, { global: { windowSize: 3 } });
  assert.equal(result.diagnostics.length, 1);
  assert.match(result.diagnostics[0].message, /未知の項目「notYetInvented」/);
});

test('decode: 型の合わない項目値は項目単位で捨てて診断を積む', () => {
  const result = SETTINGS_CASCADE_OVERRIDES_CODEC.decode({
    version: 1,
    global: { windowSize: 'three', sfbHomeCost: true },
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.value, { global: { sfbHomeCost: true } });
  assert.equal(result.diagnostics.length, 1);
  assert.equal(result.diagnostics[0].path, 'overrides.global.windowSize');
});

test('decode: 許可されていないレベルの値も型さえ合えば保持し、resolveSettingsが無視して診断を出す（二重の扱いを避ける）', () => {
  // chainInterpretationはGLOBAL_ONLY（settings-items.ts）。codecはレベルの可否を知らないので、
  // layoutレベルに置かれた値も型が合えば残す。可否の判定・診断は解決側の役目であることを確認する。
  const result = SETTINGS_CASCADE_OVERRIDES_CODEC.decode({
    version: 1,
    layout: {
      [LAYOUTS[0].id]: {
        chainInterpretation: {
          breakOnSameFinger: false, breakOnTriggerOnly: false, breakOnThumbOnly: false, breakOnOppositeHandSimultaneous: false,
        },
      },
    },
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  // codec自体はこの値を落とさない。
  assert.equal(result.value.layout?.[LAYOUTS[0].id]?.chainInterpretation?.breakOnSameFinger, false);

  const resolved = resolveSettings(result.value, context);
  // resolveCascadeが許可外レベルとして無視し、実効値は既定値のまま・診断が付く。
  assert.equal(resolved.chainInterpretation.value.breakOnSameFinger, true); // DEFAULT_CHAIN_INTERPRETATION
  assert.ok(
    resolved.chainInterpretation.diagnostics.some((diagnostic) => diagnostic.kind === 'ignored-disallowed-level'),
  );
});

test('encode→decode: 往復で同じ上書きに戻る（roundtrip）', () => {
  const value = {
    global: { windowSize: 3, playbackRateAverage: 'sma' as const },
    setup: { 's-1': { preferOppositeThumb: true } },
  };
  const encoded = SETTINGS_CASCADE_OVERRIDES_CODEC.encode(value);
  assert.equal(encoded.version, 1);
  const decoded = SETTINGS_CASCADE_OVERRIDES_CODEC.decode(encoded);
  assert.equal(decoded.ok, true);
  if (decoded.ok) {
    assert.deepEqual(decoded.value, value);
    assert.deepEqual(decoded.diagnostics, []);
  }
});
