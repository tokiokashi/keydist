import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { assertKanaLayout } from '../../../test/kana-layout-helpers.ts';
import { LAYOUT_BY_ID } from './index.ts';
import { uncoveredKana } from './kana-coverage.ts';

const layout = LAYOUT_BY_ID.get('naginata-private')!;

/** 出典のエンジンの表から起こした、出力と押すキーの組。`oneOf` はどれか1つを足すシフトのキー。 */
const source = JSON.parse(readFileSync(new URL('../../../test/fixtures/sources/naginata-private.json', import.meta.url), 'utf8')) as {
  chords: Array<{ output: string; keys: string[]; oneOf?: string[] }>;
};

const keySet = (keys: readonly string[]): string => [...keys].sort().join('+');

/** 出力ごとの、出典が認める同時押しのキーの組。 */
function sourceKeySets(): Map<string, Set<string>> {
  const sets = new Map<string, Set<string>>();
  for (const chord of source.chords) {
    const group = sets.get(chord.output) ?? new Set<string>();
    for (const extra of chord.oneOf ?? [[]]) group.add(keySet([...chord.keys, ...extra]));
    sets.set(chord.output, group);
  }
  return sets;
}

/** 配列の、出力ごとの打ち方。どれも1ステップの同時押しなので、キーの組で表す。 */
function layoutKeySets(output: string): string[] {
  return (layout.canonicalInputs.get(output) ?? []).map((alternative) => {
    const steps = alternative.baseRealizations.flatMap((realization) => realization.actions);
    assert.equal(steps.length, 1, `${output} が1ステップでない`);
    return keySet(steps[0]!);
  });
}

test('標準的なかなをすべて打てる', () => {
  // 出典は ゔ を出し、ヴ を出さない
  assertKanaLayout(layout, ['ヴ']);
  assert.deepEqual(uncoveredKana(layout), []);
});

test('配列の打ち方はどれも出典のエンジンが同じ出力にするキーの組で、出典の出力はすべて打てる', () => {
  const expected = sourceKeySets();
  assert.deepEqual(
    [...layout.canonicalInputs.keys()].filter((output) => !expected.has(output)),
    [],
  );
  for (const [output, allowed] of expected) {
    const actual = layoutKeySets(output);
    assert.ok(actual.length > 0, `${output} を打てない`);
    for (const keys of actual) assert.ok(allowed.has(keys), `${output} の ${keys} は出典に無い`);
  }
});

test('既定の打ち方のシフトと印は、かなのキーか子音のキーと反対の手にある', () => {
  const left = new Set([...'qwertasdfgzxcvb']);
  const shifts = new Set([...'dkfjvm']);
  for (const chord of source.chords) {
    if (chord.oneOf === undefined || chord.oneOf.length < 2) continue;
    const defaultKeys = layoutKeySets(chord.output)[0]!.split('+');
    const [base] = chord.keys;
    const marker = defaultKeys.filter((key) => shifts.has(key) && !chord.keys.includes(key));
    assert.equal(marker.length, 1, `${chord.output} の既定の打ち方 ${defaultKeys.join('+')}`);
    assert.notEqual(left.has(marker[0]!), left.has(base!), `${chord.output} の既定の打ち方 ${defaultKeys.join('+')}`);
  }
});
