import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildGeometry, JIS_FINGER_ASSIGNMENT, QWERTY_LEGEND } from '../shapes/geometry.ts';
import { generateTrace } from '#trace/generate.ts';
import { computeMetrics } from '#interpretation/metrics.ts';
import { LAYOUTS, LAYOUTS_JA, withRomaji } from '../layouts/index.ts';
import { kanaToRomaji, kanaToRomajiChunks, kunrei } from './kunrei.ts';
import { azik } from './azik.ts';
import { jlod } from './jlod.ts';
import { SAMPLE_TEXT_JA } from '../text/sample-ja.ts';

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

test('合成した配列は1かなを複数ステップへ展開する', () => {
  const t = generateTrace('し', ja, geometry, opts);
  assert.equal(t.strokes.length, 2);
  assert.deepEqual(
    t.strokes.map((s) => s.presses[0].keys[0].id),
    ['s', 'i'],
  );
});

test('ローマ字の各打鍵は展開前のかな単位を保持する', () => {
  const t = generateTrace('かし', ja, geometry, opts);
  assert.deepEqual(
    t.strokes.map((s) => [s.inputChar, s.char]),
    [
      ['か', 'k'],
      ['か', 'a'],
      ['し', 's'],
      ['し', 'i'],
    ],
  );
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
    { kana: 'きゃ', roman: 'kya', fromTable: true },
    { kana: 'や', roman: 'ya', fromTable: true },
  ]);
});

test('表に当たらない文字は、そのまま写した塊として印を付ける', () => {
  assert.deepEqual(kanaToRomajiChunks('かWー、', table), [
    { kana: 'か', roman: 'ka', fromTable: true },
    { kana: 'W', roman: 'W', fromTable: false },
    { kana: 'ー', roman: '-', fromTable: true },
    { kana: '、', roman: ',', fromTable: true },
  ]);
});

test('長音「ー」は数字段の - キーになる', () => {
  const t = generateTrace('ー', ja, geometry, opts);
  assert.equal(t.strokes[0].presses[0].keys[0].id, '-');
});

test('日本語サンプルは全文字が打鍵列に入る', () => {
  const text = SAMPLE_TEXT_JA.replace(/\s+/g, '');
  const t = generateTrace(text, ja, geometry, opts);
  assert.equal(t.skipped, 0);
  assert.equal(t.errors.length, 0);
  assert.ok(t.strokes.length > [...text].length, 'ローマ字展開で打鍵数が増える');
});

test('同じテーブルを使う英字配列はステップ数が揃う', () => {
  const text = SAMPLE_TEXT_JA.replace(/\s+/g, '');
  const counts = LAYOUTS.map((base) => computeMetrics(generateTrace(text, withRomaji(base, table), geometry, opts), geometry).strokes);
  assert.equal(new Set(counts).size, 1, `ステップ数が配列で異なる: ${counts}`);
});

test('日本語の全配列が評価でき、未対応の文字を残さない', () => {
  const text = SAMPLE_TEXT_JA.replace(/\s+/g, '');
  for (const layout of LAYOUTS_JA) {
    // JISの物理配列が要る配列（JISかな配列）は、JISの物理配列で測る
    const layoutGeometry = layout.requiresJisShape === true ? buildGeometry('jis-row-staggered', JIS_FINGER_ASSIGNMENT) : geometry;
    const t = generateTrace(text, layout, layoutGeometry, opts);
    assert.equal(t.errors.length, 0, `${layout.name}: ${t.errors.join(' / ')}`);
    assert.equal(t.skipped, 0, `${layout.name} で ${t.skipped} 文字が打てない`);
  }
});

// AZIK。出典: https://github.com/toriwasa/azik-roman-tableのazik_romantable.txt
const azikTable = azik();
const azikJa = withRomaji(qwerty, azikTable);

