import assert from 'node:assert/strict';
import test from 'node:test';
import { LOADED_LAYOUT_BY_ID } from '../../test/kanji-direct-tables.ts';
import { buildUserCatalog } from '#input/layouts/user-catalog.ts';
import type { FaceUserLayout } from '#input/layouts/user-layouts.ts';
import { PHYSICAL_SHAPES } from '#input/shapes/geometry.ts';
import { notationWordsInReading } from '#input/text/notation-words.ts';
import { convertToReading, type ReadingConditions, type ReadingCorrections, type ReadingToken } from '#input/text/reading.ts';
import { traceKeyOf } from './keys.ts';
import { generateEngineTrace, interpretEngineTrace } from './pipeline.ts';
import { resolveEngineInput } from './resolved-input.ts';
import { EMPTY_SETTINGS_OVERRIDES, setSettingsOverride } from './settings-items.ts';

/** 漢字の見出しを2つ（漢・字）と、かな（あ・い・か・ん・う）を持つ、小さな漢直の配列。 */
const KANJI_LAYOUT: FaceUserLayout = {
  kind: 'kana',
  id: 'kanji-small',
  name: '漢直の小さな配列',
  faces: [{ trigger: [], inputRole: 'layer', outputs: { a: 'あ', s: 'い', d: '漢', f: '字', j: 'か', k: 'ん', l: 'う' } }],
  composition: { dakuten: false, handakuten: false },
};

const USER = buildUserCatalog([KANJI_LAYOUT], []);
const CATALOG = {
  layouts: new Map([...LOADED_LAYOUT_BY_ID, ...USER.layouts]),
  shapes: new Map(Object.values(PHYSICAL_SHAPES).map((shape) => [shape.id, shape] as const)),
};

const READING_CONDITIONS: ReadingConditions = {
  status: 'converted',
  dictionary: { name: 'テスト辞書', version: '1' },
  library: { name: 'テスト解析器', version: '1' },
  corrections: [],
};

/** 語（表記と読み）の列から、解析の結果と原文を作る。読みがnullの語は、辞書に読みが無い語（未知語）。 */
function analyzed(parts: readonly (readonly [surface: string, reading: string | null])[]): { text: string; tokens: ReadingToken[] } {
  const encoder = new TextEncoder();
  let byte = 0;
  let text = '';
  const tokens = parts.map(([surface, reading]) => {
    const length = encoder.encode(surface).length;
    const token: ReadingToken = { surface, byteStart: byte, byteEnd: byte + length, reading, isUnknown: reading === null };
    byte += length;
    text += surface;
    return token;
  });
  return { text, tokens };
}

function resolve(layoutId: string, parts: readonly (readonly [string, string | null])[], corrections: ReadingCorrections = {}, keepSymbols = false) {
  const { text, tokens } = analyzed(parts);
  const conversion = convertToReading(text, tokens, corrections);
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
    userLayouts: USER.userLayouts,
    overrides,
    text: conversion.text,
    language: 'ja',
    reading: READING_CONDITIONS,
    notationExcess: conversion.notationExcess,
    notationWords: notationWordsInReading(text, tokens, corrections),
  });
  assert.ok(result.ok, result.ok ? '' : JSON.stringify(result.error));
  const traceResult = generateEngineTrace(result.input);
  return { input: result.input, trace: traceResult.trace, metrics: interpretEngineTrace(traceResult, result.input).metrics };
}

const SENTENCE = [
  ['あ', null],
  ['漢字', 'カンジ'],
  ['う', null],
] as const;

test('漢直の配列は、表記を切り分けられる語を表記で打ち、読みの範囲全体を覆う', () => {
  const { trace, input } = resolve('kanji-small', SENTENCE);
  assert.equal(input.text, 'あかんじう');
  assert.deepEqual(
    trace.strokes.map((stroke) => [stroke.char, stroke.kanaStart, stroke.kanaEnd]),
    [
      ['あ', 0, 0],
      ['漢', 1, 3],
      ['字', 1, 3],
      ['う', 4, 4],
    ],
  );
  assert.equal(trace.skipped, 0);
});

test('表記を切り分けられない字が残る語は、語全体を読みで打つ', () => {
  // 「山」は見出しに無い。読み「かんい」はすべて見出しにあるので、打てない文字が出ない
  const { trace } = resolve('kanji-small', [
    ['漢山', 'カンイ'],
    ['う', null],
  ]);
  assert.deepEqual(
    trace.strokes.map((stroke) => stroke.char),
    ['か', 'ん', 'い', 'う'],
  );
  assert.equal(trace.skipped, 0);
});

test('利用者が直した読みは、表記で打つかの判定に使わず、語の読みの範囲と入力かな数だけを決める', () => {
  const { trace, input } = resolve('kanji-small', SENTENCE, { 漢字: 'かんじゅう' });
  assert.equal(input.text, 'あかんじゅうう');
  // 表記で打つ。語の読みの範囲は直した読みの5字（位置1〜5）
  assert.deepEqual(
    trace.strokes.map((stroke) => [stroke.char, stroke.kanaStart, stroke.kanaEnd]),
    [
      ['あ', 0, 0],
      ['漢', 1, 5],
      ['字', 1, 5],
      ['う', 6, 6],
    ],
  );
  assert.equal(trace.inputChars, 7);
});

test('漢直の配列と漢直でない配列で、同じテキストのCとWが一致する', () => {
  const kanji = resolve('kanji-small', SENTENCE);
  const kana = resolve('nicola', SENTENCE);
  assert.equal(kanji.trace.inputChars, 5);
  assert.equal(kanji.trace.inputChars, kana.trace.inputChars);
  // Wは、表記で打つ語も読みに置き換えたものとみなした値: 5 + (表記2字 - 読み3字)
  assert.equal(kanji.metrics.textChars, 4);
  assert.equal(kanji.metrics.textChars, kana.metrics.textChars);
  // 打鍵の数は配列で違う（漢字の2打と、読みの3かな）
  assert.notEqual(kanji.trace.strokes.length, kana.trace.strokes.length);
});

