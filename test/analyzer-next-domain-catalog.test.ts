import assert from 'node:assert/strict';
import test from 'node:test';
import {
  customGeometryKind,
  PHYSICAL_SHAPES,
} from '../src/geometry.ts';
import { DEFAULT_GEOMETRY_SETTINGS } from '../src/geometry-settings.ts';
import { createAnalysisDomainCatalog } from '../src/features/analyzer-next/domain-catalog.ts';
import type { UserLayout } from '../src/user-layouts.ts';

const userLayout: UserLayout = {
  id: 'user-test',
  name: 'User Test',
  rows: ['', 'qwertyuiop[]', "asdfghjkl;'", 'zxcvbnm,./'],
  romaji: 'kunrei',
};

test('domain catalog keeps en direct while ja resolves romaji rules for the same user layout', () => {
  const catalog = createAnalysisDomainCatalog({
    userLayouts: [userLayout],
    userGeometryShapes: [],
    romajiSettings: {
      rules: [],
      assignments: { 'user-test': 'azik' },
    },
    geometrySettings: DEFAULT_GEOMETRY_SETTINGS,
  });

  const en = catalog.layoutsForMode('en').find((entry) => entry.layout.id === 'user-test')!;
  const ja = catalog.layoutsForMode('ja').find((entry) => entry.layout.id === 'user-test')!;

  assert.equal(en.romajiCapable, false);
  assert.equal(en.romajiRuleId, null);
  assert.equal(ja.romajiCapable, true);
  assert.equal(ja.romajiRuleId, 'azik');
  assert.ok(ja.layout.romajiTable);

  const kunrei = ja.resolveRomajiRule!('kunrei');
  assert.equal(kunrei.romajiRuleId, 'kunrei');
  assert.notEqual(kunrei.revisionKey, ja.revisionKey);
});

test('editing a user layout or custom romaji rule changes the catalog revision key', () => {
  const make = (name: string, override: string) => createAnalysisDomainCatalog({
    userLayouts: [{ ...userLayout, name }],
    userGeometryShapes: [],
    romajiSettings: {
      assignments: {},
      rules: [{
        id: 'custom-rule',
        name: 'Custom',
        base: 'kunrei',
        overrides: { し: override },
        generateSokuon: true,
      }],
    },
    geometrySettings: DEFAULT_GEOMETRY_SETTINGS,
  });

  const first = make('User Test', 'si')
    .layoutsForMode('ja').find((entry) => entry.layout.id === 'user-test')!
    .resolveRomajiRule!('custom-rule');
  const layoutEdited = make('Edited', 'si')
    .layoutsForMode('ja').find((entry) => entry.layout.id === 'user-test')!
    .resolveRomajiRule!('custom-rule');
  const ruleEdited = make('User Test', 'shi')
    .layoutsForMode('ja').find((entry) => entry.layout.id === 'user-test')!
    .resolveRomajiRule!('custom-rule');

  assert.notEqual(first.revisionKey, layoutEdited.revisionKey);
  assert.notEqual(first.revisionKey, ruleEdited.revisionKey);
});

test('geometry catalog shares current assignment while shape and revision follow requested kind', () => {
  const custom = {
    ...structuredClone(PHYSICAL_SHAPES['row-staggered']),
    id: 'shape-test',
    name: 'Shape Test',
    splitGap: 2,
  };
  const catalog = createAnalysisDomainCatalog({
    userLayouts: [],
    userGeometryShapes: [custom],
    romajiSettings: { rules: [], assignments: {} },
    geometrySettings: {
      ...structuredClone(DEFAULT_GEOMETRY_SETTINGS),
      assignment: {
        ...structuredClone(DEFAULT_GEOMETRY_SETTINGS.assignment),
        id: 'assignment-test',
      },
    },
  });

  const preset = catalog.geometryForKind('ortholinear');
  const customResolved = catalog.geometryForKind(customGeometryKind('shape-test'));

  assert.equal(preset.settings.assignment.id, 'assignment-test');
  assert.equal(customResolved.settings.assignment.id, 'assignment-test');
  assert.equal(customResolved.settings.shape.id, 'shape-test');
  assert.notEqual(preset.revisionKey, customResolved.revisionKey);
});

test('catalog exposes available ids for binding validation without computing snapshots', () => {
  const catalog = createAnalysisDomainCatalog({
    userLayouts: [userLayout],
    userGeometryShapes: [],
    romajiSettings: { rules: [], assignments: {} },
    geometrySettings: DEFAULT_GEOMETRY_SETTINGS,
  });
  const ids = catalog.availableLayoutIdsByMode();

  assert.ok(ids.en.includes('qwerty'));
  assert.ok(ids.ja.includes('naginata-v18'));
  assert.ok(ids.en.includes('user-test'));
  assert.ok(ids.ja.includes('user-test'));
});
