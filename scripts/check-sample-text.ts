// 同梱する日本語のテキスト全部（既定の「吾輩は猫である」の冒頭と、src/input/text/corpus/ の13本）を検査する。
//
//   node --experimental-strip-types scripts/check-sample-text.ts
//
// 漢字を含むテキストは、アプリと同じ辞書で読みに直してから、既定の条件で評価に渡す字数を数える。
// 辞書は .cache/dictionary/ に置く（無ければ取得する）ので、npm test には入れていない。
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { generateEngineTrace, interpretEngineTrace } from '#engine/pipeline.ts';
import { resolveEngineInput } from '#engine/resolved-input.ts';
import { EMPTY_SETTINGS_OVERRIDES } from '#engine/settings-items.ts';
import { LAYOUT_BY_ID, LAYOUTS_JA } from '#input/layouts/index.ts';
import { PHYSICAL_SHAPES, type PhysicalShape } from '#input/shapes/geometry.ts';
import { containsKanji } from '#input/text/reading.ts';
import { CORPUS_ENTRIES, sampleText } from '#input/text/samples.ts';
import { assertNoMarkup } from './aozora-core.ts';
import { createNodeToReading } from './eval-text-reading.ts';

/** 既定のテキスト（吾輩は猫である）の、評価に渡す字数の範囲（原文の約1000字を読みに直すと約1250字になる）。 */
const DEFAULT_TEXT_RANGE = { min: 1000, max: 1500 } as const;
/** corpus/ の各テキストの、評価に渡す字数の範囲。 */
const CORPUS_RANGE = { min: 9000, max: 11000 } as const;

const CATALOG = {
  layouts: LAYOUT_BY_ID,
  shapes: new Map<string, PhysicalShape>(Object.values(PHYSICAL_SHAPES).map((shape) => [shape.id, shape])),
};
const LAYOUT_ID = LAYOUTS_JA[0]!.id;

const toReading = await createNodeToReading();

/** 既定の条件で評価に渡す字数（アプリと同じ経路の `inputChars`）。 */
function evaluatedChars(text: string): number {
  const reading = containsKanji(text) ? toReading(text) : text;
  const resolved = resolveEngineInput({
    target: { kind: 'layout', layoutId: LAYOUT_ID },
    setups: new Map(),
    catalog: CATALOG,
    userLayouts: new Map(),
    overrides: EMPTY_SETTINGS_OVERRIDES,
    text: reading,
    language: 'ja',
  });
  assert.ok(resolved.ok, `${LAYOUT_ID} で解決できない`);
  return interpretEngineTrace(generateEngineTrace(resolved.input), resolved.input).metrics.inputChars;
}

interface Target {
  readonly id: string;
  readonly text: string;
  readonly range: { readonly min: number; readonly max: number };
}

const targets: Target[] = [{ id: 'legacy', text: sampleText('ja', 'legacy'), range: DEFAULT_TEXT_RANGE }];
for (const entry of CORPUS_ENTRIES) {
  const raw = await readFile(fileURLToPath(new URL(`../src/input/text/corpus/${entry.fileName}`, import.meta.url)), 'utf8');
  targets.push({ id: entry.sampleId, text: raw.replace(/\s+/g, ''), range: CORPUS_RANGE });
}

const report: { id: string; evalChars: number; chars: number }[] = [];
for (const target of targets) {
  assertNoMarkup(target.text);
  assert.ok(!/[\p{Cc}\uFFFD]/u.test(target.text), `${target.id}: 制御文字か置換文字が入っている`);
  const evalChars = evaluatedChars(target.text);
  assert.ok(
    evalChars >= target.range.min && evalChars <= target.range.max,
    `${target.id}: 評価に渡す字数 ${evalChars} が ${target.range.min}〜${target.range.max} の外`,
  );
  report.push({ id: target.id, evalChars, chars: [...target.text].length });
}

console.log(JSON.stringify(report, null, 1));
