// Trace生成・解釈・主要な抽出の時間を、固定のテキストと代表的なSetupで測る。結果はJSONで書き出し、差分の表は`perf-report.ts`が作る。
//
// 使い方: node --experimental-strip-types scripts/bench-engine.ts --out <json> [--texts-file <json>] [--runs <回数>]
// `--expose-gc`を付けて呼ぶと、測定の前にGCを走らせる
//
// - 測る経路は、アプリが計算に使う`createEngineCache`（`src/engine/cache.ts`）の窓口。段ごとの時間は、同じキャッシュに段を順に頼み、
//   頼む前後の時刻の差を取る（解釈はTraceを、抽出は解釈とキーの詳細を、前の段のキャッシュから読む）
// - 漢字を読みに直す段（辞書）は時間に入れない。日本語の既定のテキストは、読みに直した後の文を`--texts-file`に書き出して使う。
//   ファイルがあればそれを読む。ベースとheadの測定が同じ文を使えるよう、CIでは先にheadで書き出す
// - 1つの計測値は、`--runs`回（既定15）測った最小値（集合の測定は、1回が長いので3分の1の回数）。先に3回（集合の測定は1回）測って捨てる（JITの温まりを除く）。測定のたびにGCを走らせ、空のキャッシュから始める。
//   最小値を使うのは、GCや他のプロセスによる遅れが時間を伸ばす向きにしか乱れないため。中央値も`median`に残す
import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { LAYOUT_BY_ID } from '#input/layouts/index.ts';
import { PHYSICAL_SHAPES, type PhysicalShape } from '#input/shapes/geometry.ts';
import type { AnalysisTarget, Setup } from '#input/setup/index.ts';
import { sampleText, type TextLanguage } from '#input/text/samples.ts';
import { createEngineCache } from '#engine/cache.ts';
import { EMPTY_SETTINGS_OVERRIDES } from '#engine/settings-items.ts';
import { resolveEngineInput, type ResolvedInput } from '#engine/resolved-input.ts';
import type { EngineSetMemberInput } from '#engine/request.ts';
import { heatmapDefinition } from '#analyzers/heatmap/extract.ts';
import { fingerDistanceDefinition } from '#analyzers/finger-distance/extract.ts';
import { bigramFlowDefinition } from '#analyzers/bigram-flow/extract.ts';
import { handRhythmDefinition } from '#analyzers/hand-rhythm/extract.ts';
import { playbackDefinition } from '#analyzers/playback/extract.ts';
import { comparisonDefinition } from '#analyzers/comparison/extract.ts';
import { runChartDefinition } from '#analyzers/run-chart/extract.ts';
import { nSensitivityDefinition } from '#analyzers/n-sensitivity/extract.ts';

interface BenchText {
  readonly id: string;
  readonly language: TextLanguage;
  readonly text: string;
}

interface BenchSetup {
  readonly layoutId: string;
  readonly shapeId: string;
}

/** 測るSetup。言語ごとに、代表的な打ち方（ローマ字・かな直接・同時打鍵）と、英字配列を並べる。 */
const SETUPS: Readonly<Record<TextLanguage, readonly BenchSetup[]>> = {
  en: [
    { layoutId: 'qwerty', shapeId: 'row-staggered' },
    { layoutId: 'dvorak', shapeId: 'row-staggered' },
    { layoutId: 'colemak-dh', shapeId: 'row-staggered' },
  ],
  ja: [
    { layoutId: 'qwerty', shapeId: 'row-staggered' },
    { layoutId: 'jis-kana', shapeId: 'jis-row-staggered' },
    { layoutId: 'shingeta', shapeId: 'row-staggered' },
  ],
};

const CATALOG = {
  layouts: LAYOUT_BY_ID,
  shapes: new Map<string, PhysicalShape>(Object.values(PHYSICAL_SHAPES).map((shape) => [shape.id, shape])),
};

