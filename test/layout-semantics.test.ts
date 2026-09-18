import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildGeometry, resolveKeyId } from '../src/geometry.ts';
import { evaluate, type Options } from '../src/evaluate.ts';
import { LAYOUT_BY_ID, type Layout } from '../src/layouts/index.ts';

const geometry = buildGeometry('row-staggered');
const opts = (o: Partial<Options> = {}): Options => ({
  windowSize: 3,
  sfbHomeCost: true,
  ...o,
});

const BUILTIN_KANA_IDS = [
  'naginata-v18',
  'nicola',
  'shin-jis-prefix',
  'shin-jis-simultaneous',
  'shingeta',
  'tsuki-2-263',
] as const;

test('built-inかな配列はFaceのinputRoleを明示し、同期triggerだけchordを明示する', () => {
  for (const id of BUILTIN_KANA_IDS) {
    const layout = LAYOUT_BY_ID.get(id)!;
    assert.ok(layout.faces && layout.faces.length > 0, id);
    for (const face of layout.faces) {
      assert.notEqual(face.inputRole, undefined, `${id}: inputRole`);
      if (face.trigger.length === 0) continue;

      if (face.mode === 'simultaneous') {
        assert.notEqual(face.triggerBehavior, undefined, `${id}: simultaneous triggerBehavior`);
      } else {
        assert.equal(
          face.triggerBehavior,
          undefined,
          `${id}: sequential trigger must not be inferred as chord/hold`,
        );
      }
    }
  }
});

test('built-inかな配列は全SequenceにstepSemanticsを持つ', () => {
  for (const id of BUILTIN_KANA_IDS) {
    const layout = LAYOUT_BY_ID.get(id)!;
    for (const [output, sequence] of layout.map) {
      const semantics = layout.stepSemantics?.get(output);
      assert.ok(semantics, `${id}: ${output}`);
      assert.equal(semantics.length, sequence.length, `${id}: ${output}`);
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

test('代表FaceのinputRole / triggerBehaviorが意味どおり伝播する', () => {
  const naginata = evaluate('え', LAYOUT_BY_ID.get('naginata-v18')!, geometry, opts()).strokes[0];
  assert.equal(naginata.inputRole, 'modifier');
  assert.deepEqual(naginata.participations.find((p) => p.roles.includes('held-trigger'))?.roles, ['held-trigger']);

  const naginataComposition = evaluate('いぇ', LAYOUT_BY_ID.get('naginata-v18')!, geometry, opts()).strokes[0];
  assert.equal(naginataComposition.inputRole, 'composition');
  assert.ok(naginataComposition.participations.some((p) => p.roles.includes('chord-trigger')));

  const nicola = evaluate('え', LAYOUT_BY_ID.get('nicola')!, geometry, opts()).strokes[0];
  assert.equal(nicola.inputRole, 'modifier');
  assert.ok(nicola.participations.some((p) => p.roles.includes('chord-trigger')));

  const shingetaModifier = evaluate('ご', LAYOUT_BY_ID.get('shingeta')!, geometry, opts()).strokes[0];
  assert.equal(shingetaModifier.inputRole, 'modifier');
  const shingetaComposition = evaluate('きゃ', LAYOUT_BY_ID.get('shingeta')!, geometry, opts()).strokes[0];
  assert.equal(shingetaComposition.inputRole, 'composition');

  const tsuki = evaluate('ぬ', LAYOUT_BY_ID.get('tsuki-2-263')!, geometry, opts());
  assert.equal(tsuki.strokes[0].inputRole, 'modifier');
  assert.ok(tsuki.strokes[0].participations.every((p) => !p.roles.includes('chord-trigger')));
  assert.ok(tsuki.strokes[0].participations.every((p) => !p.roles.includes('held-trigger')));
});

test('新JISはprefix/simultaneousの順序とsemanticを独立して持つ', () => {
  const prefix = evaluate('お', LAYOUT_BY_ID.get('shin-jis-prefix')!, geometry, opts());
  const simultaneous = evaluate('お', LAYOUT_BY_ID.get('shin-jis-simultaneous')!, geometry, opts());

  assert.equal(prefix.strokes.length, 2);
  assert.equal(simultaneous.strokes.length, 1);
  assert.equal(prefix.strokes[0].inputRole, 'modifier');
  assert.equal(simultaneous.strokes[0].inputRole, 'modifier');
  assert.ok(prefix.strokes[0].participations.every((p) => !p.roles.includes('chord-trigger')));
  assert.ok(prefix.strokes[0].participations.every((p) => !p.roles.includes('held-trigger')));
  assert.ok(simultaneous.strokes[0].participations.some((p) => p.roles.includes('chord-trigger')));
});

function assertComposedSemantics(layout: Layout, source: string, mark: string, output: string) {
  const sourceSemantics = layout.stepSemantics?.get(source);
  const markSemantics = layout.stepSemantics?.get(mark);
  const outputSemantics = layout.stepSemantics?.get(output);
  assert.ok(sourceSemantics);
  assert.ok(markSemantics);
  assert.ok(outputSemantics);
  assert.deepEqual(outputSemantics, [...sourceSemantics, ...markSemantics]);
}

test('新JIS / 月配列の合成出力へstepSemanticsを連結する', () => {
  assertComposedSemantics(LAYOUT_BY_ID.get('shin-jis-prefix')!, 'か', '゛', 'が');
  assertComposedSemantics(LAYOUT_BY_ID.get('shin-jis-simultaneous')!, 'か', '゛', 'が');
  assertComposedSemantics(LAYOUT_BY_ID.get('tsuki-2-263')!, 'か', '゛', 'が');
});

test('新JIS prefixの親指remap後もsemantic keyが一致する', () => {
  const layout = LAYOUT_BY_ID.get('shin-jis-prefix')!;
  const trace = evaluate('お', layout, geometry, opts({ preferOppositeThumb: true }));

  assert.equal(trace.strokes[0].presses[0].keys[0].id, 'thumb-l');
  assert.deepEqual(trace.strokes[0].triggerKeys, ['thumb-l']);
  assert.deepEqual(trace.strokes[0].participations[0].roles, []);
});
