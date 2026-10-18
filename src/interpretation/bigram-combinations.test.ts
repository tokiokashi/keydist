import assert from 'node:assert/strict';
import test from 'node:test';
import { fromFaces, LAYOUT_BY_ID } from '#input/layouts/index.ts';
import type { Layout } from '#input/layouts/index.ts';
import { buildGeometry } from '#input/shapes/geometry.ts';
import { DEFAULT_TRACE_POLICY, generateTrace, type Trace } from '#trace/generate.ts';
import { countBigramCombinations } from './bigram-combinations.ts';

function traceOf(layoutId: string | Layout, text: string): Trace {
  const layout = typeof layoutId === 'string' ? LAYOUT_BY_ID.get(layoutId) : layoutId;
  assert.ok(layout, String(layoutId));
  const trace = generateTrace(text, layout, buildGeometry('row-staggered'), DEFAULT_TRACE_POLICY);
  assert.equal(trace.skipped, 0);
  return trace;
}

test('打鍵が1回以下なら0', () => {
  assert.deepEqual(countBigramCombinations(traceOf('qwerty', '')), { physical: 0, withTriggers: 0 });
  assert.deepEqual(countBigramCombinations(traceOf('qwerty', 'a')), { physical: 0, withTriggers: 0 });
});

test('組は順序付きで、同じ組は1回と数える', () => {
  // ababの組はa→bとb→aの2種類
  assert.deepEqual(countBigramCombinations(traceOf('qwerty', 'abab')), { physical: 2, withTriggers: 2 });
  // aaaの組はa→aの1種類
  assert.deepEqual(countBigramCombinations(traceOf('qwerty', 'aaa')), { physical: 1, withTriggers: 1 });
});

test('通常シフトは文字を出すキーの中にあるので、物理キーの組は変えずシフト込みの組だけを分ける', () => {
  // aAabの組はa→A、A→a、a→b。物理キーではa→aとa→bの2種類、シフト込みでは3種類（Aは右シフトで打つ）
  assert.deepEqual(countBigramCombinations(traceOf('qwerty', 'aAab')), { physical: 2, withTriggers: 3 });
});

// fはあ。dを前に押すとか、dを後に押すとさ（どちらも文字を出すキーはf）
const faceAtF = (output: string) => ['', '', ['', '', '', output], ''];
const SHIFT_LAYOUT = fromFaces('bigram-shift', 'bigram-shift', [
  { trigger: [], mode: 'simultaneous', rows: faceAtF('あ'), inputRole: 'layer' },
  { trigger: ['d'], mode: 'prefix', rows: faceAtF('か'), inputRole: 'modifier', triggerPersistence: 'single' },
  { trigger: ['d'], mode: 'suffix', rows: faceAtF('さ'), inputRole: 'modifier', triggerPersistence: 'single' },
]);

test('前置シフトは次の文字を出すキーと1打に束ねる', () => {
  // Strokeは6つだが、1打は4回（f、d+f、d+f、f）。dを束ねなければ物理キーの組はf→d、d→f、f→fの3種類になる
  const trace = traceOf(SHIFT_LAYOUT, 'あかかあ');
  assert.equal(trace.strokes.length, 6);
  // 物理キーはf→fの1種類。シフト込みはf→(f+d)、(f+d)→(f+d)、(f+d)→fの3種類
  assert.deepEqual(countBigramCombinations(trace), { physical: 1, withTriggers: 3 });
});

test('後置シフトは直前の文字を出すキーと1打に束ねる', () => {
  const trace = traceOf(SHIFT_LAYOUT, 'あささあ');
  assert.equal(trace.strokes.length, 6);
  // 1打はf、f+d、f+d、fの4回。物理キーはf→fの1種類、シフト込みは3種類
  assert.deepEqual(countBigramCombinations(trace), { physical: 1, withTriggers: 3 });
});

test('月配列2-263式の前置キーは次の文字のキーと1打になる', () => {
  // んはu単独、えはdを押してからu。文字を出すキーは同じu
  const trace = traceOf('tsuki-2-263', 'んんえ');
  assert.equal(trace.strokes.length, 4);
  // 物理キーはu→uの1種類。シフト込みはu→uとu→(u+d)の2種類
  assert.deepEqual(countBigramCombinations(trace), { physical: 1, withTriggers: 2 });
});

test('同時押しは1打の中のキーの集合として扱い、キーの直積に展開しない', () => {
  // 薙刀式の「が」はjとfの同時押し（jが濁点のトリガー）。1つのStrokeで、物理キーの要素はfだけ
  const trace = traceOf('naginata-v18', 'ががあ');
  assert.equal(trace.strokes.length, 3);
  // 物理キーはf→fとf→jの2種類。シフト込みは(f+j)→(f+j)と(f+j)→jの2種類
  assert.deepEqual(countBigramCombinations(trace), { physical: 2, withTriggers: 2 });
});

test('親指で打つキーも組に数える', () => {
  // a a aの組はa→空白と空白→aの2種類
  assert.deepEqual(countBigramCombinations(traceOf('qwerty', 'a a a')), { physical: 2, withTriggers: 2 });
});

test('親指シフトのキーはトリガーなので、物理キーの要素に入れずシフト込みの要素にだけ入れる', () => {
  // 親指シフト配列の「と」はj単独、「あ」は左親指+s、「が」は右親指+w。
  // 物理キーの組はj→s、s→j、j→wの3種類。シフト込みも同じ3種類
  assert.deepEqual(countBigramCombinations(traceOf('nicola', 'とあとが')), { physical: 3, withTriggers: 3 });
  // 「ああ」は左親指+sを2回。s→sの1種類
  assert.deepEqual(countBigramCombinations(traceOf('nicola', 'ああ')), { physical: 1, withTriggers: 1 });
});
