import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildGeometry } from '../src/geometry.ts';
import { evaluate, type Options } from '../src/evaluate.ts';
import { computeMetrics } from '../src/metrics.ts';
import { LAYOUT_BY_ID, type Layout, withCombos, withRomaji } from '../src/layouts/index.ts';
import { kunrei } from '../src/romaji/kunrei.ts';

const geometry = buildGeometry('row-staggered');
const qwerty = LAYOUT_BY_ID.get('qwerty')!;
const opts = (o: Partial<Options> = {}): Options => ({
  windowSize: 3,
  sfbHomeCost: true,
  ...o,
});

const near = (a: number, b: number, msg?: string) =>
  assert.ok(Math.abs(a - b) < 1e-9, `${msg ?? ''} expected ${b}, got ${a}`);

const totalOf = (text: string, o: Partial<Options> = {}) =>
  computeMetrics(evaluate(text, qwerty, geometry, opts(o)), geometry).totalUnits;

test('初回打鍵はホームからの距離になる', () => {
  // j は右人差し指のホームキー
  near(totalOf('j'), 0, 'j');
  // h はホームの 1u 左
  near(totalOf('h'), 1, 'h');
});

test('位置スナップショットは打鍵直後の指位置を記録する', () => {
  const t = evaluate('h', qwerty, geometry, opts());
  const h = geometry.keys.get('h')!;
  assert.deepEqual(t.strokes[0].positions.RI, { x: h.x, y: h.y });
});

test('g=0（同指連続）はキー間距離。ホームキーでも加算する', () => {
  // h(1u) → j: 同指連続なので min を取らず d(h,j)=1u
  near(totalOf('hj'), 2, 'hj');
});

test('sfbHomeCost=false のとき g=0 のホームキー打鍵は 0', () => {
  near(totalOf('hj', { sfbHomeCost: false }), 1, 'hj');
});

test('sfbHomeCost はホームキー以外の同指連続を変えない', () => {
  // h → y は両方とも右人差し指、y はホームキーではない
  assert.equal(totalOf('hy', { sfbHomeCost: true }), totalOf('hy', { sfbHomeCost: false }));
});

test('窓の内側では残った場合と戻った場合の小さい方を採る', () => {
  // y(上段 col5) → 他指 1 打 → u(上段 col6)。ともに右人差し指。
  //   d_stay = dist(y, u) = 1
  //   d_home = dist(j, u) = √(0.25² + 1²) ≈ 1.0308
  // 窓内なので小さい方の d_stay = 1 が採られる
  const t = evaluate('yau', qwerty, geometry, opts({ windowSize: 3 }));
  const last = t.strokes[2];
  assert.equal(last.char, 'u');
  assert.equal(last.presses[0].gap, 1);
  near(last.distance, 1, 'u');
});

test('窓の外では必ずホームからの距離になる', () => {
  // y → 他指 4 打 → u。windowSize=3 なので g=4 > N
  const t = evaluate('yasdfu', qwerty, geometry, opts({ windowSize: 3 }));
  const last = t.strokes[5];
  assert.equal(last.char, 'u');
  assert.equal(last.presses[0].gap, 4);
  const home = geometry.homes.RI;
  const u = geometry.grid[1][6];
  near(last.distance, Math.hypot(home.x - u.x, home.y - u.y), 'u');
});

test('g は全打鍵を数える（その指の打鍵だけではない）', () => {
  const t = evaluate('yasu', qwerty, geometry, opts());
  assert.equal(t.strokes[3].presses[0].gap, 2);
});

test('N を大きくすると総移動距離は単調に減少する', () => {
  const text = 'the quick brown fox jumps over the lazy dog';
  let last = Infinity;
  for (const n of [0, 1, 2, 3, 5, 8, 12]) {
    const d = totalOf(text, { windowSize: n });
    assert.ok(d <= last + 1e-9, `N=${n}: ${d} > ${last}`);
    last = d;
  }
});

test('配列に無い文字は skipped に数える', () => {
  const t = evaluate('a漢b', qwerty, geometry, opts());
  assert.equal(t.strokes.length, 2);
  assert.equal(t.skipped, 1);
});

test('段ずれ量が ANSI の修飾キー幅と一致する', () => {
  // 上段 q は +0.5u、ホーム段 a は +0.75u、下段 z は +1.25u
  near(geometry.grid[1][0].x, 0.5, 'q');
  near(geometry.grid[2][0].x, 0.75, 'a');
  near(geometry.grid[3][0].x, 1.25, 'z');
});

