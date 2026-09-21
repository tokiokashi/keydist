import { test } from 'node:test';
import assert from 'node:assert/strict';
import { faceFromEntries, type Face } from '../src/layouts/index.ts';
import { validateFaceAuthoring } from '../src/layouts/face-authoring-validation.ts';
import { fromFaces } from '../src/layouts/types.ts';

const face = (
  trigger: readonly string[],
  target: string,
  options: Partial<Face> = {},
): Face => ({
  ...faceFromEntries(trigger, 'simultaneous', { [target]: 'あ' }),
  layer: '相互',
  ...options,
});

test('Face authoring layer validationは合法なreciprocal foldを許可する', () => {
  assert.doesNotThrow(() => validateFaceAuthoring([
    face(['k'], 'd'),
    face(['d'], 'k'),
  ]));
});

test('Face authoring layer validationは各authoring invariantを個別に検証する', () => {
  const cases: readonly {
    name: string;
    faces: readonly Face[];
    expected: RegExp;
  }[] = [
    {
      name: 'composition + layer',
      faces: [face(['k'], 'd', { inputRole: 'composition' })],
      expected: /コンボ面にはレイヤーを宣言できない/,
    },
    {
      name: 'presentation role混在',
      faces: [
        face(['k'], 'd', { role: 'modifier' }),
        face(['d'], 'k'),
      ],
      expected: /異なる役割の面を混在させられない/,
    },
    {
      name: 'triggerが単一キーでない',
      faces: [
        face(['k', 'l'], 'd'),
        face(['d'], 'k'),
      ],
      expected: /triggerは単一キーである必要がある/,
    },
    {
      name: 'mode不一致',
      faces: [
        face(['k'], 'd'),
        face(['d'], 'k', { mode: 'prefix' }),
      ],
      expected: /modeが異なる/,
    },
    {
      name: 'triggerOrder不一致',
      faces: [
        face(['k'], 'd', { triggerOrder: 'prefix' }),
        face(['d'], 'k'),
      ],
      expected: /triggerOrderが異なる/,
    },
    {
      name: 'triggerが逆手でない',
      faces: [
        face(['k'], 'd'),
        face(['l'], 'f'),
      ],
      expected: /triggerが逆手でない/,
    },
    {
      name: '対象セル重複',
      faces: [
        face(['k'], 'd'),
        face(['d'], 'd'),
      ],
      expected: /対象セルが重複している/,
    },
    {
      name: '対象セルが逆手でない',
      faces: [
        face(['k'], 'd'),
        face(['d'], 'f'),
      ],
      expected: /対象セルが逆手でない/,
    },
  ];

  for (const entry of cases) {
    assert.throws(
      () => validateFaceAuthoring(entry.faces),
      entry.expected,
      entry.name,
    );
  }
});

test('layer未指定Faceはfolding validation対象にしない', () => {
  assert.doesNotThrow(() => validateFaceAuthoring([
    {
      ...faceFromEntries(['k', 'l'], 'simultaneous', { d: 'あ' }),
      inputRole: 'layer',
    },
    {
      ...faceFromEntries(['d'], 'prefix', { k: 'い' }),
      inputRole: 'layer',
    },
  ]));
});


test('presentation trigger metadataの不正はfromFaces constructor境界でrejectする', () => {
  const base: Face = {
    ...faceFromEntries(['space'], 'simultaneous', { j: 'あ' }),
    inputRole: 'modifier',
    triggerPersistence: 'single',
  };

  assert.throws(
    () => fromFaces('invalid-empty-alternatives', 'invalid-empty-alternatives', [{
      ...base,
      presentationTriggerAlternatives:
        [] as unknown as NonNullable<Face['presentationTriggerAlternatives']>,
    }]),
    /presentationTriggerAlternativesは空にできない（face:0）/,
  );

  assert.throws(
    () => fromFaces('invalid-empty-chord', 'invalid-empty-chord', [{
      ...base,
      presentationTriggerAlternatives:
        [[]] as unknown as NonNullable<Face['presentationTriggerAlternatives']>,
    }]),
    /presentationTriggerAlternatives\[0\]は空にできない（face:0）/,
  );
});
