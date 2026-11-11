import { test } from 'node:test';
import assert from 'node:assert/strict';
import { faceFromEntries, LAYOUT_BY_ID, type Face } from './index.ts';
import { validateFaceAuthoring } from './face-authoring-validation.ts';
import { fromFaces } from './types.ts';

const face = (trigger: readonly string[], target: string, options: Partial<Face> = {}): Face => ({
  ...faceFromEntries(trigger, 'simultaneous', { [target]: 'あ' }),
  layer: '相互',
  ...options,
});

test('Face authoring layer validationは合法なreciprocal foldを許可する', () => {
  assert.doesNotThrow(() => validateFaceAuthoring([face(['k'], 'd'), face(['d'], 'k')]));
});

test('Face authoring layer validationは各authoring invariantを個別に検証する', () => {
  const cases: readonly {
    name: string;
    faces: readonly Face[];
    expected: RegExp;
  }[] = [
    {
      name: 'composition + layer',
      faces: [face(['k'], 'd', { inputRole: 'composition', compositionAggregation: 'combo' })],
      expected: /コンボ枠に計上する面にはレイヤーを宣言できない/,
    },
    {
      name: 'presentation role混在',
      faces: [face(['k'], 'd', { role: 'modifier' }), face(['d'], 'k')],
      expected: /異なる役割の面を混在させられない/,
    },
    {
      name: 'triggerが単一キーでない',
      faces: [face(['k', 'l'], 'd'), face(['d'], 'k')],
      expected: /triggerは単一キーである必要がある/,
    },
    {
      name: 'mode不一致',
      faces: [face(['k'], 'd'), face(['d'], 'k', { mode: 'prefix' })],
      expected: /modeが異なる/,
    },
    {
      name: 'triggerOrder不一致',
      faces: [face(['k'], 'd', { triggerOrder: 'prefix' }), face(['d'], 'k')],
      expected: /triggerOrderが異なる/,
    },
    {
      name: 'triggerが逆手でない',
      faces: [face(['k'], 'd'), face(['l'], 'f')],
      expected: /triggerが逆手でない/,
    },
    {
      name: '対象セル重複',
      faces: [face(['k'], 'd'), face(['d'], 'd')],
      expected: /対象セルが重複している/,
    },
    {
      name: '対象セルが逆手でない',
      faces: [face(['k'], 'd'), face(['d'], 'f')],
      expected: /対象セルが逆手でない/,
    },
  ];

  for (const entry of cases) {
    assert.throws(() => validateFaceAuthoring(entry.faces), entry.expected, entry.name);
  }
});

test('layer未指定Faceはfolding validation対象にしない', () => {
  assert.doesNotThrow(() =>
    validateFaceAuthoring([
      {
        ...faceFromEntries(['k', 'l'], 'simultaneous', { d: 'あ' }),
        inputRole: 'layer',
      },
      {
        ...faceFromEntries(['d'], 'prefix', { k: 'い' }),
        inputRole: 'layer',
      },
    ]),
  );
});

test('presentation trigger metadataの不正はfromFaces constructor境界でrejectする', () => {
  const base: Face = {
    ...faceFromEntries(['space'], 'simultaneous', { j: 'あ' }),
    inputRole: 'modifier',
    triggerPersistence: 'single',
  };

  assert.throws(
    () =>
      fromFaces('invalid-empty-alternatives', 'invalid-empty-alternatives', [
        {
          ...base,
          presentationTriggerAlternatives: [] as unknown as NonNullable<Face['presentationTriggerAlternatives']>,
        },
      ]),
    /presentationTriggerAlternativesは空にできない（face:0）/,
  );

  assert.throws(
    () =>
      fromFaces('invalid-empty-chord', 'invalid-empty-chord', [
        {
          ...base,
          presentationTriggerAlternatives: [[]] as unknown as NonNullable<Face['presentationTriggerAlternatives']>,
        },
      ]),
    /presentationTriggerAlternatives\[0\]は空にできない（face:0）/,
  );
});

