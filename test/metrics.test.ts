import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildGeometry, ALL_FINGERS } from '../src/geometry.ts';
import { evaluate, type Options } from '../src/evaluate.ts';
import { computeMetrics, DEFAULT_METRIC_CONDITIONS, homeSpacing } from '../src/metrics.ts';
import { fromKana, LAYOUTS_JA, LAYOUT_BY_ID } from '../src/layouts/index.ts';
import { dist } from '../src/geometry.ts';
import { SAMPLE_TEXT_JA, SAMPLE_TEXT_JA_LEGACY } from '../src/sample-text-ja.ts';
import { DEFAULT_CHAIN_POLICY } from '../src/analysis-chain.ts';
import { DEFAULT_ARPEGGIO_POLICY } from '../src/analysis-arpeggio.ts';

const geometry = buildGeometry('row-staggered');
// LAYOUT_BY_IDの 'qwerty' はローマ字テーブル付きのJA版で上書きされる。
// ローマ字表に無いasciiはそのまま通るので、英字のテストにもそのまま使える。
const qwerty = LAYOUT_BY_ID.get('qwerty')!;
const opts = (o: Partial<Options> = {}): Options => ({
  windowSize: 3,
  sfbHomeCost: true,
  ...o,
});

const near = (a: number, b: number, msg?: string) =>
  assert.ok(Math.abs(a - b) < 1e-9, `${msg ?? ''} expected ${b}, got ${a}`);

test('入力文字数はローマ字展開前の文字数になる', () => {
  // 「し」はsiに展開されて2打鍵になるが、入力文字数は展開前の1
  const t = evaluate('し', qwerty, geometry, opts());
  assert.equal(t.strokes.length, 2);
  assert.equal(t.inputChars, 1);
});

test('Metricsは数値を算出した測定条件をスナップショットで保持する', () => {
  const trace = evaluate('し', qwerty, geometry, opts({ windowSize: 7, sfbHomeCost: false }));
  const metrics = computeMetrics(trace, geometry, {
    windowSize: 7,
    sfbHomeCost: false,
    preferOppositeThumb: true,
    chainPolicy: {
      ...DEFAULT_CHAIN_POLICY,
      breakOnOppositeHandSimultaneous: true,
    },
    arpeggioPolicy: {
      ...DEFAULT_ARPEGGIO_POLICY,
      bridgeSameFinger: true,
    },
    triggerRealizationPolicy: { useHold: true },
    actionRealizationPolicy: { holdStart: 'separate' },
    romajiRuleId: 'qwerty',
  });

  assert.deepEqual(metrics.conditions, {
    windowSize: 7,
    sfbHomeCost: false,
    preferOppositeThumb: true,
    chainPolicy: {
      ...DEFAULT_CHAIN_POLICY,
      breakOnOppositeHandSimultaneous: true,
    },
    arpeggioPolicy: {
      ...DEFAULT_ARPEGGIO_POLICY,
      bridgeSameFinger: true,
    },
    triggerRealizationPolicy: { useHold: true },
    actionRealizationPolicy: { holdStart: 'separate' },
    romajiRuleId: 'qwerty',
  });
});

test('旧日本語サンプルは過去の測定用に290文字で残る', () => {
  assert.equal(SAMPLE_TEXT_JA_LEGACY.replace(/\s+/g, '').length, 290);
});

test('スキップされた文字も入力文字数に数える', () => {
  // 分母を「打てた文字数」にすると配列ごとに分母が動いてしまうため、
  // 展開前の原文の文字数で固定する（skipの有無に関わらない）
  const t = evaluate('a漢b', qwerty, geometry, opts());
  assert.equal(t.skipped, 1);
  assert.equal(t.inputChars, 3);
});

