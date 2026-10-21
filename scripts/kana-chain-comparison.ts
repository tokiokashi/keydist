// 文章の中の指標の変動が、かな3文字までの並びの統計で説明できるかを、標準のコーパスから抜き出したテキストで調べる。
// 定義は`docs/kana-chain-comparison.md`。結果はMarkdownの表として標準出力に出す。画面には出さない。
//
//   node --experimental-strip-types scripts/kana-chain-comparison.ts                        すべて出す
//   node --experimental-strip-types scripts/kana-chain-comparison.ts --stage support        候補が1つの割合と続けた回数だけ出す（順位・判定は出さない）
//   node --experimental-strip-types scripts/kana-chain-comparison.ts --stage boundary      全文で、文節の区切りの直後の1文字を、境目のまわりの並びを揃えたランダムな区切りと比べる（`docs/boundary-context-comparison.md`）
//   ... --layouts qwerty,jis-kana    比べる配列（既定はqwertyとjis-kana。allで組み込みの全配列）
//   ... --ranges 3                   抜き出す範囲の数（既定は3）
//   ... --range-seed 1               範囲を選ぶ種（既定は1）
//   ... --seed-start <s>             生成文・対照テキスト・ランダムの区切りの種の始まりの値（既定はRun Chartの解析設定の既定）
//   ... --window 3                   先読みN（既定は各配列のアプリの既定値）
//   ... --source <zipのパス>          取得済みの青空文庫のzipを使う
//
// 辞書（IPADIC）は .cache/dictionary/ に取る（CONTRIBUTING.md「読みの辞書」）。無ければ取得する。
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateEngineTrace } from '#engine/pipeline.ts';
import { EMPTY_SETTINGS_OVERRIDES, setSettingsOverride } from '#engine/settings-items.ts';
import { resolveEngineInput, type ResolvedInput } from '#engine/resolved-input.ts';
import { LAYOUT_BY_ID } from '#input/layouts/index.ts';
import { PHYSICAL_SHAPES, type PhysicalShape } from '#input/shapes/geometry.ts';
import { isSymbolChar } from '#input/text/evaluation-text.ts';
import { convertToReading, type ReadingToken } from '#input/text/reading.ts';
import { SAMPLE_TEXT_JA_NEKO } from '#input/text/sample-ja-neko.ts';
import { mapBoundariesToReading, offsetsOfChunks } from '#input/text/segmentation.ts';
import { DEFAULT_RUN_CHART_OPTIONS } from '#analyzers/run-chart/options.ts';
import {
  CHAIN_METRIC,
  CHAIN_QUANTILE,
  CHAIN_SEED_COUNT,
  CHAIN_SINGLE_RATIO_LIMIT,
  CHAIN_SPAN_LENGTH,
  compareWithChain,
  generateFromChain,
  type ChainComparison,
  type ChainSupport,
  type ChainVerdict,
  type SpanQuantities,
} from '#interpretation/chain-comparison.ts';
import { buildMarkovChain } from '#interpretation/markov-text.ts';
import { countNgrams, ngramTablesWithoutRange } from '#interpretation/ngram-table.ts';
import { createMulberry32, PRNG_NAME } from '#interpretation/prng.ts';
import {
  BOUNDARY_CONTEXT_FORCED_RATIO_LIMIT,
  BOUNDARY_CONTEXT_LENGTHS,
  BOUNDARY_CONTEXT_METRIC,
  BOUNDARY_CONTEXT_SEED_COUNT,
  boundaryShare,
  compareBoundaryContext,
  type BoundaryContextVerdict,
} from '#interpretation/boundary-context.ts';
import { buildSegmentationReport, type RankAmongRandom, type SegmentationReport } from '#interpretation/segments.ts';
import { buildSpanIndex, type SpanIndex } from '#interpretation/span-metrics.ts';
import { splitBunsetsu } from '#platform/bunsetsu/budoux.ts';
import { BUNSETSU_SPLITTER } from '#platform/bunsetsu/info.ts';
import { createReadingAnalyzer, type LinderaModule, type ReadingAnalyzer } from '#platform/reading/analyzer.ts';
import { readDictionaryZip } from '#platform/reading/dictionary-files.ts';
import { DICTIONARY_SPEC, LIBRARY_SPEC } from '#platform/reading/dictionary-spec.ts';
import { extractZip } from '#platform/reading/zip.ts';
import { ensureDictionaryZip } from './dictionary-fetch.ts';
import { convertAozora, extractBody } from './aozora-core.ts';
import { AOZORA_SOURCE, archiveBytes } from './generate-neko-sample.ts';

const root = resolve(fileURLToPath(import.meta.url), '..', '..');

/** 範囲の長さの下限。評価に渡すテキストの文字数で、この値を超える最初の段落の境目までを取る。 */
const RANGE_MIN_CHARS = 2000;

interface Args {
  stage: 'support' | 'full' | 'boundary';
  layouts: string[];
  ranges: number;
  rangeSeed: number;
  seedStart: number;
  window: number | undefined;
  source: string | undefined;
}

