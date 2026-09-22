import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_GEOMETRY_SETTINGS,
  parseGeometrySettings,
  sanitizeGeometrySettings,
  serializeGeometrySettings,
} from '../src/geometry-settings.ts';
import { assignmentWithHomeKeys, buildGeometry } from '../src/geometry.ts';
import { fromDisplayUnits, toDisplayUnits } from '../src/geometry-units.ts';
import { toLayout, type UserLayout } from '../src/user-layouts.ts';

test('運指と物理形状をJSONへ書き出して復元できる', () => {
  const settings = structuredClone(DEFAULT_GEOMETRY_SETTINGS);
  settings.assignment.id = 'custom';
  settings.assignment.name = '小指を使わない';
  settings.assignment.keyFinger.a = 'LR';
  settings.assignment.homeKey.LR = 'a';
  settings.shape.id = 'custom';
  settings.shape.name = '実測キーボード';
  settings.shape.pitchMm = 18.5;
  settings.shape.rowStagger = [0, 0.4, 0.8, 1.1];
  settings.shape.columnStagger = [0.1, 0, 0.2];
  settings.shape.thumbs[0].col = 3.25;
  settings.shape.extraKeys = [
    { id: 'escape', x: -1, y: 0, row: 0, col: -1, width: 1 },
    { id: 'tab', x: -0.25, y: 1, row: 1, col: -1, width: 1.5 },
  ];
  settings.assignment.keyFinger.escape = 'LP';
  settings.assignment.keyFinger.tab = 'LP';

  const restored = parseGeometrySettings(serializeGeometrySettings(settings));
  assert.deepEqual(restored, settings);
  assert.doesNotThrow(() => buildGeometry(restored.shape, restored.assignment));
});

test('壊れた設定は既定値のうち構築できる範囲へサニタイズする', () => {
  const settings = sanitizeGeometrySettings({
    assignment: {
      id: 'broken',
      keyFinger: { a: 'unknown' },
      homeKey: { LP: 'not-a-key' },
    },
    shape: {
      id: 'broken',
      pitchMm: -1,
      rowWidths: [0, 99],
      thumbs: [],
    },
  });

  assert.equal(settings.shape.pitchMm, DEFAULT_GEOMETRY_SETTINGS.shape.pitchMm);
  assert.equal(settings.shape.rowWidths.length, 4);
  assert.doesNotThrow(() => buildGeometry(settings.shape, settings.assignment));
});

test('未知の設定ファイル形式は拒否する', () => {
  assert.throws(() => parseGeometrySettings('{"version":2,"settings":{}}'), /バージョン/);
});

test('物理形状のuとmm表示は相互変換しても正準値を保つ', () => {
  const valueU = 0.75;
  const valueMm = toDisplayUnits(valueU, 19.05, 'mm');
  assert.ok(Math.abs(valueMm - 14.2875) < 1e-12);
  assert.ok(Math.abs(fromDisplayUnits(valueMm, 19.05, 'mm') - valueU) < 1e-12);
  assert.equal(fromDisplayUnits(valueU, 19.05, 'u'), valueU);
});

test('配列側のホームキーを運指へ適用し、未知のキーは無視する', () => {
  const assignment = assignmentWithHomeKeys(DEFAULT_GEOMETRY_SETTINGS.assignment, {
    LM: 'd',
    LI: 'not-a-key',
  });
  const geometry = buildGeometry(DEFAULT_GEOMETRY_SETTINGS.shape, assignment);
  assert.equal(geometry.assignment.homeKey.LM, 'd');
  assert.equal(geometry.assignment.homeKey.LI, DEFAULT_GEOMETRY_SETTINGS.assignment.homeKey.LI);
});

test('通常の自作配列でもhomeKeysをLayoutへ保持する', () => {
  const def: UserLayout = {
    id: 'home-key-layout',
    name: 'ホームキー付き',
    rows: ['', 'qwertyuiop[]', "asdfghjkl;'", 'zxcvbnm,./'],
    romaji: 'kunrei',
    homeKeys: { LM: 's', RM: 'l' },
  };
  const layout = toLayout(def);
  assert.deepEqual(layout.homeKeys, def.homeKeys);
});


test('extra physical keyはshape座標とFingerAssignmentを分離したままsanitizeされる', () => {
  const settings = sanitizeGeometrySettings({
    shape: {
      ...structuredClone(DEFAULT_GEOMETRY_SETTINGS.shape),
      id: 'shape-extra',
      extraKeys: [
        { id: 'escape', x: -1, y: 0, row: 0, col: -1 },
        { id: 'tab', x: -0.25, y: 1, row: 1, col: -1, width: 1.5 },
      ],
    },
    assignment: {
      ...structuredClone(DEFAULT_GEOMETRY_SETTINGS.assignment),
      id: 'extra-assignment',
      keyFinger: {
        ...DEFAULT_GEOMETRY_SETTINGS.assignment.keyFinger,
        escape: 'LP',
        tab: 'LR',
      },
    },
  });

  assert.deepEqual(settings.shape.extraKeys?.map((key) => key.id), ['escape', 'tab']);
  assert.equal(settings.assignment.keyFinger.escape, 'LP');
  assert.equal(settings.assignment.keyFinger.tab, 'LR');

  const geometry = buildGeometry(settings.shape, settings.assignment);
  assert.equal(geometry.keys.get('escape')?.finger, 'LP');
  assert.equal(geometry.keys.get('tab')?.finger, 'LR');
  assert.equal(geometry.keys.get('tab')?.width, 1.5);
  assert.equal(geometry.grid.flat().some((key) => key.id === 'tab'), false);
});