test('AZIKテーブルの基本形（出典の重複は打鍵数最小・同数なら先に現れた方を採る）', () => {
  // き ← ki(2) / kf(2)は同数。出典でkiが先に現れるのでkiを採る
  assert.equal(azikTable.get('き'), 'ki');
  // しゃ ← sya(3) / xa(2)はxaが短いのでxaを採る
  assert.equal(azikTable.get('しゃ'), 'xa');
  // ん ← q(1) / nn(2)はqが短いのでqを採る
  assert.equal(azikTable.get('ん'), 'q');
  // ー ← -(1) / :(1)は同数。出典で - が先に現れるので - を採る（: はANSI QWERTYに無い）
  assert.equal(azikTable.get('ー'), '-');
});

test('AZIKは複数かなを1綴りに落とす（訓令式には無い形）', () => {
  assert.equal(azikTable.get('かん'), 'kz');
  assert.equal(azikTable.get('きゃん'), 'kyz');
});

test('AZIKの促音は ; の1打のみ。子音を重ねた自動生成をしない', () => {
  assert.equal(azikTable.get('っ'), ';');
  // kunrei()と違い「っか」のような合成見出しは持たない
  assert.equal(azikTable.get('っか'), undefined);
  // 最長一致で「っ」と「か」に分解され、;+k+aの3打で打てる
  assert.equal(kanaToRomaji('っか', azikTable), ';ka');
});

test('AZIKは出典の `[` `]` の「」と句読点を残し、・は `/` を足す。ほかの記号は落とす', () => {
  for (const symbol of ['『', '』', '…', '‥', '〜']) {
    assert.equal(azikTable.has(symbol), false, `${symbol} は落とすはずが残っている`);
  }
  assert.equal(azikTable.get('、'), ',');
  assert.equal(azikTable.get('。'), '.');
  assert.equal(azikTable.get('「'), '[');
  assert.equal(azikTable.get('」'), ']');
  // 出典で・はz/にだけある。zで始まる綴りは採らず、ほかのテーブルと同じ/にする
  assert.equal(azikTable.get('・'), '/');
});

test('AZIKは逆写像で取りこぼしなく全かなを打てる（kunreiが持つ見出し全件で検証）', () => {
  const untypable: [string, string][] = [];
  for (const kana of table.keys()) {
    const romaji = kanaToRomaji(kana, azikTable);
    // 展開結果にかな・カタカナが残っていれば、その見出しはAZIKで打てていない
    if (/[぀-ヿ]/.test(romaji)) untypable.push([kana, romaji]);
  }
  assert.deepEqual(untypable, [], `AZIKで打てないかな: ${untypable.map(([k]) => k).join(' ')}`);
});

test('AZIKはQWERTY刻印に無い文字を使わない', () => {
  const qwertyChars = new Set([...QWERTY_LEGEND.join('')]);
  for (const [kana, romaji] of azikTable) {
    for (const ch of romaji) {
      assert.ok(qwertyChars.has(ch), `${kana} の綴り "${romaji}" にQWERTYに無い "${ch}" が入っている`);
    }
  }
});

test('AZIKは日本語サンプルを全文字打てる', () => {
  const text = SAMPLE_TEXT_JA.replace(/\s+/g, '');
  const t = generateTrace(text, azikJa, geometry, opts);
  assert.equal(t.skipped, 0);
  assert.equal(t.errors.length, 0);
});

test('AZIKは訓令式よりステップ数が少ない（2かな以上への短縮が効いているはず）', () => {
  const text = SAMPLE_TEXT_JA.replace(/\s+/g, '');
  const kunreiSteps = generateTrace(text, ja, geometry, opts).strokes.length;
  const azikSteps = generateTrace(text, azikJa, geometry, opts).strokes.length;
  assert.ok(azikSteps < kunreiSteps, `AZIK: ${azikSteps} 訓令式: ${kunreiSteps}`);
});

test('テーブルは「」・を日本語IMEの既定の綴り [ ] / で持つ', () => {
  assert.equal(table.get('「'), '[');
  assert.equal(table.get('」'), ']');
  assert.equal(table.get('・'), '/');
  // 『』は専用の見出しを持たず、評価側が「」の別名として打つ。…は綴りを持たない
  for (const symbol of ['『', '』', '…']) assert.equal(table.has(symbol), false, symbol);
});

