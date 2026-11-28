// 標準のコーパス（『吾輩は猫である』全文）の文節の読みの表を、組み込みの配列で解析し、結果をMarkdownの表で出す。
// 定義は`spec/distance-model.md` §13。表の作り方と、統計が足りているかの量は`docs/corpus-ngram.md`。
//
//   node --experimental-strip-types scripts/corpus-ngram-table-analysis.ts
//   ... --layouts qwerty,jis-kana  解析する組み込みの配列のid（既定は6つの配列。下のDEFAULT_LAYOUTS）
//   ... --lookahead 1,2,3          文節で数える先読みN。複数渡すとNごとに出す（既定は2）
//   ... --reference-orders 2       選べる次数の上限より上の次数も、参考として何次まで出すか（既定は0。出さない）
//   ... --source <zipのパス>        取得済みの青空文庫のzipを使う
//
// 選べる次数は、文節の読みの系列の「足りている最大の次数」までで、0次は常に選べる（仕様 §13.5）。
// 並びは配列のid順で、値による並べ替えはしない。配列の優劣・順位・合成スコアは出さない。
import { resolve } from 'node:path';
import { EMPTY_SETTINGS_OVERRIDES } from '#engine/settings-items.ts';
import { resolveEngineInput } from '#engine/resolved-input.ts';
import { PHYSICAL_SHAPES, type PhysicalShape } from '#input/shapes/geometry.ts';
import { buildCorpusNgramTables, SINGLE_CONTINUATION_LIMIT, sufficientOrder } from '#interpretation/corpus-ngram.ts';
import {
  analyzeNgramTable,
  BUNSETSU_LOOKAHEAD,
  selectableOrders,
  type TableAnalysis,
  type TableAnalysisSetup,
  type TableSource,
  type WeightedDistribution,
} from '#interpretation/ngram-table-analysis.ts';
import { BUNSETSU_SPLITTER } from '#platform/bunsetsu/info.ts';
import { DICTIONARY_SPEC, LIBRARY_SPEC } from '#platform/reading/dictionary-spec.ts';
import { LOADED_LAYOUT_BY_ID } from '../test/kanji-direct-tables.ts';
import { AOZORA_SOURCE } from './generate-neko-sample.ts';
import { loadStandardCorpus, sha256Of } from './corpus-ngram-load.ts';

/** QWERTYのローマ字・JISかな・新JIS（2つの打ち方）・月配列2-263・薙刀式v18 */
const DEFAULT_LAYOUTS = ['qwerty', 'jis-kana', 'shin-jis-prefix', 'shin-jis-simultaneous', 'tsuki-2-263', 'naginata-v18'];

function parseArgs(argv: readonly string[]): { layouts: string[]; lookaheads: number[]; referenceOrders: number; source: string | undefined } {
  const value = (name: string): string | undefined => {
    const index = argv.indexOf(name);
    return index === -1 ? undefined : argv[index + 1];
  };
  const lookahead = (value('--lookahead') ?? String(BUNSETSU_LOOKAHEAD.default)).split(',').map(Number);
  for (const n of lookahead) {
    if (!Number.isInteger(n) || n < BUNSETSU_LOOKAHEAD.min || n > BUNSETSU_LOOKAHEAD.max) {
      throw new Error(`--lookaheadには${BUNSETSU_LOOKAHEAD.min}以上${BUNSETSU_LOOKAHEAD.max}以下の整数をコンマで区切って渡す`);
    }
  }
  const reference = Number(value('--reference-orders') ?? 0);
  if (!Number.isInteger(reference) || reference < 0) throw new Error('--reference-ordersには0以上の整数を渡す');
  const source = value('--source');
  return {
    layouts: value('--layouts')?.split(',') ?? DEFAULT_LAYOUTS,
    lookaheads: lookahead,
    referenceOrders: reference,
    source: source === undefined ? undefined : resolve(source),
  };
}

const CATALOG = {
  layouts: LOADED_LAYOUT_BY_ID,
  shapes: new Map<string, PhysicalShape>(Object.values(PHYSICAL_SHAPES).map((shape) => [shape.id, shape])),
};

