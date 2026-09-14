import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildRomajiTable,
  defaultRomajiRuleId,
  formatOverrides,
  parseOverrides,
  tableForRule,
  type UserRomajiRule,
} from '../src/romaji/rules.ts';
import { kanaToRomaji } from '../src/romaji/kunrei.ts';
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

test('無効なルール id は訓令式へフォールバックする', () => {
  assert.equal(tableForRule('missing').get('し'), 'si');
  assert.equal(defaultRomajiRuleId('oonishi'), 'oonishi');
  assert.equal(defaultRomajiRuleId('qwerty'), 'kunrei');
});

test('AZIK を基底にしたルールでは促音自動生成を強制的に無効にする', () => {
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

test('既定の割り当ては既存の測定値を維持する', () => {
  const text = SAMPLE_TEXT_JA.replace(/\s+/g, '');
  assert.equal([...text].length, 1676);
  const expected: Record<string, number> = {
    oonishi: 1075.6320,
    naginata: 1131.0836,
  };
  for (const [id, total] of Object.entries(expected)) {
    const layout = LAYOUTS_JA.find((candidate) => candidate.id === (id === 'naginata' ? 'naginata-v18' : id))!;
    const assigned = layout.romajiTable
      ? withRomaji(layout, tableForRule(defaultRomajiRuleId(id)))
      : layout;
    const metrics = computeMetrics(evaluate(text, assigned, geometry, options), geometry);
    assert.ok(Math.abs(metrics.totalUnits - total) < 0.00005, `${id}: ${metrics.totalUnits}`);
  }
});

test('QWERTY に AZIK を割り当てると短縮綴りが打鍵数へ反映される', () => {
  const text = SAMPLE_TEXT_JA.replace(/\s+/g, '');
  const qwerty = LAYOUTS_JA.find((layout) => layout.id === 'qwerty')!;
  const normal = computeMetrics(evaluate(text, qwerty, geometry, options), geometry);
  const azik = computeMetrics(
    evaluate(text, withRomaji(qwerty, tableForRule('azik')), geometry, options),
    geometry,
  );
  assert.ok(azik.strokes < normal.strokes, `AZIK: ${azik.strokes} 通常: ${normal.strokes}`);
});
