import assert from 'node:assert/strict';
import test from 'node:test';
import { LAYOUT_BY_ID } from '#input/layouts/index.ts';
import { PHYSICAL_SHAPES, type PhysicalShape } from '#input/shapes/geometry.ts';
import type { TextLanguage } from '#input/text/language.ts';
import type { ReadingConditions } from '#input/text/reading.ts';
import { generateEngineTrace, interpretEngineTrace } from './pipeline.ts';
import { resolveEngineInput } from './resolved-input.ts';
import { EMPTY_SETTINGS_OVERRIDES, setSettingsOverride } from './settings-items.ts';
import { interpretationKeyOf, traceKeyOf } from './keys.ts';

const CATALOG = {
  layouts: LAYOUT_BY_ID,
  shapes: new Map<string, PhysicalShape>(Object.values(PHYSICAL_SHAPES).map((shape) => [shape.id, shape])),
};

function resolve(layoutId: string, text: string, language: TextLanguage, keepSymbols = false, reading?: ReadingConditions | null) {
  let overrides = EMPTY_SETTINGS_OVERRIDES;
  if (keepSymbols) {
    const written = setSettingsOverride(overrides, { kind: 'global' }, 'keepSymbols', true);
    assert.ok(written.ok);
    overrides = written.overrides;
  }
  const result = resolveEngineInput({
    target: { kind: 'layout', layoutId },
    setups: new Map(),
    catalog: CATALOG,
    userLayouts: new Map(),
    overrides,
    text,
    language,
    reading,
  });
  assert.ok(result.ok, result.ok ? '' : JSON.stringify(result.error));
  return result.input;
}

function measure(layoutId: string, text: string, language: TextLanguage, keepSymbols = false, reading?: ReadingConditions | null) {
  const input = resolve(layoutId, text, language, keepSymbols, reading);
  const traceResult = generateEngineTrace(input);
  return { input, trace: traceResult.trace, metrics: interpretEngineTrace(traceResult, input).metrics };
}

test('半角の , . を持たない配列では 、 。 として打ち、持つ配列ではそのまま打つ', () => {
  const kana = measure('nicola', 'あ,い.', 'ja');
  assert.equal(kana.input.text, 'あ、い。');
  assert.deepEqual(
    kana.trace.strokes.map((stroke) => stroke.inputChar),
    ['あ', '、', 'い', '。'],
  );
  assert.equal(kana.trace.skipped, 0);

  const direct = measure('qwerty', 'あ,い.', 'ja');
  assert.equal(direct.input.text, 'あ,い.');
  assert.equal(direct.trace.skipped, 0);
});

test('既定の範囲で範囲の外の記号を取り除き、skippedにも位置にも数えない', () => {
  const plain = measure('nicola', 'あい', 'ja');
  const withSymbols = measure('nicola', 'あ「い」', 'ja');
  assert.equal(withSymbols.input.text, 'あい');
  assert.equal(withSymbols.trace.skipped, 0);
  assert.equal(withSymbols.trace.inputChars, 2);
  assert.equal(withSymbols.metrics.totalUnits, plain.metrics.totalUnits);
  assert.deepEqual(
    withSymbols.trace.strokes.map((stroke) => [stroke.inputChar, stroke.inputIndex]),
    plain.trace.strokes.map((stroke) => [stroke.inputChar, stroke.inputIndex]),
  );
});

test('範囲を広げると、打てない記号はskippedに数え、打てる記号は打つ', () => {
  const wide = measure('nicola', 'あ「い」', 'ja', true);
  assert.equal(wide.input.text, 'あ「い」');
  assert.equal(wide.trace.inputChars, 4);
  assert.equal(wide.trace.skipped, 2);
  assert.equal(wide.metrics.skipped, 2);
  assert.equal(wide.metrics.conditions.keepSymbols, true);

  const typable = measure('jis-kana', 'あ「い」', 'ja', true);
  assert.equal(typable.trace.skipped, 0);
  assert.equal(typable.trace.inputChars, 4);
});

