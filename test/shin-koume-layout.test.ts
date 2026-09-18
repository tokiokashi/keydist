import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGeometry } from '../src/geometry.ts';
import { DEFAULT_OPTIONS, evaluate } from '../src/evaluate.ts';
import { LAYOUT_BY_ID } from '../src/layouts/index.ts';
import { assertKanaLayout } from './kana-layout-helpers.ts';

const layout = LAYOUT_BY_ID.get('shin-koume')!;
const geometry = buildGeometry('row-staggered');

test('シン蜂蜜小梅は作者定義の代表配字を保持する', () => {
  assert.equal(layout.name, 'シン蜂蜜小梅');
  assert.deepEqual(layout.map.get('は'), [['g']]);
  assert.deepEqual(layout.map.get('ば'), [['thumb-r', 'g']]);
  assert.deepEqual(layout.map.get('げ'), [['thumb-r', 'w']]);
  assert.deepEqual(layout.map.get('ぱ'), [['h', 'g']]);
  assert.deepEqual(layout.map.get('ぴ'), [['g', 'u']]);
  assert.deepEqual(layout.map.get('ぷ'), [['h', 'c']]);
  assert.deepEqual(layout.map.get('ぺ'), [['g', '/']]);
  assert.deepEqual(layout.map.get('ぽ'), [['h', 'x']]);
  assert.deepEqual(layout.map.get('きゃ'), [['i', 'r']]);
  assert.deepEqual(layout.map.get('を'), [['k', 'd']]);

  assertKanaLayout(layout);
});

test('親指shiftはlayer + single、文字キーcomboはcomposition + singleとして区別する', () => {
  const shifted = layout.faces!.filter((face) =>
    face.trigger.includes('thumb-l') || face.trigger.includes('thumb-r'));
  assert.equal(shifted.length, 2);
  for (const face of shifted) {
    assert.equal(face.mode, 'simultaneous');
    assert.equal(face.inputRole, 'layer');
    assert.equal(face.triggerPersistence, 'single');
  }

  const thumb = evaluate('ば', layout, geometry, DEFAULT_OPTIONS).strokes[0];
  assert.equal(thumb.inputRole, 'layer');
  assert.equal(thumb.triggerPersistence, 'single');
  assert.ok(thumb.participations.some((p) => p.roles.includes('trigger')));

  const composition = evaluate('ぱ', layout, geometry, DEFAULT_OPTIONS).strokes[0];
  assert.equal(composition.inputRole, 'composition');
  assert.equal(composition.triggerPersistence, 'single');
  assert.ok(composition.participations.some((p) => p.roles.includes('trigger')));
  assert.ok(composition.participations.every((p) => !p.roles.includes('held-trigger')));
});

test('文字compositionはhold利用ONでもheld-triggerへ昇格しない', () => {
  const trace = evaluate('ぱぱ', layout, geometry, {
    ...DEFAULT_OPTIONS,
    triggerRealizationPolicy: { useHold: true },
  });

  assert.equal(trace.strokes.length, 2);
  assert.deepEqual(trace.strokes.map((stroke) => stroke.triggerKeys), [['h'], ['h']]);
  assert.ok(trace.strokes.every((stroke) =>
    stroke.participations.every((p) => !p.roles.includes('held-trigger'))));
});
