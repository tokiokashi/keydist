import assert from 'node:assert/strict';
import test from 'node:test';
import { fromKana, LAYOUT_BY_ID, withRomaji, type Layout } from '#input/layouts/index.ts';
import { tableForRule } from '#input/romaji/rules.ts';
import { buildGeometry, dist } from '#input/shapes/geometry.ts';
import { DEFAULT_TRACE_POLICY, generateTrace, type Trace, type TracePolicy } from '#trace/generate.ts';
import { computeKeyDetails, NO_ROLE, roleSetId, type KeyDetail } from './key-detail.ts';
import { computeMetrics } from './metrics.ts';

/**
 * キーの詳細（仕様§11.11）。期待値は、打つ文字から手で追える小さいテキストで固定する。
 */

const geometry = buildGeometry('row-staggered');

function traceFor(layoutId: string, text: string, romajiRuleId?: string, policy: TracePolicy = DEFAULT_TRACE_POLICY): Trace {
  const base = LAYOUT_BY_ID.get(layoutId);
  assert.ok(base, layoutId);
  const layout = romajiRuleId ? withRomaji(base, tableForRule(romajiRuleId)) : base;
  return generateTrace(text, layout, geometry, policy);
}

function chordTrace(text: string, layout: Layout): Trace {
  return generateTrace(text, layout, geometry, DEFAULT_TRACE_POLICY);
}

const entries = <K>(map: ReadonlyMap<K, number>) => [...map].sort(([a], [b]) => String(a).localeCompare(String(b)));
const sum = (values: Iterable<number>) => [...values].reduce((a, b) => a + b, 0);

function detailOf(details: ReturnType<typeof computeKeyDetails>, keyId: string): KeyDetail {
  const detail = details.merged.get(keyId);
  assert.ok(detail, keyId);
  return detail;
}

test('役の組は並べ替えて1つの値にし、役が無ければnone', () => {
  assert.equal(roleSetId(['trigger', 'output']), 'output+trigger');
  assert.equal(roleSetId(['held-trigger', 'trigger', 'output']), 'output+trigger+held-trigger');
  assert.equal(roleSetId([]), NO_ROLE);
});

test('かな配列: 同じキーを繰り返すと、起点は先頭だけホームで、前の文字は直前のかなになる', () => {
  const trace = traceFor('shingeta', 'かかか');
  const d = detailOf(computeKeyDetails(trace), 'd');
  assert.equal(d.presses, 3);
  assert.deepEqual(entries(d.roles), [['output', 3]]);
  assert.deepEqual(entries(d.previousChars), [['か', 2]]);
  assert.equal(d.noPreviousChar, 1);
  assert.deepEqual(entries(d.distances), [[0, 3]]);
  assert.equal(d.origins.length, 1);
  const [origin] = d.origins;
  assert.deepEqual({ x: origin.x, y: origin.y }, {
    x: Math.round(geometry.homes.LM.x * 1000) / 1000,
    y: Math.round(geometry.homes.LM.y * 1000) / 1000,
  });
  assert.deepEqual(origin.keyIds, ['d']);
  assert.equal(origin.fromHome, 1);
  assert.equal(origin.fromPrevious, 2);
});

test('かな配列: 同時押しとトリガーは、同じ入力単位の押下がどれも同じ前の文字を持つ', () => {
  // 「きゃ」は右中指のトリガーiと左人差し指のvの同時押し。「ぱ」はd(トリガー)とu
  const details = computeKeyDetails(traceFor('shingeta', 'がきゃ。ぱ'));
  const i = detailOf(details, 'i');
  const v = detailOf(details, 'v');
  assert.deepEqual(entries(i.roles), [['trigger', 1]]);
  assert.deepEqual(entries(v.roles), [['output', 1]]);
  assert.deepEqual(entries(i.previousChars), [['が', 1]]);
  assert.deepEqual(entries(v.previousChars), [['が', 1]]);
  // 「。」の前は「きゃ」、「ぱ」の前は「。」
  assert.deepEqual(entries(detailOf(details, '.').previousChars), [['きゃ', 1]]);
  assert.deepEqual(entries(detailOf(details, 'u').previousChars), [['。', 1]]);
  assert.deepEqual(entries(detailOf(details, 'd').previousChars), [['。', 1]]);
  // 先頭の「が」だけが前の文字なし
  assert.equal(detailOf(details, 'o').noPreviousChar, 1);
});