function parseArgs(argv: readonly string[]): Args {
  const value = (name: string): string | undefined => {
    const index = argv.indexOf(name);
    return index === -1 ? undefined : argv[index + 1];
  };
  const integer = (name: string, fallback: number): number => {
    const raw = value(name);
    if (raw === undefined) return fallback;
    const parsed = Number(raw);
    if (!Number.isInteger(parsed)) throw new Error(`${name}には整数を渡す: ${raw}`);
    return parsed;
  };
  const stage = value('--stage') ?? 'full';
  if (stage !== 'support' && stage !== 'full' && stage !== 'boundary') throw new Error(`--stageはsupportかfullかboundary: ${stage}`);
  const window = value('--window');
  return {
    stage,
    layouts: value('--layouts') === 'all' ? [...LAYOUT_BY_ID.keys()] : (value('--layouts') ?? 'qwerty,jis-kana').split(',').filter((id) => id !== ''),
    ranges: integer('--ranges', 3),
    rangeSeed: integer('--range-seed', 1),
    seedStart: integer('--seed-start', DEFAULT_RUN_CHART_OPTIONS.seedStart),
    window: window === undefined ? undefined : integer('--window', 0),
    source: value('--source') === undefined ? undefined : resolve(value('--source')!),
  };
}

function sha256Of(data: string | Uint8Array): string {
  return createHash('sha256').update(data).digest('hex');
}

function must<T>(value: T | undefined | null, message: string): T {
  if (value === undefined || value === null) throw new Error(message);
  return value;
}

function cpLength(text: string): number {
  let count = 0;
  for (const _char of text) count++;
  return count;
}

// ---------------------------------------------------------------------------
// コーパスと読みの変換
// ---------------------------------------------------------------------------

async function loadReadingAnalyzer(): Promise<ReadingAnalyzer> {
  const lindera = await import('lindera-wasm');
  lindera.initSync({ module: await readFile(resolve(root, 'node_modules/lindera-wasm/lindera_wasm_bg.wasm')) });
  const files = await readDictionaryZip(await ensureDictionaryZip());
  return createReadingAnalyzer(lindera as unknown as LinderaModule, files);
}

/** アプリと同じ経路（形態素解析 → 漢字を含む語を読みに置き換え）で、原文を読みに直す。 */
function readingOf(analyzer: ReadingAnalyzer, source: string): { text: string; tokens: readonly ReadingToken[] } {
  const tokens = analyzer.tokenize(source);
  return { text: convertToReading(source, tokens).text, tokens };
}

interface Unit {
  /** 段落（末尾の改行を含む）の原文 */
  readonly source: string;
  /** 全体の文字列（読みに直したコーパス全文）での開始位置（コードポイント） */
  readonly start: number;
  readonly end: number;
  /** 評価に渡すテキストでの文字数（記号を取り除いた後） */
  readonly evalChars: number;
  /** 段落の原文を読みに直した時の語の列（位置は段落の中のバイト位置） */
  readonly tokens: readonly ReadingToken[];
}

/** 前処理（仕様 §4.6）が1文字を残すか。残す文字は、記号でない文字と `、` `。`、および `、` `。` に書き換わるか配列が直接持つ半角の `,` `.` */
function keptByPreprocess(char: string): boolean {
  return !isSymbolChar(char) || char === '、' || char === '。' || char === ',' || char === '.';
}

interface Range {
  readonly firstUnit: number;
  readonly endUnit: number;
  /** 原文の範囲（段落をそのままつないだもの） */
  readonly source: string;
  /** 読みに直した範囲 */
  readonly reading: string;
  readonly tokens: readonly ReadingToken[];
  /** 全体の文字列での位置 `[a, b)`（コードポイント） */
  readonly a: number;
  readonly b: number;
  /** 評価に渡す全体の文字列での位置 `[a', b')` */
  readonly evalFrom: number;
  readonly evalTo: number;
}

// ---------------------------------------------------------------------------
// 配列ごとの評価
// ---------------------------------------------------------------------------

const CATALOG = {
  layouts: LAYOUT_BY_ID,
  shapes: new Map<string, PhysicalShape>(Object.values(PHYSICAL_SHAPES).map((shape) => [shape.id, shape])),
};

function resolveFor(layoutId: string, text: string, window: number | undefined, segmentation?: { boundaries: readonly number[] }): ResolvedInput {
  let overrides = EMPTY_SETTINGS_OVERRIDES;
  if (window !== undefined) {
    const written = setSettingsOverride(overrides, { kind: 'global' }, 'windowSize', window);
    if (!written.ok) throw new Error(`先読みN ${window}を設定できない`);
    overrides = written.overrides;
  }
  const result = resolveEngineInput({
    target: { kind: 'layout', layoutId },
    setups: new Map(),
    catalog: CATALOG,
    userLayouts: new Map(),
    overrides,
    text,
    language: 'ja',
    ...(segmentation === undefined
      ? {}
      : { segmentation: { boundaries: segmentation.boundaries, origin: 'dictionary' as const, splitter: BUNSETSU_SPLITTER } }),
  });
  if (!result.ok) throw new Error(`${layoutId}の条件を解決できない: ${JSON.stringify(result.error)}`);
  return result.input;
}

