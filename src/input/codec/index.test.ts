import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as v from 'valibot';
import {
  decodeDroppingInvalid,
  decodeField,
  defineAssetCodec,
  encodedSizeBytes,
  type MigrationStep,
} from './index.ts';

/** テスト用の小さな資産: v2で`count`を持つ。 */
interface Widget {
  readonly name: string;
  readonly count: number;
}

const widgetSchema = v.strictObject({
  name: v.pipe(v.string(), v.minLength(1)),
  count: v.pipe(v.number(), v.integer(), v.minValue(0)),
});

function widgetCodec(migrations?: readonly MigrationStep[]) {
  return defineAssetCodec<Widget>({
    currentVersion: 2,
    migrations,
    decodePayload: (payload, diagnostics) => {
      const result = v.safeParse(widgetSchema, payload);
      if (result.success) return result.output;
      diagnostics.push({ path: 'widget', message: 'payload全体が不正' });
      return undefined;
    },
    encodePayload: (value) => ({ ...value }),
  });
}

test('decode: トップレベルがオブジェクトでなければ失敗する', () => {
  const codec = widgetCodec();
  for (const input of [null, undefined, 'x', 42, [], true]) {
    const result = codec.decode(input);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason.kind, 'not-an-object');
  }
});

test('decode: versionが数値でなければ失敗する', () => {
  const codec = widgetCodec();
  const result = codec.decode({ name: 'a', count: 1 });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason.kind, 'missing-version');
});

test('decode: 未来のバージョンは黙って切り捨てず失敗理由として報告する', () => {
  const codec = widgetCodec();
  const result = codec.decode({ version: 99, name: 'a', count: 1 });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.deepEqual(result.reason, { kind: 'future-version', version: 99, currentVersion: 2 });
  }
});

test('decode: payloadがschemaを満たさなければ資産全体を失敗として返す', () => {
  const codec = widgetCodec();
  const result = codec.decode({ version: 2, name: 'a', count: 'not-a-number' });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason.kind, 'invalid-shape');
});

test('migrateチェーン: v0→v1→v2と1段ずつ引き上げる（fakeなstep）', () => {
  // v0は`count`が無く`amount`という名前だった、というfakeな旧形式を仮定する。
  const migrations: MigrationStep[] = [
    {
      fromVersion: 0,
      toVersion: 1,
      migrate: (payload) => {
        const { amount, ...rest } = payload;
        return { ...rest, count: amount };
      },
    },
    {
      fromVersion: 1,
      toVersion: 2,
      // v1→v2は無変更（nameの意味は変わらない）。チェーンが複数段を順に適用することの確認。
      migrate: (payload) => ({ ...payload }),
    },
  ];
  const codec = widgetCodec(migrations);
  const result = codec.decode({ version: 0, name: 'legacy', amount: 3 });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.value, { name: 'legacy', count: 3 });
    assert.deepEqual(result.diagnostics, []);
  }
});

test('migrateチェーン: 対応するstepが無いバージョンはunmigratable-versionで失敗する', () => {
  const migrations: MigrationStep[] = [
    { fromVersion: 0, toVersion: 1, migrate: (payload) => payload },
    // 1→2のstepを欠かす
  ];
  const codec = widgetCodec(migrations);
  const result = codec.decode({ version: 0, name: 'a', count: 1 });
  assert.equal(result.ok, false);
  if (!result.ok) assert.deepEqual(result.reason, { kind: 'unmigratable-version', version: 1 });
});

test('encode→decode: 往復で同じ値に戻る（roundtrip）', () => {
  const codec = widgetCodec();
  const value: Widget = { name: 'a', count: 3 };
  const decoded = codec.decode(codec.encode(value));
  assert.equal(decoded.ok, true);
  if (decoded.ok) {
    assert.deepEqual(decoded.value, value);
    assert.deepEqual(decoded.diagnostics, []);
  }
});

test('encode: versionフィールドを現行版で付与する', () => {
  const codec = widgetCodec();
  assert.deepEqual(codec.encode({ name: 'a', count: 1 }), { version: 2, name: 'a', count: 1 });
});

test('decodeField: 妥当なら値を、不正なら既定値へ戻し診断を積む', () => {
  const diagnostics: import('./index.ts').CodecDiagnostic[] = [];
  const schema = v.pipe(v.number(), v.integer(), v.minValue(0));
  assert.equal(decodeField(schema, 5, 0, 'count', diagnostics), 5);
  assert.equal(diagnostics.length, 0);

  assert.equal(decodeField(schema, -1, 0, 'count', diagnostics), 0);
  assert.equal(diagnostics.length, 1);
  assert.equal(diagnostics[0].path, 'count');
  assert.match(diagnostics[0].message, /既定値へ戻した$/);
});

test('decodeDroppingInvalid: 妥当なら値を、不正ならundefinedを返し診断を積む', () => {
  const diagnostics: import('./index.ts').CodecDiagnostic[] = [];
  const schema = v.pipe(v.string(), v.minLength(1));
  assert.equal(decodeDroppingInvalid(schema, 'ok', 'items[0]', diagnostics), 'ok');
  assert.equal(diagnostics.length, 0);

  assert.equal(decodeDroppingInvalid(schema, '', 'items[1]', diagnostics), undefined);
  assert.equal(diagnostics.length, 1);
  assert.match(diagnostics[0].message, /要素を捨てた$/);
});

test('encodedSizeBytes: JSONにした時のUTF-8バイト数を返す', () => {
  assert.equal(encodedSizeBytes({ a: 1 }), new TextEncoder().encode('{"a":1}').length);
  // マルチバイト文字も正しく数える（文字数ではなくバイト数）。
  assert.equal(encodedSizeBytes({ a: 'あ' }), new TextEncoder().encode('{"a":"あ"}').length);
});
