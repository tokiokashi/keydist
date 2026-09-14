import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildGeometry, ALL_FINGERS } from '../src/geometry.ts';
import { evaluate, type Options } from '../src/evaluate.ts';
import { computeMetrics, homeSpacing } from '../src/metrics.ts';
import { LAYOUTS_JA, LAYOUT_BY_ID, type Layout } from '../src/layouts/index.ts';
import { dist } from '../src/geometry.ts';
import { SAMPLE_TEXT_JA, SAMPLE_TEXT_JA_LEGACY } from '../src/sample-text-ja.ts';

const geometry = buildGeometry('row-staggered');
// LAYOUT_BY_ID の 'qwerty' はローマ字テーブル付きの JA 版で上書きされる。
// ローマ字表に無い ascii はそのまま通るので、英字のテストにもそのまま使える。
const qwerty = LAYOUT_BY_ID.get('qwerty')!;
const opts = (o: Partial<Options> = {}): Options => ({
  windowSize: 3,
  sfbHomeCost: true,
  ...o,
});

const near = (a: number, b: number, msg?: string) =>
  assert.ok(Math.abs(a - b) < 1e-9, `${msg ?? ''} expected ${b}, got ${a}`);

test('入力文字数はローマ字展開前の文字数になる', () => {
  // 「し」は si に展開されて 2 打鍵になるが、入力文字数は展開前の 1
  const t = evaluate('し', qwerty, geometry, opts());
  assert.equal(t.strokes.length, 2);
  assert.equal(t.inputChars, 1);
});

test('旧日本語サンプルは過去の測定用に290文字で残る', () => {
  assert.equal(SAMPLE_TEXT_JA_LEGACY.replace(/\s+/g, '').length, 290);
});

test('スキップされた文字も入力文字数に数える', () => {
  // 分母を「打てた文字数」にすると配列ごとに分母が動いてしまうため、
  // 展開前の原文の文字数で固定する（skip の有無に関わらない）
  const t = evaluate('a漢b', qwerty, geometry, opts());
  assert.equal(t.skipped, 1);
  assert.equal(t.inputChars, 3);
});

test('1 文字あたりの距離は打鍵数ではなく入力文字数を分母にする', () => {
  // 「し」→ si（2 打鍵、入力文字数は 1）
  const m = computeMetrics(evaluate('し', qwerty, geometry, opts()), geometry);
  assert.equal(m.strokes, 2);
  assert.equal(m.inputChars, 1);
  near(m.perCharUnits, m.totalUnits, '1文字あたり = 総距離 / 1');
  near(m.meanPerStroke, m.totalUnits / 2, '1打鍵あたり = 総距離 / 2');
  // 打鍵数を分母にすると、展開で打鍵が増えた分だけ小さく出てしまう
  near(m.perCharUnits, m.meanPerStroke * 2, '打鍵数分母では展開の効果が消える');
});

test('コンボ相当（複数文字を 1 見出しで打つ）でも入力文字数は変わらない', () => {
  // 「きゃ」を 1 ステップで打てる配列でも、入力文字数は原文通り 2
  const l: Layout = {
    id: 't', name: 't',
    map: new Map([['き', [['d']]], ['ゃ', [['k']]], ['きゃ', [['f']]]]),
    legends: new Map(),
    maxCharLength: 2,
  };
  const combo = computeMetrics(evaluate('きゃ', l, geometry, opts()), geometry);
  assert.equal(combo.strokes, 1);
  assert.equal(combo.inputChars, 2);

  const split = computeMetrics(
    evaluate('きゃ', { ...l, map: new Map([['き', [['d']]], ['ゃ', [['k']]]]) }, geometry, opts()),
    geometry,
  );
  assert.equal(split.strokes, 2);
  assert.equal(split.inputChars, 2);

  // 打鍵数は減っても入力文字数は同じなので、削減の効果が 1 文字あたりの距離に出る
  assert.ok(combo.perCharUnits <= split.perCharUnits + 1e-9);
});

test('1 文字あたりのアクション数はステップ数を入力文字数で割った値になる', () => {
  // 「し」→ si（2 打鍵、入力文字数は 1）
  const m = computeMetrics(evaluate('し', qwerty, geometry, opts()), geometry);
  assert.equal(m.strokes, 2);
  assert.equal(m.inputChars, 1);
  near(m.perCharSteps, 2, 'アクション/文字 = ステップ数 / 入力文字数');
});

test('1 文字あたりの押下キー数は押下数を入力文字数で割った値になる', () => {
  // 「し」→ si（同時押しを含まないので押下数もステップ数と同じ 2）
  const m = computeMetrics(evaluate('し', qwerty, geometry, opts()), geometry);
  assert.equal(m.presses, 2);
  near(m.perCharPresses, 2, '押下/文字 = 押下数 / 入力文字数');
});