function resolve(setup: BenchSetup, text: BenchText): { readonly target: AnalysisTarget; readonly input: ResolvedInput } {
  const id = `bench-${setup.layoutId}`;
  const entry: Setup = { id, number: 1, layoutId: setup.layoutId, shapeId: setup.shapeId };
  const result = resolveEngineInput({
    target: { kind: 'setup', setupId: id },
    setups: new Map([[id, entry]]),
    catalog: CATALOG,
    userLayouts: new Map(),
    overrides: EMPTY_SETTINGS_OVERRIDES,
    text: text.text,
    language: text.language,
  });
  if (!result.ok) throw new Error(`${setup.layoutId} / ${text.id} を解決できない: ${JSON.stringify(result.error)}`);
  return { target: { kind: 'setup', setupId: id }, input: result.input };
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

interface Measured {
  readonly min: number;
  readonly median: number;
}

/** `fn`が返す {名前: ms} を`runs`回集め、名前ごとの最小値と中央値にする。先に`warmupRuns`回測って捨てる。 */
function measure(runs: number, warmupRuns: number, fn: () => Record<string, number>): Record<string, Measured> {
  for (let i = 0; i < warmupRuns; i++) fn();
  const samples: Record<string, number[]> = {};
  for (let i = 0; i < runs; i++) {
    globalThis.gc?.();
    for (const [name, ms] of Object.entries(fn())) {
      const list = samples[name] ?? [];
      list.push(ms);
      samples[name] = list;
    }
  }
  return Object.fromEntries(Object.entries(samples).map(([name, values]) => [name, { min: Math.min(...values), median: median(values) }]));
}

function timed<T>(sink: Record<string, number>, name: string, fn: () => T): T {
  const start = performance.now();
  const value = fn();
  sink[name] = performance.now() - start;
  return value;
}

function benchSingle(input: ResolvedInput): Record<string, number> {
  const cache = createEngineCache();
  const times: Record<string, number> = {};
  timed(times, 'Trace生成', () => cache.getTrace(input));
  timed(times, '解釈', () => cache.getInterpretation(input));
  timed(times, 'キーの詳細', () => cache.getKeyDetails(input));
  timed(times, '抽出: ヒートマップ', () => cache.getExtraction(input, heatmapDefinition, heatmapDefinition.defaultOptions));
  timed(times, '抽出: 指ごとの距離', () => cache.getExtraction(input, fingerDistanceDefinition, fingerDistanceDefinition.defaultOptions));
  timed(times, '抽出: Bigram Flow', () => cache.getExtraction(input, bigramFlowDefinition, bigramFlowDefinition.defaultOptions));
  timed(times, '抽出: 手のリズム', () => cache.getExtraction(input, handRhythmDefinition, handRhythmDefinition.defaultOptions));
  timed(times, '抽出: 打鍵再生', () => cache.getExtraction(input, playbackDefinition, playbackDefinition.defaultOptions));
  return times;
}

function benchSet(members: readonly EngineSetMemberInput[]): Record<string, number> {
  const cache = createEngineCache();
  const times: Record<string, number> = {};
  // 集合のAnalyzerはメンバーごとのTraceを使う。最初に頼むN感度は空のキャッシュからなのでTrace生成を含み、後の2つは共有したTraceを読む
  timed(times, '集合: N感度（Trace生成を含む）', () => cache.getSetExtraction(members, nSensitivityDefinition, nSensitivityDefinition.defaultOptions));
  timed(times, '集合: 比較表', () => cache.getSetExtraction(members, comparisonDefinition, comparisonDefinition.defaultOptions));
  timed(times, '集合: Run Chart', () => cache.getSetExtraction(members, runChartDefinition, runChartDefinition.defaultOptions));
  return times;
}

async function loadTexts(file: string | undefined): Promise<BenchText[]> {
  if (file !== undefined && existsSync(file)) return JSON.parse(await readFile(file, 'utf8')) as BenchText[];
  // 読みに直す段は辞書を使うので、必要になった時だけ読み込む
  const { createNodeToReading } = await import('./eval-text-reading.ts');
  const toReading = await createNodeToReading();
  const texts: BenchText[] = [
    { id: 'ja.legacy', language: 'ja', text: toReading(sampleText('ja', 'legacy')) },
    { id: 'en.default', language: 'en', text: sampleText('en', 'default') },
  ];
  if (file !== undefined) await writeFile(file, `${JSON.stringify(texts, null, 2)}\n`);
  return texts;
}

const { values } = parseArgs({ options: { out: { type: 'string' }, 'texts-file': { type: 'string' }, runs: { type: 'string', default: '15' } } });
if (values.out === undefined) throw new Error('--outが要る');
const runs = Number(values.runs);
// 集合の測定は1回が1秒を超える（N感度）ので、回数を減らす
const setRuns = Math.max(3, Math.ceil(runs / 3));
const texts = await loadTexts(values['texts-file']);

const results: Record<string, Measured> = {};
for (const text of texts) {
  const resolved = SETUPS[text.language].map((setup) => ({ setup, ...resolve(setup, text) }));
  for (const { setup, input } of resolved) {
    for (const [name, value] of Object.entries(measure(runs, 3, () => benchSingle(input)))) results[`${text.id} / ${setup.layoutId} / ${name}`] = value;
  }
  const members: EngineSetMemberInput[] = resolved.map(({ target, input }) => ({ target, resolution: { ok: true, input } }));
  for (const [name, value] of Object.entries(measure(setRuns, 1, () => benchSet(members)))) results[`${text.id} / ${name}`] = value;
}

const output = {
  node: process.version,
  runs,
  setRuns,
  texts: texts.map((text) => ({ id: text.id, chars: [...text.text].length })),
  setups: SETUPS,
  /** 計測名 → 最小値と中央値（ms） */
  ms: results,
};
await writeFile(values.out, `${JSON.stringify(output, null, 2)}\n`);
for (const [name, { min, median: mid }] of Object.entries(results))
  console.log(`${min.toFixed(2).padStart(9)} ms (中央値 ${mid.toFixed(2).padStart(9)})  ${name}`);
