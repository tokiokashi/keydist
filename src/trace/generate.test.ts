import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildGeometry } from '#input/shapes/geometry.ts';
import { generateTrace, type TracePolicy } from './generate.ts';
import { computeMetrics } from '#interpretation/metrics.ts';
import { compileSequenceInputAlternative } from '#input/semantics/index.ts';
import {
  faceFromEntries,
  fromFaces,
  fromKana,
  LAYOUT_BY_ID,
  type Layout,
  withCombos,
  withRomaji,
  withThumbShiftAlternatives,
} from '#input/layouts/index.ts';
import { kunrei } from '#input/romaji/kunrei.ts';

const geometry = buildGeometry('row-staggered');
const qwerty = LAYOUT_BY_ID.get('qwerty')!;
const opts = (o: Partial<TracePolicy> = {}): TracePolicy => ({
  windowSize: 3,
  sfbHomeCost: true,
  ...o,
});

const near = (a: number, b: number, msg?: string) => assert.ok(Math.abs(a - b) < 1e-9, `${msg ?? ''} expected ${b}, got ${a}`);

const totalOf = (text: string, o: Partial<TracePolicy> = {}) => computeMetrics(generateTrace(text, qwerty, geometry, opts(o)), geometry).totalUnits;

test('初回打鍵はホームからの距離になる', () => {
  // jは右人差し指のホームキー
  near(totalOf('j'), 0, 'j');
  // hはホームの1u左
  near(totalOf('h'), 1, 'h');
});

test('位置スナップショットは打鍵直後の指位置を記録する', () => {
  const t = generateTrace('h', qwerty, geometry, opts());
  const h = geometry.keys.get('h')!;
  assert.deepEqual(t.strokes[0].positions.RI, { x: h.x, y: h.y });
});

test('g=0（同指連続）はキー間距離。ホームキーでも加算する', () => {
  // h(1u) → j: 同指連続なのでminを取らずd(h,j)=1u
  near(totalOf('hj'), 2, 'hj');
});

test('sfbHomeCost=falseのときg=0のホームキー打鍵は0', () => {
  near(totalOf('hj', { sfbHomeCost: false }), 1, 'hj');
});

test('sfbHomeCostはホームキー以外の同指連続を変えない', () => {
  // h → yは両方とも右人差し指、yはホームキーではない
  assert.equal(totalOf('hy', { sfbHomeCost: true }), totalOf('hy', { sfbHomeCost: false }));
});

test('N文字先までは残った場合と戻った場合の小さい方を採る', () => {
  // y → a → uで、uはyから2文字先。
  //   d_stay = dist(y, u) = 1
  //   d_home = dist(j, u) = √(0.25² + 1²) ≈ 1.0308
  // N=2なら小さい方のd_stay = 1が採られる
  const t = generateTrace('yau', qwerty, geometry, opts({ windowSize: 2 }));
  const last = t.strokes[2];
  assert.equal(last.char, 'u');
  assert.equal(last.presses[0].gap, 1);
  near(last.distance, 1, 'u');
});

test('指間距離は残す候補を選んだ区間だけ前回キー位置を使う', () => {
  const stay = generateTrace('yau', qwerty, geometry, opts());
  const y = geometry.keys.get('y')!;
  assert.deepEqual(stay.strokes[1].positions.RI, { x: y.x, y: y.y });

  // u → 他指1打 → hは、hへはホームからの方が近いので、途中はホーム扱い。
  const home = generateTrace('uah', qwerty, geometry, opts());
  const h = geometry.keys.get('h')!;
  assert.deepEqual(home.strokes[1].positions.RI, geometry.homes.RI);
  assert.deepEqual(home.strokes[2].positions.RI, { x: h.x, y: h.y });
});

test('次の同指打鍵で残すと確定しない間は未使用指をホーム扱いにする', () => {
  const t = generateTrace('ha', qwerty, geometry, opts());
  assert.deepEqual(t.strokes[1].positions.RI, geometry.homes.RI);
});

test('N文字先を超えると必ずホームからの距離になる', () => {
  // y → a → s → d → f → u。uはyから5文字先なのでN=4では範囲の外。
  const t = generateTrace('yasdfu', qwerty, geometry, opts({ windowSize: 4 }));
  const last = t.strokes[5];
  assert.equal(last.char, 'u');
  assert.equal(last.presses[0].gap, 4);
  const home = geometry.homes.RI;
  const u = geometry.grid[1][6];
  near(last.distance, Math.hypot(home.x - u.x, home.y - u.y), 'u');
});

test('gは全打鍵を数える（その指の打鍵だけではない）', () => {
  const t = generateTrace('yasu', qwerty, geometry, opts());
  assert.equal(t.strokes[3].presses[0].gap, 2);
});

test('次の文字は距離1、N=1は1文字先までを表す', () => {
  const next = generateTrace('yu', qwerty, geometry, opts({ windowSize: 1 }));
  assert.equal(next.strokes[1].presses[0].inputDistance, 1);

  const inside = generateTrace('yau', qwerty, geometry, opts({ windowSize: 2 }));
  const outside = generateTrace('yau', qwerty, geometry, opts({ windowSize: 1 }));
  assert.equal(inside.strokes[2].presses[0].inputDistance, 2);
  near(inside.strokes[2].distance, 1, 'N=2なら2文字先でstay候補を比較する');

  const home = geometry.homes.RI;
  const u = geometry.keys.get('u')!;
  near(outside.strokes[2].distance, Math.hypot(home.x - u.x, home.y - u.y), 'N=1では2文字先はhome');
});

