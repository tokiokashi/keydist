import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGeometry } from '../src/geometry.ts';
import { DEFAULT_OPTIONS, evaluate } from '../src/evaluate.ts';
import { LAYOUT_BY_ID } from '../src/layouts/index.ts';
import { assertKanaLayout } from './kana-layout-helpers.ts';

const layout = LAYOUT_BY_ID.get('asuka')!;
const geometry = buildGeometry('row-staggered');

test('飛鳥123は紅皿定義の代表配字を保持する', () => {
  assert.equal(layout.name, '飛鳥');
  assert.deepEqual(layout.map.get('き'), [['a']]);
  assert.deepEqual(layout.map.get('あ'), [['thumb-l', 's']]);
  assert.deepEqual(layout.map.get('わ'), [['thumb-r', 'a']]);
  assert.deepEqual(layout.map.get('ヴ'), [['thumb-l', 'y']]);
  assert.deepEqual(layout.map.get('ー'), [['w']]);
  assert.equal(layout.legends.get('thumb-l'), '左親指');
  assert.equal(layout.legends.get('thumb-r'), '右親指');

  assertKanaLayout(layout, ['ゎ']);
});

test('飛鳥の親指面はsimultaneous + layer + hold-capableを明示する', () => {
  const shifted = layout.faces!.filter((face) => face.trigger.length > 0);
  assert.equal(shifted.length, 2);
  for (const face of shifted) {
    assert.equal(face.mode, 'simultaneous');
    assert.equal(face.inputRole, 'layer');
    assert.equal(face.triggerPersistence, 'hold-capable');
  }

  const base = evaluate('あ', layout, geometry, DEFAULT_OPTIONS).strokes[0];
  assert.deepEqual(base.classifications, []);
  assert.ok(base.participations.some((p) => p.roles.includes('trigger')));
  assert.ok(base.participations.every((p) => !p.roles.includes('held-trigger')));
});

test('飛鳥はhold利用ON/OFFで同じ親指triggerの連続保持を比較できる', () => {
  const off = evaluate('あだ', layout, geometry, DEFAULT_OPTIONS);
  const on = evaluate('あだ', layout, geometry, {
    ...DEFAULT_OPTIONS,
    triggerRealizationPolicy: { useHold: true },
  });

  assert.deepEqual(off.strokes.map((stroke) => stroke.triggerKeys), [
    ['thumb-l'],
    ['thumb-l'],
  ]);
  assert.deepEqual(on.strokes.map((stroke) => stroke.triggerKeys), [
    ['thumb-l'],
    [],
  ]);
  assert.deepEqual(
    on.strokes.map((stroke) => stroke.participations
      .filter((p) => p.roles.includes('held-trigger'))
      .map((p) => p.holdPhase)),
    [['start'], ['continue']],
  );
});