test('取り除いた後のテキストが、Traceの入力の文字数と打鍵の入力の文字列に一致する', () => {
  const { input, trace } = measure('nicola', 'あ！い？、う〜。', 'ja');
  assert.equal(input.text, 'あい、う。');
  assert.equal(trace.inputChars, [...input.text].length);
  assert.equal(trace.strokes.map((stroke) => stroke.inputChar).join(''), input.text);
});

test('英語のテキストは、範囲の切り替えに関わらず変わらない', () => {
  const text = "It's (a) test; ok, yes.";
  const base = measure('qwerty', text, 'en');
  const wide = measure('qwerty', text, 'en', true);
  assert.equal(base.input.text, text);
  assert.equal(wide.input.text, text);
  assert.equal(base.metrics.totalUnits, wide.metrics.totalUnits);
  assert.equal(base.trace.inputChars, [...text].length);
});

test('範囲の条件は、前処理の後のテキストが同じでも解釈のキーを分ける', () => {
  const base = resolve('nicola', 'あい', 'ja');
  const wide = resolve('nicola', 'あい', 'ja', true);
  assert.equal(traceKeyOf(base), traceKeyOf(wide));
  assert.notEqual(interpretationKeyOf(base, traceKeyOf(base)), interpretationKeyOf(wide, traceKeyOf(wide)));
});

test('示す文をそのまま打つ場面は、前処理を通さない', () => {
  const result = resolveEngineInput({
    target: { kind: 'layout', layoutId: 'nicola' },
    setups: new Map(),
    catalog: CATALOG,
    userLayouts: new Map(),
    overrides: EMPTY_SETTINGS_OVERRIDES,
    text: 'あ「い」,',
    language: 'ja',
    verbatimText: true,
  });
  assert.ok(result.ok);
  assert.equal(result.input.text, 'あ「い」,');
});

const READING: ReadingConditions = {
  status: 'converted',
  dictionary: { name: 'IPADIC', version: '6.2.0' },
  library: { name: 'lindera-wasm', version: '6.2.0' },
  corrections: [],
};

test('読みに直した後のテキストで、入力文字数・打鍵の入力の文字列を数える', () => {
  // 原文 `今日は` を読みに直した `きょうは` が評価に渡る。漢字は打てない文字に数えない
  const { input, trace, metrics } = measure('nicola', 'きょうは', 'ja', false, READING);
  assert.equal(input.text, 'きょうは');
  assert.equal(trace.inputChars, 4);
  assert.equal(trace.skipped, 0);
  assert.equal(trace.strokes.map((stroke) => stroke.inputChar).join(''), 'きょうは');
  assert.equal(metrics.inputChars, 4);
});

test('読みの条件は、ResolvedInputとMetricsの条件のスナップショットに載り、解釈のキーを分ける', () => {
  const plain = measure('nicola', 'きょうは', 'ja', false, null);
  const converted = measure('nicola', 'きょうは', 'ja', false, READING);
  const unavailable = measure('nicola', 'きょうは', 'ja', false, { ...READING, status: 'unavailable' });
  assert.equal(plain.input.reading, null);
  assert.equal(plain.metrics.conditions.reading, null);
  assert.deepEqual(converted.metrics.conditions.reading, READING);
  assert.equal(unavailable.metrics.conditions.reading?.status, 'unavailable');
  // 数値は同じでも、読みの条件は数値の出どころとして別の入れ物になる
  assert.equal(plain.metrics.totalUnits, converted.metrics.totalUnits);
  assert.equal(traceKeyOf(plain.input), traceKeyOf(converted.input));
  const keyOf = (input: ReturnType<typeof resolve>) => interpretationKeyOf(input, traceKeyOf(input));
  assert.notEqual(keyOf(plain.input), keyOf(converted.input));
  assert.notEqual(keyOf(converted.input), keyOf(unavailable.input));
});

test('読みの条件を渡さなければnull。示す文をそのまま打つ場面は渡しても付けない', () => {
  assert.equal(resolve('nicola', 'あい', 'ja').reading, null);
  const result = resolveEngineInput({
    target: { kind: 'layout', layoutId: 'nicola' },
    setups: new Map(),
    catalog: CATALOG,
    userLayouts: new Map(),
    overrides: EMPTY_SETTINGS_OVERRIDES,
    text: 'あい',
    language: 'ja',
    reading: READING,
    verbatimText: true,
  });
  assert.ok(result.ok);
  assert.equal(result.input.reading, null);
});