test('面ごとの値と、面をまたいだ合算', () => {
  // 「か」は単打の面のd、「ぱ」は中指シフトの面でd(トリガー)とu(出力)
  const details = computeKeyDetails(traceFor('shingeta', 'かぱ'));
  assert.deepEqual([...details.faces.keys()], ['single', 'layer:中指シフト']);
  const single = details.faces.get('single')!;
  const shift = details.faces.get('layer:中指シフト')!;
  assert.equal(single.get('d')?.presses, 1);
  assert.deepEqual(entries(single.get('d')!.roles), [['output', 1]]);
  assert.equal(shift.get('d')?.presses, 1);
  assert.deepEqual(entries(shift.get('d')!.roles), [['trigger', 1]]);
  assert.deepEqual([...shift.keys()].sort(), ['d', 'u']);
  const merged = detailOf(details, 'd');
  assert.equal(merged.presses, 2);
  assert.deepEqual(entries(merged.roles), [['output', 1], ['trigger', 1]]);
  assert.deepEqual(entries(merged.previousChars), [['か', 1]]);
  assert.equal(merged.noPreviousChar, 1);
});

test('コンボの面も1つの面として持つ', () => {
  const details = computeKeyDetails(traceFor('shin-koume', 'ぴ'));
  assert.deepEqual([...details.faces.keys()], ['combo']);
  const combo = details.faces.get('combo')!;
  assert.deepEqual([...combo.keys()].sort(), ['g', 'u']);
  assert.equal(combo.get('g')?.presses, 1);
  assert.equal(combo.get('u')?.presses, 1);
});

test('ローマ字: 同じかなを打つ複数の打鍵が同じ前の文字を持つ', () => {
  // 「しゃ」はs・y・aの3打鍵で1つの入力単位。前の「か」(k・a)が前の文字になる
  const details = computeKeyDetails(traceFor('qwerty', 'かしゃ', 'kunrei'));
  for (const id of ['s', 'y']) {
    const detail = detailOf(details, id);
    assert.deepEqual(entries(detail.previousChars), [['か', 1]], id);
    assert.equal(detail.noPreviousChar, 0, id);
  }
  const a = detailOf(details, 'a');
  assert.equal(a.presses, 2);
  assert.deepEqual(entries(a.previousChars), [['か', 1]]);
  assert.equal(a.noPreviousChar, 1);
  const k = detailOf(details, 'k');
  assert.equal(k.noPreviousChar, 1);
});

test('ローマ字: 続くかなの前の文字は、直前の入力単位のかなになる', () => {
  const details = computeKeyDetails(traceFor('qwerty', 'しゃか', 'kunrei'));
  const k = detailOf(details, 'k');
  assert.deepEqual(entries(k.previousChars), [['しゃ', 1]]);
  assert.equal(k.noPreviousChar, 0);
  // 2つめのaは「か」の中の打鍵。前の文字は「しゃ」
  const a = detailOf(details, 'a');
  assert.deepEqual(entries(a.previousChars), [['しゃ', 1]]);
  assert.equal(a.noPreviousChar, 1);
});

test('AZIK: 複数のかなを1つの見出しにした綴りは1つの入力単位になる', () => {
  // 「かん」はkzの2打鍵。続く「か」の前の文字が「かん」になる
  const trace = traceFor('qwerty', 'かんか', 'azik');
  assert.equal(trace.skipped, 0);
  assert.deepEqual(
    trace.strokes.map((stroke) => [stroke.inputIndex, stroke.inputChar]),
    [[0, 'かん'], [0, 'かん'], [2, 'か'], [2, 'か']],
  );
  assert.deepEqual(trace.strokes.map((stroke) => stroke.presses[0].keys[0].id), ['k', 'z', 'k', 'a']);
  const details = computeKeyDetails(trace);
  const k = detailOf(details, 'k');
  assert.equal(k.presses, 2);
  assert.deepEqual(entries(k.previousChars), [['かん', 1]]);
  assert.equal(k.noPreviousChar, 1);
  assert.equal(detailOf(details, 'z').noPreviousChar, 1);
  assert.deepEqual(entries(detailOf(details, 'a').previousChars), [['かん', 1]]);
});

test('打てずに飛ばした文字を挟んでも、直前に打った入力単位が前の文字になる', () => {
  const trace = traceFor('shingeta', 'か☃か');
  assert.equal(trace.skipped, 1);
  const d = detailOf(computeKeyDetails(trace), 'd');
  assert.deepEqual(entries(d.previousChars), [['か', 1]]);
  assert.equal(d.noPreviousChar, 1);
});

