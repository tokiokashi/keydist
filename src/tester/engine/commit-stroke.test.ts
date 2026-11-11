import test from 'node:test';
import assert from 'node:assert/strict';
import { TypingInputEngine, type TypingInputEngineOptions } from './index.ts';
import { faceFromEntries, fromFaces, type Face } from '#input/layouts/index.ts';
import { TSUKI_EX } from '#input/layouts/tsuki-ex.ts';
import { YUMI } from '#input/layouts/yumi.ts';
import type { CanonicalInputMap } from '#input/semantics/index.ts';

const COMMIT = 'thumb-r';

/** 各キーをdown、upの順に打ち、最後にflushして、認識された出力を順に返す。置き換えは `(←前の出力)` で添える。 */
function typeKeys(canonicalInputs: CanonicalInputMap, keys: readonly string[], options: TypingInputEngineOptions = { commitKey: COMMIT }): string[] {
  const engine = new TypingInputEngine(canonicalInputs, { triggerRealizationPolicy: { useHold: true }, ...options });
  const outputs: string[] = [];
  const collect = (recognized: readonly { readonly output: string; readonly replacePreviousText?: string }[]) =>
    outputs.push(
      ...recognized.map((entry) => (entry.replacePreviousText === undefined ? entry.output : `${entry.output}(←${entry.replacePreviousText})`)),
    );
  for (const key of keys) {
    collect(engine.handle({ type: 'down', key }).recognized);
    collect(engine.handle({ type: 'up', key }).recognized);
  }
  collect(engine.flush().recognized);
  return outputs;
}

test('弓配列: く の次に確定の打鍵を押すと く ゃ、押さずに続けると ひゃ の面の入力になる', () => {
  assert.deepEqual(typeKeys(YUMI.canonicalInputs, ['n', 'b']), ['ひゃ']);
  assert.deepEqual(typeKeys(YUMI.canonicalInputs, ['n', COMMIT, 'b']), ['く', 'ゃ']);
});

test('月配列E-X: 前置トリガーの単打の直後に確定の打鍵を押すと、前置の面にならず単打の入力になる', () => {
  assert.deepEqual(typeKeys(TSUKI_EX.canonicalInputs, ['k', 'a']), ['え']);
  assert.deepEqual(typeKeys(TSUKI_EX.canonicalInputs, ['k', COMMIT, 'a']), ['。', 'の']);
});

const SINGLE: Face = { ...faceFromEntries([], 'simultaneous', { j: 'じ', k: 'ひ', e: '、', a: 'あ' }), inputRole: 'layer' };
const THUMB_PREFIX: Face = { ...faceFromEntries(['space'], 'prefix', { a: 'ぁ' }), inputRole: 'layer', triggerPersistence: 'single' };
const TWO_STROKE: Face = { ...faceFromEntries(['j'], 'prefix', { k: 'び' }), inputRole: 'layer', triggerPersistence: 'single' };
const THREE_STROKE: Face = { ...faceFromEntries(['j'], 'prefix', { k: 'ひゃ' }), suffixTrigger: ['e'], inputRole: 'layer', triggerPersistence: 'single' };
const FACES = [SINGLE, TWO_STROKE, THREE_STROKE, THUMB_PREFIX];
const layout = fromFaces('commit-test', 'commit-test', FACES);

test('前置と出力キーの順次打鍵を確定した後の確定の打鍵は、続く後置トリガーを同じ面にしない', () => {
  assert.deepEqual(typeKeys(layout.canonicalInputs, ['j', 'k', 'e']), ['ひゃ']);
  assert.deepEqual(typeKeys(layout.canonicalInputs, ['j', 'k', COMMIT, 'e']), ['び', '、']);
});

test('確定の打鍵は文字を出さない。継ぎ目でない時と、確定の打鍵の直後の押下は、配列がその位置に持つ入力として読む', () => {
  // 右親指のキーを前置トリガーに持つ配列。継ぎ目でない `a` の後の `thumb-r` は、通常どおり前置トリガーとして `a` を ぁ にする
  assert.deepEqual(typeKeys(layout.canonicalInputs, ['a', COMMIT, 'a']), ['あ', 'ぁ']);
  assert.deepEqual(typeKeys(layout.canonicalInputs, ['j', 'k', COMMIT]), ['び']);
  assert.deepEqual(typeKeys(layout.canonicalInputs, ['j', 'k', COMMIT, COMMIT, 'a']), ['び', 'ぁ']);
});

test('右親指のキーが前置トリガーでもある配列でも、継ぎ目の確定の打鍵は前置トリガーにならない。確定の打鍵を扱わなければ前置トリガーになる', () => {
  assert.deepEqual(typeKeys(layout.canonicalInputs, ['j', 'k', COMMIT, 'a']), ['び', 'あ']);
  assert.deepEqual(typeKeys(layout.canonicalInputs, ['j', 'k', COMMIT, 'a'], {}), ['び', 'ぁ']);
});

test('確定の打鍵が要る継ぎ目を持たない配列では、確定の打鍵のキーを指定しても何も変わらない', () => {
  const plain = fromFaces('plain', 'plain', [SINGLE, THUMB_PREFIX]);
  assert.deepEqual(typeKeys(plain.canonicalInputs, ['a', 'k']), typeKeys(plain.canonicalInputs, ['a', 'k'], {}));
});
