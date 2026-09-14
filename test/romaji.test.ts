import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildGeometry, QWERTY_LEGEND } from '../src/geometry.ts';
import { evaluate } from '../src/evaluate.ts';
import { computeMetrics } from '../src/metrics.ts';
import { LAYOUTS, LAYOUTS_JA, withRomaji } from '../src/layouts/index.ts';
import { kanaToRomaji, kanaToRomajiChunks, kunrei } from '../src/romaji/kunrei.ts';
import { azik } from '../src/romaji/azik.ts';
import { SAMPLE_TEXT_JA } from '../src/sample-text-ja.ts';

const geometry = buildGeometry('row-staggered');
const qwerty = LAYOUTS[0];
const table = kunrei();
const opts = { windowSize: 3, sfbHomeCost: true };
const ja = withRomaji(qwerty, table);

test('訓令式テーブルの基本形', () => {
  assert.equal(table.get('し'), 'si');
  assert.equal(table.get('つ'), 'tu');
  assert.equal(table.get('ふ'), 'hu');
  assert.equal(table.get('じ'), 'zi');
  assert.equal(table.get('ん'), 'nn');
  assert.equal(table.get('ぁ'), 'xa');
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

test('ローマ字テーブルを付けても刻印は英字配列のまま', () => {
  assert.equal(ja.legends.get('a'), 'a');
  assert.equal(ja.legends.get('-'), '-');
  assert.equal(ja.legends, qwerty.legends);
});

test('かな → ローマ字は最長一致で展開する', () => {
  assert.equal(kanaToRomaji('しゃっきん', table), 'syakkinn');
  assert.equal(kanaToRomaji('こーひー', table), 'ko-hi-');
  assert.equal(kanaToRomaji('abc', table), 'abc');
});

test('かな → ローマ字の展開単位を保持する', () => {
  assert.deepEqual(kanaToRomajiChunks('きゃや', table), [
    { kana: 'きゃ', roman: 'kya' },
    { kana: 'や', roman: 'ya' },
  ]);
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

test('同じテーブルを使う英字配列はステップ数が揃う', () => {
  const text = SAMPLE_TEXT_JA.replace(/\s+/g, '');
  const counts = LAYOUTS.map(
    (base) => computeMetrics(evaluate(text, withRomaji(base, table), geometry, opts), geometry).strokes,
  );
  assert.equal(new Set(counts).size, 1, `ステップ数が配列で異なる: ${counts}`);
});

test('日本語の全配列が評価でき、未対応の文字を残さない', () => {
  const text = SAMPLE_TEXT_JA.replace(/\s+/g, '');
  for (const layout of LAYOUTS_JA) {
    const t = evaluate(text, layout, geometry, opts);
    assert.equal(t.errors.length, 0, `${layout.name}: ${t.errors.join(' / ')}`);
    assert.equal(t.skipped, 0, `${layout.name} で ${t.skipped} 文字が打てない`);
  }
});

// AZIK（issue #33）。出典: https://github.com/toriwasa/azik-roman-table の azik_romantable.txt
const azikTable = azik();
const azikJa = withRomaji(qwerty, azikTable);

test('AZIK テーブルの基本形（出典の重複は打鍵数最小・同数なら先に現れた方を採る）', () => {
  // き ← ki(2) / kf(2) は同数。出典で ki が先に現れるので ki を採る
  assert.equal(azikTable.get('き'), 'ki');
  // しゃ ← sya(3) / xa(2) は xa が短いので xa を採る
  assert.equal(azikTable.get('しゃ'), 'xa');
  // ん ← q(1) / nn(2) は q が短いので q を採る
  assert.equal(azikTable.get('ん'), 'q');
  // ー ← -(1) / :(1) は同数。出典で - が先に現れるので - を採る（: は ANSI QWERTY に無い）
  assert.equal(azikTable.get('ー'), '-');
});

test('AZIK は複数かなを1綴りに落とす（訓令式には無い形）', () => {
  assert.equal(azikTable.get('かん'), 'kz');
  assert.equal(azikTable.get('きゃん'), 'kyz');
});

test('AZIK の促音は ; の1打のみ。子音を重ねた自動生成をしない', () => {
  assert.equal(azikTable.get('っ'), ';');
  // kunrei() と違い「っか」のような合成見出しは持たない
  assert.equal(azikTable.get('っか'), undefined);
  // 最長一致で「っ」と「か」に分解され、;+k+a の3打で打てる
  assert.equal(kanaToRomaji('っか', azikTable), ';ka');
});

test('JIS 配列前提の記号（「」『』・…‥〜）は落とす。句読点は kunrei と同じ綴りで残す', () => {
  for (const symbol of ['「', '」', '『', '』', '・', '…', '‥', '〜']) {
    assert.equal(azikTable.has(symbol), false, `${symbol} は落とすはずが残っている`);
  }
  assert.equal(azikTable.get('、'), ',');
  assert.equal(azikTable.get('。'), '.');
});

test('AZIK は逆写像で取りこぼしなく全かなを打てる（kunrei が持つ見出し全件で検証）', () => {
  const untypable: [string, string][] = [];
  for (const kana of table.keys()) {
    const romaji = kanaToRomaji(kana, azikTable);
    // 展開結果にかな・カタカナが残っていれば、その見出しは AZIK で打てていない
    if (/[぀-ヿ]/.test(romaji)) untypable.push([kana, romaji]);
  }
  assert.deepEqual(untypable, [], `AZIK で打てないかな: ${untypable.map(([k]) => k).join(' ')}`);
});

test('AZIK は QWERTY 刻印に無い文字を使わない', () => {
  const qwertyChars = new Set([...QWERTY_LEGEND.join('')]);
  for (const [kana, romaji] of azikTable) {
    for (const ch of romaji) {
      assert.ok(qwertyChars.has(ch), `${kana} の綴り "${romaji}" に QWERTY に無い "${ch}" が入っている`);
    }
  }
});

test('AZIK は日本語サンプルを全文字打てる', () => {
  const text = SAMPLE_TEXT_JA.replace(/\s+/g, '');
  const t = evaluate(text, azikJa, geometry, opts);
  assert.equal(t.skipped, 0);
  assert.equal(t.errors.length, 0);
});

test('AZIK は訓令式よりステップ数が少ない（2かな以上への短縮が効いているはず）', () => {
  const text = SAMPLE_TEXT_JA.replace(/\s+/g, '');
  const kunreiSteps = evaluate(text, ja, geometry, opts).strokes.length;
  const azikSteps = evaluate(text, azikJa, geometry, opts).strokes.length;
  assert.ok(azikSteps < kunreiSteps, `AZIK: ${azikSteps} 訓令式: ${kunreiSteps}`);
});
