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
