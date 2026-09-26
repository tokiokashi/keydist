import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluate } from '#trace/evaluate.ts';
import { TypingInputEngine } from '#tester/engine/index.ts';
import {
  DEFAULT_GEOMETRY_SETTINGS,
  parseGeometrySettings,
  sanitizePhysicalShape,
  serializeGeometrySettings,
} from '#input/shapes/settings.ts';
import {
  DEFAULT_FINGER_ASSIGNMENT,
  PHYSICAL_SHAPES,
  buildGeometry,
  type FingerAssignment,
  type PhysicalShape,
} from '#input/shapes/geometry.ts';
import { computeMetrics } from '#interpretation/metrics.ts';
import { fromKana, LAYOUT_BY_ID } from '#input/layouts/index.ts';
import {
  browserCodeToPhysicalKey,
} from '#tester/browser-keyboard-adapter.ts';
import {
  physicalKeysUsedByLayout,
  visibleGeometryKeys,
} from '#input/layouts/physical-keys.ts';

const shape: PhysicalShape = {
  ...structuredClone(PHYSICAL_SHAPES['row-staggered']),
  id: 'extra-keys',
  name: 'grid外キーfixture',
  extraKeys: [
    { id: 'tab', row: 1, col: -1, x: -1, y: 1, width: 1.5 },
    { id: 'escape', row: 0, col: -1, x: -1, y: 0 },
  ],
};

const assignment: FingerAssignment = {
  ...structuredClone(DEFAULT_FINGER_ASSIGNMENT),
  id: 'extra-keys',
  name: 'grid外キーfixture',
  keyFinger: {
    ...DEFAULT_FINGER_ASSIGNMENT.keyFinger,
    tab: 'LP',
    escape: 'LP',
  },
};

test('grid外physical keyはshape座標とFingerAssignmentを分離したままgeometryへ入る', () => {
  const geometry = buildGeometry(shape, assignment);

  assert.deepEqual(
    geometry.keys.get('tab'),
    { id: 'tab', row: 1, col: -1, x: -1, y: 1, finger: 'LP', width: 1.5 },
  );
  assert.deepEqual(
    geometry.keys.get('escape'),
    { id: 'escape', row: 0, col: -1, x: -1, y: 0, finger: 'LP' },
  );
  assert.equal(geometry.grid.flat().some((key) => key.id === 'tab'), false);
});

test('grid外physical keyを使うdirect inputはevaluateとmetricsへ流れる', () => {
  const geometry = buildGeometry(shape, assignment);
  const layout = fromKana('extra-key-layout', 'Extra key fixture', {
    よ: [['tab']],
    ろ: [['escape']],
  });

  const trace = evaluate('よろ', layout, geometry, { windowSize: 3, sfbHomeCost: true });
  assert.equal(trace.skipped, 0);
  assert.deepEqual(
    trace.strokes.flatMap((stroke) => stroke.presses.flatMap((press) => press.keys.map((key) => key.id))),
    ['tab', 'escape'],
  );

  const metrics = computeMetrics(trace, geometry);
  assert.equal(metrics.presses, 2);
  assert.equal(metrics.perFingerPresses.LP, 2);
});

test('extraKeysとその運指はgeometry settings JSONをround-tripする', () => {
  const settings = structuredClone(DEFAULT_GEOMETRY_SETTINGS);
  settings.shape = shape;
  settings.assignment = assignment;

  const restored = parseGeometrySettings(serializeGeometrySettings(settings));
  assert.deepEqual(restored.shape.extraKeys, shape.extraKeys);
  assert.equal(restored.assignment.keyFinger.tab, 'LP');
  assert.equal(restored.assignment.keyFinger.escape, 'LP');
  assert.doesNotThrow(() => buildGeometry(restored.shape, restored.assignment));
});

test('browser adapterは周辺physical keyのcodeをstable idへ変換する', () => {
  assert.equal(browserCodeToPhysicalKey('Tab'), 'tab');
  assert.equal(browserCodeToPhysicalKey('Escape'), 'escape');
  assert.equal(browserCodeToPhysicalKey('CapsLock'), 'caps-lock');
  assert.equal(browserCodeToPhysicalKey('Backquote'), 'backquote');
  assert.equal(browserCodeToPhysicalKey('Backslash'), 'backslash');
});

test('layout ownershipはcanonical inputに実際に含まれるphysical keyから決まる', () => {
  const regular = LAYOUT_BY_ID.get('qwerty')!;
  const extra = fromKana('extra-key-layout', 'Extra key fixture', {
    よ: [['tab']],
    ろ: [['escape']],
  });

  assert.equal(physicalKeysUsedByLayout(regular).has('tab'), false);
  assert.equal(physicalKeysUsedByLayout(regular).has('escape'), false);
  assert.equal(physicalKeysUsedByLayout(extra).has('tab'), true);
  assert.equal(physicalKeysUsedByLayout(extra).has('escape'), true);
});


test('grid外physical keyは使うlayoutだけheatmap/playback表示対象になる', () => {
  const geometry = buildGeometry(shape, assignment);
  const regular = LAYOUT_BY_ID.get('qwerty')!;
  const extra = fromKana('extra-key-visibility', 'Extra key visibility', {
    よ: [['tab']],
  });

  assert.equal(visibleGeometryKeys(regular, geometry).some((key) => key.id === 'tab'), false);
  assert.equal(visibleGeometryKeys(regular, geometry).some((key) => key.id === 'escape'), false);
  assert.equal(visibleGeometryKeys(extra, geometry).some((key) => key.id === 'tab'), true);
  assert.equal(visibleGeometryKeys(extra, geometry).some((key) => key.id === 'escape'), false);
});

test('extra key idはcanonical physical identityでなければならない', () => {
  const aliased: PhysicalShape = {
    ...shape,
    extraKeys: [{ id: 'space', row: 4, col: 5, x: 5.5, y: 4 }],
  };
  assert.throws(() => buildGeometry(aliased, assignment), /canonical physical key id/);

  const sanitized = sanitizePhysicalShape(aliased, PHYSICAL_SHAPES['row-staggered']);
  assert.equal(sanitized.extraKeys, undefined);
});

test('extra key idはgrid・thumb・extra内で重複できない', () => {
  const duplicateGrid: PhysicalShape = {
    ...shape,
    extraKeys: [{ id: 'q', row: 0, col: -1, x: -1, y: 0 }],
  };
  assert.throws(() => buildGeometry(duplicateGrid, assignment), /重複/);

  const duplicateThumb: PhysicalShape = {
    ...shape,
    extraKeys: [{ id: 'thumb-l', row: 0, col: -1, x: -1, y: 0 }],
  };
  assert.throws(() => buildGeometry(duplicateThumb, assignment), /重複/);
});


test('browser physical keyをTypingInputEngineまで通してgrid外direct inputを認識できる', () => {
  const layout = fromKana('extra-key-runtime', 'Extra key runtime', {
    よ: [['tab']],
    ろ: [['escape']],
  });
  const engine = new TypingInputEngine(layout.canonicalInputs);

  const tabKey = browserCodeToPhysicalKey('Tab');
  const escapeKey = browserCodeToPhysicalKey('Escape');
  assert.equal(tabKey, 'tab');
  assert.equal(escapeKey, 'escape');

  assert.equal(engine.handle({ type: 'down', key: tabKey }).recognized[0]?.output, 'よ');
  engine.handle({ type: 'up', key: tabKey });
  assert.equal(engine.handle({ type: 'down', key: escapeKey }).recognized[0]?.output, 'ろ');
});
