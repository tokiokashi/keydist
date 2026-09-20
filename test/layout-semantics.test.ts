import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildGeometry, resolveKeyId } from '../src/geometry.ts';
import { evaluate, type Options } from '../src/evaluate.ts';
import { LAYOUT_BY_ID } from '../src/layouts/index.ts';

const geometry = buildGeometry('row-staggered');
const opts = (o: Partial<Options> = {}): Options => ({
  windowSize: 3,
  sfbHomeCost: true,
  ...o,
});

const BUILTIN_KANA_IDS = [
  'naginata-v18',
  'nicola',
  'shin-koume',
  'asuka',
  'shin-jis-prefix',
  'shin-jis-simultaneous',
  'shingeta',
  'tsuki-2-263',
] as const;

test('built-inかな配列はFaceのinputRole / triggerPersistenceを明示する', () => {
  for (const id of BUILTIN_KANA_IDS) {
    const layout = LAYOUT_BY_ID.get(id)!;
    assert.ok(layout.faces && layout.faces.length > 0, id);
    for (const face of layout.faces) {
      assert.notEqual(face.inputRole, undefined, `${id}: inputRole`);
      if (face.trigger.length > 0) {
        assert.notEqual(face.triggerPersistence, undefined, `${id}: triggerPersistence`);
      }
    }
  }
});

test('semantic migrationで物理Sequenceは変えない', () => {
  for (const id of BUILTIN_KANA_IDS) {
    const layout = LAYOUT_BY_ID.get(id)!;
    for (const [output, sequence] of layout.map) {
      const trace = evaluate(output, layout, geometry, opts());
      assert.equal(trace.skipped, 0, `${id}: ${output}`);
      assert.equal(trace.strokes.length, sequence.length, `${id}: ${output}`);
      for (const [index, step] of sequence.entries()) {
        const expected = step.map(resolveKeyId).sort();
        const actual = trace.strokes[index].presses
          .flatMap((press) => press.keys.map((key) => key.id))
          .sort();
        assert.deepEqual(actual, expected, `${id}: ${output} step ${index}`);
      }
    }
  }
});

test('薙刀式はsimultaneousとhold-capableを独立して持ち、Spaceだけ先押し制約を持つ', () => {
  const layout = LAYOUT_BY_ID.get('naginata-v18')!;

  for (const face of layout.faces ?? []) {
    if (face.trigger.length > 0) {
      assert.equal(face.mode, 'simultaneous');
      assert.equal(face.triggerPersistence, 'hold-capable');
    }
  }
  const centerFace = layout.faces?.find((face) => face.trigger.includes('space'));
  assert.equal(centerFace?.triggerOrder, 'prefix');
  for (const face of layout.faces ?? []) {
    if (face !== centerFace) assert.equal(face.triggerOrder, undefined);
  }

  const center = evaluate('え', layout, geometry, opts()).strokes[0];
  assert.equal(center.inputRole, 'modifier');
  assert.equal(center.triggerPersistence, 'hold-capable');
  assert.ok(center.participations.some((p) => p.roles.includes('trigger')));
  assert.ok(center.participations.every((p) => !p.roles.includes('held-trigger')));

  const voiced = evaluate('が', layout, geometry, opts()).strokes[0];
  assert.equal(voiced.inputRole, 'modifier');
  assert.equal(voiced.triggerPersistence, 'hold-capable');
  assert.ok(voiced.participations.some((p) => p.roles.includes('trigger')));
  assert.ok(voiced.participations.every((p) => !p.roles.includes('held-trigger')));

  const small = evaluate('ぁ', layout, geometry, opts()).strokes[0];
  assert.equal(small.inputRole, 'modifier');
  assert.equal(small.triggerPersistence, 'hold-capable');
  assert.ok(small.participations.some((p) => p.roles.includes('trigger')));

  const composition = evaluate('いぇ', layout, geometry, opts()).strokes[0];
  assert.equal(composition.inputRole, 'composition');
  assert.equal(composition.triggerPersistence, 'hold-capable');
  assert.ok(composition.participations.some((p) => p.roles.includes('trigger')));
  assert.ok(composition.participations.every((p) => !p.roles.includes('held-trigger')));
});

