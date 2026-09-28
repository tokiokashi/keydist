import assert from 'node:assert/strict';
import test from 'node:test';
import * as v from 'valibot';
import {
  defineOption,
  defineOptions,
  findOptionsKeyDisciplineViolations,
  findViewOptionsExtractionViolations,
  numberUrlCodec,
  picklistUrlCodec,
  type OptionsValueMap,
} from './options.ts';

/**
 * `options.ts`（項目ごとの宣言から型・既定値・decode・抽出キー・URLの読み書きを導く仕組み）
 * のunit test。fixtureは実在のAnalyzerに依存しない、schema/decodeどちらの経路も持つ
 * 小さなレジストリにする（bigram-flow固有の事情に引きずられないため）。
 */

const fixtureOptions = defineOptions({
  bucketSize: defineOption<number>({
    schema: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(100)),
    default: 4,
    affects: 'extract',
    url: numberUrlCodec('bucketSize', 1, 100),
  }),
  color: defineOption<'red' | 'blue'>({
    schema: v.picklist(['red', 'blue']),
    default: 'red',
    affects: 'view',
    url: picklistUrlCodec('color', ['red', 'blue']),
  }),
});

type FixtureOptions = OptionsValueMap<typeof fixtureOptions.items>;

test('defineOption: schemaもdecodeも無いと定義できない', () => {
  assert.throws(() => defineOption<number>({ default: 1, affects: 'view' } as never));
});

test('defaultOptions: 各項目のdefaultを束ねたもの', () => {
  assert.deepEqual(fixtureOptions.defaultOptions, { bucketSize: 4, color: 'red' });
});

test('decodeOptions: 保存が無ければ既定値・診断は空', () => {
  const diagnostics: { path: string; message: string }[] = [];
  assert.deepEqual(fixtureOptions.decodeOptions(undefined, diagnostics), fixtureOptions.defaultOptions);
  assert.deepEqual(diagnostics, []);
});

test('decodeOptions: 未知の形式は丸ごと既定値へ戻し診断を積む', () => {
  const diagnostics: { path: string; message: string }[] = [];
  assert.deepEqual(fixtureOptions.decodeOptions('nope', diagnostics), fixtureOptions.defaultOptions);
  assert.equal(diagnostics.length, 1);
});

test('decodeOptions: 壊れた項目だけ既定値へ戻し、他は読む', () => {
  const diagnostics: { path: string; message: string }[] = [];
  const decoded = fixtureOptions.decodeOptions({ bucketSize: 999, color: 'blue' }, diagnostics);
  assert.equal(decoded.bucketSize, 4); // 範囲外なので既定値
  assert.equal(decoded.color, 'blue'); // 妥当なのでそのまま
  assert.ok(diagnostics.some((d) => d.path === 'options.bucketSize'));
});

test('decodeOptions: 未知の項目idは診断付きで捨てる', () => {
  const diagnostics: { path: string; message: string }[] = [];
  const decoded = fixtureOptions.decodeOptions({ bucketSize: 8, unknownField: 1 }, diagnostics);
  assert.equal(decoded.bucketSize, 8);
  assert.ok(diagnostics.some((d) => d.message.includes('unknownField')));
});

test('extractKeyOf: affectsがextractの項目だけを含む', () => {
  const base: FixtureOptions = { bucketSize: 4, color: 'red' };
  const changedColor: FixtureOptions = { ...base, color: 'blue' };
  const changedBucket: FixtureOptions = { ...base, bucketSize: 8 };
  assert.deepEqual(fixtureOptions.extractKeyOf(base), fixtureOptions.extractKeyOf(changedColor));
  assert.notDeepEqual(fixtureOptions.extractKeyOf(base), fixtureOptions.extractKeyOf(changedBucket));
});

test('encodeOptionsToUrl: 既定値と同じ項目はURLに出さない', () => {
  const params = fixtureOptions.encodeOptionsToUrl(fixtureOptions.defaultOptions);
  assert.equal(params.toString(), '');
});

test('encodeOptionsToUrl: 既定値と違う項目だけ出す', () => {
  const params = fixtureOptions.encodeOptionsToUrl({ bucketSize: 8, color: 'red' });
  assert.equal(params.get('bucketSize'), '8');
  assert.equal(params.get('color'), null);
});

