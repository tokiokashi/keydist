import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as v from 'valibot';
import type { CodecDiagnostic } from '#input/codec/index.ts';
import { decodeCascadeOverrides, encodeCascadeOverrides, type ItemSchemaMap } from './codec.ts';
import type { CascadeOverrides } from './overrides.ts';

/** テスト用の小さなレジストリ相当: 2項目だけの値写像。 */
interface TestValueMap {
  readonly enabled: boolean;
  readonly windowSize: number;
}

type CascadeOverridesForTest = CascadeOverrides<TestValueMap>;

const testItemSchemas: ItemSchemaMap<TestValueMap> = {
  enabled: v.boolean(),
  windowSize: v.pipe(v.number(), v.integer(), v.minValue(1)),
};

test('decodeCascadeOverrides: オブジェクトでなければ空の上書きを返す', () => {
  const diagnostics: CodecDiagnostic[] = [];
  for (const raw of [null, 'x', 42, []]) {
    assert.deepEqual(decodeCascadeOverrides(testItemSchemas, raw, 'overrides', diagnostics), {});
  }
});

test('decodeCascadeOverrides: 妥当な値はレベルをまたいでそのまま読める（globalとインスタンス系）', () => {
  const diagnostics: CodecDiagnostic[] = [];
  const raw = {
    global: { enabled: true },
    shape: { 'shape-a': { windowSize: 4 } },
    layout: { qwerty: { enabled: false, windowSize: 2 } },
  };
  const result = decodeCascadeOverrides(testItemSchemas, raw, 'overrides', diagnostics);
  assert.deepEqual(result, raw);
  assert.deepEqual(diagnostics, []);
});

test('decodeCascadeOverrides: 未知の項目idは捨てて診断を積む', () => {
  const diagnostics: CodecDiagnostic[] = [];
  const result = decodeCascadeOverrides(
    testItemSchemas,
    { global: { enabled: true, notARealItem: 123 } },
    'overrides',
    diagnostics,
  );
  assert.deepEqual(result, { global: { enabled: true } });
  assert.equal(diagnostics.length, 1);
  assert.match(diagnostics[0].message, /未知の項目「notARealItem」/);
});

test('decodeCascadeOverrides: 型の合わない値は項目単位で捨てて診断を積む', () => {
  const diagnostics: CodecDiagnostic[] = [];
  const result = decodeCascadeOverrides(
    testItemSchemas,
    { global: { enabled: 'yes', windowSize: 3 } },
    'overrides',
    diagnostics,
  );
  assert.deepEqual(result, { global: { windowSize: 3 } });
  assert.equal(diagnostics.length, 1);
  assert.equal(diagnostics[0].path, 'overrides.global.enabled');
});

test('decodeCascadeOverrides: 全項目が捨てられたレベルはエントリごと消える（空オブジェクトを残さない）', () => {
  const diagnostics: CodecDiagnostic[] = [];
  const result = decodeCascadeOverrides(
    testItemSchemas,
    { layout: { qwerty: { enabled: 'yes' } } },
    'overrides',
    diagnostics,
  );
  assert.deepEqual(result, {});
});

test('decodeCascadeOverrides: 許可されていないレベルに値があっても、codecは型が合えば残す（可否はresolveの役目）', () => {
  // testItemSchemasはレベルの許可を知らない。ここでは「型検査だけがcodecの仕事」であることを、
  // 値そのものは通ることで確認する（レベルの可否はresolveCascadeが判定する。codec.ts先頭コメント参照）。
  const diagnostics: CodecDiagnostic[] = [];
  const result = decodeCascadeOverrides(
    testItemSchemas,
    { setup: { 's-1': { enabled: true } } },
    'overrides',
    diagnostics,
  );
  assert.deepEqual(result, { setup: { 's-1': { enabled: true } } });
  assert.deepEqual(diagnostics, []);
});