function evaluatorOf(input: ResolvedInput): (text: string) => SpanIndex {
  return (text) => buildSpanIndex(generateEngineTrace({ ...input, text }).trace);
}

// ---------------------------------------------------------------------------
// 表の出力
// ---------------------------------------------------------------------------

const fixed = (value: number | undefined, digits = 3): string => (value === undefined ? '–' : value.toFixed(digits));
const percent = (value: number | undefined): string => (value === undefined ? '–' : `${(value * 100).toFixed(2)}%`);

function minMax(values: readonly (number | undefined)[], digits = 3): string {
  const defined = values.filter((value): value is number => value !== undefined);
  if (defined.length === 0) return '–';
  return `${fixed(Math.min(...defined), digits)}〜${fixed(Math.max(...defined), digits)}`;
}

function rankText(rank: RankAmongRandom | undefined): string {
  if (rank === undefined) return '–';
  const position = rank.low === rank.high ? `${rank.low}` : `${rank.low}〜${rank.high}`;
  return `${position}/${rank.of}${rank.extreme === null ? '' : rank.extreme === 'highest' ? '（最大より大きい）' : '（最小より小さい）'}`;
}

function verdictText(verdict: ChainVerdict): string {
  switch (verdict.kind) {
    case 'unexplained':
      return 'かな3文字までの並びでは説明できなかった';
    case 'not-ruled-out':
      return '説明できなかったとは言えない';
    case 'withheld':
      return verdict.reason === 'single-ratio' ? '出さない（候補が1つの段の割合が上限を超えた）' : '出さない（区間の値が決まらない）';
    case 'not-judged':
      return '–';
  }
}

function table(header: readonly string[], rows: readonly (readonly string[])[]): string {
  return [`| ${header.join(' | ')} |`, `|${header.map(() => '---').join('|')}|`, ...rows.map((row) => `| ${row.join(' | ')} |`)].join('\n');
}

function supportRow(rangeLabel: string, layoutId: string, support: ChainSupport): string[] {
  return [
    rangeLabel,
    layoutId,
    String(support.steps),
    String(support.singleCandidateSteps),
    percent(support.singleRatio),
    support.singleRatio !== undefined && support.singleRatio > CHAIN_SINGLE_RATIO_LIMIT ? '超えた' : '超えない',
    String(support.continuedByLastChar),
    String(support.continuedFromWhole),
  ];
}

// ---------------------------------------------------------------------------
// 全文での境目のまわりの並びとの比較
// ---------------------------------------------------------------------------

interface BoundaryStageInput {
  readonly args: Args;
  readonly started: number;
  readonly lap: (label: string) => void;
  readonly corpus: string;
  readonly corpusSha: string;
  readonly units: readonly Unit[];
  readonly wholeReading: string;
  readonly wholeChars: readonly string[];
}

function boundaryVerdictText(verdict: BoundaryContextVerdict, length: number): string {
  switch (verdict.kind) {
    case 'unexplained':
      return `境目のまわりの${length}文字の並びでは説明できなかった（並びの外の打鍵を含む）`;
    case 'not-ruled-out':
      return '説明できなかったとは言えない';
    case 'withheld':
      return verdict.reason === 'forced-ratio' ? '判定なし（選ぶ余地が無い区切りの割合が上限を超えた）' : '判定なし（値が決まらない）';
  }
}