test('複数文字見出しは、覆う最後の文字からNを数える', () => {
  const layout = fromKana('multi-input-unit', 'multi-input-unit', {
    y: [['y']],
    きゃ: [['a']],
    u: [['u']],
  });
  const inside = generateTrace('yきゃu', layout, geometry, opts({ windowSize: 3 }));
  const outside = generateTrace('yきゃu', layout, geometry, opts({ windowSize: 2 }));

  assert.equal(inside.strokes.length, 3, 'きゃは1見出しとして1 Stroke');
  assert.deepEqual(
    inside.strokes.map((stroke) => [stroke.kanaStart, stroke.kanaEnd]),
    [
      [0, 0],
      [1, 2],
      [3, 3],
    ],
  );
  near(inside.strokes[2].distance, 1, 'yからuは3文字先なのでN=3でstay候補');
  const home = geometry.homes.RI;
  const u = geometry.keys.get('u')!;
  near(outside.strokes[2].distance, Math.hypot(home.x - u.x, home.y - u.y), 'N=2では3文字先は範囲の外');
});

test('trigger action分離でNの入力距離は変わらない', () => {
  const layout = fromFaces('lookahead-trigger-split', 'lookahead-trigger-split', [
    {
      ...faceFromEntries([], 'simultaneous', { y: 'y', u: 'u' }),
      inputRole: 'layer',
    },
    {
      ...faceFromEntries(['thumb-r'], 'simultaneous', { f: 'x' }),
      inputRole: 'modifier',
      triggerPersistence: 'hold-capable',
      triggerOrder: 'prefix',
    },
  ]);

  const combined = generateTrace(
    'yxu',
    layout,
    geometry,
    opts({
      windowSize: 1,
      actionRealizationPolicy: { triggerActivation: 'disabled' },
    }),
  );
  const separate = generateTrace(
    'yxu',
    layout,
    geometry,
    opts({
      windowSize: 1,
      actionRealizationPolicy: { triggerActivation: 'semantic' },
    }),
  );

  assert.equal(combined.strokes.length + 1, separate.strokes.length, 'trigger-only Strokeだけ増える');
  near(
    computeMetrics(combined, geometry).totalUnits,
    computeMetrics(separate, geometry).totalUnits,
    'action分離でselected input列が同じなら距離は変わらない',
  );
});

test('Nを大きくすると総移動距離は単調に減少する', () => {
  const text = 'the quick brown fox jumps over the lazy dog';
  let last = Infinity;
  for (const n of [0, 1, 2, 3, 5, 8, 12]) {
    const d = totalOf(text, { windowSize: n });
    assert.ok(d <= last + 1e-9, `N=${n}: ${d} > ${last}`);
    last = d;
  }
});

test('配列に無い文字はskippedに数える', () => {
  const t = generateTrace('a漢b', qwerty, geometry, opts());
  assert.equal(t.strokes.length, 2);
  assert.equal(t.skipped, 1);
});

test('段ずれ量がANSIの修飾キー幅と一致する', () => {
  // 上段qは +0.5u、ホーム段aは +0.75u、下段zは +1.25u
  near(geometry.grid[1][0].x, 0.5, 'q');
  near(geometry.grid[2][0].x, 0.75, 'a');
  near(geometry.grid[3][0].x, 1.25, 'z');
});

test('ホーム段だけを打つと隣接指の超過はほぼ0になる', () => {
  // 生の距離ではなくホーム間隔1uを引いた超過を見る（仕様 §11.6）
  const m = computeMetrics(generateTrace('asdf jkl;', qwerty, geometry, opts()), geometry);
  for (const stat of m.adjacent) {
    assert.ok(Math.abs(stat.meanExcess) < 0.5, `${stat.pair.join('-')}: ${stat.meanExcess}`);
  }
});

test('空白は右親指の打鍵として数え、移動距離は0になる', () => {
  const t = generateTrace(' ', qwerty, geometry, opts());
  assert.equal(t.strokes.length, 1);
  assert.equal(t.skipped, 0);
  assert.equal(t.strokes[0].presses[0].finger, 'RT');
  near(t.strokes[0].distance, 0, 'space');
});

test('空白がgのカウントに入る', () => {
  // 'y' → 空白 → 'u'。空白を落とすとg=0（同指連続）になってしまう
  const t = generateTrace('y u', qwerty, geometry, opts());
  assert.equal(t.strokes.length, 3);
  assert.equal(t.strokes[2].char, 'u');
  assert.equal(t.strokes[2].presses[0].gap, 1);
});

test('親指の連打でも距離は増えない', () => {
  near(totalOf('   '), 0, 'spaces');
});

// ---- 同時押しと前置・後置シフト ----

const chord = (map: Record<string, string[][]>): Layout => fromKana('test', 'test', map);

test('同時押しは1ステップ、押下は押したキーの数だけ数える', () => {
  const l = chord({ x: [['space', 'q']] });
  const m = computeMetrics(generateTrace('x', l, geometry, opts()), geometry);
  assert.equal(m.strokes, 1);
  assert.equal(m.presses, 2);
});

test('旧親指キーidのspaceはthumb-rとして解決する', () => {
  const alias = chord({ x: [['space']] });
  const canonical = chord({ x: [['thumb-r']] });
  const aliasTrace = generateTrace('x', alias, geometry, opts());
  const canonicalTrace = generateTrace('x', canonical, geometry, opts());

  assert.equal(aliasTrace.errors.length, 0);
  assert.equal(aliasTrace.strokes[0].presses[0].keys[0].id, 'thumb-r');
  assert.deepEqual(aliasTrace.strokes, canonicalTrace.strokes);
});

