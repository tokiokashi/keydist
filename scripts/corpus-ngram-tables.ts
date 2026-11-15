// コーパスから、文節の読みの系列とかなの系列のn-gramの表と、次数ごとの統計が足りているかの量を出す。
// 定義は`docs/corpus-ngram.md`。結果はMarkdownの表として標準出力に出す。表そのものはリポジトリに置かない。
//
//   node --experimental-strip-types scripts/corpus-ngram-tables.ts
//   ... --max-order 5      表の最大の次数（既定は5）
//   ... --top 10           次数ごとに出現回数の多い並びを何件出すか（既定は0。出さない）
//   ... --source <zipのパス> 取得済みの青空文庫のzipを使う
//   ... --context          次数ごとの量の代わりに、検出できた文脈の長さと、コーパスの大きさを変えた時の変化を出す
//
// 辞書（IPADIC）は .cache/dictionary/ に取る（CONTRIBUTING.md「読みの辞書」）。無ければ取得する。
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { convertToReading } from '#input/text/reading.ts';
import { mapBoundariesToReading, offsetsOfChunks } from '#input/text/segmentation.ts';
import {
  BUNSETSU_KEY_SEPARATOR,
  buildCorpusNgramTables,
  SINGLE_CONTINUATION_LIMIT,
  sufficientOrder,
  ngramSufficiency,
  type OrderSufficiency,
} from '#interpretation/corpus-ngram.ts';
import {
  detectContextLength,
  MAX_DISTANCE,
  PERMUTATIONS_FULL,
  PERMUTATIONS_SIZED,
  P_VALUE_LIMIT,
  DISTANCE_GRID,
  SELECTION_SEED_OFFSET,
  selectRunsUpTo,
  type ContextLength,
} from '#interpretation/corpus-context.ts';
import { PRNG_NAME } from '#interpretation/prng.ts';
import { countNgramsInRuns } from '#interpretation/ngram-table.ts';
import { splitBunsetsu } from '#platform/bunsetsu/budoux.ts';
import { BUNSETSU_SPLITTER } from '#platform/bunsetsu/info.ts';
import { createReadingAnalyzer, type LinderaModule } from '#platform/reading/analyzer.ts';
import { readDictionaryZip } from '#platform/reading/dictionary-files.ts';
import { DICTIONARY_SPEC, LIBRARY_SPEC } from '#platform/reading/dictionary-spec.ts';
import { extractZip } from '#platform/reading/zip.ts';
import { ensureDictionaryZip } from './dictionary-fetch.ts';
import { convertAozora, extractBody } from './aozora-core.ts';
import { AOZORA_SOURCE, archiveBytes } from './generate-neko-sample.ts';

const root = resolve(fileURLToPath(import.meta.url), '..', '..');

function parseArgs(argv: readonly string[]): { maxOrder: number; top: number; source: string | undefined; context: boolean } {
  const value = (name: string): string | undefined => {
    const index = argv.indexOf(name);
    return index === -1 ? undefined : argv[index + 1];
  };
  const integer = (name: string, fallback: number): number => {
    const raw = value(name);
    if (raw === undefined) return fallback;
    const parsed = Number(raw);
    if (!Number.isInteger(parsed) || parsed < 0) throw new Error(`${name}には0以上の整数を渡す: ${raw}`);
    return parsed;
  };
  const source = value('--source');
  return {
    maxOrder: integer('--max-order', 5),
    top: integer('--top', 0),
    source: source === undefined ? undefined : resolve(source),
    context: argv.includes('--context'),
  };
}

const sha256Of = (data: string | Uint8Array): string => createHash('sha256').update(data).digest('hex');

function table(header: readonly string[], rows: readonly (readonly string[])[]): string {
  return [`| ${header.join(' | ')} |`, `|${header.map(() => '---').join('|')}|`, ...rows.map((row) => `| ${row.join(' | ')} |`)].join('\n');
}

const percent = (value: number | undefined): string => (value === undefined ? '–' : `${(value * 100).toFixed(2)}%`);

function sufficiencyTable(rows: readonly OrderSufficiency[]): string {
  return table(
    [
      '次数',
      '出現数',
      '並びの種類',
      '1回だけの並び',
      '文脈の種類',
      '続きが1種類の文脈の出現',
      '続きが1種類の文脈の出現の割合（判定）',
      '文脈が1回だけ',
      '文脈が1回だけの割合（参考）',
      '並びが1回だけの割合',
      `上限${percent(SINGLE_CONTINUATION_LIMIT)}`,
    ],
    rows.map((row) => [
      String(row.order),
      String(row.occurrences),
      String(row.grams),
      String(row.singletonGrams),
      String(row.contexts),
      String(row.singleContinuationOccurrences),
      percent(row.singleContinuationRatio),
      String(row.singletonContexts),
      percent(row.contextSingletonRatio),
      percent(row.gramSingletonRatio),
      row.singleContinuationRatio === undefined ? '判定しない' : row.singleContinuationRatio <= SINGLE_CONTINUATION_LIMIT ? '以下' : '超えた',
    ]),
  );
}