test('コンボはアクション/文字を下げるが、押下/文字は下げない', () => {
  // 「きゃ」を 3 キー同時押しの 1 ステップで打てる配列と、2 ステップに分けて打つ配列を比較する。
  // コンボは押すキー自体は減らさないため、押下数は両者で変わらない
  const combo: Layout = {
    id: 'combo', name: 'combo',
    map: new Map([['きゃ', [['d', 'k', 'l']]]]),
    legends: new Map(),
    maxCharLength: 2,
  };
  const split: Layout = {
    id: 'split', name: 'split',
    map: new Map([['き', [['d']]], ['ゃ', [['k', 'l']]]]),
    legends: new Map(),
    maxCharLength: 2,
  };

  const comboMetrics = computeMetrics(evaluate('きゃ', combo, geometry, opts()), geometry);
  const splitMetrics = computeMetrics(evaluate('きゃ', split, geometry, opts()), geometry);

  assert.equal(comboMetrics.strokes, 1);
  assert.equal(splitMetrics.strokes, 2);
  assert.equal(comboMetrics.presses, splitMetrics.presses, 'コンボでも押下キー数の合計は変わらない');

  assert.ok(comboMetrics.perCharSteps < splitMetrics.perCharSteps, 'コンボはアクション/文字を下げる');
  near(comboMetrics.perCharPresses, splitMetrics.perCharPresses, '押下/文字はコンボで変わらない');
});

test('コンボの定義数・命中定義数・延べ命中回数を分けて数える（#36）', () => {
  const combo = LAYOUT_BY_ID.get('oonishi-custom-combo')!;
  const trace = evaluate('やく やま にゅうりょく きゃ', combo, geometry, opts());
  const m = computeMetrics(trace, geometry);

  assert.deepEqual(trace.comboHits, ['aku', 'yuu', 'yoku', 'ya']);
  assert.deepEqual(m.combos, { definitions: 73, matched: 4, hits: 4 });
});

test('指ごとの押下数はサンプル文の実測値と一致する', () => {
  const text = SAMPLE_TEXT_JA.replace(/\s+/g, '');
  const qwerty = LAYOUTS_JA.find((l) => l.id === 'qwerty')!;
  const oonishi = LAYOUTS_JA.find((l) => l.id === 'oonishi')!;
  const naginata = LAYOUTS_JA.find((l) => l.id === 'naginata-v18')!;
  const qwertyMetrics = computeMetrics(evaluate(text, qwerty, geometry, opts()), geometry);
  const oonishiMetrics = computeMetrics(evaluate(text, oonishi, geometry, opts()), geometry);
  const naginataMetrics = computeMetrics(evaluate(text, naginata, geometry, opts()), geometry);

  assert.equal(text.length, 1676);
  assert.equal(qwertyMetrics.perFingerPresses.LP, 443);
  assert.equal(oonishiMetrics.perFingerPresses.LR, 304);
  assert.equal(naginataMetrics.perFingerPresses.RT, 590);
});

test('指ごとの押下数の合計は総押下数と一致する', () => {
  // マトリックスは指ごとの押下数を並べる図なので、そこに出ない押下があってはいけない。
  // 親指のように移動距離が 0 の指を列から落とすと、この和が崩れる
  const text = SAMPLE_TEXT_JA.replace(/\s+/g, '');
  for (const layout of LAYOUTS_JA) {
    const m = computeMetrics(evaluate(text, layout, geometry, opts()), geometry);
    const sum = ALL_FINGERS.reduce((a, f) => a + m.perFingerPresses[f], 0);
    assert.equal(sum, m.presses, `${layout.id} の指ごとの押下数の合計`);
  }
});

test('全打鍵で指の相対位置が変わらなければ隣接指の標準偏差は 0 になる', () => {
  // 'j' は右人差し指のホームキー。連打では他の指は一切動かない
  const m = computeMetrics(evaluate('jjjj', qwerty, geometry, opts()), geometry);
  for (const stat of m.adjacent) {
    near(stat.stdDev, 0, stat.pair.join('-'));
    near(stat.maxExcess, stat.meanExcess, `${stat.pair.join('-')} max`);
    // ホームから動いていないので超過は 0（仕様 §11.6）
    near(stat.meanExcess, 0, `${stat.pair.join('-')} excess`);
  }
});

test('どの物理形状でもホーム段だけを打てば隣接指の超過は 0 になる', () => {
  // 引くのは定数 1u ではなくペアごとの実ホーム間隔なので、列ずれのある形状でも
  // ホームに居る状態がちょうど 0 になる（仕様 §11.6）
  for (const shape of ['row-staggered', 'ortholinear', 'column-staggered'] as const) {
    const g = buildGeometry(shape);
    const m = computeMetrics(evaluate('asdf jkl;', qwerty, g, opts()), g);
    for (const stat of m.adjacent) {
      near(stat.meanExcess, 0, `${shape} ${stat.pair.join('-')} mean`);
      near(stat.maxExcess, 0, `${shape} ${stat.pair.join('-')} max`);
    }
  }
});

test('隣接指の標準偏差は打鍵ごとのスナップショットから求めた分散の平方根と一致する', () => {
  const text = 'asdf jkl; yhn';
  const trace = evaluate(text, qwerty, geometry, opts());
  const m = computeMetrics(trace, geometry);

  for (const stat of m.adjacent) {
    // metrics.ts とは独立に、Trace.strokes の位置スナップショットから直接計算する
    const samples = trace.strokes.map(
      (s) =>
        dist(s.positions[stat.pair[0]], s.positions[stat.pair[1]]) -
        homeSpacing(geometry, stat.pair),
    );
    const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
    const variance = samples.reduce((a, b) => a + (b - mean) ** 2, 0) / samples.length;
    near(stat.meanExcess, mean, `${stat.pair.join('-')} mean`);
    near(stat.stdDev, Math.sqrt(variance), `${stat.pair.join('-')} stdDev`);
    near(stat.maxExcess, Math.max(...samples), `${stat.pair.join('-')} max`);
  }
});