test('1つの押下が複数のキーを持つ時は、各キーに1回ずつ数え、距離を按分しない', () => {
  // a(r2c0)とq(r1c0)はどちらも左小指。指はその間の重心を押す
  const layout = fromKana('chord', 'chord', { x: [['a', 'q']] });
  const trace = chordTrace('xx', layout);
  assert.equal(trace.strokes[0].presses[0].keys.length, 2);
  const details = computeKeyDetails(trace);
  const [first, second] = trace.strokes.map((stroke) => stroke.presses[0]);
  const rounded = (value: number) => Math.round(value * 1000) / 1000;
  for (const id of ['a', 'q']) {
    const detail = detailOf(details, id);
    assert.equal(detail.presses, 2, id);
    assert.deepEqual(entries(detail.roles), [['output', 2]], id);
    assert.deepEqual(entries(detail.distances), [[rounded(first.distance), 1], [rounded(second.distance), 1]].sort((x, y) => x[0] - y[0]), id);
    assert.equal(sum(detail.origins.map((o) => o.fromPrevious + o.fromHome)), 2, id);
  }
  // 2回目は重心に残ったままなので距離0、1回目はホームから
  assert.equal(second.distance, 0);
  assert.equal(second.origin?.from, 'previous');
  assert.equal(first.origin?.from, 'home');
});

test('起点が採用した候補を表す: 同指連続は直前の位置、Nを超えるとホーム', () => {
  // dの後に別の指で何度か打ってからdに戻る。N=1では ΔI=2でホームから来たことになる
  const n1: TracePolicy = { ...DEFAULT_TRACE_POLICY, windowSize: 1 };
  const trace = traceFor('qwerty', 'eaaae', undefined, n1);
  const origins = trace.strokes.map((stroke) => stroke.presses[0].origin?.from);
  assert.deepEqual(origins, ['home', 'home', 'previous', 'previous', 'home']);
});

test('押し方の内訳・前の文字・起点・距離の回数の和は、どれも押下数と一致する', () => {
  const cases: Array<[string, string, string | undefined]> = [
    ['shingeta', 'がきゃ。ぱかかか、んー', undefined],
    ['qwerty', 'しゃかんじょうほうがっこう', 'kunrei'],
    ['qwerty', 'かんかんがんじゃくらんこう', 'azik'],
    ['shin-koume', 'ぴあぴかぴ', undefined],
    ['naginata-v18', 'がぎぐ、げごぱ。', undefined],
  ];
  for (const [layoutId, text, rule] of cases) {
    const trace = traceFor(layoutId, text, rule);
    const details = computeKeyDetails(trace);
    const label = `${layoutId}:${rule ?? ''}`;
    const all = [...details.merged.values(), ...[...details.faces.values()].flatMap((face) => [...face.values()])];
    for (const detail of all) {
      assert.equal(sum(detail.roles.values()), detail.presses, label);
      assert.equal(sum(detail.previousChars.values()) + detail.noPreviousChar, detail.presses, label);
      assert.equal(sum(detail.origins.map((o) => o.fromPrevious + o.fromHome)), detail.presses, label);
      assert.equal(sum(detail.distances.values()), detail.presses, label);
    }
    // 面ごとの和は合算と一致し、全面の押下数の和はMetrics.pressesと一致する
    const metrics = computeMetrics(trace, geometry);
    assert.equal(sum([...details.merged.values()].map((detail) => detail.presses)), metrics.presses, label);
    for (const [keyId, detail] of details.merged) {
      const perFace = [...details.faces.values()].map((face) => face.get(keyId)?.presses ?? 0);
      assert.equal(sum(perFace), detail.presses, `${label}:${keyId}`);
      assert.equal(detail.presses, metrics.keyCounts.get(keyId), `${label}:${keyId}`);
    }
  }
});

test('Traceが記録した起点から求めた距離はpress.distanceと一致する', () => {
  // sfbHomeCost: true（既定）では、距離は起点から目標までの距離そのもの
  const cases: Array<[string, string, string | undefined]> = [
    ['shingeta', 'がきゃ。ぱかかか、んー', undefined],
    ['qwerty', 'しゃかんじょうほうがっこう', 'kunrei'],
    ['qwerty', 'かんかんがんじゃくらんこう', 'azik'],
    ['shin-koume', 'ぴあぴかぴ', undefined],
  ];
  for (const [layoutId, text, rule] of cases) {
    for (const stroke of traceFor(layoutId, text, rule).strokes) {
      for (const press of stroke.presses) {
        assert.ok(press.origin, `${layoutId}:${press.keys.map((key) => key.id).join('+')}`);
        assert.ok(
          Math.abs(dist(press.origin.at, press.target) - press.distance) < 1e-9,
          `${layoutId}:${press.keys.map((key) => key.id).join('+')}`,
        );
      }
    }
  }
});