test('1文字あたりの距離は打鍵数ではなく入力文字数を分母にする', () => {
  // 「し」→ si（2打鍵、入力文字数は1）
  const m = computeMetrics(evaluate('し', qwerty, geometry, opts()), geometry);
  assert.equal(m.strokes, 2);
  assert.equal(m.inputChars, 1);
  near(m.perCharUnits, m.totalUnits, '1文字あたり = 総距離 / 1');
  near(m.meanPerStroke, m.totalUnits / 2, '1打鍵あたり = 総距離 / 2');
  // 打鍵数を分母にすると、展開で打鍵が増えた分だけ小さく出てしまう
  near(m.perCharUnits, m.meanPerStroke * 2, '打鍵数分母では展開の効果が消える');
});

test('コンボ相当（複数文字を1見出しで打つ）でも入力文字数は変わらない', () => {
  // 「きゃ」を1ステップで打てる配列でも、入力文字数は原文通り2
  const l = fromKana('t', 't', {
    き: [['d']],
    ゃ: [['k']],
    きゃ: [['f']],
  });
  const combo = computeMetrics(evaluate('きゃ', l, geometry, opts()), geometry);
  assert.equal(combo.strokes, 1);
  assert.equal(combo.inputChars, 2);

  const splitLayout = fromKana('t-split', 't-split', {
    き: [['d']],
    ゃ: [['k']],
  });
  const split = computeMetrics(
    evaluate('きゃ', splitLayout, geometry, opts()),
    geometry,
  );
  assert.equal(split.strokes, 2);
  assert.equal(split.inputChars, 2);

  // 打鍵数は減っても入力文字数は同じなので、削減の効果が1文字あたりの距離に出る
  assert.ok(combo.perCharUnits <= split.perCharUnits + 1e-9);
});

test('1文字あたりのアクション数はステップ数を入力文字数で割った値になる', () => {
  // 「し」→ si（2打鍵、入力文字数は1）
  const m = computeMetrics(evaluate('し', qwerty, geometry, opts()), geometry);
  assert.equal(m.strokes, 2);
  assert.equal(m.inputChars, 1);
  near(m.perCharSteps, 2, 'アクション/文字 = ステップ数 / 入力文字数');
});

test('1文字あたりの押下キー数は押下数を入力文字数で割った値になる', () => {
  // 「し」→ si（同時押しを含まないので押下数もステップ数と同じ2）
  const m = computeMetrics(evaluate('し', qwerty, geometry, opts()), geometry);
  assert.equal(m.presses, 2);
  near(m.perCharPresses, 2, '押下/文字 = 押下数 / 入力文字数');
});

test('単打面率は単打面の1キー直接出力だけを文字数ベースで数える', () => {
  const asuka = LAYOUT_BY_ID.get('asuka')!;
  const asukaMetrics = computeMetrics(evaluate('はあ', asuka, geometry, opts()), geometry);
  near(asukaMetrics.singleTapLayerRate, 50, '飛鳥: 単打面「は」だけを数える');

  const shingeta = LAYOUT_BY_ID.get('shingeta')!;
  const shingetaMetrics = computeMetrics(evaluate('のきゃ', shingeta, geometry, opts()), geometry);
  near(shingetaMetrics.singleTapLayerRate, 100 / 3, '新下駄: 2文字コンボ「きゃ」は単打面率へ含めない');

  const romajiMetrics = computeMetrics(evaluate('あか', qwerty, geometry, opts()), geometry);
  near(romajiMetrics.singleTapLayerRate, 50, 'ローマ字: 1キーの「あ」だけを数え、2打鍵の「か」は含めない');
});

