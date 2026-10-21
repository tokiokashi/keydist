import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildGeometry } from '#input/shapes/geometry.ts';
import { fromKana, LAYOUT_BY_ID } from '#input/layouts/index.ts';
import { DEFAULT_TRACE_POLICY, EVALUATION_CHAR_ALIASES, generateTrace, type Trace } from './generate.ts';

const geometry = buildGeometry('row-staggered');
const qwerty = LAYOUT_BY_ID.get('qwerty')!;

const keysOf = (trace: Trace) => trace.strokes.map((stroke) => stroke.presses.flatMap((press) => press.keys.map((key) => key.id)));

test('別名は、全角形のASCIIのうち英字・数字と，．を除いた記号から、対応する半角へ写す', () => {
  for (const [full, half] of [
    ['！', '!'],
    ['（', '('],
    ['）', ')'],
    ['／', '/'],
    ['＋', '+'],
    ['～', '~'],
    ['＝', '='],
    ['＠', '@'],
    ['；', ';'],
    ['＼', '\\'],
    ['｀', '`'],
  ]) {
    assert.equal(EVALUATION_CHAR_ALIASES[full], half, full);
  }
  for (const char of ['Ａ', 'ｚ', '０', '９', '，', '．', '’', '”', '‘', '〜', '￥', '――', '—', '…', '　']) {
    assert.equal(EVALUATION_CHAR_ALIASES[char], undefined, char);
  }
});

test('テキストの全角形の記号は、半角の記号と同じ物理入力として打つ', () => {
  const half = generateTrace('()[]+=/', qwerty, geometry, DEFAULT_TRACE_POLICY);
  const full = generateTrace('（）［］＋＝／', qwerty, geometry, DEFAULT_TRACE_POLICY);
  assert.equal(half.skipped, 0);
  assert.equal(full.skipped, 0);
  assert.deepEqual(keysOf(full), keysOf(half));
  assert.deepEqual(
    full.strokes.map((stroke) => stroke.inputChar),
    [...'（）［］＋＝／'],
  );
});

test('全角形の英字と数字は、半角へ写さない', () => {
  const trace = generateTrace('Ａ１', qwerty, geometry, DEFAULT_TRACE_POLICY);
  assert.equal(trace.skipped, 2);
});

test('配列の出力の全角形の記号は、半角の記号のテキストで打てる', () => {
  const layout = fromKana('alias-fullwidth', '全角の出力', { '（': [['a']], '！': [['s']] });
  const trace = generateTrace('(!', layout, geometry, DEFAULT_TRACE_POLICY);
  assert.equal(trace.skipped, 0);
  assert.deepEqual(keysOf(trace), [['a'], ['s']]);
});

test('配列の出力の半角の記号は、全角形の記号のテキストで打てる', () => {
  const layout = fromKana('alias-halfwidth', '半角の出力', { '(': [['a']], '!': [['s']] });
  const trace = generateTrace('（！', layout, geometry, DEFAULT_TRACE_POLICY);
  assert.equal(trace.skipped, 0);
  assert.deepEqual(keysOf(trace), [['a'], ['s']]);
  assert.deepEqual(
    trace.strokes.map((stroke) => stroke.inputChar),
    ['（', '！'],
  );
});

test('配列が全角形と半角の両方を持つ時は、両方の打ち方を代わりの打ち方として持つ', () => {
  const layout = fromKana('alias-both', '両方の出力', { '！': [['a']], '!': [['s']] });
  assert.equal(generateTrace('!', layout, geometry, DEFAULT_TRACE_POLICY).skipped, 0);
  assert.equal(generateTrace('！', layout, geometry, DEFAULT_TRACE_POLICY).skipped, 0);
  assert.equal(generateTrace('!！', layout, geometry, DEFAULT_TRACE_POLICY).strokes.length, 2);
});

test('別名の範囲の外の出力は、文字が一致した時だけ打てる', () => {
  const layout = fromKana('alias-outside', '範囲の外の出力', { '’': [['a']], '￥': [['s']] });
  assert.equal(generateTrace('’￥', layout, geometry, DEFAULT_TRACE_POLICY).skipped, 0);
  assert.equal(generateTrace("'\\", layout, geometry, DEFAULT_TRACE_POLICY).skipped, 2);
});

test('『』は、『』を持たないかな配列では「」と同じ物理入力で打つ', () => {
  const layout = fromKana('alias-bracket', 'かぎ括弧だけ', { '「': [['a']], '」': [['s']] });
  const single = generateTrace('「」', layout, geometry, DEFAULT_TRACE_POLICY);
  const double = generateTrace('『』', layout, geometry, DEFAULT_TRACE_POLICY);
  assert.equal(double.skipped, 0);
  assert.deepEqual(keysOf(double), keysOf(single));
  assert.deepEqual(
    double.strokes.map((stroke) => stroke.inputChar),
    ['『', '』'],
  );
});

test('『』を片方だけ持つ配列では、持たない側にだけ別名を当てる', () => {
  const layout = fromKana('alias-bracket-half', '『だけ', { '「': [['a']], '」': [['s']], '『': [['d']] });
  assert.deepEqual(keysOf(generateTrace('『』「', layout, geometry, DEFAULT_TRACE_POLICY)), [['d'], ['s'], ['a']]);
});

test('『』を持つ薙刀式v18では、『』を自分の定義で打ち、「」の打鍵は変わらない', () => {
  const naginata = LAYOUT_BY_ID.get('naginata-v18')!;
  assert.deepEqual(keysOf(generateTrace('『』', naginata, geometry, DEFAULT_TRACE_POLICY)), [
    ['j', 'k', 's'],
    ['j', 'k', 'x'],
  ]);
  assert.deepEqual(keysOf(generateTrace('「」', naginata, geometry, DEFAULT_TRACE_POLICY)), [
    ['j', 'k', 'f'],
    ['j', 'k', 'v'],
  ]);
});

test('「」を打てない配列では、『』も打てない記号に数える', () => {
  const layout = fromKana('alias-bracket-none', '括弧なし', { あ: [['a']] });
  const trace = generateTrace('『あ』', layout, geometry, DEFAULT_TRACE_POLICY);
  assert.equal(trace.skipped, 2);
  assert.deepEqual(trace.skippedByKind, { kanji: 0, symbol: 2, other: 0 });
});