test('前置シフトは2ステップになる', () => {
  const l = chord({ x: [['space'], ['q']] });
  const m = computeMetrics(generateTrace('x', l, geometry, opts()), geometry);
  assert.equal(m.strokes, 2);
  assert.equal(m.presses, 2);
});

test('後置シフトも2ステップになる', () => {
  const l = chord({ x: [['q'], ['space']] });
  const m = computeMetrics(generateTrace('x', l, geometry, opts()), geometry);
  assert.equal(m.strokes, 2);
  assert.equal(m.presses, 2);
});

test('同時押しと順次打鍵の差はステップ数に出る。押下数と総距離は変わらない', () => {
  const text = 'xxxx';
  const a = computeMetrics(generateTrace(text, chord({ x: [['space', 'q']] }), geometry, opts()), geometry);
  const b = computeMetrics(generateTrace(text, chord({ x: [['space'], ['q']] }), geometry, opts()), geometry);
  assert.equal(b.strokes, a.strokes * 2);
  assert.equal(b.presses, a.presses);
  near(b.totalUnits, a.totalUnits, 'total');
});

test('prefix配列のシフト単独ステップでも後続出力を見て反対側親指へ振り替える', () => {
  const prefix = withThumbShiftAlternatives(
    fromFaces('prefix-thumb-shift', 'prefix-thumb-shift', [
      {
        ...faceFromEntries(['thumb-r'], 'prefix', { q: '左', j: '右' }),
        inputRole: 'modifier',
        triggerPersistence: 'single',
      },
    ]),
    'thumb-r',
    ['thumb-r', 'thumb-l'],
  );

  const fixedLeft = generateTrace('左', prefix, geometry, opts());
  const fixedRight = generateTrace('右', prefix, geometry, opts());
  const oppositeLeft = generateTrace('左', prefix, geometry, opts({ preferOppositeThumb: true }));
  const oppositeRight = generateTrace('右', prefix, geometry, opts({ preferOppositeThumb: true }));

  assert.equal(fixedLeft.strokes.length, 2);
  assert.equal(fixedRight.strokes.length, 2);
  assert.equal(oppositeLeft.strokes.length, 2);
  assert.equal(oppositeRight.strokes.length, 2);

  assert.equal(fixedLeft.strokes[0].presses[0].keys[0].id, 'thumb-r');
  assert.equal(fixedRight.strokes[0].presses[0].keys[0].id, 'thumb-r');
  assert.equal(oppositeLeft.strokes[0].presses[0].keys[0].id, 'thumb-r');
  assert.equal(oppositeRight.strokes[0].presses[0].keys[0].id, 'thumb-l');

  assert.equal(oppositeLeft.strokes[1].presses[0].keys[0].id, 'q');
  assert.equal(oppositeRight.strokes[1].presses[0].keys[0].id, 'j');
});

test('新JIS prefixでも振り替え後の親指がtrigger semanticsへ伝播する', () => {
  const shinJis = LAYOUT_BY_ID.get('shin-jis-prefix')!;
  const trace = generateTrace('お', shinJis, geometry, opts({ preferOppositeThumb: true }));

  assert.equal(trace.strokes.length, 2);
  assert.equal(trace.strokes[0].presses[0].keys[0].id, 'thumb-l');
  assert.deepEqual(trace.strokes[0].triggerKeys, ['thumb-l']);
  assert.deepEqual(trace.strokes[0].participations[0].roles, ['trigger']);
  assert.equal(trace.strokes[1].presses[0].keys[0].id, 'j');
});

test('suffix配列も合法alternativeから反対側親指pathを選択する', () => {
  const suffix = withThumbShiftAlternatives(
    fromFaces('suffix-thumb-shift', 'suffix-thumb-shift', [
      {
        ...faceFromEntries(['thumb-r'], 'suffix', { q: '左', j: '右' }),
        inputRole: 'modifier',
        triggerPersistence: 'single',
      },
    ]),
    'thumb-r',
    ['thumb-r', 'thumb-l'],
  );

  const left = generateTrace('左', suffix, geometry, opts({ preferOppositeThumb: true }));
  const right = generateTrace('右', suffix, geometry, opts({ preferOppositeThumb: true }));

  assert.equal(left.strokes.length, 2);
  assert.equal(right.strokes.length, 2);
  assert.equal(left.strokes[1].presses[0].keys[0].id, 'thumb-r');
  assert.equal(right.strokes[1].presses[0].keys[0].id, 'thumb-l');
});

test('薙刀式のシフトは設定時に出力キーと反対側の親指へ振り替える', () => {
  const naginata = LAYOUT_BY_ID.get('naginata-v18')!;
  const fixed = generateTrace('おせ', naginata, geometry, opts());
  const opposite = generateTrace('おせ', naginata, geometry, opts({ preferOppositeThumb: true }));

  assert.deepEqual(
    fixed.strokes[0].presses.find((press) => press.finger === 'RT')?.keys.map((key) => key.id),
    ['thumb-r'],
  );
  assert.deepEqual(
    fixed.strokes[1].presses.find((press) => press.finger === 'RT')?.keys.map((key) => key.id),
    ['thumb-r'],
  );
  assert.deepEqual(
    opposite.strokes[0].presses.find((press) => press.finger === 'LT')?.keys.map((key) => key.id),
    ['thumb-l'],
  );
  assert.deepEqual(
    opposite.strokes[1].presses.find((press) => press.finger === 'RT')?.keys.map((key) => key.id),
    ['thumb-r'],
  );
  assert.deepEqual(opposite.strokes[0].triggerKeys, ['thumb-l']);
  assert.deepEqual(opposite.strokes[1].triggerKeys, ['thumb-r']);
});

