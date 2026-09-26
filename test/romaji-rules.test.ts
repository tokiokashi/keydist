import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildRomajiTable,
  defaultRomajiRuleId,
  formatOverrides,
  parseOverrides,
  tableForRule,
  type UserRomajiRule,
} from '#input/romaji/rules.ts';
import { kanaToRomaji } from '#input/romaji/kunrei.ts';
import { buildGeometry } from '../src/geometry.ts';
import { evaluate } from '../src/evaluate.ts';
import { computeMetrics } from '../src/metrics.ts';
import { LAYOUTS_JA, withRomaji } from '../src/layouts/index.ts';
import { SAMPLE_TEXT_JA } from '../src/sample-text-ja.ts';

const geometry = buildGeometry('row-staggered');
const options = { windowSize: 3, sfbHomeCost: true };

test('ローマ字差分を読み取り、複数かなの見出しを保持する', () => {
  const parsed = parseOverrides('しゃ = sha\nかん = kz\n# コメント\n');
  assert.deepEqual(parsed.errors, []);
  assert.deepEqual(parsed.overrides, { しゃ: 'sha', かん: 'kz' });
  assert.equal(formatOverrides(parsed.overrides), 'しゃ = sha\nかん = kz');
});

test('ローマ字差分の形式エラーと重複を報告する', () => {
  const parsed = parseOverrides('しゃ = sha\nしゃ = shi\n壊れた行\nabc = xyz\nし = shi!');
  assert.equal(parsed.errors.length, 4);
  assert.deepEqual(parsed.overrides, { しゃ: 'sha' });
});

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

  for (const id of ['qwerty', 'oonishi']) {
    const layout = LAYOUTS_JA.find((candidate) => candidate.id === id)!;
    const assigned = withRomaji(layout, tableForRule(defaultRomajiRuleId(id)));
    const builtInTrace = evaluate(text, layout, geometry, options);
    const assignedTrace = evaluate(text, assigned, geometry, options);

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
  const normal = computeMetrics(evaluate(text, qwerty, geometry, options), geometry);
  const azik = computeMetrics(
    evaluate(text, withRomaji(qwerty, tableForRule('azik')), geometry, options),
    geometry,
  );
  assert.ok(azik.strokes < normal.strokes, `AZIK: ${azik.strokes} 通常: ${normal.strokes}`);
});