test('単打面率はlegacy inputRoleではなくcanonical classificationをauthorityにする', () => {
  const layout = fromKana('tap-authority', 'tap-authority', {
    あ: [['f']],
  });
  const trace = evaluate('あ', layout, geometry, opts());

  const legacyCompositionOnly = {
    ...trace,
    strokes: trace.strokes.map((stroke) => ({
      ...stroke,
      inputRole: 'composition' as const,
      classifications: [],
    })),
  };
  near(
    computeMetrics(legacyCompositionOnly, geometry).singleTapLayerRate,
    100,
    'legacy inputRole=compositionだけでは単打面から除外しない',
  );

  const canonicalComposition = {
    ...trace,
    strokes: trace.strokes.map((stroke) => ({
      ...stroke,
      inputRole: 'layer' as const,
      classifications: ['composition'] as const,
    })),
  };
  near(
    computeMetrics(canonicalComposition, geometry).singleTapLayerRate,
    0,
    'composition classificationがあればlegacy inputRole=layerでも単打面から除外する',
  );
});

test('単打面率は文字数、単打率・1キー率はaction数を分母にする', () => {
  const layout = fromKana('rate-bases', 'rate-bases', {
    きゃ: [['f']],
    あ: [['d'], ['k']],
  });
  const metrics = computeMetrics(evaluate('きゃあ', layout, geometry, opts()), geometry);

  assert.equal(metrics.inputChars, 3);
  assert.equal(metrics.actions, 3);
  assert.equal(metrics.strokes, 3);
  near(metrics.singleTapLayerRate, 200 / 3, '単打面率: きゃの2文字 / 全3文字');
  near(metrics.singleTapRate, 100 / 3, '単打率: きゃの1単打action / 全3action');
  near(metrics.singleKeyRate, 100, '1キー率: 3 actionすべて1物理キー');
});

test('単打率はかなを1キーで直接出す独立actionだけを数える', () => {
  const romajiMetrics = computeMetrics(evaluate('あか', qwerty, geometry, opts()), geometry);
  near(romajiMetrics.singleTapRate, 0, 'ローマ字のa / k / aをかな配列の単打とは数えない');
  near(romajiMetrics.singleKeyRate, 100, 'ローマ字の各actionは1キー入力として数える');

  const tsuki = LAYOUT_BY_ID.get('tsuki-2-263')!;
  const prefixMetrics = computeMetrics(evaluate('あ', tsuki, geometry, opts()), geometry);
  near(prefixMetrics.singleTapRate, 0, '月配列: 前置シフトを含む入力は単打には含めない');
  near(prefixMetrics.singleKeyRate, 100, '月配列: 前置シフトも出力も各actionは1キー');

  const shingeta = LAYOUT_BY_ID.get('shingeta')!;
  const comboMetrics = computeMetrics(evaluate('きゃ', shingeta, geometry, opts()), geometry);
  near(comboMetrics.singleTapRate, 0, '新下駄: 多キー同時押しは単打に含めない');
  near(comboMetrics.singleKeyRate, 0, '新下駄: 多キー同時押しは1キー打鍵でもない');
});

test('1キー率はActionRealizationPolicy適用後の共通Stroke streamを数える', () => {
  const asuka = LAYOUT_BY_ID.get('asuka')!;
  const combinedTrace = evaluate('あだ', asuka, geometry, opts({
    triggerRealizationPolicy: { useHold: true },
    actionRealizationPolicy: { holdStart: 'combined' },
  }));
  const separateTrace = evaluate('あだ', asuka, geometry, opts({
    triggerRealizationPolicy: { useHold: true },
    actionRealizationPolicy: { holdStart: 'separate' },
  }));
  const baseConditions = {
    ...DEFAULT_METRIC_CONDITIONS,
    triggerRealizationPolicy: { useHold: true },
  };

  const combined = computeMetrics(combinedTrace, geometry, {
    ...baseConditions,
    actionRealizationPolicy: { holdStart: 'combined' },
  });
  const separate = computeMetrics(separateTrace, geometry, {
    ...baseConditions,
    actionRealizationPolicy: { holdStart: 'separate' },
  });

  assert.equal(combinedTrace.strokes.length, 2);
  assert.equal(separateTrace.strokes.length, 3);
  assert.equal(combined.actions, 2);
  assert.equal(separate.actions, 3);
  near(combined.singleKeyRate, 50, '2 action中、hold継続の1 actionだけが1キー');
  near(separate.singleKeyRate, 100, 'hold開始を分けると3 actionすべて1キー');
});

