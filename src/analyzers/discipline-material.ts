import { LAYOUT_BY_ID } from '#input/layouts/index.ts';
import type { Layout } from '#input/layouts/types.ts';
import { buildGeometry } from '#input/shapes/geometry.ts';
import { analyzeStrokeStructure } from '#interpretation/structure/aggregate.ts';
import { computeKeyDetails } from '#interpretation/key-detail.ts';
import { computeMetrics } from '#interpretation/metrics.ts';
import { DEFAULT_TRACE_POLICY, generateTrace } from '#trace/generate.ts';
import type { SingleAnalyzerExtractContext } from './contract.ts';

/**
 * 解析設定の入れ忘れ防止テスト（`options.ts`の`checkOptionsDiscipline`）が、定義の`extract`へ
 * 渡す材料を、実際の配列とテキストから作る。
 *
 * 手で組んだTraceやMetricsは、`extract`が読む項目が増えた時に実際の値とずれても気づけない。
 * 実際の配列を`generateTrace`・`computeMetrics`に通した値を渡すので、`extract`がどの項目を
 * 読んでも、アプリが渡す値と同じ形で検査される。物理配列はrow-staggered、Trace方針は
 * `DEFAULT_TRACE_POLICY`。
 */
export function singleDisciplineContext(
  layout: Layout,
  text: string,
): Omit<SingleAnalyzerExtractContext<unknown>, 'options'> {
  const geometry = buildGeometry('row-staggered');
  const trace = generateTrace(text, layout, geometry, DEFAULT_TRACE_POLICY);
  return {
    trace,
    analysis: analyzeStrokeStructure(trace.strokes),
    metrics: computeMetrics(trace, geometry),
    requestTrace: {
      requestTrace: (input) => generateTrace(
        input.text ?? text,
        input.layout ?? layout,
        input.geometry ?? geometry,
        { ...DEFAULT_TRACE_POLICY, ...input.tracePolicy },
      ),
    },
    keyDetails: () => computeKeyDetails(trace, geometry),
  };
}

/**
 * 単打・行指定キーの面のレイヤーと、コンボ枠を持つ組み込みの配列（かわせみ配列+）で、
 * 単打・行指定キーの面のレイヤー・コンボ枠のどれにも押下がつくテキスト
 * （「く」が行指定キーの面、「あい」がコンボ）を打った材料。
 * レイヤーやコンボの中身を読む`extract`が、表示だけの設定に依存していないかを確かめるのに使う。
 */
export function layerComboDisciplineContext(): ReturnType<typeof singleDisciplineContext> {
  const layout = LAYOUT_BY_ID.get('kawasemi-plus');
  if (layout === undefined) throw new Error('組み込みの配列「kawasemi-plus」が見つかりません');
  return singleDisciplineContext(layout, 'あいうえおかくが');
}

/** QWERTYで左右の手をまたぐ短いテキストを打った材料。レイヤーとコンボには依らない`extract`の検査に使う。 */
export function plainDisciplineContext(): ReturnType<typeof singleDisciplineContext> {
  const layout = LAYOUT_BY_ID.get('qwerty');
  if (layout === undefined) throw new Error('組み込みの配列「qwerty」が見つかりません');
  return singleDisciplineContext(layout, 'fdjadsk');
}