test('薙刀式で同じ側のシフトが連続すると親指が残った扱いになる', () => {
  const naginata = LAYOUT_BY_ID.get('naginata-v18')!;
  const trace = generateTrace('おお', naginata, geometry, opts({ preferOppositeThumb: true }));
  const thumbs = trace.strokes.map((stroke) => stroke.presses.find((press) => press.finger === 'LT'));

  assert.equal(thumbs[0]?.keys[0].id, 'thumb-l');
  assert.equal(thumbs[1]?.keys[0].id, 'thumb-l');
  assert.equal(thumbs[1]?.gap, 0);
  near(thumbs[1]?.distance ?? Infinity, 0, '連続する左親指シフト');
});

test('ステップ内の距離は各指の単純和になる', () => {
  // 左小指qと右小指pを同時に押す。どちらもホーム段から1行上
  const l = chord({ x: [['q', 'p']] });
  const t = generateTrace('x', l, geometry, opts());
  const step = t.strokes[0];
  assert.equal(step.presses.length, 2);
  near(step.distance, step.presses[0].distance + step.presses[1].distance, 'sum');
});

test('1本の指で複数キーを押す場合は重心を目標位置にする', () => {
  // r2c0(a)とr1c0(q)はどちらも左小指。指はその間を押す
  const t = generateTrace('x', chord({ x: [['a', 'q']] }), geometry, opts());
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
  // 同じ同時押しを2回続ける。2回目は移動が起きない
  const t = generateTrace('xx', chord({ x: [['a', 'q']] }), geometry, opts());
  assert.equal(t.strokes[1].presses[0].gap, 0);
  near(t.strokes[1].distance, 0, 'second press');
});

test('1本の指で複数キーを押しても押下数はキーの数だけ数える', () => {
  const m = computeMetrics(generateTrace('x', chord({ x: [['a', 'q']] }), geometry, opts()), geometry);
  assert.equal(m.strokes, 1);
  assert.equal(m.presses, 2);
});

test('存在しないキーidはエラーとして記録する', () => {
  const t = generateTrace('x', chord({ x: [['no-such-key']] }), geometry, opts());
  assert.equal(t.errors.length, 1);
  assert.match(t.errors[0], /no-such-key/);
});

// ---- 複数文字の見出し ----

test('最長一致の探索上限はcanonicalInputsだけから決まる', () => {
  const base = fromKana('canonical-match-length', 'canonical-match-length', {
    き: [['d']],
    ゃ: [['k']],
  });
  const canonicalInputs = new Map(base.canonicalInputs);
  canonicalInputs.set('きゃ', [compileSequenceInputAlternative('きゃ', [['f']], 'single')]);
  const layout = { ...base, canonicalInputs };

  assert.equal(layout.map.has('きゃ'), false, 'legacy mapには長い見出しを追加しない');

  const trace = generateTrace('きゃ', layout, geometry, opts());
  assert.equal(trace.skipped, 0);
  assert.equal(trace.strokes.length, 1);
  assert.equal(trace.strokes[0].char, 'きゃ');
  assert.deepEqual(
    trace.strokes[0].presses.flatMap((press) => press.keys.map((key) => key.id)),
    ['f'],
  );
});

test('「きゃ」を見出しに持つ配列は1単位として当てる', () => {
  const l = fromKana('t', 't', {
    き: [['d']],
    ゃ: [['k']],
    きゃ: [['f']],
  });
  const t = generateTrace('きゃ', l, geometry, opts());
  assert.equal(t.strokes.length, 1);
  assert.equal(t.strokes[0].char, 'きゃ');
});

test('「きゃ」を見出しに持たない配列は「き」「ゃ」に分解する', () => {
  const l = fromKana('t', 't', {
    き: [['d']],
    ゃ: [['k']],
  });
  const t = generateTrace('きゃ', l, geometry, opts());
  assert.equal(t.strokes.length, 2);
  assert.deepEqual(
    t.strokes.map((s) => s.char),
    ['き', 'ゃ'],
  );
});

test('最長一致は後続の文字を食い過ぎない', () => {
  const l = fromKana('t', 't', {
    き: [['d']],
    ゃ: [['k']],
    きゃ: [['f']],
    く: [['j']],
  });
  const t = generateTrace('きゃく', l, geometry, opts());
  assert.deepEqual(
    t.strokes.map((s) => s.char),
    ['きゃ', 'く'],
  );
});