/** 配列の既定の条件（物理配列・指の割り当て・綴り・親指など）を、アプリと同じ経路で解決する。 */
function setupOf(layoutId: string): TableAnalysisSetup {
  const result = resolveEngineInput({
    target: { kind: 'layout', layoutId },
    setups: new Map(),
    catalog: CATALOG,
    userLayouts: new Map(),
    overrides: EMPTY_SETTINGS_OVERRIDES,
    text: 'あ',
    language: 'ja',
  });
  if (!result.ok) throw new Error(`${layoutId}の条件を解決できない: ${JSON.stringify(result.error)}`);
  const { layout, geometry, tracePolicy, romajiRuleId } = result.input;
  return { layout, geometry, tracePolicy, romajiRuleId };
}

function table(header: readonly string[], rows: readonly (readonly string[])[]): string {
  return [`| ${header.join(' | ')} |`, `|${header.map(() => '---').join('|')}|`, ...rows.map((row) => `| ${row.join(' | ')} |`)].join('\n');
}

const fixed = (value: number | undefined, digits = 4): string => (value === undefined ? '–' : value.toFixed(digits));
const percent = (value: number | undefined): string => (value === undefined ? '–' : `${(value * 100).toFixed(2)}%`);

function distributionRow(label: string, distribution: WeightedDistribution | undefined): string[] {
  if (distribution === undefined) return [label, ...Array<string>(8).fill('–')];
  return [
    label,
    fixed(distribution.min),
    ...distribution.quantiles.map((quantile) => fixed(quantile.value)),
    fixed(distribution.max),
    fixed(distribution.mean),
  ];
}