test('decodeCascadeOverrides: JSON.parse由来の"__proto__"を項目idに使った上書きは例外を投げず、未知の項目として捨てる（レビュー再現ケース）', () => {
  // `schemas["__proto__"]`という素のbracketアクセスは、schemasがそれをown
  // propertyとして持たない限りObject.prototypeの継承accessorを踏んでschemas自身の
  // prototypeを返してしまい（undefinedにならない）、そのままvalibotへ渡すと
  // `schema.~run is not a function`のTypeErrorになっていた（decodeは例外を投げない
  // 原則に反する）。JSON.parseはリテラルなown property "__proto__"を作れてしまう
  // （代入のexotic setterを経由しないため）ので、外部由来のJSON文字列として再現する。
  const raw = JSON.parse('{"global":{"__proto__":{"windowSize":5}}}') as unknown;
  const diagnostics: CodecDiagnostic[] = [];
  let result: CascadeOverridesForTest | undefined;
  assert.doesNotThrow(() => {
    result = decodeCascadeOverrides(testItemSchemas, raw, 'overrides', diagnostics);
  });
  assert.deepEqual(result, {});
  assert.equal(diagnostics.length, 1);
  assert.match(diagnostics[0].message, /未知の項目「__proto__」/);
});

test('decodeCascadeOverrides: "constructor"を項目idに使った上書きも例外を投げず、未知の項目として捨てる', () => {
  const diagnostics: CodecDiagnostic[] = [];
  const result = decodeCascadeOverrides(
    testItemSchemas,
    { global: { constructor: { windowSize: 5 } } },
    'overrides',
    diagnostics,
  );
  assert.deepEqual(result, {});
  assert.equal(diagnostics.length, 1);
  assert.match(diagnostics[0].message, /未知の項目「constructor」/);
});

test('decodeCascadeOverrides: instanceKeyが"__proto__"の上書きは例外もprototype汚染も起こさず、診断付きで丸ごと捨てる（レビュー再現ケース）', () => {
  const raw = JSON.parse('{"layout":{"__proto__":{"windowSize":5}}}') as unknown;
  const diagnostics: CodecDiagnostic[] = [];
  let result: CascadeOverridesForTest | undefined;
  assert.doesNotThrow(() => {
    result = decodeCascadeOverrides(testItemSchemas, raw, 'overrides', diagnostics);
  });
  assert.deepEqual(result, {});
  // 値が消えるだけでなく、必ず診断が残ることを確認する（「捨てた値には必ず診断」）。
  assert.equal(diagnostics.length, 1);
  assert.match(diagnostics[0].message, /予約された名前「__proto__」/);
  // decode結果自体のprototypeも汚染されていないことを確認する。
  assert.equal(Object.getPrototypeOf(result), Object.prototype);
});

test('decodeCascadeOverrides: instanceKeyが"constructor"/"prototype"の上書きも診断付きで丸ごと捨てる', () => {
  const diagnostics: CodecDiagnostic[] = [];
  const result = decodeCascadeOverrides(
    testItemSchemas,
    { setup: { constructor: { windowSize: 1 }, prototype: { windowSize: 2 }, 's-1': { windowSize: 3 } } },
    'overrides',
    diagnostics,
  );
  assert.deepEqual(result, { setup: { 's-1': { windowSize: 3 } } });
  assert.equal(diagnostics.length, 2);
  assert.ok(diagnostics.some((d) => d.message.includes('予約された名前「constructor」')));
  assert.ok(diagnostics.some((d) => d.message.includes('予約された名前「prototype」')));
});

test('encodeCascadeOverrides→decodeCascadeOverrides: 往復で同じ値に戻る', () => {
  const value: CascadeOverridesForTest = {
    global: { enabled: true, windowSize: 5 },
    inputMethod: { romaji: { windowSize: 2 } },
    setup: { 's-1': { enabled: false } },
  };
  const diagnostics: CodecDiagnostic[] = [];
  const decoded = decodeCascadeOverrides(testItemSchemas, encodeCascadeOverrides(value), 'overrides', diagnostics);
  assert.deepEqual(decoded, value);
  assert.deepEqual(diagnostics, []);
});
