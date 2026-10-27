import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildRomajiTable, defaultRomajiRuleId, tableForRule, type UserRomajiRule } from './rules.ts';
import { kanaToRomaji } from './kunrei.ts';
import { buildGeometry } from '../shapes/geometry.ts';
import { generateTrace } from '#trace/generate.ts';
import { computeMetrics } from '#interpretation/metrics.ts';
import { LAYOUTS_JA, withRomaji } from '../layouts/index.ts';
import { SAMPLE_TEXT_JA } from '../text/sample-ja.ts';

const geometry = buildGeometry('row-staggered');
const options = { windowSize: 3, sfbHomeCost: true };

test('カスタムルールは基底＋差分で構築でき、促音生成を切り替えられる', () => {
  const rule: UserRomajiRule = {
    id: 'custom-test',
    name: 'テスト',
    base: 'kunrei',
    overrides: { し: 'shi', しゃ: 'sha' },
    generateSokuon: true,
  };
  const table = buildRomajiTable(rule);
  assert.equal(kanaToRomaji('っしゃ', table), 'ssha');
  assert.equal(table.get('っしゃ'), 'ssha');

  const noSokuon = buildRomajiTable({ ...rule, generateSokuon: false });
  assert.equal(noSokuon.has('っしゃ'), false);
  assert.equal(kanaToRomaji('っしゃ', noSokuon), 'xtusha');
});

test('無効なルールidは訓令式へフォールバックする', () => {
  assert.equal(tableForRule('missing').get('し'), 'si');
  assert.equal(defaultRomajiRuleId('oonishi'), 'oonishi');
  assert.equal(defaultRomajiRuleId('qwerty'), 'kunrei');
  assert.equal(defaultRomajiRuleId('tomisuke'), 'tomisuke');
});

test('とみすけ式は訓令式と、しゃ・しゅ・しょ・しぇ（と促音の見出し）だけ綴りが違う', () => {
  const kunrei = tableForRule('kunrei');
  const tomisuke = tableForRule('tomisuke');
  const differing = [...new Set([...kunrei.keys(), ...tomisuke.keys()])].filter((heading) => kunrei.get(heading) !== tomisuke.get(heading)).sort();
  const expected = ['しゃ', 'しゅ', 'しょ', 'しぇ'].flatMap((heading) => [heading, `っ${heading}`]).sort();
  assert.deepEqual(differing, expected);
  assert.deepEqual(
    ['しゃ', 'しゅ', 'しょ', 'しぇ', 'っしゃ', 'っしゅ', 'っしょ', 'っしぇ'].map((heading) => tomisuke.get(heading)),
    ['sha', 'shu', 'sho', 'she', 'ssha', 'sshu', 'ssho', 'sshe'],
  );
  // 作者が触れていないかなは訓令式のまま。し単体・ふ・じ・ち・んも変えない
  assert.deepEqual(
    ['し', 'ふ', 'じ', 'じゃ', 'ちゃ', 'ん'].map((heading) => tomisuke.get(heading)),
    ['si', 'hu', 'zi', 'zya', 'tya', kunrei.get('ん')],
  );
});

test('とみすけ配列は、全体の綴りを変えていない時も変えた時も、とみすけ式で打つ', () => {
  const layout = LAYOUTS_JA.find((candidate) => candidate.id === 'tomisuke')!;
  const text = 'しゃしんしょうひん';
  const expected = generateTrace(text, withRomaji(layout, tableForRule('tomisuke')), geometry, options);
  // 組み込みの配列は、推奨の綴りを焼き込んだ形で並ぶ（全体の既定が訓令式でも変わらない）
  const builtIn = generateTrace(text, layout, geometry, options);
  assert.deepEqual(
    builtIn.strokes.map((stroke) => stroke.char),
    expected.strokes.map((stroke) => stroke.char),
  );
  const kunreiTrace = generateTrace(text, withRomaji(layout, tableForRule('kunrei')), geometry, options);
  assert.notDeepEqual(
    builtIn.strokes.map((stroke) => stroke.char),
    kunreiTrace.strokes.map((stroke) => stroke.char),
  );
});

test('AZIKを基底にしたルールでは促音自動生成を強制的に無効にする', () => {
  const table = buildRomajiTable({
    id: 'azik-custom',
    name: 'AZIK派生',
    base: 'azik',
    overrides: {},
    generateSokuon: true,
  });
  assert.equal(table.get('っ'), ';');
  assert.equal(table.has('っか'), false);
  assert.equal(kanaToRomaji('っか', table), ';ka');
});

test('既定のローマ字割り当ては組み込み配列の入力列と一致する', () => {
  const text = SAMPLE_TEXT_JA.replace(/\s+/g, '');
  assert.equal([...text].length, 1676);

  for (const id of ['qwerty', 'oonishi', 'tomisuke']) {
    const layout = LAYOUTS_JA.find((candidate) => candidate.id === id)!;
    const assigned = withRomaji(layout, tableForRule(defaultRomajiRuleId(id)));
    const builtInTrace = generateTrace(text, layout, geometry, options);
    const assignedTrace = generateTrace(text, assigned, geometry, options);

    assert.equal(assignedTrace.skipped, builtInTrace.skipped, id);
    assert.equal(assignedTrace.strokes.length, builtInTrace.strokes.length, id);
    assert.deepEqual(
      assignedTrace.strokes.map((stroke) => stroke.char),
      builtInTrace.strokes.map((stroke) => stroke.char),
      id,
    );
  }
});

test('QWERTYにAZIKを割り当てると短縮綴りが打鍵数へ反映される', () => {
  const text = SAMPLE_TEXT_JA.replace(/\s+/g, '');
  const qwerty = LAYOUTS_JA.find((layout) => layout.id === 'qwerty')!;
  const normal = computeMetrics(generateTrace(text, qwerty, geometry, options), geometry);
  const azik = computeMetrics(generateTrace(text, withRomaji(qwerty, tableForRule('azik')), geometry, options), geometry);
  assert.ok(azik.strokes < normal.strokes, `AZIK: ${azik.strokes} 通常: ${normal.strokes}`);
});