test('ホーム段だけを打つと隣接指の超過はほぼ 0 になる', () => {
  // 生の距離ではなくホーム間隔 1u を引いた超過を見る（仕様 §11.6）
  const m = computeMetrics(evaluate('asdf jkl;', qwerty, geometry, opts()), geometry);
  for (const stat of m.adjacent) {
    assert.ok(
      Math.abs(stat.meanExcess) < 0.5,
      `${stat.pair.join('-')}: ${stat.meanExcess}`,
    );
  }
});

test('空白は右親指の打鍵として数え、移動距離は 0 になる', () => {
  const t = evaluate(' ', qwerty, geometry, opts());
  assert.equal(t.strokes.length, 1);
  assert.equal(t.skipped, 0);
  assert.equal(t.strokes[0].presses[0].finger, 'RT');
  near(t.strokes[0].distance, 0, 'space');
});

test('空白が g のカウントに入る', () => {
  // 'y' → 空白 → 'u'。空白を落とすと g=0（同指連続）になってしまう
  const t = evaluate('y u', qwerty, geometry, opts());
  assert.equal(t.strokes.length, 3);
  assert.equal(t.strokes[2].char, 'u');
  assert.equal(t.strokes[2].presses[0].gap, 1);
});

test('親指の連打でも距離は増えない', () => {
  near(totalOf('   '), 0, 'spaces');
});

// ---- 同時押しと前置・後置シフト ----

const chord = (map: Record<string, string[][]>): Layout => ({
  id: 'test', name: 'test',
  map: new Map(Object.entries(map)),
  legends: new Map(),
});

test('同時押しは 1 ステップ、押下は押したキーの数だけ数える', () => {
  const l = chord({ x: [['space', 'q']] });
  const m = computeMetrics(evaluate('x', l, geometry, opts()), geometry);
  assert.equal(m.strokes, 1);
  assert.equal(m.presses, 2);
});

test('旧親指キー id の space は thumb-r として解決する', () => {
  const alias = chord({ x: [['space']] });
  const canonical = chord({ x: [['thumb-r']] });
  const aliasTrace = evaluate('x', alias, geometry, opts());
  const canonicalTrace = evaluate('x', canonical, geometry, opts());

  assert.equal(aliasTrace.errors.length, 0);
  assert.equal(aliasTrace.strokes[0].presses[0].keys[0].id, 'thumb-r');
  assert.deepEqual(aliasTrace.strokes, canonicalTrace.strokes);
});

test('前置シフトは 2 ステップになる', () => {
  const l = chord({ x: [['space'], ['q']] });
  const m = computeMetrics(evaluate('x', l, geometry, opts()), geometry);
  assert.equal(m.strokes, 2);
  assert.equal(m.presses, 2);
});

test('後置シフトも 2 ステップになる', () => {
  const l = chord({ x: [['q'], ['space']] });
  const m = computeMetrics(evaluate('x', l, geometry, opts()), geometry);
  assert.equal(m.strokes, 2);
  assert.equal(m.presses, 2);
});

test('同時押しと順次打鍵の差はステップ数に出る。押下数と総距離は変わらない', () => {
  const text = 'xxxx';
  const a = computeMetrics(evaluate(text, chord({ x: [['space', 'q']] }), geometry, opts()), geometry);
  const b = computeMetrics(evaluate(text, chord({ x: [['space'], ['q']] }), geometry, opts()), geometry);
  assert.equal(b.strokes, a.strokes * 2);
  assert.equal(b.presses, a.presses);
  near(b.totalUnits, a.totalUnits, 'total');
});

test('ステップ内の距離は各指の単純和になる', () => {
  // 左小指 q と右小指 p を同時に押す。どちらもホーム段から 1 行上
  const l = chord({ x: [['q', 'p']] });
  const t = evaluate('x', l, geometry, opts());
  const step = t.strokes[0];
  assert.equal(step.presses.length, 2);
  near(step.distance, step.presses[0].distance + step.presses[1].distance, 'sum');
});

