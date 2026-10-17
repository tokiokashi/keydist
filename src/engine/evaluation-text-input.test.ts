import assert from 'node:assert/strict';
import test from 'node:test';
import { LAYOUT_BY_ID } from '#input/layouts/index.ts';
import { PHYSICAL_SHAPES, type PhysicalShape } from '#input/shapes/geometry.ts';
import type { TextLanguage } from '#input/text/language.ts';
import { generateEngineTrace, interpretEngineTrace } from './pipeline.ts';
import { resolveEngineInput } from './resolved-input.ts';
import { EMPTY_SETTINGS_OVERRIDES, setSettingsOverride } from './settings-items.ts';
import { interpretationKeyOf, traceKeyOf } from './keys.ts';

const CATALOG = {
  layouts: LAYOUT_BY_ID,
  shapes: new Map<string, PhysicalShape>(Object.values(PHYSICAL_SHAPES).map((shape) => [shape.id, shape])),
};

function resolve(layoutId: string, text: string, language: TextLanguage, keepSymbols = false) {
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
  });
  assert.ok(result.ok, result.ok ? '' : JSON.stringify(result.error));
  return result.input;
}

function measure(layoutId: string, text: string, language: TextLanguage, keepSymbols = false) {
  const input = resolve(layoutId, text, language, keepSymbols);
  const traceResult = generateEngineTrace(input);
  return { input, trace: traceResult.trace, metrics: interpretEngineTrace(traceResult, input).metrics };
}

test('半角の , . を持たない配列では 、 。 として打ち、持つ配列ではそのまま打つ', () => {
  const kana = measure('nicola', 'あ,い.', 'ja');
  assert.equal(kana.input.text, 'あ、い。');
  assert.deepEqual(kana.trace.strokes.map((stroke) => stroke.inputChar), ['あ', '、', 'い', '。']);
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