test('ヤ行コンボは拗音の内部だけで発火し、単独ヤ行を奪わない', () => {
  const combo = LAYOUT_BY_ID.get('oonishi-custom')!;
  const cases: [string, string[]][] = [
    ['やく', ['y', 'aku']],
    ['やま', ['y', 'a', 'm', 'a']],
    ['にゅうりょく', ['n', 'yuu', 'r', 'yoku']],
    ['きゃ', ['k', 'ya']],
    ['んや', ['nn', 'y', 'a']],
  ];

  for (const [text, expected] of cases) {
    const trace = generateTrace(text, combo, geometry, opts());
    assert.deepEqual(
      trace.strokes.map((stroke) => stroke.char),
      expected,
      text,
    );
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

  assert.deepEqual(
    generateTrace('やく', generic, geometry, opts()).strokes.map((s) => s.char),
    ['yaku'],
  );
  assert.deepEqual(
    generateTrace('やく', restricted, geometry, opts()).strokes.map((s) => s.char),
    ['y', 'aku'],
  );
});

test('semantic normalizationはoutputのみのStrokeを表現する', () => {
  const trace = generateTrace('a', qwerty, geometry, opts());
  const stroke = trace.strokes[0];

  assert.deepEqual(stroke.classifications, []);
  assert.equal(stroke.participations.length, 1);
  assert.deepEqual(stroke.participations[0].roles, ['output']);
  assert.equal(stroke.participations[0].finger, 'LP');
  assert.equal(stroke.participations[0].hand, 'left');
});

test('prefix + singleはtrigger-only Strokeとして正規化する', () => {
  const layout = fromFaces('semantic-prefix-single', 'semantic-prefix-single', [
    {
      trigger: ['q'],
      mode: 'prefix',
      rows: ['', '', ['x'], ''],
      inputRole: 'modifier',
      triggerPersistence: 'single',
    },
  ]);
  const trace = generateTrace('x', layout, geometry, opts());

  assert.equal(trace.strokes.length, 2);
  assert.deepEqual(
    trace.strokes[0].participations.map((p) => p.roles),
    [['trigger']],
  );
  assert.deepEqual(
    trace.strokes[1].participations.map((p) => p.roles),
    [['output']],
  );
});

test('同一キーはoutput + triggerの複合roleを持てる', () => {
  const layout = fromFaces('semantic-composite', 'semantic-composite', [
    {
      trigger: ['a'],
      mode: 'simultaneous',
      rows: ['', '', ['x'], ''],
      inputRole: 'modifier',
      triggerPersistence: 'single',
    },
  ]);
  const trace = generateTrace('x', layout, geometry, opts());
  const participation = trace.strokes[0].participations[0];

  assert.equal(participation.finger, 'LP');
  assert.deepEqual(new Set(participation.roles), new Set(['output', 'trigger']));
});

test('hold-capableはcapabilityとして伝播し、base normalizationではheld-triggerを生成しない', () => {
  const layout = fromFaces('semantic-hold-capable', 'semantic-hold-capable', [
    {
      trigger: ['q'],
      mode: 'simultaneous',
      rows: ['', '', ['x'], ''],
      inputRole: 'modifier',
      triggerPersistence: 'hold-capable',
    },
  ]);
  const trace = generateTrace('x', layout, geometry, opts());
  const stroke = trace.strokes[0];

  assert.deepEqual(layout.canonicalInputs.get('x')?.[0]?.semanticInputs[0].capabilities, [{ kind: 'while-held', keys: ['q'] }]);
  assert.deepEqual(stroke.classifications, []);
  assert.ok(stroke.participations.some((p) => p.roles.includes('trigger')));
  assert.ok(stroke.participations.every((p) => !p.roles.includes('held-trigger')));
});

test('文字コンボはcompositionとして伝播し、trigger宣言なしではtriggerにしない', () => {
  const layout = withCombos('semantic-combo', 'semantic-combo', qwerty, [['ab', ['a', 'b']]]);
  const trace = generateTrace('ab', layout, geometry, opts());
  const stroke = trace.strokes[0];

  assert.ok(stroke.classifications.includes('composition'));
  assert.ok(stroke.participations.length >= 1);
  for (const participation of stroke.participations) {
    assert.deepEqual(participation.roles, ['output']);
  }
});

test('semantic normalizationはlayout idに依存しない', () => {
  const make = (id: string) =>
    fromFaces(id, 'same', [
      {
        trigger: ['q'],
        mode: 'simultaneous',
        rows: ['', '', ['x'], ''],
        inputRole: 'modifier',
        triggerPersistence: 'single',
      },
    ]);
  const first = generateTrace('x', make('semantic-a'), geometry, opts()).strokes[0];
  const second = generateTrace('x', make('semantic-b'), geometry, opts()).strokes[0];

  assert.deepEqual(first.classifications, second.classifications);
  assert.deepEqual(first.triggerKeys, second.triggerKeys);
  assert.deepEqual(
    first.participations.map((p) => ({ hand: p.hand, finger: p.finger, roles: p.roles })),
    second.participations.map((p) => ({ hand: p.hand, finger: p.finger, roles: p.roles })),
  );
});

test('同じlogical outputの複数alternativeは既定でauthoring先頭pathを使う', () => {
  const layout = fromKana('alternative-default', 'alternative-default', [
    ['x', [['f']]],
    ['x', [['j']]],
  ]);
  const trace = generateTrace('x', layout, geometry, opts());
  assert.deepEqual(
    trace.strokes[0].presses.flatMap((press) => press.keys.map((key) => key.id)),
    ['f'],
  );
});

test('classificationはselected canonical alternativeからStrokeまで伝播する', () => {
  const layout = withCombos('classified-combo', 'classified-combo', qwerty, [['ab', ['a', 'b'], undefined, undefined, ['vocabulary-extension']]]);
  const trace = generateTrace('ab', layout, geometry, opts());
  assert.deepEqual(trace.strokes[0].classifications, ['composition', 'vocabulary-extension']);
});

test('preferOppositeThumbのpath同一性はFace presentation provenanceに依存しない', () => {
  const base = withThumbShiftAlternatives(
    fromFaces('thumb-presentation-provenance', 'thumb-presentation-provenance', [
      {
        ...faceFromEntries(['thumb-r'], 'simultaneous', { j: 'x' }),
        inputRole: 'modifier',
        triggerPersistence: 'single',
      },
    ]),
    'thumb-r',
    ['thumb-r', 'thumb-l'],
  );
  const alternatives = base.canonicalInputs.get('x');
  assert.ok(alternatives);
  assert.equal(alternatives.length, 2);

  const opposite = alternatives[1];
  const mappedInputs = new Map(
    opposite.semanticInputs.map(
      (input) =>
        [
          input,
          {
            ...input,
            // physical/semantic/realization factは同じまま、presentation provenanceだけを変える。
            faceMemberships: [{ faceIndex: 999, cellKey: 'q' }],
          },
        ] as const,
    ),
  );
  const provenanceOnlyDifferent = {
    ...opposite,
    semanticInputs: opposite.semanticInputs.map((input) => mappedInputs.get(input)!),
    baseRealizations: opposite.baseRealizations.map((realization) => ({
      ...realization,
      input: mappedInputs.get(realization.input) ?? realization.input,
    })),
  };
  const canonicalInputs = new Map(base.canonicalInputs);
  canonicalInputs.set('x', [alternatives[0], provenanceOnlyDifferent]);
  const layout = { ...base, canonicalInputs };

  const trace = generateTrace('x', layout, geometry, opts({ preferOppositeThumb: true }));
  assert.deepEqual(trace.strokes[0].triggerKeys, ['thumb-l'], 'presentation provenance差だけで合法なopposite-thumb variantを除外しない');
});

test('preferOppositeThumbはnon-thumb別方式alternativeへ切り替えない', () => {
  const layout = fromFaces('thumb-policy-scope', 'thumb-policy-scope', [
    {
      ...faceFromEntries(['thumb-l'], 'simultaneous', { q: 'x' }),
      inputRole: 'modifier',
      triggerPersistence: 'single',
    },
    {
      ...faceFromEntries([], 'simultaneous', { j: 'x' }),
      inputRole: 'layer',
    },
  ]);
  layout.thumbShiftKey = 'thumb-l';
  layout.thumbShiftKeys = ['thumb-l', 'thumb-r'];

  const trace = generateTrace('x', layout, geometry, opts({ preferOppositeThumb: true }));
  assert.deepEqual(trace.strokes[0].presses.flatMap((press) => press.keys.map((key) => key.id)).sort(), ['q', 'thumb-l']);
});

test('same-output direct alternativeはcomboのyouonOnlyに巻き込まれない', () => {
  const base = fromKana('condition-scope', 'condition-scope', [
    ['a', [['f']]],
    ['b', [['j']]],
    ['ab', [['q']]],
  ]);
  const layout = withCombos('condition-scope-combo', 'condition-scope-combo', base, [['ab', ['a', 'b'], { youonOnly: true }]]);

  const trace = generateTrace('ab', layout, geometry, opts());
  assert.equal(trace.skipped, 0);
  assert.deepEqual(
    trace.strokes.flatMap((stroke) => stroke.presses.flatMap((press) => press.keys.map((key) => key.id))),
    ['q'],
  );
  assert.deepEqual(trace.comboHits, [], 'selected direct alternativeはcombo hitに数えない');
});

test('youonOnlyしかない長い見出しは拗音外でeligibleにならず短い見出しへfallbackする', () => {
  const base = fromKana('condition-fallback', 'condition-fallback', {
    y: [['q']],
    a: [['w']],
    k: [['e']],
    u: [['r']],
  });
  const layout = withCombos('condition-fallback-combo', 'condition-fallback-combo', base, [['yaku', ['y', 'a', 'k', 'u'], { youonOnly: true }]]);

  const trace = generateTrace('yaku', layout, geometry, opts());
  assert.deepEqual(
    trace.strokes.map((stroke) => stroke.char),
    ['y', 'a', 'k', 'u'],
  );
  assert.deepEqual(trace.comboHits, []);
});

test('層に計上するFace compositionがselectedされた場合は、同outputのwithCombos定義をcombo hitに数えない', () => {
  const base = fromFaces('combo-origin-selection', 'combo-origin-selection', [
    {
      ...faceFromEntries([], 'simultaneous', { f: 'a', j: 'b' }),
      inputRole: 'layer',
    },
    {
      ...faceFromEntries(['d'], 'simultaneous', { q: 'x' }),
      inputRole: 'composition',
      compositionAggregation: 'layer',
      triggerPersistence: 'single',
    },
  ]);
  const layout = withCombos('combo-origin-selection-2', 'combo-origin-selection-2', base, [['x', ['a', 'b']]]);

  const alternatives = layout.canonicalInputs.get('x');
  assert.ok(alternatives);
  assert.deepEqual(
    alternatives.map((alternative) => alternative.origin),
    ['face', 'combo'],
  );

  const trace = generateTrace('x', layout, geometry, opts());
  assert.deepEqual(trace.comboHits, []);
  assert.equal(trace.comboDefinitions, 1);
  assert.deepEqual(trace.strokes[0].presses.flatMap((press) => press.keys.map((key) => key.id)).sort(), ['d', 'q']);
});

test('コンボ枠に計上するFace compositionの出力は、定義数B・命中数U・延べ回数Hに数える', () => {
  const faces = [
    {
      ...faceFromEntries([], 'simultaneous', { f: 'a', j: 'b' }),
      inputRole: 'layer' as const,
    },
    {
      ...faceFromEntries(['d', 'k'], 'simultaneous', { q: 'x', w: 'y' }),
      inputRole: 'composition' as const,
      compositionAggregation: 'combo' as const,
      triggerPersistence: 'single' as const,
    },
    {
      ...faceFromEntries(['d'], 'simultaneous', { e: 'z' }),
      inputRole: 'composition' as const,
      compositionAggregation: 'layer' as const,
      triggerPersistence: 'single' as const,
    },
  ];
  const layout = fromFaces('combo-frame-count', 'combo-frame-count', faces);

  // 面の数ではなく出力の数で数える。層に計上する面の出力zはBに入らない
  const trace = generateTrace('xxaz', layout, geometry, opts());
  assert.equal(trace.comboDefinitions, 2);
  assert.deepEqual(trace.comboHits, ['x', 'x']);
  assert.ok(trace.comboDefinitions >= new Set(trace.comboHits).size);

  // コンボ定義の見出しと重なる出力は、見出しごとに1件で数える
  const withDefinition = withCombos('combo-frame-count-2', 'combo-frame-count-2', layout, [['x', ['a', 'b']]]);
  assert.equal(generateTrace('a', withDefinition, geometry, opts()).comboDefinitions, 2);
});

test('selectionIndexは入力の選択ごとに振り、同じ入力単位でも別の選択なら別の値になる', () => {
  const combo = LAYOUT_BY_ID.get('oonishi-custom')!;
  const kyou = generateTrace('きょう', combo, geometry, opts());
  assert.deepEqual(
    kyou.strokes.map((stroke) => stroke.char),
    ['k', 'you'],
  );
  assert.equal(kyou.strokes[0].inputIndex, kyou.strokes[1].inputIndex);
  assert.notEqual(kyou.strokes[0].selectionIndex, kyou.strokes[1].selectionIndex);
  // 1つの選択が複数のストロークになる時は、そのストロークどうしで共有する。
  const shifted = generateTrace('が', LAYOUT_BY_ID.get('shin-jis-prefix')!, geometry, opts());
  assert.ok(shifted.strokes.length >= 2);
  assert.equal(new Set(shifted.strokes.map((stroke) => stroke.selectionIndex)).size, 1);
});

/** 打鍵ごとの、指ごとの`Press.inputDistance`。参加が初めての指は無限大 */
const inputDistances = (trace: ReturnType<typeof generateTrace>) => trace.strokes.map((stroke) => stroke.presses.map((press) => press.inputDistance));

test('ローマ字配列: 同じかなを打つ入力どうしはΔI=0、隣り合うかなの入力はΔI=1になる', () => {
  const romaji = withRomaji(qwerty, kunrei());
  // 「ふ」はh・u（どちらも右人差し指）。続く「ふ」のhは、前のかなのuから1文字先
  const trace = generateTrace('ふふ', romaji, geometry, opts());
  assert.deepEqual(
    trace.strokes.map((stroke) => stroke.char),
    ['h', 'u', 'h', 'u'],
  );
  assert.deepEqual(inputDistances(trace), [[Infinity], [0], [1], [0]]);
});

test('ローマ字配列: kyaの3つの入力は同じかなの範囲を持つ', () => {
  const romaji = withRomaji(qwerty, kunrei());
  const trace = generateTrace('あきゃ', romaji, geometry, opts());
  assert.deepEqual(
    trace.strokes.map((stroke) => stroke.char),
    ['a', 'k', 'y', 'a'],
  );
  assert.deepEqual(
    trace.strokes.map((stroke) => [stroke.kanaStart, stroke.kanaEnd]),
    [
      [0, 0],
      [1, 2],
      [1, 2],
      [1, 2],
    ],
  );
  assert.equal(new Set(trace.strokes.map((stroke) => stroke.selectionIndex)).size, 4);
});

test('ローマ字配列: 促音を含む綴りの単位は、促音とその次のかなの範囲を持つ', () => {
  const romaji = withRomaji(qwerty, kunrei());
  const trace = generateTrace('あっか', romaji, geometry, opts());
  assert.deepEqual(
    trace.strokes.map((stroke) => stroke.char),
    ['a', 'k', 'k', 'a'],
  );
  assert.deepEqual(
    trace.strokes.map((stroke) => [stroke.kanaStart, stroke.kanaEnd]),
    [
      [0, 0],
      [1, 2],
      [1, 2],
      [1, 2],
    ],
  );
});

test('コンボが2つの綴りの単位にまたがる時、範囲は両方の単位を覆う。ΔIが負になる所は0にする', () => {
  const combo = withRomaji(LAYOUT_BY_ID.get('oonishi-custom')!, kunrei());
  const trace = generateTrace('きょう', combo, geometry, opts());
  assert.deepEqual(
    trace.strokes.map((stroke) => stroke.char),
    ['k', 'you'],
  );
  // 「きょ」(kyo)と「う」(u)をまたぐyouは0〜2、kは「きょ」の0〜1
  assert.deepEqual(
    trace.strokes.map((stroke) => [stroke.kanaStart, stroke.kanaEnd]),
    [
      [0, 1],
      [0, 2],
    ],
  );
  for (const stroke of trace.strokes) {
    for (const press of stroke.presses) assert.ok((press.inputDistance ?? -1) >= 0, 'ΔIは負にならない');
  }
});

test('かな配列: 読み飛ばした文字も位置に数える', () => {
  const layout = fromKana('skip-count', 'skip-count', { a: [['a']], u: [['u']] });
  const trace = generateTrace('a☆☆u', layout, geometry, opts());
  assert.equal(trace.skipped, 2);
  assert.deepEqual(
    trace.strokes.map((stroke) => [stroke.kanaStart, stroke.kanaEnd]),
    [
      [0, 0],
      [3, 3],
    ],
  );
});

test('ローマ字配列: 配列に無く読み飛ばした文字も位置に数える', () => {
  const romaji = withRomaji(qwerty, kunrei());
  const trace = generateTrace('あ☆☆い', romaji, geometry, opts());
  assert.equal(trace.skipped, 2);
  assert.deepEqual(
    trace.strokes.map((stroke) => [stroke.kanaStart, stroke.kanaEnd]),
    [
      [0, 0],
      [3, 3],
    ],
  );
});

test('読み飛ばした文字は、Nの範囲を狭める位置として数える', () => {
  // y → uは、間にaだけなら2文字先、読み飛ばす文字が加わると3文字先
  const layout = fromKana('skip-window', 'skip-window', { y: [['y']], a: [['a']], u: [['u']] });
  const home = geometry.homes.RI;
  const u = geometry.keys.get('u')!;
  const toHome = Math.hypot(home.x - u.x, home.y - u.y);
  near(generateTrace('yau', layout, geometry, opts({ windowSize: 2 })).strokes[2].distance, 1, '2文字先はN=2の中');
  near(generateTrace('ya☆u', layout, geometry, opts({ windowSize: 2 })).strokes[2].distance, toHome, '3文字先はN=2の外');
  near(generateTrace('ya☆u', layout, geometry, opts({ windowSize: 3 })).strokes[2].distance, 1, '3文字先はN=3の中');
});

test('かな配列: きゃを1つの入力で打つ場合と、きとゃを別々に打つ場合で、ゃを打った指から見た次のかなのΔIが同じになる', () => {
  // 次のかな「う」は、ゃを打ったのと同じ指（右人差し指）のキー
  const together = fromKana('kya-together', 'kya-together', { きゃ: [['j']], う: [['u']] });
  const apart = fromKana('kya-apart', 'kya-apart', { き: [['k']], ゃ: [['j']], う: [['u']] });
  const a = generateTrace('きゃう', together, geometry, opts());
  const b = generateTrace('きゃう', apart, geometry, opts());
  assert.deepEqual(
    a.strokes.map((stroke) => [stroke.kanaStart, stroke.kanaEnd]),
    [
      [0, 1],
      [2, 2],
    ],
  );
  assert.deepEqual(
    b.strokes.map((stroke) => [stroke.kanaStart, stroke.kanaEnd]),
    [
      [0, 0],
      [1, 1],
      [2, 2],
    ],
  );
  assert.equal(a.strokes[1].presses[0].inputDistance, 1);
  assert.equal(b.strokes[2].presses[0].inputDistance, 1);
  // きだけを打った指（右中指）から見た次のかな「う」は、別々に打つ配列の方が1大きい
  const kiThenU = fromKana('ki-u', 'ki-u', { き: [['k']], ゃ: [['j']], う: [['i']] });
  assert.equal(generateTrace('きゃう', kiThenU, geometry, opts()).strokes[2].presses[0].inputDistance, 2);
});

test('英文: 文字1つが1文字で、読み飛ばす文字が無い時はNの範囲が文字数のまま', () => {
  const trace = generateTrace('hello', qwerty, geometry, opts());
  assert.deepEqual(
    trace.strokes.map((stroke) => [stroke.kanaStart, stroke.kanaEnd]),
    [
      [0, 0],
      [1, 1],
      [2, 2],
      [3, 3],
      [4, 4],
    ],
  );
});

test('N=0は、同じかなの中だけ指を残す候補を持つ', () => {
  // 「あ」をu・x・uと打つ表。三つ目のuは、同じかなの中で一つ目のuを打った指（右人差し指）が、間にxを挟んで再び打つ
  const table = new Map([['あ', 'uxu']]);
  const layout = withRomaji(qwerty, table);
  const toHome = (key: string, finger: 'RI' | 'LR') => {
    const home = geometry.homes[finger];
    const target = geometry.keys.get(key)!;
    return Math.hypot(home.x - target.x, home.y - target.y);
  };
  const inside = generateTrace('あ', layout, geometry, opts({ windowSize: 0 }));
  assert.deepEqual(
    inside.strokes.map((stroke) => stroke.char),
    ['u', 'x', 'u'],
  );
  near(inside.strokes[2].distance, 0, '同じかなの中なのでN=0でも残る候補を持つ');
  // 隣のかなのuは、N=0では範囲の外
  const outside = generateTrace(
    'いう',
    withRomaji(
      qwerty,
      new Map([
        ['い', 'u'],
        ['う', 'xu'],
      ]),
    ),
    geometry,
    opts({ windowSize: 0 }),
  );
  assert.deepEqual(
    outside.strokes.map((stroke) => stroke.char),
    ['u', 'x', 'u'],
  );
  near(outside.strokes[2].distance, toHome('u', 'RI'), '隣のかなはN=0の外なのでホームから');
});

test('打鍵のindexは並びの位置と一致する', () => {
  const trace = generateTrace('asdf jkl; hello world, again', qwerty, geometry, opts());
  assert.ok(trace.strokes.length > 10);
  for (const [position, stroke] of trace.strokes.entries()) assert.equal(stroke.index, position);
});
