import assert from 'node:assert/strict';
import { test } from 'node:test';
import { levelOverrides, withLevelOverrides, type CascadeOverrides, type LevelOverrides } from './overrides.ts';
import type { CascadeLevel } from './levels.ts';

interface TestValueMap {
  readonly windowSize: number;
}

const empty: CascadeOverrides<TestValueMap> = {};

test('levelOverrides/withLevelOverrides: 通常のidは往復できる（既存挙動の確認）', () => {
  const level: CascadeLevel = { kind: 'layout', layoutId: 'qwerty' };
  const next: LevelOverrides<TestValueMap> = { windowSize: 4 };
  const written = withLevelOverrides(empty, level, next);
  assert.deepEqual(levelOverrides(written, level), next);
});

test('levelOverrides: 上書きが無いidは"__proto__"/"constructor"でもObject.prototypeを拾わずundefinedを返す（レビュー再現ケース）', () => {
  // 素のbracket読み（`bucket[instanceKey]`）は、instanceKeyが"__proto__"だと
  // bucket自身がそれをown propertyとして持たない限りObject.prototypeを返してしまう
  // （undefinedにならない）。levelOverridesがそれを直接返さないことを確認する。
  for (const layoutId of ['__proto__', 'constructor', 'prototype']) {
    const result = levelOverrides(empty, { kind: 'layout', layoutId });
    assert.equal(result, undefined, `layoutId=${layoutId}`);
  }
});

test('withLevelOverrides: layoutIdが"__proto__"でも診断なしに正しく保存・読み出しできる（prototype汚染を起こさない）', () => {
  const level: CascadeLevel = { kind: 'layout', layoutId: '__proto__' };
  const next: LevelOverrides<TestValueMap> = { windowSize: 7 };
  const written = withLevelOverrides(empty, level, next);

  // 値そのものが正しく読み戻せる（`bucket["__proto__"] = next`という素の代入では
  // ここが`undefined`のままになっていた: 値がprototypeの差し替えとして消えるため）。
  assert.deepEqual(levelOverrides(written, level), next);

  // 他のオブジェクトのprototype chainが汚染されていないことも確認する
  // （Object.prototypeを直接書き換えていれば、無関係な新規オブジェクトにまで
  // 影響が漏れて見える）。
  assert.deepEqual(Object.getPrototypeOf({}), Object.prototype);
  assert.equal(('windowSize' in {}), false);

  // written自身のbucketも、実際にown propertyとして"__proto__"を持てている
  // （＝真にエントリとして保存されている）ことを確認する。
  const bucket = written.layout as Record<string, unknown>;
  assert.equal(Object.hasOwn(bucket, '__proto__'), true);
});

test('withLevelOverrides→削除: layoutIdが"__proto__"のエントリも他のidと同じくdeleteで消える', () => {
  const level: CascadeLevel = { kind: 'layout', layoutId: '__proto__' };
  const withEntry = withLevelOverrides(empty, level, { windowSize: 1 });
  const withoutEntry = withLevelOverrides(withEntry, level, undefined);
  assert.equal(levelOverrides(withoutEntry, level), undefined);
  // 唯一のエントリを消したので、layoutバケット自体も残らない（空オブジェクトを残さない既存仕様）。
  assert.equal(withoutEntry.layout, undefined);
});

test('withLevelOverrides: shapeId/setupId/inputMethodの各レベルでも"__proto__"を安全に扱える', () => {
  const levels: CascadeLevel[] = [
    { kind: 'shape', shapeId: '__proto__' },
    { kind: 'setup', setupId: '__proto__' },
    { kind: 'inputMethod', inputMethod: 'romaji' }, // inputMethodは型で3値に限定されるため__proto__は作れない。回帰確認のみ。
  ];
  for (const level of levels) {
    const next: LevelOverrides<TestValueMap> = { windowSize: 2 };
    const written = withLevelOverrides(empty, level, next);
    assert.deepEqual(levelOverrides(written, level), next);
  }
});
