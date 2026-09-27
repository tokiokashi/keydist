import assert from 'node:assert/strict';
import test from 'node:test';
import type {
  AnalyzerTarget,
  SingleAnalyzerDefinition,
  SingleAnalyzerExtractContext,
} from './contract.ts';

/**
 * `contract.ts` は型と、Analyzerが実装する契約の形だけを持つ純粋ファイルなので、
 * ここでは「フィクスチャの `SingleAnalyzerDefinition` を実際に作って呼べること」
 * 「抽出に効く設定の宣言（`extractKeyOf`）が見た目だけの項目を落とせること」を確認する。
 * 実際のengine配線（キャッシュキーへ畳み込む・依頼の打ち切り等）は `#engine` 側のテストで見る。
 */

interface FixtureOptions {
  readonly bucketSize: number;
  readonly highlightColor: string;
}

const DEFAULT_OPTIONS: FixtureOptions = { bucketSize: 4, highlightColor: 'red' };

function createFixtureDefinition(): SingleAnalyzerDefinition<FixtureOptions, number> {
  return {
    id: 'fixture',
    cardinality: 'single',
    defaultOptions: DEFAULT_OPTIONS,
    decodeOptions(raw, diagnostics) {
      if (typeof raw !== 'object' || raw === null) {
        diagnostics.push({ path: 'options', message: '未知の形式のため既定値へ戻した' });
        return DEFAULT_OPTIONS;
      }
      const source = raw as Record<string, unknown>;
      const bucketSize = typeof source.bucketSize === 'number' ? source.bucketSize : DEFAULT_OPTIONS.bucketSize;
      const highlightColor = typeof source.highlightColor === 'string'
        ? source.highlightColor
        : DEFAULT_OPTIONS.highlightColor;
      return { bucketSize, highlightColor };
    },
    // highlightColorは見た目だけの項目なので抽出キーに含めない。
    extractKeyOf(options) {
      return { bucketSize: options.bucketSize };
    },
    extract(context: SingleAnalyzerExtractContext<FixtureOptions>) {
      return Math.floor(context.metrics.totalUnits / context.options.bucketSize);
    },
  };
}

test('SingleAnalyzerDefinition: extractは Trace結果 + 解釈結果 + options から値を返す純関数', () => {
  const definition = createFixtureDefinition();
  const result = definition.extract({
    trace: { strokes: [], errors: [], skipped: 0 } as never,
    analysis: { aggregate: { strokeCount: 0 } } as never,
    metrics: { totalUnits: 12, strokes: 0 } as never,
    options: DEFAULT_OPTIONS,
    requestTrace: { requestTrace: () => { throw new Error('unused'); } },
  });
  assert.equal(result, 3);
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

test('AnalyzerTarget: setup 1つ / setupsの集合の2形だけを最小形として持つ', () => {
  const single: AnalyzerTarget = { kind: 'setup', setupId: 'setup-1' };
  const set: AnalyzerTarget = { kind: 'setups', setupIds: ['setup-1', 'setup-2'] };
  assert.equal(single.kind, 'setup');
  assert.equal(set.kind, 'setups');
});
