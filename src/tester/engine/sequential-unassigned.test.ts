import test from 'node:test';
import assert from 'node:assert/strict';
import { TypingInputEngine } from './index.ts';
import { loadedKanjiDirectLayout } from '../../../test/kanji-direct-tables.ts';
import type { CanonicalInputMap } from '#input/semantics/index.ts';

/** 各キーをdown、upの順に打ち、最後にflushして、認識された出力を順に返す。 */
function typeKeys(canonicalInputs: CanonicalInputMap, keys: readonly string[]): string[] {
  const engine = new TypingInputEngine(canonicalInputs);
  const outputs: string[] = [];
  for (const key of keys) {
    outputs.push(...engine.handle({ type: 'down', key }).recognized.map((entry) => entry.output));
    outputs.push(...engine.handle({ type: 'up', key }).recognized.map((entry) => entry.output));
  }
  outputs.push(...engine.flush().recognized.map((entry) => entry.output));
  return outputs;
}

const TCODE = loadedKanjiDirectLayout('tcode').canonicalInputs;
const TUT = loadedKanjiDirectLayout('tut-code').canonicalInputs;
const SECCA = loadedKanjiDirectLayout('secca').canonicalInputs;

test('T-Code: 割り当ての無い組は、1打目も2打目も文字を出さず、次の入力の1打目に使わない', () => {
  assert.deepEqual(typeKeys(TCODE, ['1', '1']), []);
  assert.deepEqual(typeKeys(TCODE, ['1', '1', 'l']), []);
  assert.deepEqual(typeKeys(TCODE, ['1', '1', '1', 'l']), ['執']);
  assert.deepEqual(typeKeys(TCODE, ['1', '1', 'l', '4']), ['漢']);
});

test('TUT-Code: 2打の組の割り当てが無ければ、2打目が1打の文字でも出さず、打ちかけの入力も取り消す', () => {
  assert.deepEqual(typeKeys(TUT, ['q', 'q']), ['並']);
  assert.deepEqual(typeKeys(TUT, ['q', '1']), []);
  assert.deepEqual(typeKeys(TUT, ['q', '1', 'q', 'q']), ['並']);
  assert.deepEqual(typeKeys(TUT, ['q', '1', '1']), ['1']);
});

test('TUT-Code: 3打の入力の途中で割り当ての無い打鍵を続けても、同じように取り消す', () => {
  assert.deepEqual(typeKeys(TUT, ['q', 't', 'y']), ['智']);
  assert.deepEqual(typeKeys(TUT, ['q', 't', '1']), []);
  assert.deepEqual(typeKeys(TUT, ['q', 't', '1', 'q', 'q']), ['並']);
});

test('雪華: 1打目が文字を出す入力の後は取り消す打ちかけが無いので、割り当ての無い組でも2打目は新しい入力になる', () => {
  assert.deepEqual(typeKeys(SECCA, [',', ',']), ['ん', 'ん']);
});
