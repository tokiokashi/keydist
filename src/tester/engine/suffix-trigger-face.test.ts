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