test('促音の自動生成は記号の見出しから作らない', () => {
  for (const heading of ['っ「', 'っ」', 'っ・', 'っー', 'っ、', 'っ。']) assert.equal(table.has(heading), false, heading);
  assert.equal(table.get('っか'), 'kka');
});

test('「」・を含む文は、ローマ字を経る配列で [ ] / を打つ', () => {
  const t = generateTrace('あ「い」・', ja, geometry, opts);
  assert.equal(t.skipped, 0);
  assert.deepEqual(
    t.strokes.map((stroke) => stroke.presses.flatMap((press) => press.keys.map((key) => key.id))),
    [['a'], ['['], ['i'], [']'], ['/']],
  );
  assert.deepEqual(
    t.strokes.map((stroke) => stroke.inputChar),
    ['あ', '「', 'い', '」', '・'],
  );
});

test('『』は「」と同じ打鍵で、inputCharは元の文字を保つ', () => {
  const single = generateTrace('「あ」', ja, geometry, opts);
  const double = generateTrace('『あ』', ja, geometry, opts);
  assert.equal(double.skipped, 0);
  const keys = (trace: typeof single) => trace.strokes.map((stroke) => stroke.presses.flatMap((press) => press.keys.map((key) => key.id)));
  assert.deepEqual(keys(double), keys(single));
  assert.deepEqual(
    double.strokes.map((stroke) => stroke.inputChar),
    ['『', 'あ', '』'],
  );
});

test('ローマ字テーブルが『を見出しに持つ時は別名を当てず、その綴りで打つ', () => {
  const own = withRomaji(qwerty, new Map([...table, ['『', 'q']]));
  const t = generateTrace('『「', own, geometry, opts);
  assert.deepEqual(
    t.strokes.map((stroke) => stroke.presses.flatMap((press) => press.keys.map((key) => key.id))),
    [['q'], ['[']],
  );
});

test('…は綴りを持たず、打てない記号に数える', () => {
  const t = generateTrace('あ…', ja, geometry, opts);
  assert.equal(t.skipped, 1);
  assert.deepEqual(t.skippedByKind, { kanji: 0, symbol: 1, other: 0 });
});

test('物理キーを持たない配列では「」・を打てない文字に数える', () => {
  const oonishi = LAYOUTS_JA.find((layout) => layout.id === 'oonishi')!;
  const custom = LAYOUTS_JA.find((layout) => layout.id === 'oonishi-custom')!;
  // 大西配列は [ ] / のキーを持たない。『』も「」を打てないので打てない文字に数える
  assert.equal(generateTrace('「」・『』', oonishi, geometry, opts).skipped, 5);
  // TK音直入力法は / のキーだけを持つ
  const partial = generateTrace('「」・『』', custom, geometry, opts);
  assert.equal(partial.skipped, 4);
  assert.equal(partial.strokes.length, 1);
});

// JLOD。綴りはDvorakの文字で持つ。例は解説ページ（https://www.mikage.to/jlod/）の入力例
const jlodTable = jlod();
const dvorak = LAYOUTS.find((layout) => layout.id === 'dvorak')!;
const jlodJa = withRomaji(dvorak, jlodTable);

test('JLODテーブルの代表の綴り（Dvorakの文字）', () => {
  assert.equal(jlodTable.get('か'), 'ca');
  assert.equal(jlodTable.get('き'), 'ci');
  assert.equal(jlodTable.get('こう'), 'c,');
  assert.equal(jlodTable.get('かい'), "c'");
  assert.equal(jlodTable.get('かん'), 'c;');
  assert.equal(jlodTable.get('きゃ'), 'cga');
  assert.equal(jlodTable.get('しゃ'), 'sha');
  assert.equal(jlodTable.get('ん'), 'nn');
  assert.equal(jlodTable.get('っ'), "'");
  assert.equal(jlodTable.get('ぁ'), 'la');
});

