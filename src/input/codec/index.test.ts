import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as v from 'valibot';
import { decodeDroppingInvalid, droppedNotObject, decodeField, defineAssetCodec, encodedSizeBytes, type MigrationStep } from './index.ts';

/** テスト用の小さな資産: v2で`count`を持つ。 */
interface Widget {
  readonly name: string;
  readonly count: number;
}

const widgetSchema = v.strictObject({
  name: v.pipe(v.string(), v.minLength(1)),
  count: v.pipe(v.number(), v.integer(), v.minValue(0)),
});

function widgetCodec(migrations?: readonly MigrationStep[], currentVersion = 2) {
  return defineAssetCodec<Widget>({
    currentVersion,
    ...(migrations === undefined ? {} : { migrations }),
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

test('decode: versionフィールドが無ければmissing-versionで失敗する', () => {
  const codec = widgetCodec();
  const result = codec.decode({ name: 'a', count: 1 });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason.kind, 'missing-version');
});

test('decode: versionが1以上の整数でなければinvalid-versionで失敗する（unmigratable-versionと混同しない）', () => {
  const codec = widgetCodec();
  for (const version of [-1, 0, 1.5, 'x', null, NaN]) {
    const result = codec.decode({ version, name: 'a', count: 1 });
    assert.equal(result.ok, false);
    if (!result.ok) assert.deepEqual(result.reason, { kind: 'invalid-version', version });
  }
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

test('migrateチェーン: v1→v2→v3と1段ずつ引き上げる（fakeなstep）', () => {
  // versionは1始まり（invalid-versionのテスト参照）なので、最初期のfakeな旧形式もv1とする。
  // v1は`count`が無く`amount`という名前だった、というfakeな旧形式を仮定する。
  const migrations: MigrationStep[] = [
    {
      fromVersion: 1,
      toVersion: 2,
      migrate: (payload) => {
        const { amount, ...rest } = payload;
        return { ...rest, count: amount };
      },
    },
    {
      fromVersion: 2,
      toVersion: 3,
      // v2→v3は無変更（nameの意味は変わらない）。チェーンが複数段を順に適用することの確認。
      migrate: (payload) => ({ ...payload }),
    },
  ];
  const codec = widgetCodec(migrations, 3);
  const result = codec.decode({ version: 1, name: 'legacy', amount: 3 });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.value, { name: 'legacy', count: 3 });
    assert.deepEqual(result.diagnostics, []);
  }
});

test('migrateチェーン: 対応するstepが無いバージョンはunmigratable-versionで失敗する', () => {
  const migrations: MigrationStep[] = [
    { fromVersion: 1, toVersion: 2, migrate: (payload) => payload },
    // 2→3のstepを欠かす
  ];
  const codec = widgetCodec(migrations, 3);
  const result = codec.decode({ version: 1, name: 'a', count: 1 });
  assert.equal(result.ok, false);
  if (!result.ok) assert.deepEqual(result.reason, { kind: 'unmigratable-version', version: 2 });
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
  assert.match(diagnostics[0].message, /既定値へ戻しました$/);
});

test('decodeDroppingInvalid: 妥当なら値を、不正ならundefinedを返し診断を積む', () => {
  const diagnostics: import('./index.ts').CodecDiagnostic[] = [];
  const schema = v.pipe(v.string(), v.minLength(1));
  assert.equal(decodeDroppingInvalid(schema, 'ok', 'items[0]', diagnostics), 'ok');
  assert.equal(diagnostics.length, 0);

  assert.equal(decodeDroppingInvalid(schema, '', 'items[1]', diagnostics), undefined);
  assert.equal(diagnostics.length, 1);
  assert.match(diagnostics[0].message, /要素を捨てました$/);
});

test('診断の文: valibot既定の英語の文は欄の名前と問題の種類から作る日本語にし、検査の側が持つ文は残す', () => {
  const diagnostics: import('./index.ts').CodecDiagnostic[] = [];
  const schema = v.pipe(
    v.object({ id: v.pipe(v.string(), v.minLength(1)), count: v.number(), tags: v.array(v.string()), kind: v.picklist(['a', 'b']) }),
    v.check(() => false, '合わない組み合わせです'),
  );
  decodeDroppingInvalid(schema, {}, 'items[0]', diagnostics);
  decodeDroppingInvalid(schema, 5, 'items[1]', diagnostics);
  decodeDroppingInvalid(schema, { id: '', count: 'x', tags: 1, kind: 'z' }, 'items[2]', diagnostics);
  assert.deepEqual(
    diagnostics.map((diagnostic) => diagnostic.message),
    [
      '「id」欄がありません。「count」欄がありません。「tags」欄がありません。「kind」欄がありません。そのため要素を捨てました',
      '値の形式が正しくありません。そのため要素を捨てました',
      '「id」欄が短すぎます。「count」欄が数値ではありません。「tags」欄が配列ではありません。「kind」欄の値が選べる値にありません。そのため要素を捨てました',
    ],
  );
  const checked: import('./index.ts').CodecDiagnostic[] = [];
  decodeDroppingInvalid(schema, { id: 'a', count: 1, tags: [], kind: 'a' }, 'items[3]', checked);
  assert.deepEqual(
    checked.map((diagnostic) => diagnostic.message),
    ['合わない組み合わせです。そのため要素を捨てました'],
  );
});

test('診断の文: v.integer()など形の違う既定の文も日本語になり、検査の側の文と生成する文は文として並ぶ', () => {
  const diagnostics: import('./index.ts').CodecDiagnostic[] = [];
  const schema = v.object({ rows: v.pipe(v.number(), v.integer()), name: v.pipe(v.string(), v.minLength(1, '名前を入れてください')) });
  decodeDroppingInvalid(schema, { rows: 1.5, name: 'a' }, 'items[0]', diagnostics);
  decodeDroppingInvalid(schema, { rows: 1, name: '' }, 'items[1]', diagnostics);
  decodeDroppingInvalid(schema, { rows: 1.5, name: '' }, 'items[2]', diagnostics);
  const fallback: import('./index.ts').CodecDiagnostic[] = [];
  decodeField(schema, 5, null, 'item', fallback);
  assert.deepEqual(
    diagnostics.map((diagnostic) => diagnostic.message),
    [
      '「rows」欄の値が条件に合っていません。そのため要素を捨てました',
      '名前を入れてください。そのため要素を捨てました',
      '「rows」欄の値が条件に合っていません。名前を入れてください。そのため要素を捨てました',
    ],
  );
  assert.deepEqual(
    fallback.map((diagnostic) => diagnostic.message),
    ['値の形式が正しくありません。そのため既定値へ戻しました'],
  );
  for (const diagnostic of [...diagnostics, ...fallback]) assert.doesNotMatch(diagnostic.message, /Invalid|Expected|Received|object/);
});

test('診断の文: 型名のobjectを出さない', () => {
  assert.doesNotMatch(droppedNotObject('ペイン'), /object/);
});

test('encodedSizeBytes: JSONにした時のUTF-8バイト数を返す', () => {
  assert.equal(encodedSizeBytes({ a: 1 }), new TextEncoder().encode('{"a":1}').length);
  // マルチバイト文字も正しく数える（文字数ではなくバイト数）。
  assert.equal(encodedSizeBytes({ a: 'あ' }), new TextEncoder().encode('{"a":"あ"}').length);
});