test('単打率はhold継続中の1キー入力を単打に含めない', () => {
  const asuka = LAYOUT_BY_ID.get('asuka')!;
  const trace = evaluate('あだ', asuka, geometry, opts({
    triggerRealizationPolicy: { useHold: true },
  }));
  const metrics = computeMetrics(trace, geometry);

  assert.equal(trace.strokes.length, 2);
  assert.ok(trace.strokes[1].participations.some((p) => p.roles.includes('held-trigger')));
  near(metrics.singleTapRate, 0, 'held triggerに依存する文字は新規1キーでも単打ではない');
  near(metrics.singleTapLayerRate, 0, 'hold継続の文字は単打面にも含めない');
});

test('単打面率はhold継続中のシフト文字を単打面扱いしない', () => {
  const asuka = LAYOUT_BY_ID.get('asuka')!;
  const trace = evaluate('あだ', asuka, geometry, opts({
    triggerRealizationPolicy: { useHold: true },
  }));
  const metrics = computeMetrics(trace, geometry);
  near(metrics.singleTapLayerRate, 0);
  assert.ok(trace.strokes.some((stroke) =>
    stroke.participations.some((p) => p.roles.includes('held-trigger'))));
});

test('コンボはアクション/文字を下げるが、押下/文字は下げない', () => {
  // 「きゃ」を3キー同時押しの1ステップで打てる配列と、2ステップに分けて打つ配列を比較する。
  // コンボは押すキー自体は減らさないため、押下数は両者で変わらない
  const combo = fromKana('combo', 'combo', {
    きゃ: [['d', 'k', 'l']],
  });
  const split = fromKana('split', 'split', {
    き: [['d']],
    ゃ: [['k', 'l']],
  });

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
  const trace = evaluate('やくやまにゅうりょくきゃ', combo, geometry, opts());
  const m = computeMetrics(trace, geometry);

  assert.deepEqual(trace.comboHits, ['aku', 'yuu', 'yoku', 'ya']);
  assert.deepEqual(m.combos, { definitions: 73, matched: 4, hits: 4 });
});

test('層別集計と統合ヒートマップのキー押下数は保存則を満たす（#87）', () => {
  const text = SAMPLE_TEXT_JA.replace(/\s+/g, '');
  for (const layout of LAYOUTS_JA) {
    const m = computeMetrics(evaluate(text, layout, geometry, opts()), geometry);
    const layerPresses = m.layers.reduce((sum, layer) => sum + layer.presses, 0);
    assert.equal(layerPresses + m.comboPresses, m.presses, `${layout.id} の層別押下数`);

    const byKey = new Map<string, number>();
    for (const layer of m.layers) {
      for (const [key, count] of layer.keyCounts) {
        byKey.set(key, (byKey.get(key) ?? 0) + count);
      }
    }
    for (const [key, count] of m.comboKeyCounts) {
      byKey.set(key, (byKey.get(key) ?? 0) + count);
    }
    assert.deepEqual(byKey, m.keyCounts, `${layout.id} の層別キー押下数`);
  }
});