test('1 本の指で複数キーを押す場合は重心を目標位置にする', () => {
  // r2c0(a) と r1c0(q) はどちらも左小指。指はその間を押す
  const t = evaluate('x', chord({ x: [['a', 'q']] }), geometry, opts());
  assert.equal(t.errors.length, 0);
  assert.equal(t.strokes[0].presses.length, 1);

  const press = t.strokes[0].presses[0];
  assert.equal(press.finger, 'LP');
  assert.equal(press.keys.length, 2);
  const a = geometry.grid[2][0];
  const q = geometry.grid[1][0];
  near(press.target.x, (a.x + q.x) / 2, 'centroid x');
  near(press.target.y, (a.y + q.y) / 2, 'centroid y');
  // ホーム（a）から重心までの距離が計上される
  near(press.distance, Math.hypot(a.x - press.target.x, a.y - press.target.y), 'distance');
});

test('重心を押した後、その指は重心に残る', () => {
  // 同じ同時押しを 2 回続ける。2 回目は移動が起きない
  const t = evaluate('xx', chord({ x: [['a', 'q']] }), geometry, opts());
  assert.equal(t.strokes[1].presses[0].gap, 0);
  near(t.strokes[1].distance, 0, 'second press');
});

test('1 本の指で複数キーを押しても押下数はキーの数だけ数える', () => {
  const m = computeMetrics(evaluate('x', chord({ x: [['a', 'q']] }), geometry, opts()), geometry);
  assert.equal(m.strokes, 1);
  assert.equal(m.presses, 2);
});

test('存在しないキー id はエラーとして記録する', () => {
  const t = evaluate('x', chord({ x: [['no-such-key']] }), geometry, opts());
  assert.equal(t.errors.length, 1);
  assert.match(t.errors[0], /no-such-key/);
});

// ---- 複数文字の見出し ----

test('「きゃ」を見出しに持つ配列は 1 単位として当てる', () => {
  const l: Layout = {
    id: 't', name: 't',
    map: new Map([['き', [['d']]], ['ゃ', [['k']]], ['きゃ', [['f']]]]),
    legends: new Map(),
    maxCharLength: 2,
  };
  const t = evaluate('きゃ', l, geometry, opts());
  assert.equal(t.strokes.length, 1);
  assert.equal(t.strokes[0].char, 'きゃ');
});

test('「きゃ」を見出しに持たない配列は「き」「ゃ」に分解する', () => {
  const l: Layout = {
    id: 't', name: 't',
    map: new Map([['き', [['d']]], ['ゃ', [['k']]]]),
    legends: new Map(),
  };
  const t = evaluate('きゃ', l, geometry, opts());
  assert.equal(t.strokes.length, 2);
  assert.deepEqual(t.strokes.map((s) => s.char), ['き', 'ゃ']);
});

test('最長一致は後続の文字を食い過ぎない', () => {
  const l: Layout = {
    id: 't', name: 't',
    map: new Map([['き', [['d']]], ['ゃ', [['k']]], ['きゃ', [['f']]], ['く', [['j']]]]),
    legends: new Map(),
    maxCharLength: 2,
  };
  const t = evaluate('きゃく', l, geometry, opts());
  assert.deepEqual(t.strokes.map((s) => s.char), ['きゃ', 'く']);
});

test('ヤ行コンボは拗音の内部だけで発火し、単独ヤ行を奪わない（#42）', () => {
  const combo = LAYOUT_BY_ID.get('oonishi-custom-combo')!;
  const cases: [string, string[]][] = [
    ['やく', ['y', 'aku']],
    ['やま', ['y', 'a', 'm', 'a']],
    ['にゅうりょく', ['n', 'yuu', 'r', 'yoku']],
    ['きゃ', ['k', 'ya']],
    ['んや', ['nn', 'y', 'a']],
  ];

  for (const [text, expected] of cases) {
    const trace = evaluate(text, combo, geometry, opts());
    assert.deepEqual(trace.strokes.map((stroke) => stroke.char), expected, text);
    assert.equal(trace.skipped, 0, text);
  }

  const base = LAYOUT_BY_ID.get('oonishi')!;
  const generic = withRomaji(
    withCombos('generic', 'generic', base, [
      ['yaku', ['i', 'a', 'x']],
      ['aku', ['a', 'x']],
    ]),
    kunrei(),
  );
  const restricted = withRomaji(
    withCombos('restricted', 'restricted', base, [
      ['yaku', ['i', 'a', 'x'], { youonOnly: true }],
      ['aku', ['a', 'x']],
    ]),
    kunrei(),
  );

  assert.deepEqual(evaluate('やく', generic, geometry, opts()).strokes.map((s) => s.char), ['yaku']);
  assert.deepEqual(evaluate('やく', restricted, geometry, opts()).strokes.map((s) => s.char), ['y', 'aku']);
});