test('JLODの綴りは解説ページの入力例と一致する', () => {
  const spell = (text: string) => kanaToRomaji(text, jlodTable).toUpperCase();
  assert.equal(spell('てんし'), 'TJSI');
  assert.equal(spell('て') + spell('ん') + spell('し'), 'TENNSI');
  assert.equal(spell('かーど'), 'CA-DO');
  assert.equal(spell('あんき'), ';CI');
  assert.equal(spell('かこ'), 'CACO');
  assert.equal(spell('き') + spell('く'), 'CICU');
  assert.equal(spell('よる'), 'VORU');
  assert.equal(spell('やかん'), 'VAC;');
  assert.equal(spell('ぴんく'), 'FXCU');
});

test('JLODの促音はアポストロフィの1打のみ。子音を重ねた自動生成をしない', () => {
  assert.equal(jlodTable.get('っ'), "'");
  assert.equal(jlodTable.has('っか'), false);
  assert.equal(kanaToRomaji('っか', jlodTable), "'ca");
});

test('JLODは複数かなを1綴りに落とす（撥音・二重母音・母音+き/く/つ/っ・頻出拗音）', () => {
  const expected: Record<string, string> = {
    こん: 'cq',
    かん: 'c;',
    きゃん: 'cg;',
    かつ: 'cfa',
    かっ: 'cf;',
    かく: "cf'",
    きゅう: 'cc',
    しゅう: 'st',
    ぴゅく: 'frg',
  };
  for (const [kana, romaji] of Object.entries(expected)) assert.equal(jlodTable.get(kana), romaji, kana);
});

test('JLODは同じキー列の後の行を採る。句読点・長音・中点・括弧の綴り', () => {
  assert.equal(jlodTable.get('、'), ',');
  assert.equal(jlodTable.get('。'), '.');
  assert.equal(jlodTable.get('ー'), '-');
  assert.equal(jlodTable.get('・'), '/');
  assert.equal(jlodTable.get('「'), '[');
  assert.equal(jlodTable.get('」'), ']');
});

test('JLODは定型句の節を入れない', () => {
  for (const phrase of ['いたしました', 'になります', 'よろしく', 'おねがい', 'なっております', 'かくにん', 'でしょうか']) {
    assert.equal(jlodTable.has(phrase), false, phrase);
  }
  for (const kana of jlodTable.keys()) assert.ok([...kana].length <= 3, `${kana} が3文字を超える`);
});

test('JLODは出典でヵ・ヶだけを落とす。ヴは持つ', () => {
  for (const kana of ['ヵ', 'ヶ']) assert.equal(jlodTable.has(kana), false, kana);
  assert.equal(jlodTable.get('ヴ'), 'vvu');
});

test('JLODは逆写像で取りこぼしなく全かなを打てる（kunreiが持つ見出し全件で検証）', () => {
  const untypable: [string, string][] = [];
  for (const kana of table.keys()) {
    const romaji = kanaToRomaji(kana, jlodTable);
    if (/[぀-ヿ]/.test(romaji)) untypable.push([kana, romaji]);
  }
  assert.deepEqual(untypable, [], `JLODで打てないかな: ${untypable.map(([k]) => k).join(' ')}`);
});

test('JLODの綴りは、keydistのDvorak配列にあるキーだけで書かれる', () => {
  for (const [kana, romaji] of jlodTable) {
    for (const ch of romaji) assert.ok(dvorak.map.has(ch), `${kana} の綴り "${romaji}" にDvorakに無い "${ch}" が入っている`);
  }
});

test('JLODは日本語サンプルをDvorak配列で全文字打てる', () => {
  const text = SAMPLE_TEXT_JA.replace(/\s+/g, '');
  const t = generateTrace(text, jlodJa, geometry, opts);
  assert.equal(t.skipped, 0);
  assert.equal(t.errors.length, 0);
});

test('JLODは日本語サンプルの打鍵のステップ数を出せる', () => {
  const text = SAMPLE_TEXT_JA.replace(/\s+/g, '');
  const steps = generateTrace(text, jlodJa, geometry, opts).strokes.length;
  assert.ok(steps > 0, `JLOD: ${steps}`);
});