test('漢直でない配列は、表記で打つ語の候補を持たず、Traceのキーが語の有無で変わらない', () => {
  const { text, tokens } = analyzed(SENTENCE);
  const withWords = resolve('nicola', SENTENCE);
  assert.deepEqual(withWords.input.notationWords, []);
  const conversion = convertToReading(text, tokens);
  const withoutWords = resolveEngineInput({
    target: { kind: 'layout', layoutId: 'nicola' },
    setups: new Map(),
    catalog: CATALOG,
    userLayouts: USER.userLayouts,
    overrides: EMPTY_SETTINGS_OVERRIDES,
    text: conversion.text,
    language: 'ja',
    reading: READING_CONDITIONS,
    notationExcess: conversion.notationExcess,
  });
  assert.ok(withoutWords.ok);
  assert.equal(traceKeyOf(withWords.input), traceKeyOf(withoutWords.input));
});

test('漢直の配列のTraceのキーは、表記で打つ語の候補を含む', () => {
  const withWords = resolve('kanji-small', SENTENCE);
  const { text, tokens } = analyzed(SENTENCE);
  const conversion = convertToReading(text, tokens);
  const withoutWords = resolveEngineInput({
    target: { kind: 'layout', layoutId: 'kanji-small' },
    setups: new Map(),
    catalog: CATALOG,
    userLayouts: USER.userLayouts,
    overrides: EMPTY_SETTINGS_OVERRIDES,
    text: conversion.text,
    language: 'ja',
    reading: READING_CONDITIONS,
    notationExcess: conversion.notationExcess,
  });
  assert.ok(withoutWords.ok);
  assert.notEqual(traceKeyOf(withWords.input), traceKeyOf(withoutWords.input));
});

test('辞書に読みが無い語の漢字は、表記のまま評価に渡り、見出しにあれば打ち、無ければ打てない漢字に数える', () => {
  const { trace, input } = resolve('kanji-small', [
    ['漢', null],
    ['山', null],
    ['あ', null],
  ]);
  assert.equal(input.text, '漢山あ');
  assert.deepEqual(input.notationWords, []);
  assert.deepEqual(
    trace.strokes.map((stroke) => stroke.char),
    ['漢', 'あ'],
  );
  assert.deepEqual(trace.skippedByKind, { kanji: 1, symbol: 0, other: 0 });
});

test('表記は記号と英数字の範囲の処理の後の字列で打つ', () => {
  // 表記「漢・字」の「・」は、既定の範囲では取り除かれて「漢字」になり、記号を残す範囲では見出しに無い字が残るので読みで打つ
  const parts = [['漢・字', 'カンジ']] as const;
  assert.deepEqual(
    resolve('kanji-small', parts).trace.strokes.map((stroke) => stroke.char),
    ['漢', '字'],
  );
  assert.deepEqual(
    resolve('kanji-small', parts, {}, true).trace.strokes.map((stroke) => stroke.char),
    ['か', 'ん'],
  );
});

test('語の前の記号が取り除かれても、語の読みの範囲は評価に渡すテキストの位置に写る', () => {
  const { trace, input } = resolve('kanji-small', [
    ['あ', null],
    ['！', null],
    ['漢字', 'カンジ'],
    ['う', null],
  ]);
  assert.equal(input.text, 'あかんじう');
  assert.deepEqual(input.notationWords, [{ start: 1, end: 4, surface: '漢字' }]);
  assert.deepEqual(
    trace.strokes.map((stroke) => [stroke.char, stroke.kanaStart, stroke.kanaEnd]),
    [
      ['あ', 0, 0],
      ['漢', 1, 3],
      ['字', 1, 3],
      ['う', 4, 4],
    ],
  );
});

test('表記が読みより短い語の後ろの片仮名は、見出しに無ければひらがなに書き換えて打つ', () => {
  // 見出しに て・す・と があり片仮名が無い配列。「漢字」は2字で読みは3字なので、後ろの片仮名の位置が列と評価に渡すテキストでずれる
  const user = buildUserCatalog(
    [
      {
        kind: 'kana',
        id: 'kanji-small-2',
        name: '漢直の小さな配列2',
        faces: [{ trigger: [], inputRole: 'layer', outputs: { a: 'て', s: 'す', d: '漢', f: '字', j: 'と' } }],
        composition: { dakuten: false, handakuten: false },
      },
    ],
    [],
  );
  const { text, tokens } = analyzed([
    ['漢字', 'カンジ'],
    ['テスト', null],
  ]);
  const conversion = convertToReading(text, tokens);
  const result = resolveEngineInput({
    target: { kind: 'layout', layoutId: 'kanji-small-2' },
    setups: new Map(),
    catalog: { layouts: new Map([...LOADED_LAYOUT_BY_ID, ...user.layouts]), shapes: CATALOG.shapes },
    userLayouts: user.userLayouts,
    overrides: EMPTY_SETTINGS_OVERRIDES,
    text: conversion.text,
    language: 'ja',
    reading: READING_CONDITIONS,
    notationExcess: conversion.notationExcess,
    notationWords: notationWordsInReading(text, tokens),
  });
  assert.ok(result.ok);
  assert.equal(result.input.text, 'かんじてすと');
  const { trace } = { trace: generateEngineTrace(result.input).trace };
  assert.equal(trace.skipped, 0);
  assert.deepEqual(
    trace.strokes.map((stroke) => stroke.char),
    ['漢', '字', 'て', 'す', 'と'],
  );
});
