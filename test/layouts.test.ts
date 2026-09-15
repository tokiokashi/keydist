import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildGeometry } from '../src/geometry.ts';
import { DEFAULT_OPTIONS, evaluate } from '../src/evaluate.ts';
import { faceFromEntries, fromFaces, KANA_PENDING, LAYOUT_BY_ID, LAYOUTS_JA } from '../src/layouts/index.ts';
import { computeMetrics } from '../src/metrics.ts';
import { SAMPLE_TEXT_JA } from '../src/sample-text-ja.ts';
import { toLayout } from '../src/user-layouts.ts';
import { assertKanaLayout } from './kana-layout-helpers.ts';

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

test('面定義の未知のキーは空欄にせずエラーにする', () => {
  assert.throws(
    () => faceFromEntries([], 'simultaneous', { typo: 'あ' }),
    /面に未知のキーがある: typo/,
  );
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

test('NICOLA は3面の直接かな入力を同時押しとして保持する', () => {
  const layout = LAYOUT_BY_ID.get('nicola')!;

  assert.equal(layout.map.size, 89);
  assert.equal(layout.maxCharLength, 1);
  assert.deepEqual(layout.map.get('。'), [['q']]);
  assert.deepEqual(layout.map.get('え'), [['thumb-l', 'w']]);
  assert.deepEqual(layout.map.get('が'), [['thumb-r', 'w']]);
  assert.deepEqual(layout.map.get('ー'), [['thumb-l', 'x']]);
  assert.deepEqual(layout.map.get('っ'), [['thumb-r', ';']]);
  assert.equal(layout.legends.get('thumb-l'), '無変換');
  assert.equal(layout.legends.get('thumb-r'), '変換');
  for (const sequence of layout.map.values()) assert.equal(sequence.length, 1);
  assertKanaLayout(layout, ['ゎ']);
});

test('新下駄配列は7面の直接かな入力を同時押しとして保持する', () => {
  const layout = LAYOUT_BY_ID.get('shingeta')!;

  assert.deepEqual(layout.map.get('ー'), [['q']]);
  assert.deepEqual(layout.map.get('あ'), [['d', 'j']]);
  assert.deepEqual(layout.map.get('しゃ'), [['i', 'c']]);
  assert.deepEqual(layout.map.get('ぁ'), [['k', '1']]);
  assert.deepEqual(layout.map.get('ヴ'), [['d', '/']]);
  assert.equal(layout.legends.has('thumb-l'), false);
  assert.equal(layout.legends.has('thumb-r'), false);
  for (const sequence of layout.map.values()) assert.equal(sequence.length, 1);
  assertKanaLayout(layout);
});

test('月配列 2-263 式はクロスシフトと濁音の逐次合成を保持する', () => {
  const layout = LAYOUT_BY_ID.get('tsuki-2-263')!;

  assert.deepEqual(layout.map.get('そ'), [['q']]);
  assert.deepEqual(layout.map.get('ら'), [['k'], ['d']]);
  assert.deepEqual(layout.map.get('お'), [['d'], ['j']]);
  assert.deepEqual(layout.map.get('が'), [['s'], ['l']]);
  assert.deepEqual(layout.map.get('ぱ'), [['a'], ['/']]);
  assert.deepEqual(layout.map.get('ゔ'), [['j'], ['l']]);
  assert.equal(layout.map.has('ヴ'), false);
  assert.equal(layout.legends.has('thumb-l'), false);
  assert.equal(layout.legends.has('thumb-r'), false);
  assertKanaLayout(layout, ['ゎ', 'ヴ']);
});

test('かな配列七傑の未実装枠は一覧へ登録しない', () => {
  const pendingIds = [
    'asuka', 'shin-koume', 'shin-jis-prefix', 'shin-jis-simultaneous',
  ];
  const noThumbIds = new Set<string>();
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
