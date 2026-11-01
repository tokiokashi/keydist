import test from 'node:test';
import assert from 'node:assert/strict';
import { TypingInputEngine } from './index.ts';
import { faceFromEntries, fromFaces, type Face } from '#input/layouts/index.ts';

test('前置・本体・後置の3打の面を、物理キーの順次打鍵から認識する', () => {
  const base: Face = {
    ...faceFromEntries([], 'simultaneous', { j: 'じ', k: 'ひ', e: '、' }),
    inputRole: 'layer',
  };
  const three: Face = {
    ...faceFromEntries(['j'], 'prefix', { k: 'ひゃ' }),
    suffixTrigger: ['e'],
    inputRole: 'layer',
    triggerPersistence: 'single',
  };
  const engine = new TypingInputEngine(fromFaces('three-stroke', 'three-stroke', [base, three]).canonicalInputs);
  const outputs: string[] = [];
  for (const [type, key] of [
    ['down', 'j'],
    ['up', 'j'],
    ['down', 'k'],
    ['up', 'k'],
    ['down', 'e'],
    ['up', 'e'],
  ] as const) {
    outputs.push(...engine.handle({ type, key }).recognized.map((entry) => entry.output));
  }
  assert.deepEqual(outputs, ['ひゃ']);
});

const SINGLE_FACE: Face = {
  ...faceFromEntries([], 'simultaneous', { j: 'じ', k: 'ひ', e: '、', a: 'あ' }),
  inputRole: 'layer',
};

const THREE_STROKE_FACE: Face = {
  ...faceFromEntries(['j'], 'prefix', { k: 'ひゃ' }),
  suffixTrigger: ['e'],
  inputRole: 'layer',
  triggerPersistence: 'single',
};

const TWO_STROKE_FACE: Face = {
  ...faceFromEntries(['j'], 'prefix', { k: 'び' }),
  inputRole: 'layer',
  triggerPersistence: 'single',
};

/** 各キーをdown、upの順に打ち、最後にflushして、認識された出力を順に返す。 */
function typeKeys(faces: readonly Face[], keys: readonly string[]): string[] {
  const engine = new TypingInputEngine(fromFaces('three-stroke', 'three-stroke', faces).canonicalInputs);
  const outputs: string[] = [];
  const collect = (recognized: readonly { readonly output: string }[]) => outputs.push(...recognized.map((entry) => entry.output));
  for (const key of keys) {
    collect(engine.handle({ type: 'down', key }).recognized);
    collect(engine.handle({ type: 'up', key }).recognized);
  }
  collect(engine.flush().recognized);
  return outputs;
}

test('3打の面の途中で別のキーへ進むと、押した順に単打の出力を確定する', () => {
  const faces = [SINGLE_FACE, THREE_STROKE_FACE];
  assert.deepEqual(typeKeys(faces, ['j', 'k', 'e']), ['ひゃ']);
  assert.deepEqual(typeKeys(faces, ['j', 'k', 'k']), ['じ', 'ひ', 'ひ']);
  assert.deepEqual(typeKeys(faces, ['j', 'k', 'a']), ['じ', 'ひ', 'あ']);
});

test('3打の面と同じ前置の2打の面があっても、打ち直した同じキーは前の打鍵の続きにならない', () => {
  const faces = [SINGLE_FACE, TWO_STROKE_FACE, THREE_STROKE_FACE];
  assert.deepEqual(typeKeys(faces, ['j', 'k', 'e']), ['ひゃ']);
  assert.deepEqual(typeKeys(faces, ['j', 'k', 'k']), ['び', 'ひ']);
  assert.deepEqual(typeKeys(faces, ['j', 'k']), ['び']);
});