function topTable(tables: readonly ReadonlyMap<string, number>[], separator: string, top: number): string {
  const rows: string[][] = [];
  for (const [order, entries] of tables.entries()) {
    const sorted = [...entries].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, top);
    for (const [key, count] of sorted) rows.push([String(order), separator === '' ? key : key.split(separator).join(' / '), String(count)]);
  }
  return table(['次数', '並び', '出現回数'], rows);
}

const SELECTION_SEEDS = [1, 2, 3, 4, 5] as const;
const SIZE_FRACTIONS = [
  { label: '1/16', value: 1 / 16 },
  { label: '1/8', value: 1 / 8 },
  { label: '1/4', value: 1 / 4 },
  { label: '1/2', value: 1 / 2 },
] as const;

const fixed = (value: number | undefined, digits = 3): string => (value === undefined ? '–' : value.toFixed(digits));

function contextLengthLabel(result: ContextLength): string {
  return result.reachedLimit ? `${result.length}（上限まで検出）` : String(result.length);
}

function distanceTable(result: ContextLength): string {
  return table(
    [
      '距離d',
      '組の数',
      'I(d)（ビット）',
      '並べ替えた組の平均',
      '超過量（ビット）',
      '超過量 / d=1の超過量',
      'p値',
      '検出',
      'Grassbergerの推定量（元）',
      'Grassbergerの推定量（並べ替え種1）',
    ],
    result.rows.map((row) => [
      String(row.distance),
      String(row.pairs),
      fixed(row.mutualInformation),
      fixed(row.permutedMean),
      fixed(row.excess),
      fixed(row.excessRatio, 4),
      fixed(row.pValue, 4),
      row.detected ? 'できた' : 'できない',
      fixed(row.grassberger),
      fixed(row.grassbergerPermuted),
    ]),
  );
}

/** 5通りの値を、最小・中央値・最大で並べる。 */
function spread(values: readonly number[], format: (value: number) => string): string {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length === 1
    ? format(sorted[0]!)
    : `${format(sorted[0]!)} / ${format(sorted[Math.floor(sorted.length / 2)]!)} / ${format(sorted.at(-1)!)}`;
}

interface SizeTrial {
  readonly kanaUnits: number;
  readonly bunsetsuUnits: number;
  readonly kanaLength: ContextLength;
  readonly bunsetsuLength: ContextLength;
  readonly kanaRatios: readonly (number | undefined)[];
  readonly bunsetsuRatios: readonly (number | undefined)[];
}

function trial(
  kana: readonly (readonly string[])[],
  bunsetsu: readonly (readonly string[])[],
  indices: readonly number[],
  full?: { kana: ContextLength; bunsetsu: ContextLength },
): SizeTrial {
  const kanaRuns = indices.map((index) => kana[index]!);
  const bunsetsuRuns = indices.map((index) => bunsetsu[index]!);
  const kanaRows = ngramSufficiency(countNgramsInRuns(kanaRuns, 3));
  const bunsetsuRows = ngramSufficiency(countNgramsInRuns(bunsetsuRuns, 2, BUNSETSU_KEY_SEPARATOR), BUNSETSU_KEY_SEPARATOR);
  return {
    kanaUnits: kanaRuns.reduce((sum, run) => sum + run.length, 0),
    bunsetsuUnits: bunsetsuRuns.reduce((sum, run) => sum + run.length, 0),
    kanaLength: full?.kana ?? detectContextLength(kanaRuns, MAX_DISTANCE.kana, { permutations: PERMUTATIONS_SIZED }),
    bunsetsuLength: full?.bunsetsu ?? detectContextLength(bunsetsuRuns, MAX_DISTANCE.bunsetsu, { permutations: PERMUTATIONS_SIZED }),
    kanaRatios: [kanaRows[2]!.singleContinuationRatio, kanaRows[3]!.singleContinuationRatio],
    bunsetsuRatios: [bunsetsuRows[1]!.singleContinuationRatio, bunsetsuRows[2]!.singleContinuationRatio],
  };
}

