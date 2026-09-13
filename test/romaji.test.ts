import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildGeometry } from '../src/geometry.ts';
import { evaluate } from '../src/evaluate.ts';
import { computeMetrics } from '../src/metrics.ts';
import { LAYOUTS, composeRomaji } from '../src/layouts/index.ts';
import { kunrei } from '../src/romaji/kunrei.ts';
import { SAMPLE_TEXT_JA } from '../src/sample-text-ja.ts';

const geometry = buildGeometry('row-staggered');
const qwerty = LAYOUTS[0];
const table = kunrei();
const opts = { windowSize: 3, sfbHomeCost: true };
const ja = composeRomaji('qwerty-ja', 'QWERTY', table, qwerty);

test('訓令式テーブルの基本形', () => {
  assert.equal(table.get('し'), 'si');
  assert.equal(table.get('つ'), 'tu');
  assert.equal(table.get('ふ'), 'hu');
  assert.equal(table.get('じ'), 'zi');
  assert.equal(table.get('ん'), 'nn');
  assert.equal(table.get('ー'), '-');
});

test('促音は次のかなの頭子音を重ねる', () => {
  assert.equal(table.get('っか'), 'kka');
  assert.equal(table.get('っと'), 'tto');
  assert.equal(table.get('っし'), 'ssi');
  assert.equal(table.get('っきゃ'), 'kkya');
});

test('母音で始まるかなには促音形を作らない', () => {
  assert.equal(table.get('っあ'), undefined);
  assert.equal(table.get('っん'), undefined);
});

test('合成した配列は 1 かなを複数ステップへ展開する', () => {
  const t = evaluate('し', ja, geometry, opts);
  assert.equal(t.strokes.length, 2);
  assert.deepEqual(t.strokes.map((s) => s.presses[0].keys[0].id), ['s', 'i']);
});

test('合成しても刻印は英字配列のものを引き継ぐ', () => {
  assert.equal(ja.legends.get('a'), 'a');
  assert.equal(ja.legends.get('-'), '-');
  assert.equal(ja.legends, qwerty.legends);
});

test('長音「ー」は数字段の - キーになる', () => {
  const t = evaluate('ー', ja, geometry, opts);
  assert.equal(t.strokes[0].presses[0].keys[0].id, '-');
});

test('日本語サンプルは全文字が打鍵列に入る', () => {
  const text = SAMPLE_TEXT_JA.replace(/\s+/g, '');
  const t = evaluate(text, ja, geometry, opts);
  assert.equal(t.skipped, 0);
  assert.equal(t.errors.length, 0);
  assert.ok(t.strokes.length > [...text].length, 'ローマ字展開で打鍵数が増える');
});

test('全英字配列が同じテーブルで同じステップ数になる', () => {
  const text = SAMPLE_TEXT_JA.replace(/\s+/g, '');
  const counts = LAYOUTS.map((base) => {
    const l = composeRomaji(`${base.id}-ja`, base.name, table, base);
    return computeMetrics(evaluate(text, l, geometry, opts), geometry).strokes;
  });
  assert.equal(new Set(counts).size, 1, `ステップ数が配列で異なる: ${counts}`);
});