test('decodeOptionsFromUrl: 無いパラメータはvaluesに含まれない', () => {
  const diagnostics: { path: string; message: string }[] = [];
  const result = fixtureOptions.decodeOptionsFromUrl(new URLSearchParams(''), diagnostics);
  assert.deepEqual(result.values, {});
  assert.deepEqual(result.consumedParamNames, []);
});

test('decodeOptionsFromUrl: 妥当な値を読み、消費したパラメータ名を返す', () => {
  const diagnostics: { path: string; message: string }[] = [];
  const result = fixtureOptions.decodeOptionsFromUrl(new URLSearchParams('bucketSize=10&color=blue'), diagnostics);
  assert.deepEqual(result.values, { bucketSize: 10, color: 'blue' });
  assert.deepEqual([...result.consumedParamNames].sort(), ['bucketSize', 'color']);
  assert.deepEqual(diagnostics, []);
});

test('decodeOptionsFromUrl: 壊れた値は診断を積みvaluesから外す（パラメータ自体は消費したとみなす）', () => {
  const diagnostics: { path: string; message: string }[] = [];
  const result = fixtureOptions.decodeOptionsFromUrl(new URLSearchParams('bucketSize=999&color=green'), diagnostics);
  assert.deepEqual(result.values, {});
  assert.deepEqual([...result.consumedParamNames].sort(), ['bucketSize', 'color']);
  assert.equal(diagnostics.length, 2);
});

// ---------------------------------------------------------------------------
// 入れ忘れ防止のテストキット自体の検証（誤分類を実際に入れて落ちることを確認する）
// ---------------------------------------------------------------------------

test('findOptionsKeyDisciplineViolations: 正しく分類されていれば違反は無い', () => {
  const violations = findOptionsKeyDisciplineViolations(
    fixtureOptions,
    { bucketSize: 4, color: 'red' },
    { bucketSize: 8, color: 'blue' },
  );
  assert.deepEqual(violations, []);
});

test('findOptionsKeyDisciplineViolations: affects:extractと宣言したのにextractKeyOfへ乗せ忘れていたら検出する', () => {
  // 「入れ忘れ」そのものの再現: bucketSizeはaffects:'extract'と宣言したのに、
  // extractKeyOfが実際には見ていない（normalizeForExtractKeyで握りつぶす）状態を作る。
  const forgetful = defineOptions({
    bucketSize: defineOption<number>({
      schema: v.pipe(v.number(), v.integer()),
      default: 4,
      affects: 'extract',
      // 入れ忘れの再現: どんな値でも同じキーへ畳み込んでしまう（実際のAnalyzerでは
      // 「フィールドをextractKeyOfへ足し忘れる」ことに相当する）。
      normalizeForExtractKey: () => 'ignored',
    }),
  });
  const violations = findOptionsKeyDisciplineViolations(
    forgetful,
    { bucketSize: 4 },
    { bucketSize: 8 },
  );
  assert.deepEqual(violations, ['bucketSize']);
});

test('findViewOptionsExtractionViolations: view項目を変えても抽出結果が変わらなければ違反無し', () => {
  const extract = (options: FixtureOptions) => options.bucketSize * 2; // colorを一切使わない
  const violations = findViewOptionsExtractionViolations(
    fixtureOptions,
    { bucketSize: 4, color: 'red' },
    { bucketSize: 8, color: 'blue' },
    extract,
  );
  assert.deepEqual(violations, []);
});

test('findViewOptionsExtractionViolations: view宣言なのに実際は抽出結果へ効いている誤分類を検出する', () => {
  // colorはaffects: 'view'だが、抽出関数の実装が実際にはcolorを使ってしまっている
  // （extractKeyOfのキーには乗らないのに結果は変わる = 同じキーで違う値を返す事故の再現）。
  const extract = (options: FixtureOptions) => (options.color === 'blue' ? 999 : options.bucketSize);
  const violations = findViewOptionsExtractionViolations(
    fixtureOptions,
    { bucketSize: 4, color: 'red' },
    { bucketSize: 4, color: 'blue' },
    extract,
  );
  assert.deepEqual(violations, ['color']);
});

test('findViewOptionsExtractionViolations: Mapを含む抽出結果でも正しく比較できる', () => {
  const extract = (options: FixtureOptions) =>
    new Map([['bucket', options.bucketSize], ['dummy', options.color === 'blue' ? 0 : 0]]);
  const violations = findViewOptionsExtractionViolations(
    fixtureOptions,
    { bucketSize: 4, color: 'red' },
    { bucketSize: 4, color: 'blue' },
    extract,
  );
  assert.deepEqual(violations, []);
});