test('直した読みの対応は条件のスナップショットに全体が入り、同じ数でも中身の違う直しは解釈のキーを分ける', () => {
  const fixedA: ReadingConditions = { ...READING, corrections: [{ surface: '今日', reading: 'こんにち' }] };
  const fixedB: ReadingConditions = { ...READING, corrections: [{ surface: '今日', reading: 'きょー' }] };
  const a = measure('nicola', 'こんにちは', 'ja', false, fixedA);
  const b = measure('nicola', 'こんにちは', 'ja', false, fixedB);
  assert.deepEqual(a.metrics.conditions.reading?.corrections, [{ surface: '今日', reading: 'こんにち' }]);
  const keyOf = (input: ReturnType<typeof resolve>) => interpretationKeyOf(input, traceKeyOf(input));
  assert.notEqual(keyOf(a.input), keyOf(b.input));
  assert.notEqual(keyOf(a.input), keyOf(measure('nicola', 'こんにちは', 'ja', false, READING).input));
  // スナップショットは入力の配列を共有しない
  assert.notEqual(a.metrics.conditions.reading?.corrections, fixedA.corrections);
});

function strokeChars(layoutId: string, text: string) {
  return measure(layoutId, text, 'ja').trace.strokes.map((stroke) => stroke.inputChar);
}

test('片仮名は、配列が見出しとして持たない部分だけをひらがなにして打つ', () => {
  const asuka = measure('asuka', 'ヴォ', 'ja');
  assert.equal(asuka.input.text, 'ヴぉ');
  assert.deepEqual(
    asuka.trace.strokes.map((stroke) => stroke.inputChar),
    ['ヴ', 'ぉ'],
  );
  assert.equal(asuka.trace.skipped, 0);
  assert.equal(asuka.trace.inputChars, 2);
});

test('片仮名の見出し（複数文字・片仮名とひらがなの混じり）は、配列ごとにそのまま打つ', () => {
  assert.equal(measure('kawasemi-plus', 'ヴァヴォヴぇい', 'ja').input.text, 'ヴァヴォヴぇい');
  assert.deepEqual(strokeChars('kawasemi-plus', 'ヴァ'), ['ヴァ']);
  assert.equal(measure('shin-koume', 'ヴぁヴぇ', 'ja').input.text, 'ヴぁヴぇ');
  assert.deepEqual(strokeChars('shin-koume', 'ヴォ'), ['ヴぉ']);
});

test('片仮名の見出しを持たない配列では、片仮名をひらがなにして打つ', () => {
  const kana = measure('nicola', 'ニャーニャー', 'ja');
  assert.equal(kana.input.text, 'にゃーにゃー');
  assert.equal(kana.trace.skipped, 0);
  assert.equal(measure('qwerty', 'ニャーニャー', 'ja').trace.skipped, 0);
  // 書き換えたひらがな（ゔ）を配列が打てなければ、打てない文字に数える
  assert.equal(measure('qwerty', 'ヴ', 'ja').trace.skipped, 1);
});

test('ローマ字のテーブルが片仮名を見出しとして持つ時は、その片仮名をそのまま打つ', () => {
  const written = setSettingsOverride(EMPTY_SETTINGS_OVERRIDES, { kind: 'layout', layoutId: 'qwerty' }, 'romajiRuleId', 'azik');
  assert.ok(written.ok);
  const result = resolveEngineInput({
    target: { kind: 'layout', layoutId: 'qwerty' },
    setups: new Map(),
    catalog: CATALOG,
    userLayouts: new Map(),
    overrides: written.overrides,
    text: 'ヴォ',
    language: 'ja',
  });
  assert.ok(result.ok);
  assert.equal(result.input.text, 'ヴぉ');
});

test('英語のテキストの片仮名は書き換えない', () => {
  assert.equal(resolve('qwerty', 'ニャー ヴ', 'en').text, 'ニャー ヴ');
});
