import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildGeometry } from '../src/geometry.ts';
import { DEFAULT_OPTIONS, evaluate } from '../src/evaluate.ts';
import { fromFaces, KANA_PENDING, LAYOUT_BY_ID, LAYOUTS_JA } from '../src/layouts/index.ts';
import { computeMetrics } from '../src/metrics.ts';
import { SAMPLE_TEXT_JA } from '../src/sample-text-ja.ts';
import { toLayout } from '../src/user-layouts.ts';

const faceAtF = (output: string) => ['', '', ['', '', '', output], ''];

test('面は prefix / suffix / simultaneous を Sequence に展開する', () => {
  const layout = fromFaces('faces', 'faces', [
    { trigger: [], mode: 'simultaneous', rows: faceAtF('あ') },
    { trigger: ['d'], mode: 'prefix', rows: faceAtF('か') },
    { trigger: ['d'], mode: 'suffix', rows: faceAtF('さ') },
    { trigger: ['j'], mode: 'simultaneous', rows: faceAtF('た') },
  ]);

  assert.deepEqual(layout.map.get('あ'), [['f']]);
  assert.deepEqual(layout.map.get('か'), [['d'], ['f']]);
  assert.deepEqual(layout.map.get('さ'), [['f'], ['d']]);
  assert.deepEqual(layout.map.get('た'), [['j', 'f']]);
});

test('日本語の配列一覧に Dvorak を含める（#48）', () => {
  const dvorak = LAYOUTS_JA.find((layout) => layout.id === 'dvorak');

  assert.ok(dvorak);
  assert.equal(dvorak.name, 'Dvorak');
  assert.ok(dvorak.romajiTable);
});

test('面のセル配列は複数文字の見出しを 1 キーへ置ける', () => {
  const layout = fromFaces('multi', 'multi', [
    { trigger: [], mode: 'simultaneous', rows: ['', '', ['', '', '', 'きゃ'], ''] },
  ]);

  assert.deepEqual(layout.map.get('きゃ'), [['f']]);
  assert.equal(layout.maxCharLength, 2);
});

test('薙刀式 v18 は面から生成され、全定義を 1 ステップで保持する', () => {
  const layout = LAYOUT_BY_ID.get('naginata-v18')!;

  assert.equal(layout.map.size, 150);
  assert.equal(layout.map.has(' '), false);
  assert.equal(layout.legends.get('thumb-l'), '親指');
  assert.equal(layout.legends.get('thumb-r'), 'Space');
  assert.equal(layout.legends.has('space'), false);
  for (const sequence of layout.map.values()) assert.equal(sequence.length, 1);
  assert.deepEqual(layout.map.get('きゃ'), [['h', 'w']]);
  assert.deepEqual(layout.map.get('ぐゎ'), [['.', 'f', 'h']]);
});

test('かな配列七傑の未実装枠は一覧へ登録しない', () => {
  const pendingIds = [
    'nicola', 'asuka', 'shin-koume', 'shin-jis-prefix',
    'shin-jis-simultaneous', 'shingeta', 'tsuki-2-263',
  ];
  const noThumbIds = new Set(['shingeta', 'tsuki-2-263']);
  assert.deepEqual(KANA_PENDING.map((layout) => layout.id), pendingIds);
  for (const layout of KANA_PENDING) {
    assert.equal(layout.map.size, 0, `${layout.id} は配置を持たない`);
    if (noThumbIds.has(layout.id)) {
      assert.equal(layout.legends.has('thumb-l'), false, `${layout.id} は thumb-l を表示しない`);
      assert.equal(layout.legends.has('thumb-r'), false, `${layout.id} は thumb-r を表示しない`);
    } else {
      assert.ok(layout.legends.has('thumb-l'), `${layout.id} は thumb-l の凡例を持つ`);
      assert.ok(layout.legends.has('thumb-r'), `${layout.id} は thumb-r の凡例を持つ`);
    }
    assert.equal(LAYOUT_BY_ID.has(layout.id), false);
  }
  assert.equal(LAYOUTS_JA.some((layout) => pendingIds.includes(layout.id)), false);
});

test('保存済み凡例の space も thumb-r へ解決する', () => {
  const layout = toLayout({
    id: 'user-legacy',
    name: 'legacy',
    rows: ['', '', '', ''],
    romaji: 'kunrei',
    sequences: [['x', [['space']]]],
    legends: [['space', 'Space']],
    direct: true,
  });

  assert.equal(layout.legends.get('thumb-r'), 'Space');
  assert.equal(layout.legends.has('space'), false);
});

test('薙刀式 v18 の面移行で総距離とステップ数を維持する', () => {
  const geometry = buildGeometry('row-staggered');
  const layout = LAYOUT_BY_ID.get('naginata-v18')!;
  const text = SAMPLE_TEXT_JA.replace(/\s+/g, '');
  const trace = evaluate(text, layout, geometry, DEFAULT_OPTIONS);
  const metrics = computeMetrics(trace, geometry);

  assert.equal(trace.skipped, 0);
  assert.equal(metrics.strokes, 1654);
  assert.equal(metrics.presses, 2440);
  assert.ok(Math.abs(metrics.totalUnits - 1131.0836338355334) < 1e-9);
});