function sizeTable(
  kana: readonly (readonly string[])[],
  bunsetsu: readonly (readonly string[])[],
  full: { kana: ContextLength; bunsetsu: ContextLength },
): string {
  const lengths = kana.map((run) => run.length);
  const total = lengths.reduce((sum, length) => sum + length, 0);
  const all = kana.map((_, index) => index);
  const rows: string[][] = [];
  const addRow = (label: string, trials: readonly SizeTrial[]): void => {
    const lengthOf = (r: ContextLength): number => r.length;
    const limited = (pick: (t: SizeTrial) => ContextLength): string => (trials.some((t) => pick(t).reachedLimit) ? '（上限まで検出した通りあり）' : '');
    const ratio = (pick: (t: SizeTrial) => number | undefined): string => {
      const values = trials.map(pick);
      return values.some((v) => v === undefined) ? '–' : spread(values as number[], (v) => `${(v * 100).toFixed(2)}%`);
    };
    rows.push([
      label,
      String(trials.length),
      spread(
        trials.map((t) => t.kanaUnits),
        String,
      ),
      spread(
        trials.map((t) => t.bunsetsuUnits),
        String,
      ),
      spread(
        trials.map((t) => lengthOf(t.kanaLength)),
        String,
      ) + limited((t) => t.kanaLength),
      spread(
        trials.map((t) => lengthOf(t.bunsetsuLength)),
        String,
      ) + limited((t) => t.bunsetsuLength),
      ratio((t) => t.kanaRatios[0]),
      ratio((t) => t.kanaRatios[1]),
      ratio((t) => t.bunsetsuRatios[0]),
      ratio((t) => t.bunsetsuRatios[1]),
    ]);
  };
  for (const { label, value } of SIZE_FRACTIONS) {
    addRow(
      label,
      SELECTION_SEEDS.map((seed) => trial(kana, bunsetsu, selectRunsUpTo(lengths, total * value, seed))),
    );
  }
  addRow('1/1', [trial(kana, bunsetsu, all, full)]);
  return table(
    [
      '大きさ',
      '通り',
      'かなの単位の数',
      '文節の単位の数',
      'かなの文脈の長さ',
      '文節の文脈の長さ',
      'かな2次の続きが1種類の割合',
      'かな3次の続きが1種類の割合',
      '文節1次の続きが1種類の割合',
      '文節2次の続きが1種類の割合',
    ],
    rows,
  );
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  // コーパス: 取得と除去は`scripts/generate-neko-sample.ts`と同じ
  const zip = await archiveBytes(args.source);
  const entry = (await extractZip(zip)).get(AOZORA_SOURCE.entryName);
  if (entry === undefined) throw new Error(`zipに${AOZORA_SOURCE.entryName}が無い`);
  const corpus = convertAozora(extractBody(new TextDecoder('shift_jis', { fatal: true }).decode(entry))).text;

  // 読みへの変換と文節の区切り: アプリと同じ経路（原文を形態素解析 → 読みに置き換え。分割器は原文に1回だけ当て、語の境目へ寄せて読みの位置へ写す）
  const lindera = await import('lindera-wasm');
  lindera.initSync({ module: await readFile(resolve(root, 'node_modules/lindera-wasm/lindera_wasm_bg.wasm')) });
  const analyzer = createReadingAnalyzer(lindera as unknown as LinderaModule, await readDictionaryZip(await ensureDictionaryZip()));
  const tokens = analyzer.tokenize(corpus);
  const reading = convertToReading(corpus, tokens);
  const sourceBoundaries = offsetsOfChunks(splitBunsetsu(corpus));
  const readingBoundaries = mapBoundariesToReading(corpus, tokens, sourceBoundaries);

  const result = buildCorpusNgramTables(reading.text, readingBoundaries, args.maxOrder);
  const { sequences } = result;
  const unitCount = sequences.bunsetsu.reduce((sum, run) => sum + run.length, 0);
  const kanaCount = sequences.kana.reduce((sum, run) => sum + run.length, 0);

  const out: string[] = [];
  out.push(
    args.context
      ? '# コーパスの文脈の長さの推定と、コーパスの大きさを変えた時の変化'
      : '# コーパスの文節の読みとかなのn-gramの表と、統計が足りているかの量',
    '',
  );
  out.push(args.context ? '定義は `docs/corpus-ngram.md`。' : '定義は `docs/corpus-ngram.md`。表そのものは出さず、次数ごとの量を出す。', '');
  out.push('## 再現の条件', '');
  out.push(
    `- コーパス: 青空文庫『${AOZORA_SOURCE.title}』（作品789）。zip ${AOZORA_SOURCE.fileName}（sha256 ${AOZORA_SOURCE.sha256}）。注記を除いた全文のsha256 ${sha256Of(corpus)}（${[...corpus].length}文字）`,
  );
  out.push('- 統計は1作品（明治期の小説、一人称の語り）から出たもの。ジャンルの区分は無い。日本語の文章一般の統計として読まない');
  out.push(
    `- 文節の分割器: ${BUNSETSU_SPLITTER.name} ${BUNSETSU_SPLITTER.version}（日本語のモデル）。読みに直す前の原文に1回だけ当てた（原文の区切り${sourceBoundaries.length}個、読みの上${readingBoundaries.length}個）`,
  );
  out.push(
    `- 読みへの変換: ${LIBRARY_SPEC.name} ${LIBRARY_SPEC.version} + ${DICTIONARY_SPEC.name} ${DICTIONARY_SPEC.version}。原文のルビは使わない。利用者の読みの直しは当てない。読みに置き換えた語${reading.replacedWords}個`,
  );
  out.push(
    '- 前処理: 仕様 §4.6の2段目から4段目のうち配列に依らない分（記号は `、` `。` だけ残し、英字と数字を取り除く。半角の `,` `.` は `、` `。` へ書き換える）。片仮名は書き換えない',
  );
  out.push(
    `- 系列を切った文字: 空白と改行${sequences.cuts.whitespace}個、読みに直らなかった漢字${sequences.cuts.unreadableKanji}個、かなと句読点と漢字と空白のどれでもない文字${sequences.cuts.otherUnreadable}個。前処理の後の文字数${sequences.chars}`,
  );
  out.push(`- 走りの数: かな${sequences.kana.length}、文節${sequences.bunsetsu.length}。単位の数: かな${kanaCount}、文節${unitCount}`);
  out.push(
    `- 表の最大の次数: ${args.context ? '3（かなの系列）・2（文節の系列）' : args.maxOrder}。上限: 続きが1種類の文脈の出現の割合 ${percent(SINGLE_CONTINUATION_LIMIT)}`,
  );
  if (args.context) {
    out.push(
      `- 文脈の長さの推定: 距離を置いた2単位の相互情報量（出現回数の比で求める）。乱数生成器は${PRNG_NAME}。基準は距離ごとに組の2つ目だけを全組の間で並べ替えた列。全体の表の並べ替えは種1〜${PERMUTATIONS_FULL}の${PERMUTATIONS_FULL}通り（p値は(1 + 元以上の数) / ${PERMUTATIONS_FULL + 1}）、大きさを変えた表の1/16〜1/2は種1〜${PERMUTATIONS_SIZED}の${PERMUTATIONS_SIZED}通り（p値は(1 + 元以上の数) / ${PERMUTATIONS_SIZED + 1}、1/1の行は全体の表の値）。p値が${P_VALUE_LIMIT}以下を検出とする。走りを選ぶ種は${SELECTION_SEEDS.join('・')}（生成器の種は${SELECTION_SEED_OFFSET}を足した値）。調べた距離の格子: ${DISTANCE_GRID.join('・')}（かなは${MAX_DISTANCE.kana}まで、文節は${MAX_DISTANCE.bunsetsu}まで）`,
    );
  }
  out.push('');

  if (args.context) {
    const started = performance.now();
    const full: { kana?: ContextLength; bunsetsu?: ContextLength } = {};
    for (const [title, key, runs, limit] of [
      ['かなの系列', 'kana', sequences.kana, MAX_DISTANCE.kana],
      ['文節の読みの系列', 'bunsetsu', sequences.bunsetsu, MAX_DISTANCE.bunsetsu],
    ] as const) {
      const detected = detectContextLength(runs, limit, { permutations: PERMUTATIONS_FULL, withGrassberger: true });
      full[key] = detected;
      out.push(`## 全体の${title}の、距離ごとの相互情報量`, '');
      out.push(distanceTable(detected), '');
      out.push(`検出できた文脈の長さ（格子の点で、p値が${P_VALUE_LIMIT}以下の距離が途切れずに続く最大）: ${contextLengthLabel(detected)}`, '');
    }
    out.push('## コーパスの大きさを変えた時', '');
    out.push('各列の5通りの値は、最小 / 中央値 / 最大。割合は続きが1種類の文脈の出現の割合。', '');
    out.push(sizeTable(sequences.kana, sequences.bunsetsu, { kana: full.kana!, bunsetsu: full.bunsetsu! }), '');
    out.push(
      `実行時間（相互情報量と大きさの変化の計算。コーパスの読み込みと表の作成を除く）: ${((performance.now() - started) / 1000).toFixed(1)}秒`,
      '',
    );
    console.log(out.join('\n'));
    return;
  }

  for (const [title, side, separator] of [
    ['文節の読みの系列', result.bunsetsu, BUNSETSU_KEY_SEPARATOR],
    ['かなの系列', result.kana, ''],
  ] as const) {
    const order = sufficientOrder(side.sufficiency);
    out.push(`## ${title}`, '');
    out.push(sufficiencyTable(side.sufficiency), '');
    out.push(`足りている最大の次数: ${order === undefined ? '無い（次数1で上限を超えた）' : order}`, '');
    if (args.top > 0) out.push(topTable(side.tables, separator, args.top), '');
  }
  console.log(out.join('\n'));
}

await main();