test('NICOLA / 新下駄は現在の同期Faceをsingleとして明示する', () => {
  const nicola = evaluate('え', LAYOUT_BY_ID.get('nicola')!, geometry, opts()).strokes[0];
  assert.equal(nicola.inputRole, 'modifier');
  assert.equal(nicola.triggerPersistence, 'single');
  assert.ok(nicola.participations.some((p) => p.roles.includes('trigger')));

  const shingetaModifier = evaluate('ご', LAYOUT_BY_ID.get('shingeta')!, geometry, opts()).strokes[0];
  assert.equal(shingetaModifier.inputRole, 'modifier');
  assert.equal(shingetaModifier.triggerPersistence, 'single');
  assert.ok(shingetaModifier.participations.some((p) => p.roles.includes('trigger')));

  const shingetaYouon = evaluate('きゃ', LAYOUT_BY_ID.get('shingeta')!, geometry, opts()).strokes[0];
  assert.equal(shingetaYouon.inputRole, 'modifier');
  assert.equal(shingetaYouon.triggerPersistence, 'single');
  assert.ok(shingetaYouon.participations.some((p) => p.roles.includes('trigger')));
});

test('月配列prefixはtrigger-only Stroke + singleとして正規化する', () => {
  const trace = evaluate('ぬ', LAYOUT_BY_ID.get('tsuki-2-263')!, geometry, opts());
  assert.equal(trace.strokes.length, 2);
  assert.equal(trace.strokes[0].inputRole, 'modifier');
  assert.equal(trace.strokes[0].triggerPersistence, 'single');
  assert.deepEqual(trace.strokes[0].participations[0].roles, ['trigger']);
  assert.equal(trace.strokes[1].triggerPersistence, undefined);
  assert.deepEqual(trace.strokes[1].participations[0].roles, ['output']);
  assert.ok(trace.strokes.flatMap((s) => s.participations).every((p) => !p.roles.includes('held-trigger')));
});

test('新JISはFaceModeとTriggerPersistenceを独立して持つ', () => {
  const prefix = evaluate('お', LAYOUT_BY_ID.get('shin-jis-prefix')!, geometry, opts());
  const simultaneous = evaluate('お', LAYOUT_BY_ID.get('shin-jis-simultaneous')!, geometry, opts());

  assert.equal(prefix.strokes.length, 2);
  assert.equal(simultaneous.strokes.length, 1);

  assert.equal(prefix.strokes[0].inputRole, 'modifier');
  assert.equal(prefix.strokes[0].triggerPersistence, 'single');
  assert.deepEqual(prefix.strokes[0].participations[0].roles, ['trigger']);
  assert.equal(prefix.strokes[1].triggerPersistence, undefined);
  assert.deepEqual(prefix.strokes[1].participations[0].roles, ['output']);

  assert.equal(simultaneous.strokes[0].inputRole, 'modifier');
  assert.equal(simultaneous.strokes[0].triggerPersistence, 'hold-capable');
  assert.ok(simultaneous.strokes[0].participations.some((p) => p.roles.includes('trigger')));

  for (const stroke of [...prefix.strokes, ...simultaneous.strokes]) {
    assert.ok(stroke.participations.every((p) => !p.roles.includes('held-trigger')));
  }
});

test('新JIS prefixの親指remap後もsemantic keyが一致する', () => {
  const layout = LAYOUT_BY_ID.get('shin-jis-prefix')!;
  const trace = evaluate('お', layout, geometry, opts({ preferOppositeThumb: true }));

  assert.equal(trace.strokes[0].presses[0].keys[0].id, 'thumb-l');
  assert.deepEqual(trace.strokes[0].triggerKeys, ['thumb-l']);
  assert.equal(trace.strokes[0].triggerPersistence, 'single');
  assert.deepEqual(trace.strokes[0].participations[0].roles, ['trigger']);
});