test('extraCellsは左端の列の3つのキーだけを許す', () => {
  const withExtra = (key: string): Face => ({ ...faceFromEntries([], 'simultaneous', {}), extraCells: { [key]: 'あ' } });
  for (const key of ['backquote', 'tab', 'caps-lock']) {
    assert.doesNotThrow(() => validateFaceAuthoring([withExtra(key)]), key);
  }
  for (const key of ['q', 'shift-l', 'space', 'enter']) {
    assert.throws(() => validateFaceAuthoring([withExtra(key)]), /extraCellsに使えるのは左端の列の3つのキーだけ/, key);
  }
});

test('コンボとして数える面のextraCellsも検査する', () => {
  const { layer: _layer, ...base } = face(['k'], 'd', { inputRole: 'composition', compositionAggregation: 'combo' });
  const comboFace: Face = { ...base, extraCells: { q: 'あ' } };
  assert.throws(() => validateFaceAuthoring([comboFace]), /extraCellsに使えるのは左端の列の3つのキーだけ/);
});

test('組み込みの全配列の面が、extraCellsの検査を通る', () => {
  for (const layout of LAYOUT_BY_ID.values()) {
    assert.doesNotThrow(() => validateFaceAuthoring(layout.faces ?? []), layout.id);
  }
});

const routeKeys = (layout: ReturnType<typeof fromFaces>, output: string): string[] =>
  (layout.canonicalInputs.get(output) ?? []).map((alternative) =>
    alternative.baseRealizations
      .flatMap((r) => r.actions)
      .flat()
      .join(''),
  );

const baseFace = (entries: Record<string, string>, defaultCells?: readonly string[]): Face => ({
  ...faceFromEntries([], 'simultaneous', entries),
  inputRole: 'layer',
  ...(defaultCells === undefined ? {} : { defaultCells }),
});

test('defaultCellsは、同じ面の中の同じ出力の先頭の経路を決め、他の出力の並びを変えない', () => {
  const entries = { '1': 'ー', q: 'あ', w: 'ー', e: 'い', r: 'ー', t: 'う' };
  const plain = fromFaces('plain', 'plain', [baseFace(entries)]);
  assert.deepEqual(routeKeys(plain, 'ー'), ['1', 'w', 'r']);
  const marked = fromFaces('marked', 'marked', [baseFace(entries, ['r'])]);
  assert.deepEqual(routeKeys(marked, 'ー'), ['r', '1', 'w']);
  for (const output of ['あ', 'い', 'う']) assert.deepEqual(routeKeys(marked, output), routeKeys(plain, output));
});

test('defaultCellsは、面をまたぐ並びを変えない', () => {
  const trigger: Face = { ...faceFromEntries(['d'], 'prefix', { a: 'ー' }), inputRole: 'layer', triggerPersistence: 'single' };
  const marked = fromFaces('cross', 'cross', [baseFace({ q: 'ー', w: 'ー' }, ['w']), trigger]);
  assert.deepEqual(routeKeys(marked, 'ー'), ['w', 'q', 'da']);
});

test('defaultCellsは、面に出力が無いキー・同じ出力の他のセルが無いキー・同じ出力を2つ指す定義を弾く', () => {
  assert.throws(() => fromFaces('a', 'a', [baseFace({ q: 'あ', w: 'あ' }, ['e'])]), /defaultCellsのキー「e」は面に出力が無い/);
  assert.throws(() => fromFaces('b', 'b', [baseFace({ q: 'あ', w: 'い' }, ['q'])]), /面の中に他のセルが無い/);
  assert.throws(() => fromFaces('c', 'c', [baseFace({ q: 'あ', w: 'あ' }, ['q', 'w'])]), /同じ出力「あ」のセルを2つ以上指している/);
});
