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
  // ab→ba→ab: 組は a→b, b→a の2種類
  assert.deepEqual(countBigramCombinations(traceOf('qwerty', 'abab')), { physical: 2, withTriggers: 2 });
  // aa: a→a の1種類
  assert.deepEqual(countBigramCombinations(traceOf('qwerty', 'aaa')), { physical: 1, withTriggers: 1 });
});

test('通常シフトは文字を出すキーの中にあるので、物理キーの組は変えずシフト込みの組だけを分ける', () => {
  // aAab の組は a→A, A→a, a→b。物理キーでは a→a, a→b の2種類、シフト込みでは3種類（Aは右シフトで打つ）
  assert.deepEqual(countBigramCombinations(traceOf('qwerty', 'aAab')), { physical: 2, withTriggers: 3 });
});

// f が あ。d を前に押すと か、d を後に押すと さ（どちらも出力のキーは f）
const faceAtF = (output: string) => ['', '', ['', '', '', output], ''];
const SHIFT_LAYOUT = fromFaces('bigram-shift', 'bigram-shift', [
  { trigger: [], mode: 'simultaneous', rows: faceAtF('あ'), inputRole: 'layer' },
  { trigger: ['d'], mode: 'prefix', rows: faceAtF('か'), inputRole: 'modifier', triggerPersistence: 'single' },
  { trigger: ['d'], mode: 'suffix', rows: faceAtF('さ'), inputRole: 'modifier', triggerPersistence: 'single' },
]);

test('前置シフトは次の文字を出すキーと1打に束ねる', () => {
  // 打鍵は f, d f, d f, f の6回だが、1打は4回: f / d+f / d+f / f
  // 束ねなければ f→d, d→f, f→d, d→f, f→f の物理キー4種類・シフト込みも同じ数になる
  const trace = traceOf(SHIFT_LAYOUT, 'あかかあ');
  assert.equal(trace.strokes.length, 6);
  // 物理キーは f→f の1種類。シフト込みは f→(f+d), (f+d)→(f+d), (f+d)→f の3種類
  assert.deepEqual(countBigramCombinations(trace), { physical: 1, withTriggers: 3 });
});

test('後置シフトは直前の文字を出すキーと1打に束ねる', () => {
  const trace = traceOf(SHIFT_LAYOUT, 'あささあ');
  assert.equal(trace.strokes.length, 6);
  // 1打は f / f+d / f+d / f。物理キーは f→f の1種類、シフト込みは3種類
  assert.deepEqual(countBigramCombinations(trace), { physical: 1, withTriggers: 3 });
});

test('月配列2-263式の前置キーは次の文字のキーと1打になる', () => {
  // ん は u 単独、え は d を押してから u。出力のキーは同じ u
  const trace = traceOf('tsuki-2-263', 'んんえ');
  assert.equal(trace.strokes.length, 4);
  // 物理キーは u→u の1種類。シフト込みは u→u と u→(u+d) の2種類
  assert.deepEqual(countBigramCombinations(trace), { physical: 1, withTriggers: 2 });
});

test('同時押しは1打の中のキーの集合として扱い、キーの直積に展開しない', () => {
  // 薙刀式の「が」は j と f の同時押し（j が濁点のトリガー）。1 Strokeで、物理キーの要素は f だけ
  const trace = traceOf('naginata-v18', 'ががあ');
  assert.equal(trace.strokes.length, 3);
  // 物理キーは f→f, f→j の2種類。シフト込みは (f+j)→(f+j), (f+j)→j の2種類
  assert.deepEqual(countBigramCombinations(trace), { physical: 2, withTriggers: 2 });
});

test('親指で打つキーも組に数える', () => {
  // 'a a' は a→空白, 空白→a の2種類
  assert.deepEqual(countBigramCombinations(traceOf('qwerty', 'a a a')), { physical: 2, withTriggers: 2 });
});

test('親指シフトのキーはトリガーなので、物理キーの要素に入れずシフト込みの要素にだけ入れる', () => {
  // 親指シフト配列の「と」は j 単独、「あ」は左親指+s、「が」は右親指+w。
  // 物理キーは j→s, s→j, j→w の3種類で、シフト込みでも同じ3種類（親指のキーが違っても物理キーの組は変わらない）
  assert.deepEqual(countBigramCombinations(traceOf('nicola', 'とあとが')), { physical: 3, withTriggers: 3 });
  // 「ああ」は左親指+s を2回。s→s の1種類
  assert.deepEqual(countBigramCombinations(traceOf('nicola', 'ああ')), { physical: 1, withTriggers: 1 });
});