const DISTRIBUTION_HEADER = ['配列', '最小', '10%点', '25%点', '中央値', '75%点', '90%点', '最大', '平均'];

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const loaded = await loadStandardCorpus(args.source);
  const highestOrder = 5;
  const tables = buildCorpusNgramTables(loaded.reading.text, loaded.readingBoundaries, highestOrder);
  const sufficiency = tables.bunsetsu.sufficiency;
  const selectable = selectableOrders(sufficiency);
  const upper = selectable.at(-1)!;
  if (args.referenceOrders > highestOrder - upper) throw new Error(`--reference-ordersは${highestOrder - upper}まで`);
  const source: TableSource = {
    kind: 'corpus',
    name: `青空文庫『${AOZORA_SOURCE.title}』（作品789）全文`,
    archive: { fileName: AOZORA_SOURCE.fileName, sha256: AOZORA_SOURCE.sha256 },
    segmentation: { origin: 'splitter', splitter: BUNSETSU_SPLITTER },
    reading: { library: LIBRARY_SPEC, dictionary: DICTIONARY_SPEC },
  };
  const setups = args.layouts.map((id) => [id, setupOf(id)] as const);

  const out: string[] = [];
  out.push('# 標準のコーパスの文節の読みの表による解析', '');
  out.push('定義は `spec/distance-model.md` §13。並びは配列のid順で、値による並べ替えはしない。配列の優劣・順位・合成スコアは出さない。', '');
  out.push('## 再現の条件', '');
  out.push(
    `- 表の元のテキスト: ${source.name}。zip ${AOZORA_SOURCE.fileName}（sha256 ${AOZORA_SOURCE.sha256}）。注記を除いた全文のsha256 ${sha256Of(loaded.corpus)}（${[...loaded.corpus].length}文字）`,
  );
  out.push('- 統計は1作品（明治期の小説、一人称の語り）から出たもの。ジャンルの区分は無い。日本語の文章一般の統計として読まない');
  out.push(
    `- 文節の区切りの出どころ: 分割器 ${BUNSETSU_SPLITTER.name} ${BUNSETSU_SPLITTER.version}（日本語のモデル）。読みに直す前の原文に1回だけ当てた（原文の区切り${loaded.sourceBoundaryCount}個、読みの上${loaded.readingBoundaries.length}個）`,
  );
  out.push(
    `- 読みへの変換: ${LIBRARY_SPEC.name} ${LIBRARY_SPEC.version} + ${DICTIONARY_SPEC.name} ${DICTIONARY_SPEC.version}。原文のルビは使わない。利用者の読みの直しは当てない。読みに置き換えた語${loaded.reading.replacedWords}個`,
  );
  out.push(
    `- 表の前処理と系列の切り方: \`docs/corpus-ngram.md\`。走りの数${tables.sequences.bunsetsu.length}、文節の数${tables.sequences.bunsetsu.reduce((sum, run) => sum + run.length, 0)}`,
  );
  out.push(
    `- 選べる次数: ${selectable.join('・')}次（足りている最大の次数 ${sufficientOrder(sufficiency) ?? 'なし'}。上限は続きが1種類の文脈の出現の割合 ${percent(SINGLE_CONTINUATION_LIMIT)}。0次は判定せず常に選べる）`,
  );
  out.push(
    `- 先読みN: 文節で数える（今の文節を含めて何文節を見るか）。${args.lookaheads.join('・')}。選べる範囲は${BUNSETSU_LOOKAHEAD.min}〜${BUNSETSU_LOOKAHEAD.max}、既定は${BUNSETSU_LOOKAHEAD.default}`,
  );
  out.push(
    '- 文脈より前の打鍵は無かったものとして、すべての指をホームに置いた状態から項目を打つ。コンボを止める境と、漢直の配列の表記で打つ語は持たない（表が読みの文節だけを持つため）',
  );
  out.push('', '### 配列ごとの条件', '');
  out.push(
    table(
      ['配列のid', '綴り', '物理配列', '指の割り当て', 'sfb_home_cost', 'センターシフトの親指', '空白の親指'],
      setups.map(([id, setup]) => [
        id,
        setup.romajiRuleId ?? 'かな直接',
        setup.geometry.id,
        setup.geometry.assignment.id,
        String(setup.tracePolicy.sfbHomeCost),
        setup.tracePolicy.centerShiftThumb ?? 'right',
        setup.tracePolicy.spaceThumb ?? 'right',
      ]),
    ),
    '',
  );

  const orders: { order: number; selectable: boolean }[] = [
    ...selectable.map((order) => ({ order, selectable: true })),
    ...Array.from({ length: args.referenceOrders }, (_, index) => ({ order: upper + 1 + index, selectable: false })),
  ];
  const started = performance.now();
  const cache = new Map<string, TableAnalysis>();
  const progress = (order: number, lookahead: number): string => `次数${order} N=${lookahead}`;
  for (const lookahead of args.lookaheads) {
    for (const { order, selectable: isSelectable } of orders) {
      const results = new Map<string, TableAnalysis>();
      for (const [id, setup] of setups) {
        // Nをk+1より大きくしても結果はk+1と同じ（仕様 §13.3）。同じ計算を繰り返さず、条件のNだけ差し替える
        const cacheKey = `${id}:${order}:${Math.min(lookahead, order + 1)}`;
        let result = cache.get(cacheKey);
        if (result === undefined) {
          result = analyzeNgramTable(tables.bunsetsu.tables[order]!, order, setup, lookahead, source);
          cache.set(cacheKey, result);
        }
        results.set(id, { ...result, conditions: { ...result.conditions, lookahead: { unit: 'bunsetsu', value: lookahead } } });
        console.error(`${progress(order, lookahead)} ${id} ${((performance.now() - started) / 1000).toFixed(0)}秒`);
      }
      const first = results.values().next().value!;
      const title = `表の次数${order}・文節の先読みN=${lookahead}${isSelectable ? '' : '（選べない次数。参考）'}`;
      out.push(`## ${title}`, '');
      out.push(`出現数W = ${first.occurrences}、項目の数E = ${first.entries}、入力かな数C = ${first.chars}`, '');
      out.push(
        table(
          ['配列', '総移動距離D [u]', '入力1かなあたりD/C [u]', '打てなかった文字S'],
          [...results].map(([id, result]) => [id, fixed(result.totalDistance, 1), fixed(result.perChar), String(result.skipped)]),
        ),
        '',
      );
      out.push('文節の移動距離の分布（出現回数で重み付け。単位はu）', '');
      out.push(
        table(
          DISTRIBUTION_HEADER,
          [...results].map(([id, result]) => distributionRow(id, result.distanceDistribution)),
        ),
        '',
      );
      out.push('文節の移動距離を文節のかな数で割った値の分布（出現回数で重み付け。単位はu/かな）', '');
      out.push(
        table(
          DISTRIBUTION_HEADER,
          [...results].map(([id, result]) => distributionRow(id, result.perCharDistribution)),
        ),
        '',
      );
    }
  }
  out.push(`実行時間（コーパスの読み込みと表の作成を除く）: ${((performance.now() - started) / 1000).toFixed(1)}秒`, '');
  console.log(out.join('\n'));
}

await main();