async function runBoundaryStage(input: BoundaryStageInput): Promise<void> {
  const { args, started, lap, corpus, corpusSha, units, wholeReading, wholeChars } = input;
  // 文節の区切り: 改行を含む原文の全文にBudouXを当て、段落ごとの語の列を全文のバイト位置へずらして読みへ写す
  const tokens: ReadingToken[] = [];
  let byteOffset = 0;
  for (const unit of units) {
    for (const token of unit.tokens) tokens.push({ ...token, byteStart: token.byteStart + byteOffset, byteEnd: token.byteEnd + byteOffset });
    byteOffset += new TextEncoder().encode(unit.source).length;
  }
  const bunsetsuSource = offsetsOfChunks(splitBunsetsu(corpus));
  const bunsetsuInReading = mapBoundariesToReading(corpus, tokens, bunsetsuSource);
  lap(`全文の文節の区切りを付けた（原文${bunsetsuSource.length}個、読みの上${bunsetsuInReading.length}個）`);
  // 改行の直後に区切りが付いた数（段落の境目の扱いの記録）
  const paragraphStarts = new Set(units.map((unit) => unit.start));
  const atParagraphStart = bunsetsuInReading.filter((boundary) => paragraphStarts.has(boundary)).length;

  const totalEvalChars = units.reduce((sum, unit) => sum + unit.evalChars, 0);
  const sections = {
    context: [] as string[][],
    share: [] as string[][],
    forced: [] as string[][],
  };
  const conditions: string[] = [];
  let withheld = 0;
  let judged = 0;
  const forcedRatios: Record<number, number[]> = { 1: [], 2: [], 3: [] };
  for (const layoutId of args.layouts) {
    const resolved = resolveFor(layoutId, wholeReading, args.window, { boundaries: bunsetsuInReading });
    const chars = [...resolved.text];
    if (chars.length !== totalEvalChars)
      throw new Error(`${layoutId}: 評価に渡す全体の文字数${chars.length}が、記号の取り除きだけで数えた${totalEvalChars}と違う`);
    const boundaries = must(resolved.extractionAssets.segmentation, '区切りが評価の資産に載っていない').boundaries;
    const index = evaluatorOf(resolved)(resolved.text);
    lap(`${layoutId}: 全文のTraceを作った`);
    const layout = must(LAYOUT_BY_ID.get(layoutId), layoutId);
    conditions.push(
      `${layout.name}（${layoutId}。${resolved.romajiRuleId === null ? 'かな直接入力' : `ローマ字入力、綴り${resolved.romajiRuleId}`}、物理配列${resolved.geometry.id}、指の割り当て${resolved.geometry.assignment.id}、N=${resolved.tracePolicy.windowSize}）`,
    );
    // #125のランダムな区切り（区間の長さの並べ替え）を同じ全文で作った値と順位
    const report = must(buildSegmentationReport(index, boundaries, args.seedStart), `${layoutId}: 区切りの比較を作れない`);
    const permuted = report.bunsetsu.byMetric[BOUNDARY_CONTEXT_METRIC].after;
    const permutedRandom = report.random.map((stats) => stats.byMetric[BOUNDARY_CONTEXT_METRIC].after);
    for (const length of BOUNDARY_CONTEXT_LENGTHS) {
      const result = compareBoundaryContext(index, chars, boundaries, length, args.seedStart);
      if (result.verdict.kind === 'withheld') withheld++;
      else judged++;
      forcedRatios[length]!.push(result.forcedRatio ?? Number.NaN);
      sections.context.push([
        layoutId,
        String(length),
        String(result.comparedCount),
        fixed(result.own),
        minMax(result.random),
        rankText(result.rank),
        boundaryVerdictText(result.verdict, length),
        fixed(permuted),
        minMax(permutedRandom),
        rankText(report.rank.after),
      ]);
      sections.forced.push([layoutId, String(length), String(result.comparedCount), String(result.forcedCount), percent(result.forcedRatio)]);
    }
    const share = boundaryShare(index, boundaries);
    sections.share.push([layoutId, String(boundaries.length), percent(share.charShare), percent(share.distanceShare)]);
  }
  lap('評価を終えた');

  const out: string[] = [];
  out.push('# 文節の区切りの直後の1文字と、境目のまわりの並びを揃えたランダムな区切り（全文）', '');
  out.push('## 再現の条件', '');
  out.push(
    `- コーパス: 青空文庫『${AOZORA_SOURCE.title}』（作品789）。zip ${AOZORA_SOURCE.fileName}（sha256 ${AOZORA_SOURCE.sha256}）。除去後の全文のsha256 ${corpusSha}（${cpLength(corpus)}文字、${units.length}段落）`,
    `- 読みの辞書: ${DICTIONARY_SPEC.name} ${DICTIONARY_SPEC.version}、解析器${LIBRARY_SPEC.name} ${LIBRARY_SPEC.version}。利用者の読みの直しは無し。全文を段落ごとに読みに直してつないだ文字列は${wholeChars.length}文字、評価に渡す文字列は${totalEvalChars}文字（全配列で一致を確かめた）`,
    `- 前処理: 仕様 §4.6の1〜4段（既定の記号の範囲）`,
    `- 文節の区切り: ${BUNSETSU_SPLITTER.name} ${BUNSETSU_SPLITTER.version}を、改行を含む原文の全文に1回当て、アプリと同じ経路で評価に渡すテキストの位置へ写した。原文の上で${bunsetsuSource.length}個、読みの上で${bunsetsuInReading.length}個。段落の先頭（改行の直後）に載った区切りは読みの上で${atParagraphStart}個`,
    `- 配列: ${conditions.join('、')}`,
    `- 比べる量: 区切りの直後の1文字に帰属したステップの1文字あたりの距離 [u] の、全区切りでの平均（docs/segment-metrics.md の直後の1文字）`,
    `- 並びを揃えたランダムな区切り: 乱数${PRNG_NAME}、種${args.seedStart}〜${args.seedStart + BOUNDARY_CONTEXT_SEED_COUNT - 1}の${BOUNDARY_CONTEXT_SEED_COUNT}個。並びの長さ1・2・3文字。判定は並びの長さ・配列ごとに別々`,
    `- 選ぶ余地が無い区切りの割合の上限: ${BOUNDARY_CONTEXT_FORCED_RATIO_LIMIT * 100}%。超えたらその並びの長さ・配列の判定を出さない`,
    `- 長さの並べ替え（docs/segment-metrics.md のランダム）: 同じ全文・同じ種の${BOUNDARY_CONTEXT_SEED_COUNT}個。全文の区切りすべてを使うので、並びの長さごとの列の文節の値（前の文字が足りない区切りを除く）とは、長さ2・3で区切りの数が少し違う`,
    '',
  );
  out.push('## 文節の直後の1文字（1文字あたりの距離 [u]）', '');
  out.push(
    table(
      [
        '配列',
        '並びの長さ',
        '比べる区切りの数',
        '文節',
        '並びを揃えたランダム20個',
        '順位',
        '判定',
        '文節（全区切り）',
        '長さの並べ替え20個',
        '長さの並べ替えでの順位',
      ],
      sections.context,
    ),
    '',
  );
  out.push(
    '判定は並びの長さ・配列ごとの別々の判定である。特徴が無くても、1つの判定が端に来る確率は最大で2/21で、判定は並びの長さ3通り×配列の数だけ並ぶ。順位は統計的な有意ではない。配列や並びの長さをまとめた結論は出さない。',
    '',
  );
  out.push('## 選ぶ余地が無い区切りの割合', '');
  out.push(table(['配列', '並びの長さ', '比べる区切りの数', '選ぶ余地が無い区切りの数', '割合'], sections.forced), '');
  out.push(`- 判定を出した（並びの長さ×配列）: ${judged}、出さなかった: ${withheld}（合計${judged + withheld}）`);
  for (const length of BOUNDARY_CONTEXT_LENGTHS) {
    const ratios = forcedRatios[length]!;
    out.push(`- 並びの長さ${length}: 割合の最小〜最大 ${minMaxPercent(ratios)}`);
  }
  out.push('');
  out.push('## 境目の打鍵が占める割合', '');
  out.push(
    table(
      ['配列', '区切りの数', '区切りの直後の1文字が全文の文字数に占める割合', '区切りの直後の1文字に帰属する距離が全文の距離に占める割合'],
      sections.share,
    ),
    '',
  );
  out.push(
    '## 実行',
    '',
    `- 実行時間${((Date.now() - started) / 1000).toFixed(1)}秒（全文の評価を含む）、最大の常駐メモリ${(process.resourceUsage().maxRSS / 1024).toFixed(0)}MB`,
  );
  console.log(out.join('\n'));
}

