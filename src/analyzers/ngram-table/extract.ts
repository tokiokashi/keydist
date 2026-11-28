import {
  DEFAULT_EXTRACTION_ASSETS,
  defineSetAnalyzer,
  type AnalyzerSetMember,
  type AnalyzerSetMemberFailure,
  type SetAnalyzerDefinition,
  type SetAnalyzerExtractContext,
} from '#analyzers/contract.ts';
import { analysisTargetKey } from '#input/setup/index.ts';
import { analyzeNgramTable, type TableAnalysis, type TableSource } from '#interpretation/ngram-table-analysis.ts';
import { ngramTableAssetKey, ngramTableMap, type NgramTableAsset, type NgramTableColophon } from '#interpretation/ngram-table-asset.ts';
import { disciplineSetContext, generatedDisciplineMember } from '../set-discipline-material.ts';
import { builtinDisciplineLayout } from '../discipline-material.ts';
import { buildGeometry } from '#input/shapes/geometry.ts';
import { ALTERNATE_NGRAM_TABLE_OPTIONS, DEFAULT_NGRAM_TABLE_OPTIONS, ngramTableOptions, type NgramTableOptions } from './options.ts';

/**
 * 表による解析の抽出（定義は `spec/distance-model.md` §13）。
 *
 * 評価に渡すテキストのTraceは読まない。メンバーの配列・物理配列・Trace方針（`AnalyzerSetMember.setup`）で、表の各項目を
 * ホームポジションの状態から打ち、最後の文節の距離を出現回数の重みで集計する（`interpretation/ngram-table-analysis.ts`）。
 * 表は資産（`assets.ngramTable`）で受け取る。メンバーごとの計算は、表と文節の先読みが同じなら覚えて使い回す。
 */

export interface NgramTableOkRow {
  readonly kind: 'ok';
  readonly targetKey: string;
  readonly analysis: TableAnalysis;
}

/** 表が渡されなかった行（表を読み込めなかった時）。値は出さない。 */
export interface NgramTableNoTableRow {
  readonly kind: 'no-table';
  readonly targetKey: string;
}

export interface NgramTableFailedRow {
  readonly kind: 'failed';
  readonly targetKey: string;
  readonly failureKind: AnalyzerSetMemberFailure['kind'];
  readonly message: string;
}

export type NgramTableRow = NgramTableOkRow | NgramTableNoTableRow | NgramTableFailedRow;

export interface NgramTableExtracted {
  /** 解析した表の次数と、文節の先読み。表が渡された対象が1つも無ければ`undefined` */
  readonly basis: { readonly order: number; readonly lookahead: number; readonly source: TableSource; readonly colophon: NgramTableColophon } | undefined;
  /** 集合の各枠（配列かSetup）ぶんの行。並び順に表示上の意味は無い（ホストが持つ集合の並び順へ `targetKey` で引き直す）。 */
  readonly rows: readonly NgramTableRow[];
}

/** 結果の条件の先読みは、渡された値のまま持つ（`N`を`k+1`に丸めた計算結果を使い回しても、条件には要求の値を書く）。 */
function withLookahead(analysis: TableAnalysis, lookahead: number): TableAnalysis {
  return { ...analysis, conditions: { ...analysis.conditions, lookahead: { unit: 'bunsetsu', value: lookahead } } };
}

function analysisOf(member: AnalyzerSetMember, asset: NgramTableAsset, lookahead: number): TableAnalysis | undefined {
  const { setup } = member;
  if (setup === undefined) return undefined;
  // `N`を`k+1`より大きくしても結果は`k+1`と同じ（§13.3）。丸めた値で覚えて、`N`だけを変えた時の再計算を省く
  const effective = Math.min(lookahead, asset.order + 1);
  const key = `ngram-table:${JSON.stringify(ngramTableAssetKey(asset))}:${effective}`;
  const analysis = member.remember(key, () => analyzeNgramTable(ngramTableMap(asset), asset.order, setup, effective, asset.source));
  return withLookahead(analysis, lookahead);
}

export function computeNgramTableExtraction(
  members: readonly AnalyzerSetMember[],
  failures: readonly AnalyzerSetMemberFailure[],
  options: NgramTableOptions,
): NgramTableExtracted {
  const rows: NgramTableRow[] = [];
  let reference: NgramTableAsset | undefined;
  for (const member of members) {
    const targetKey = analysisTargetKey(member.target);
    const asset = member.assets?.ngramTable;
    if (asset === undefined) {
      rows.push({ kind: 'no-table', targetKey });
      continue;
    }
    reference ??= asset;
    const analysis = analysisOf(member, asset, options.lookahead);
    rows.push(analysis === undefined ? { kind: 'no-table', targetKey } : { kind: 'ok', targetKey, analysis });
  }
  for (const failure of failures) {
    rows.push({ kind: 'failed', targetKey: analysisTargetKey(failure.target), failureKind: failure.kind, message: failure.message });
  }
  return {
    basis:
      reference === undefined
        ? undefined
        : { order: reference.order, lookahead: options.lookahead, source: reference.source, colophon: reference.colophon },
    rows,
  };
}

// ---------------------------------------------------------------------------
// 入れ忘れ防止テストの材料
// ---------------------------------------------------------------------------

const FIXTURE_TABLE: NgramTableAsset = {
  id: 'fixture',
  order: 1,
  source: {
    kind: 'corpus',
    name: 'テスト用の表',
    archive: { fileName: 'fixture.zip', sha256: '0' },
    segmentation: { origin: 'splitter', splitter: { name: 'fixture', version: '0' } },
    reading: null,
  },
  colophon: { work: 'テスト', original: 'テスト', changes: 'テスト' },
  keys: ['あい\u0000うえ', 'うえ\u0000あい', 'かき\u0000くけ'],
  counts: [3, 2, 1],
};

function fixtureMembers(): readonly AnalyzerSetMember[] {
  const layout = builtinDisciplineLayout('qwerty');
  const geometry = buildGeometry('row-staggered');
  return [
    generatedDisciplineMember('あ', {
      setup: { layout, geometry, tracePolicy: { windowSize: 3, sfbHomeCost: true }, romajiRuleId: null },
      assets: { ...DEFAULT_EXTRACTION_ASSETS, ngramTable: FIXTURE_TABLE },
    }),
  ];
}

/** engine（`engine/cache.ts` の `getSetExtraction`）が呼ぶ、Analyzer契約の実体。 */
export const ngramTableDefinition: SetAnalyzerDefinition<NgramTableOptions, NgramTableExtracted> = defineSetAnalyzer({
  id: 'ngram-table',
  options: ngramTableOptions,
  extract(context: SetAnalyzerExtractContext<NgramTableOptions>): NgramTableExtracted {
    return computeNgramTableExtraction(context.members, context.failures, context.options);
  },
  // 表の名前・版・次数が変わったら、抽出を作り直す（表の中身は取り出さず、出どころで見分ける）
  assetsKeyOf: (_options, assets) => (assets.ngramTable === undefined ? null : ngramTableAssetKey(assets.ngramTable)),
  optionsDiscipline: {
    sample: DEFAULT_NGRAM_TABLE_OPTIONS,
    alternates: ALTERNATE_NGRAM_TABLE_OPTIONS,
    context: () => disciplineSetContext(fixtureMembers()),
  },
});
