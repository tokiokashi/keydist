import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { LAYOUT_BY_ID } from '#input/layouts/index.ts';
import { PHYSICAL_SHAPES, type PhysicalShape } from '#input/shapes/geometry.ts';
import { comboBarriersInReading } from '#input/text/combo-barriers.ts';
import { convertToReading, type ReadingToken } from '#input/text/reading.ts';
import { createReadingAnalyzer, type LinderaModule } from '#platform/reading/analyzer.ts';
import { readDictionaryZip } from '#platform/reading/dictionary-files.ts';
import { DICTIONARY_SPEC } from '#platform/reading/dictionary-spec.ts';
import { generateEngineTrace } from './pipeline.ts';
import { resolveEngineInput } from './resolved-input.ts';
import { EMPTY_SETTINGS_OVERRIDES } from './settings-items.ts';
import { traceKeyOf } from './keys.ts';

const CATALOG = {
  layouts: LAYOUT_BY_ID,
  shapes: new Map<string, PhysicalShape>(Object.values(PHYSICAL_SHAPES).map((shape) => [shape.id, shape])),
};

/** TK音直入力法（コンボを持つ組み込みの配列）で、読みに直した後のテキストと境から評価する。 */
function measure(text: string, comboBarriers?: readonly number[]) {
  const result = resolveEngineInput({
    target: { kind: 'layout', layoutId: 'tk-onchoku' },
    setups: new Map(),
    catalog: CATALOG,
    userLayouts: new Map(),
    overrides: EMPTY_SETTINGS_OVERRIDES,
    text,
    language: 'ja',
    comboBarriers,
  });
  assert.ok(result.ok);
  return { input: result.input, trace: generateEngineTrace(result.input).trace };
}

test('境が無ければ、早くはaku、嬉しかったはsikaのコンボで打つ（境の効果を測る基準）', () => {
  assert.deepEqual(measure('はやく').trace.comboHits, ['aku']);
  assert.deepEqual(measure('うれしかった').trace.comboHits, ['sika']);
});

test('早くの語幹と活用語尾の間の境で、akuのコンボを使わない', () => {
  const { trace } = measure('はやく', [2]);
  assert.deepEqual(trace.comboHits, []);
  assert.equal(trace.strokes.length, 6);
});

test('嬉しかったの語幹と活用語尾の間の境で、sikaのコンボを使わない', () => {
  const { trace } = measure('うれしかった', [3]);
  assert.deepEqual(trace.comboHits, []);
});

test('境をまたがないコンボは、境があっても使う', () => {
  // 語幹と語尾の間の境（位置5）をまたぐsikaは使わず、境の手前のdesuは使う
  const { trace } = measure('ですうれしかった', [5]);
  assert.deepEqual(trace.comboHits, ['desu']);
});

test('入力は活用語でなく境が無いので、4アクションのまま', () => {
  const { trace } = measure('にゅうりょく', []);
  assert.equal(trace.strokes.length, 4);
});

test('境はTraceのキーに入る。同じテキストでも境が違えば別のキーになる', () => {
  assert.notEqual(traceKeyOf(measure('はやく', [2]).input), traceKeyOf(measure('はやく', []).input));
});

test('語の列から境を求め、利用者の読みの直しで読みの長さが変わっても語尾の手前に置く', () => {
  const token: ReadingToken = { surface: '早く', byteStart: 0, byteEnd: 6, reading: 'ハヤク', isUnknown: false, stemLength: 1 };
  assert.deepEqual(comboBarriersInReading('早く', [token]), [2]);
  // 読みを1字長い直しにしても、語尾 く の手前
  assert.deepEqual(comboBarriersInReading('早く', [token], { 早く: 'はやーく' }), [3]);
  assert.equal(convertToReading('早く', [token], { 早く: 'はやーく' }).text, 'はやーく');
  // 語尾で終わらない直しは、語幹と語尾を割れないので境を置かない
  assert.deepEqual(comboBarriersInReading('早く', [token], { 早く: 'はやい' }), []);
});

// 実際の辞書で、漢字書きの入力が境のとおりにコンボを使わないことまで通して確かめる。テスト自身は辞書を取得しない
const zipPath = new URL(`../../.cache/dictionary/${DICTIONARY_SPEC.fileName}`, import.meta.url);
test('実際の辞書で、漢字書きの早くと嬉しかったはakuとsikaを使わず、入力は4アクションのまま', {
  skip: process.env.CI === undefined && !existsSync(zipPath),
}, async () => {
  const lindera = await import('lindera-wasm');
  lindera.initSync({ module: await readFile(new URL('../../node_modules/lindera-wasm/lindera_wasm_bg.wasm', import.meta.url)) });
  const analyzer = createReadingAnalyzer(lindera as unknown as LinderaModule, await readDictionaryZip(await readFile(zipPath)));
  const evaluate = (source: string) => {
    const tokens = analyzer.tokenize(source);
    const reading = convertToReading(source, tokens).text;
    return { reading, ...measure(reading, comboBarriersInReading(source, tokens)) };
  };
  const hayaku = evaluate('早く');
  assert.equal(hayaku.reading, 'はやく');
  assert.deepEqual(hayaku.input.comboBarriers, [2]);
  assert.deepEqual(hayaku.trace.comboHits, []);

  const ureshikatta = evaluate('嬉しかった');
  assert.equal(ureshikatta.reading, 'うれしかった');
  assert.deepEqual(ureshikatta.input.comboBarriers, [3]);
  assert.deepEqual(ureshikatta.trace.comboHits, []);

  const nyuryoku = evaluate('入力');
  assert.deepEqual(nyuryoku.input.comboBarriers, []);
  assert.equal(nyuryoku.trace.strokes.length, 4);

  // 語どうしの境では止めない。静かに は 静か（名詞）と に（助詞）に分かれ、活用語尾を持たない
  assert.deepEqual(evaluate('静かに').input.comboBarriers, []);
});