function minMaxPercent(values: readonly number[]): string {
  const defined = values.filter((value) => !Number.isNaN(value));
  if (defined.length === 0) return '–';
  return `${percent(Math.min(...defined))}〜${percent(Math.max(...defined))}`;
}

// ---------------------------------------------------------------------------
// 本体
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const started = Date.now();
  const args = parseArgs(process.argv.slice(2));
  for (const id of args.layouts) must(LAYOUT_BY_ID.get(id), `配列${id}が無い`);
  const lap = (label: string): void => console.error(`[kana-chain] ${label} ${((Date.now() - started) / 1000).toFixed(1)}秒`);

  // コーパス: 取得と除去は`scripts/generate-neko-sample.ts`と同じ（archiveBytes・extractBody・convertAozora）
  const zip = await archiveBytes(args.source);
  const entry = must((await extractZip(zip)).get(AOZORA_SOURCE.entryName), `zipに${AOZORA_SOURCE.entryName}が無い`);
  const body = extractBody(new TextDecoder('shift_jis', { fatal: true }).decode(entry));
  const corpus = convertAozora(body).text;
  if (!corpus.endsWith('\n')) throw new Error('コーパスの末尾が改行でない');
  const corpusSha = sha256Of(corpus);

  // 段落（改行の境目）ごとに読みへ直し、つないで全体の文字列を作る
  const analyzer = await loadReadingAnalyzer();
  lap('辞書を読み込んだ');
  const units: Unit[] = [];
  let readingParts = '';
  let cursor = 0;
  for (const line of corpus.slice(0, -1).split('\n')) {
    const source = `${line}\n`;
    const { text: reading, tokens: unitTokens } = readingOf(analyzer, source);
    const length = cpLength(reading);
    let evalChars = 0;
    for (const char of reading) if (keptByPreprocess(char)) evalChars++;
    units.push({ source, start: cursor, end: cursor + length, evalChars, tokens: unitTokens });
    readingParts += reading;
    cursor += length;
  }
  const wholeReading = readingParts;
  const wholeChars = [...wholeReading];
  lap(`コーパス全文を読みに直した（${units.length}段落、${wholeChars.length}文字）`);

  if (args.stage === 'boundary') {
    await runBoundaryStage({ args, started, lap, corpus, corpusSha, units, wholeReading, wholeChars });
    return;
  }

  // 前提: 前処理の3段目（半角の `,` `.` の書き換え）は1文字を1文字に直すだけで、文字数を変えない。
  // 配列が直接持てば半角のまま、持たなければ `、` `。` になり、どちらも4段目の記号の取り除きを受けない。
  // そのため範囲の位置は全配列で共有できる。配列ごとの文字数の一致は、下の配列ごとの検査で確かめる
  const halfwidthPunctuation = (wholeReading.match(/[,.]/g) ?? []).length;

  // 範囲を選ぶ。既定の日本語サンプルと重なる範囲を除く
  const sampleStart = corpus.indexOf(SAMPLE_TEXT_JA_NEKO);
  if (sampleStart === -1) throw new Error('既定の日本語サンプルがコーパスの中に見つからない');
  const sampleEnd = sampleStart + SAMPLE_TEXT_JA_NEKO.length;
  const sourceOffsets: number[] = [];
  {
    let offset = 0;
    for (const unit of units) {
      sourceOffsets.push(offset);
      offset += unit.source.length;
    }
    sourceOffsets.push(offset);
  }
  const overlapsSample = (first: number, end: number): boolean => sourceOffsets[first]! < sampleEnd && sourceOffsets[end]! > sampleStart;
  const endUnitOf = (first: number): number | undefined => {
    let sum = 0;
    for (let i = first; i < units.length; i++) {
      sum += units[i]!.evalChars;
      if (sum > RANGE_MIN_CHARS) return i + 1;
    }
    return undefined;
  };
  const candidates: { first: number; end: number }[] = [];
  for (let first = 0; first < units.length; first++) {
    if (units[first]!.source.trim() === '') continue;
    const end = endUnitOf(first);
    if (end !== undefined && !overlapsSample(first, end)) candidates.push({ first, end });
  }
  if (candidates.length === 0) throw new Error('範囲の候補が無い');
  const random = createMulberry32(args.rangeSeed);
  const chosen: { first: number; end: number }[] = [];
  for (let attempt = 0; chosen.length < args.ranges && attempt < 10_000; attempt++) {
    const candidate = candidates[Math.floor(random() * candidates.length)]!;
    if (chosen.some((other) => candidate.first < other.end && other.first < candidate.end)) continue;
    chosen.push(candidate);
  }
  if (chosen.length < args.ranges) throw new Error('重ならない範囲を選べなかった');
  chosen.sort((x, y) => x.first - y.first);

  const evalPrefix = (unitIndex: number): number => units.slice(0, unitIndex).reduce((sum, unit) => sum + unit.evalChars, 0);
  const ranges: Range[] = chosen.map(({ first, end }) => {
    const source = units
      .slice(first, end)
      .map((unit) => unit.source)
      .join('');
    const { text: reading, tokens } = readingOf(analyzer, source);
    const a = units[first]!.start;
    const b = units[end - 1]!.end;
    // 評価に渡すテキストが、全体の文字列のうち範囲に当たる部分と一致すること
    if (reading !== wholeChars.slice(a, b).join('')) {
      throw new Error(`段落${first}〜${end}の範囲を読みに直した結果が、全体の文字列の同じ部分と違う`);
    }
    const evalFrom = evalPrefix(first);
    return {
      firstUnit: first,
      endUnit: end,
      source,
      reading,
      tokens,
      a,
      b,
      evalFrom,
      evalTo: evalFrom + units.slice(first, end).reduce((s, u) => s + u.evalChars, 0),
    };
  });
  lap('範囲を選んだ');

  // 配列ごとの、全体の評価に渡す文字列と2次までの表
  const totalEvalChars = units.reduce((sum, unit) => sum + unit.evalChars, 0);
  const layoutStates = args.layouts.map((layoutId) => {
    const whole = resolveFor(layoutId, wholeReading, args.window);
    const wholeEvalChars = [...whole.text];
    if (wholeEvalChars.length !== totalEvalChars) {
      throw new Error(`${layoutId}: 評価に渡す全体の文字数${wholeEvalChars.length}が、記号の取り除きだけで数えた${totalEvalChars}と違う`);
    }
    return { layoutId, whole, evalChars: wholeEvalChars, tables: countNgrams(wholeEvalChars, 2) };
  });
  lap('配列ごとの全体の表を作った');

  const rangeLabel = (index: number): string => `範囲${index + 1}`;
  const supportRows: string[][] = [];
  const compareRows: string[][] = [];
  const controlRows: string[][] = [];
  const bunsetsuRows: string[][] = [];
  const bunsetsuValueRows: string[][] = [];
  const evalLengths: string[] = [];

  for (const [rangeIndex, range] of ranges.entries()) {
    const bunsetsuSource = offsetsOfChunks(splitBunsetsu(range.source));
    const bunsetsuInReading = mapBoundariesToReading(range.source, range.tokens, bunsetsuSource);
    for (const state of layoutStates) {
      const input = resolveFor(state.layoutId, range.reading, args.window, { boundaries: bunsetsuInReading });
      const rangeChars = [...input.text];
      if (rangeChars.join('') !== state.evalChars.slice(range.evalFrom, range.evalTo).join('')) {
        throw new Error(`${state.layoutId} ${rangeLabel(rangeIndex)}: 範囲の評価に渡すテキストが、全体の評価に渡す文字列の同じ部分と違う`);
      }
      evalLengths.push(`${rangeLabel(rangeIndex)} ${state.layoutId} ${rangeChars.length}`);
      const chain = buildMarkovChain(ngramTablesWithoutRange(state.tables, state.evalChars, range.evalFrom, range.evalTo));
      const label = rangeLabel(rangeIndex);

      if (args.stage === 'support') {
        const seeds = Array.from({ length: CHAIN_SEED_COUNT }, (_, offset) => args.seedStart + offset);
        supportRows.push(supportRow(label, state.layoutId, generateFromChain(chain, input.text, seeds).support));
        continue;
      }

      const comparison: ChainComparison = compareWithChain({
        text: input.text,
        chain,
        evaluate: evaluatorOf(input),
        seedStart: args.seedStart,
        judge: true,
      });
      supportRows.push(supportRow(label, state.layoutId, comparison.support));
      const generatedP90 = comparison.generated.map((q) => q.p90);
      compareRows.push([
        label,
        state.layoutId,
        fixed(comparison.original.p90),
        minMax(generatedP90),
        rankText(comparison.rank),
        verdictText(comparison.verdict),
        fixed(comparison.original.median),
        minMax(comparison.generated.map((q) => q.median)),
        fixed(comparison.original.max),
        minMax(comparison.generated.map((q) => q.max)),
      ]);
      const quantitiesRange = (list: readonly SpanQuantities[], pick: (q: SpanQuantities) => number | undefined): string => minMax(list.map(pick));
      controlRows.push([
        label,
        state.layoutId,
        quantitiesRange(comparison.shuffled, (q) => q.p90),
        quantitiesRange(comparison.shuffled, (q) => q.median),
        quantitiesRange(comparison.shuffled, (q) => q.max),
        quantitiesRange(comparison.uniform, (q) => q.p90),
        quantitiesRange(comparison.uniform, (q) => q.median),
        quantitiesRange(comparison.uniform, (q) => q.max),
      ]);

      // 区切りの比較（文節の区切りは原文にBudouXを当てた位置を、アプリと同じ経路で評価に渡すテキストの位置へ写したもの）
      const boundaries = must(input.extractionAssets.segmentation, '区切りが評価の資産に載っていない').boundaries;
      const report: SegmentationReport | undefined = buildSegmentationReport(evaluatorOf(input)(input.text), boundaries, args.seedStart);
      if (report === undefined) {
        bunsetsuRows.push([label, state.layoutId, '–', '–', '–']);
        continue;
      }
      const metric = report.bunsetsu.byMetric[CHAIN_METRIC];
      bunsetsuRows.push([label, state.layoutId, String(report.bunsetsu.segmentCount), rankText(report.rank.p90), rankText(report.rank.after)]);
      bunsetsuValueRows.push([
        label,
        state.layoutId,
        fixed(metric.p90),
        minMax(report.random.map((stats) => stats.byMetric[CHAIN_METRIC].p90)),
        fixed(metric.after),
        minMax(report.random.map((stats) => stats.byMetric[CHAIN_METRIC].after)),
        fixed(report.fixed.byMetric[CHAIN_METRIC].p90),
        fixed(report.fixed.byMetric[CHAIN_METRIC].after),
      ]);
    }
  }
  lap('評価を終えた');

  // 出力
  const out: string[] = [];
  out.push('# かな3文字までの並びの統計で説明できるか（コーパスの範囲）', '');
  out.push('## 再現の条件', '');
  const layoutNames = args.layouts.map((id) => {
    const layout = must(LAYOUT_BY_ID.get(id), id);
    const state = must(
      layoutStates.find((s) => s.layoutId === id),
      id,
    );
    return `${layout.name}（${id}。${state.whole.romajiRuleId === null ? 'かな直接入力' : `ローマ字入力、綴り${state.whole.romajiRuleId}`}、物理配列${state.whole.geometry.id}、指の割り当て${state.whole.geometry.assignment.id}、N=${state.whole.tracePolicy.windowSize}）`;
  });
  out.push(
    `- コーパス: 青空文庫『${AOZORA_SOURCE.title}』（作品789）。zip ${AOZORA_SOURCE.fileName}（sha256 ${AOZORA_SOURCE.sha256}）。取得と除去はscripts/generate-neko-sample.tsと同じ。除去後の全文のsha256 ${corpusSha}（${cpLength(corpus)}文字、${units.length}段落）`,
    `- 読みの辞書: ${DICTIONARY_SPEC.name} ${DICTIONARY_SPEC.version}、解析器${LIBRARY_SPEC.name} ${LIBRARY_SPEC.version}。利用者の読みの直しは無し。全文を段落ごとに読みに直してつないだ文字列は${wholeChars.length}文字`,
    `- 前処理: 仕様 §4.6の1〜4段（既定の記号の範囲）。全体の文字列にある半角の \`,\` \`.\` は${halfwidthPunctuation}個で、前処理の3段目は1文字を1文字に直すだけなので文字数は変わらない。全体の評価に渡す文字数が配列によらず${totalEvalChars}文字であることと、範囲の評価に渡すテキストが全体の評価に渡す文字列の同じ部分に一致することを、範囲×配列ごとに確かめた`,
    `- 範囲: 段落（改行）の境目から、評価に渡すテキストの文字数が${RANGE_MIN_CHARS}を超える最初の段落の境目まで。既定の日本語サンプル（第一章の先頭、原文の${sampleStart}〜${sampleEnd}文字目）と重なる範囲と、互いに重なる範囲は除く。乱数${PRNG_NAME}、範囲の種${args.rangeSeed}、${ranges.length}範囲`,
    ...ranges.map(
      (range, i) =>
        `  - ${rangeLabel(i)}: 段落${range.firstUnit}〜${range.endUnit - 1}、全体の文字列の位置 [${range.a}, ${range.b})、評価に渡す全体の文字列の位置 [${range.evalFrom}, ${range.evalTo})、評価に渡すテキスト${range.evalTo - range.evalFrom}文字、原文の先頭${JSON.stringify(range.source.slice(0, 20))}`,
    ),
    `- 配列: ${layoutNames.join('、')}。窓幅・物理配列・指の割り当て・綴りは各配列のアプリの既定値${args.window === undefined ? '' : `（Nだけ${args.window}に上書き）`}`,
    `- 連鎖: 2次マルコフ連鎖（連続3文字の出現回数）。配列ごとに、その配列の評価に渡す全体の文字列から、範囲の文字を含む3文字組をすべて引いて作る。表は同梱せず、実行のたびにコーパスから作る`,
    `- 生成: 元と同じ文字数、最初の2文字は元と同じ。候補が無い文脈は、直前の1文字から始まる文脈を出現回数の重みで引き、それも無ければ全体から重みで引く。乱数${PRNG_NAME}、種の始まり${args.seedStart}（${args.seedStart}〜${args.seedStart + CHAIN_SEED_COUNT - 1}の${CHAIN_SEED_COUNT}個）。対照テキスト（順序破壊・一様ランダム）も同じ種`,
    `- 判定の量: 1文字あたりの距離 [u] を、先頭から重ならない${CHAIN_SPAN_LENGTH}文字の区間に切った時の区間ごとの値の${CHAIN_QUANTILE * 100}%点（補間しない最近順位）。末尾の${CHAIN_SPAN_LENGTH}文字に満たない区間は除く。順位は元の値と生成文${CHAIN_SEED_COUNT}個を合わせた${CHAIN_SEED_COUNT + 1}個の中の順位で、同点は幅、端に数えるのは厳密に大きいか小さい時だけ（相対誤差1e-12以内を同点とする）`,
    `- 候補が1つしか無かった段の割合の上限: ${CHAIN_SINGLE_RATIO_LIMIT * 100}%。超えたら判定を出さない。割合は配列×範囲ごとに、生成文${CHAIN_SEED_COUNT}個を合わせた全部の段で数える`,
    `- 文節の区切り: ${BUNSETSU_SPLITTER.name} ${BUNSETSU_SPLITTER.version}。原文の範囲に当て、アプリと同じ経路で評価に渡すテキストの位置へ写した。ランダムの区切りの種は${args.seedStart}〜${args.seedStart + CHAIN_SEED_COUNT - 1}`,
    '',
  );
  out.push('## 統計が足りているか（候補が1つしか無かった段と、候補が無く続けた回数）', '');
  out.push(
    table(
      [
        '範囲',
        '配列',
        '段の数',
        '候補が1つの段',
        '割合',
        `上限${CHAIN_SINGLE_RATIO_LIMIT * 100}%`,
        '候補が無く直前の1文字から続けた回数',
        '全体から引いて続けた回数',
      ],
      supportRows,
    ),
    '',
  );
  if (args.stage === 'full') {
    out.push('## 元のテキストと生成文（1文字あたりの距離 [u]、区間の値の量）', '');
    out.push(
      table(
        ['範囲', '配列', '元の90%点', '生成文20個の90%点', '元の順位', '判定', '元の中央値', '生成文の中央値', '元の最大', '生成文の最大'],
        compareRows,
      ),
      '',
    );
    out.push(
      '判定は範囲×配列ごとの別々の判定である。どれかが端に来ることは、そのテキストや配列の特徴の根拠にならない（特徴が無くても、1つの判定が端に来る確率は最大で2/21）。範囲や配列をまとめた結論は出さない。順位は統計的な有意ではない。',
      '',
    );
    out.push('## 対照テキスト（判定には使わない。20個の最小〜最大）', '');
    out.push(
      table(
        ['範囲', '配列', '順序破壊の90%点', '順序破壊の中央値', '順序破壊の最大', '一様ランダムの90%点', '一様ランダムの中央値', '一様ランダムの最大'],
        controlRows,
      ),
      '',
    );
    out.push('## 文節の区切りの比較（1文字あたりの距離 [u]）', '');
    out.push(table(['範囲', '配列', '文節の区間の数', '区間の90%点の順位', '区切りの直後の1文字の順位'], bunsetsuRows), '');
    out.push(
      table(
        ['範囲', '配列', '文節の90%点', 'ランダム20個の90%点', '文節の直後の1文字', 'ランダム20個の直後の1文字', '固定長の90%点', '固定長の直後の1文字'],
        bunsetsuValueRows,
      ),
      '',
    );
    out.push(
      '順位は文節の値とランダムの20個を合わせた21個の中の順位（docs/segment-metrics.md）。端の順位は統計的な有意ではない。固定長には順位を付けない。',
      '',
    );
  }
  out.push('## 実行', '', `- 実行時間${((Date.now() - started) / 1000).toFixed(1)}秒（${args.stage === 'support' ? '候補が1つの割合だけ' : '全部'}）`);
  console.log(out.join('\n'));
}

await main();