test('層操作キーと出力キーを同時押しの中で分離する', () => {
  const cases = [
    { layoutId: 'naginata-v18', text: 'が', trigger: 'j', output: 'f' },
    { layoutId: 'shingeta', text: 'れ', trigger: 'k', output: 'd' },
  ];
  for (const { layoutId, text, trigger, output } of cases) {
    const layout = LAYOUTS_JA.find((entry) => entry.id === layoutId)!;
    const trace = evaluate(text, layout, geometry, opts());
    const metrics = computeMetrics(trace, geometry);
    const layer = metrics.layers.find((stat) => stat.presses > 0)!;

    assert.deepEqual(trace.strokes[0].triggerKeys, [trigger], `${layoutId} のトリガー`);
    assert.deepEqual(trace.strokes[0].pairedTriggerKeys, [trigger], `${layoutId} の対向トリガー`);

    const withoutFaceMetadata = { ...layout, faces: undefined, faceLayerIds: undefined };
    const canonicalOnlyTrace = evaluate(text, withoutFaceMetadata, geometry, opts());
    assert.deepEqual(
      canonicalOnlyTrace.strokes[0].pairedTriggerKeys,
      [trigger],
      `${layoutId} はFace metadataなしでもcanonical roleから対向トリガーを判定する`,
    );
    assert.equal(layer.keyCounts.get(trigger), 1, `${layoutId} のトリガー実押下`);
    assert.equal(layer.keyCounts.get(output), 1, `${layoutId} の出力実押下`);
    assert.equal(layer.triggerKeyCounts.get(trigger), 1, `${layoutId} のトリガー集計`);
    assert.equal(layer.triggerKeyCounts.get(output) ?? 0, 0, `${layoutId} の出力をトリガー扱いしない`);
    assert.equal(layer.pairedTriggerKeyCounts.get(trigger), 1, `${layoutId} の対向トリガー`);
    assert.equal(layer.pairedTriggerKeyCounts.get(output) ?? 0, 0, `${layoutId} の出力を対向トリガー扱いしない`);
  }
});

test('層トリガー1個の同時打鍵は対向トリガー扱いしない', () => {
  const cases = [
    { layoutId: 'naginata-v18', text: 'ぎ', trigger: 'j', output: 'w' },
    { layoutId: 'shingeta', text: 'ご', trigger: 'k', output: 'w' },
  ];
  for (const { layoutId, text, trigger, output } of cases) {
    const layout = LAYOUTS_JA.find((entry) => entry.id === layoutId)!;
    const trace = evaluate(text, layout, geometry, opts());
    const metrics = computeMetrics(trace, geometry);
    const layer = metrics.layers.find((stat) => stat.presses > 0)!;

    assert.deepEqual(trace.strokes[0].pairedTriggerKeys, [], `${layoutId} の対向トリガーなし`);
    assert.equal(layer.pairedTriggerKeyCounts.get(trigger) ?? 0, 0, `${layoutId} のトリガー`);
    assert.equal(layer.pairedTriggerKeyCounts.get(output) ?? 0, 0, `${layoutId} の出力`);
  }
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
  // 親指のように移動距離が0の指を列から落とすと、この和が崩れる
  const text = SAMPLE_TEXT_JA.replace(/\s+/g, '');
  for (const layout of LAYOUTS_JA) {
    const m = computeMetrics(evaluate(text, layout, geometry, opts()), geometry);
    const sum = ALL_FINGERS.reduce((a, f) => a + m.perFingerPresses[f], 0);
    assert.equal(sum, m.presses, `${layout.id} の指ごとの押下数の合計`);
  }
});

test('全打鍵で指の相対位置が変わらなければ隣接指の標準偏差は0になる', () => {
  // 'j' は右人差し指のホームキー。連打では他の指は一切動かない
  const m = computeMetrics(evaluate('jjjj', qwerty, geometry, opts()), geometry);
  for (const stat of m.adjacent) {
    near(stat.stdDev, 0, stat.pair.join('-'));
    near(stat.maxExcess, stat.meanExcess, `${stat.pair.join('-')} max`);
    // ホームから動いていないので超過は0（仕様 §11.6）
    near(stat.meanExcess, 0, `${stat.pair.join('-')} excess`);
  }
});

test('どの物理形状でもホーム段だけを打てば隣接指の超過は0になる', () => {
  // 引くのは定数1uではなくペアごとの実ホーム間隔なので、列ずれのある形状でも
  // ホームに居る状態がちょうど0になる（仕様 §11.6）
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
    // metrics.tsとは独立に、Trace.strokesの位置スナップショットから直接計算する
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
