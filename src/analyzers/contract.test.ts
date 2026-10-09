import assert from 'node:assert/strict';
import test from 'node:test';
import * as v from 'valibot';
import { checkOptionsDiscipline, defineOption, defineOptions } from './options.ts';
import {
  defineSetAnalyzer,
  defineSingleAnalyzer,
  type AnalyzerTarget,
  type SingleAnalyzerDefinition,
  type SingleAnalyzerExtractContext,
} from './contract.ts';

/**
 * `contract.ts` は型と、Analyzerが実装する契約の形だけを持つ純粋ファイルなので、
 * ここでは「フィクスチャの `SingleAnalyzerDefinition` を実際に作って呼べること」
 * 「抽出に効く設定の宣言（`extractKeyOf`）が見た目だけの項目を落とせること」を確認する。
 * 実際のengine配線（キャッシュキーへ畳み込む・依頼の打ち切り等）は `#engine` 側のテストで見る。
 *
 * `SingleAnalyzerDefinition`はブランド付きの型で、`defineSingleAnalyzer`を経由してしか
 * 作れない（オブジェクトリテラルを手組みするとtypecheckで落ちる。
 * `contract.test.ts`自身がその経路を通ることで、実物のAnalyzer（`analyzers/bigram-flow/`等）と
 * 同じ作法を保つ）。
 */

const fixtureOptions = defineOptions({
  bucketSize: defineOption<number>({
    schema: v.pipe(v.number(), v.integer(), v.minValue(1)),
    default: 4,
    affects: 'extract',
  }),
  // 見た目だけの項目なので抽出キーに含めない（affects: 'view'）。
  highlightColor: defineOption<string>({
    schema: v.string(),
    default: 'red',
    affects: 'view',
  }),
});

const DEFAULT_OPTIONS = fixtureOptions.defaultOptions;

/** `extract`に渡す文脈（`options`以外）。`metrics.totalUnits`だけを読む抽出のための最小の値。 */
function fixtureContext() {
  return {
    trace: { strokes: [], errors: [], skipped: 0 } as never,
    analysis: { aggregate: { strokeCount: 0 } } as never,
    metrics: { totalUnits: 100, strokes: 0 } as never,
    requestTrace: { requestTrace: () => { throw new Error('unused'); } },
    keyDetails: () => { throw new Error('unused'); },
  };
}

function createFixtureDefinition(): SingleAnalyzerDefinition<typeof DEFAULT_OPTIONS, number> {
  return defineSingleAnalyzer({
    id: 'fixture',
    options: fixtureOptions,
    extract(context: SingleAnalyzerExtractContext<typeof DEFAULT_OPTIONS>) {
      return Math.floor(context.metrics.totalUnits / context.options.bucketSize);
    },
    // `optionsDiscipline`は`defineSingleAnalyzer`が必須で要求する。
    optionsDiscipline: {
      sample: DEFAULT_OPTIONS,
      alternates: { bucketSize: 8, highlightColor: 'blue' },
      context: fixtureContext,
    },
  });
}

test('SingleAnalyzerDefinition: extractは Trace結果 + 解釈結果 + options から値を返す純関数', () => {
  const definition = createFixtureDefinition();
  const result = definition.extract({
    trace: { strokes: [], errors: [], skipped: 0 } as never,
    analysis: { aggregate: { strokeCount: 0 } } as never,
    metrics: { totalUnits: 12, strokes: 0 } as never,
    options: DEFAULT_OPTIONS,
    requestTrace: { requestTrace: () => { throw new Error('unused'); } },
    keyDetails: () => { throw new Error('unused'); },
  });
  assert.equal(result, 3);
});

test('optionsDiscipline.extract: 材料の文脈とoptionsから引数を組み、定義のextractを呼ぶ', () => {
  const { optionsDiscipline } = createFixtureDefinition();
  assert.equal(optionsDiscipline.extract({ bucketSize: 4, highlightColor: 'red' }), 25);
  assert.equal(optionsDiscipline.extract({ bucketSize: 8, highlightColor: 'red' }), 12);
});

/** 見た目だけの項目（highlightColor）を、抽出の側が読んでしまう定義。`extract`の中で読む版と、計算の関数の中で読む版。 */
function createViewReadingDefinition(readIn: 'extract' | 'compute') {
  const compute = (totalUnits: number, options: typeof DEFAULT_OPTIONS) =>
    (readIn === 'compute' && options.highlightColor === 'blue' ? 0 : totalUnits);
  return defineSingleAnalyzer({
    id: `view-reading-${readIn}`,
    options: fixtureOptions,
    extract: (context) => (
      readIn === 'extract' && context.options.highlightColor === 'blue'
        ? 0
        : compute(context.metrics.totalUnits, context.options)
    ),
    optionsDiscipline: {
      sample: DEFAULT_OPTIONS,
      alternates: { bucketSize: 8, highlightColor: 'blue' },
      context: fixtureContext,
    },
  });
}

test('checkOptionsDiscipline: extractの中で見た目だけの項目を読むと検出する', () => {
  const definition = createViewReadingDefinition('extract');
  const result = checkOptionsDiscipline(
    { items: definition.optionsItems, extractKeyOf: definition.extractKeyOf } as never,
    definition.optionsDiscipline as never,
  );
  assert.deepEqual(result.viewExtractionViolations, ['highlightColor']);
});

test('checkOptionsDiscipline: extractが呼ぶ計算の関数の中で見た目だけの項目を読んでも検出する', () => {
  const definition = createViewReadingDefinition('compute');
  const result = checkOptionsDiscipline(
    { items: definition.optionsItems, extractKeyOf: definition.extractKeyOf } as never,
    definition.optionsDiscipline as never,
  );
  assert.deepEqual(result.viewExtractionViolations, ['highlightColor']);
});

test('checkOptionsDiscipline: 集合対象のextractの中で見た目だけの項目を読むと検出する', () => {
  const definition = defineSetAnalyzer({
    id: 'set-view-reading',
    options: fixtureOptions,
    extract: (context) => context.members.length + (context.options.highlightColor === 'blue' ? 1 : 0),
    optionsDiscipline: {
      sample: DEFAULT_OPTIONS,
      alternates: { bucketSize: 8, highlightColor: 'blue' },
      context: () => ({ members: [], failures: [] }),
    },
  });
  const result = checkOptionsDiscipline(
    { items: definition.optionsItems, extractKeyOf: definition.extractKeyOf } as never,
    definition.optionsDiscipline as never,
  );
  assert.deepEqual(result.viewExtractionViolations, ['highlightColor']);
});

test('extractKeyOfは見た目だけの項目（highlightColor）を落とす', () => {
  const definition = createFixtureDefinition();
  const keyA = definition.extractKeyOf({ bucketSize: 4, highlightColor: 'red' });
  const keyB = definition.extractKeyOf({ bucketSize: 4, highlightColor: 'blue' });
  assert.deepEqual(keyA, keyB, '見た目だけの違いは抽出キーに現れない');

  const keyC = definition.extractKeyOf({ bucketSize: 8, highlightColor: 'red' });
  assert.notDeepEqual(keyA, keyC, '抽出に効く項目の違いは抽出キーに現れる');
});

test('decodeOptionsは壊れた値を既定値へ戻す（例外を投げない）', () => {
  const definition = createFixtureDefinition();
  const diagnostics: { path: string; message: string }[] = [];
  const decoded = definition.decodeOptions(null, diagnostics);
  assert.deepEqual(decoded, DEFAULT_OPTIONS);
  assert.equal(diagnostics.length, 1);
});

test('AnalyzerTarget: 単一対象(single) / 集合対象(set)の2形だけを最小形として持つ', () => {
  const single: AnalyzerTarget = { kind: 'single', target: { kind: 'setup', setupId: 'setup-1' } };
  const set: AnalyzerTarget = {
    kind: 'set',
    targets: [{ kind: 'setup', setupId: 'setup-1' }, { kind: 'layout', layoutId: 'qwerty' }],
  };
  assert.equal(single.kind, 'single');
  assert.equal(set.kind, 'set');
});
