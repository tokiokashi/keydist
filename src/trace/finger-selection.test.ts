import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ALL_FINGERS,
  buildGeometry,
  columnFingerAssignment,
  DEFAULT_FINGER_ASSIGNMENT,
  fingerDist,
  makeFingerAssignment,
  QWERTY_OPTIMIZED_FINGER_ASSIGNMENT,
  type Finger,
  type FingerAssignment,
  PHYSICAL_SHAPES,
  type Geometry,
  type Point,
} from '#input/shapes/geometry.ts';
import { faceFromEntries, fromFaces, fromKana, LAYOUTS, LAYOUT_BY_ID, withRomaji, type Layout } from '#input/layouts/index.ts';
import { kunrei } from '#input/romaji/kunrei.ts';
import { computeMetrics } from '#interpretation/metrics.ts';
import { analyzeStrokeStructure } from '#interpretation/structure/aggregate.ts';
import { DEFAULT_CHAIN_INTERPRETATION } from '#interpretation/structure/chain.ts';
import { DEFAULT_ARPEGGIO_INTERPRETATION } from '#interpretation/structure/arpeggio.ts';
import { DEFAULT_ACTION_REALIZATION_POLICY, DEFAULT_TRIGGER_REALIZATION_POLICY } from '#input/semantics/index.ts';
import { generateTrace, type TracePolicy, type Trace } from './generate.ts';
import { strokeFingerChoices } from './finger-selection.ts';

const SHAPE = 'row-staggered';
const opts = (o: Partial<TracePolicy> = {}): TracePolicy => ({ windowSize: 3, sfbHomeCost: true, ...o });
const near = (a: number, b: number, msg?: string) =>
  assert.ok(Math.abs(a - b) < 1e-9, `${msg ?? ''} expected ${b}, got ${a}`);

/** 英字1文字が同じ刻印のキー1打になる配列 */
const LETTERS = 'abcdefghijklmnopqrstuvwxyz';
const letterLayout = (extra: Record<string, string[][]> = {}): Layout =>
  fromKana('letters', 'letters', {
    ...Object.fromEntries([...LETTERS].map((c) => [c, [[c]]])),
    ...extra,
  });

/** 打鍵ごとの「キーid → 指」 */
const fingersOf = (trace: Trace): Map<string, Finger>[] =>
  trace.strokes.map((stroke) => new Map(stroke.presses.flatMap((press) => press.keys.map((key) => [key.id, press.finger] as const))));

/** 基本の指に追加の担当を足した割り当て（既定の列固定が元） */
function withExtra(extra: Record<string, Finger[]>, id = 'test-extra'): FingerAssignment {
  const base = DEFAULT_FINGER_ASSIGNMENT;
  return makeFingerAssignment(id, id, { ...base.baseFinger }, { ...base.homeKey }, extra);
}

// ---- 範囲ごとの全通りの数え上げ（動的計画法と独立に書いた参照実装） ----

interface PlannedStroke { readonly ordinal: number; readonly keys: readonly string[] }

function planOf(text: string, defs: Record<string, string[][]>): PlannedStroke[] {
  const strokes: PlannedStroke[] = [];
  [...text].forEach((char, ordinal) => {
    for (const step of defs[char]) strokes.push({ ordinal, keys: step });
  });
  return strokes;
}

interface RefState {
  prev: Record<Finger, Point>;
  last: Record<Finger, number>;
  lastInput: Record<Finger, number>;
}

function cloneRef(state: RefState): RefState {
  return { prev: { ...state.prev }, last: { ...state.last }, lastInput: { ...state.lastInput } };
}

/** 1打鍵を進め、(同指連続, 丸めた距離, 基本の指で打ったキー数) を返す */
function refStep(
  geometry: Geometry,
  state: RefState,
  stroke: PlannedStroke,
  strokeIndex: number,
  fingers: readonly Finger[],
  windowSize: number,
): { sfb: number; distance: number; base: number } {
  const groups = new Map<Finger, string[]>();
  stroke.keys.forEach((key, slot) => {
    const list = groups.get(fingers[slot]) ?? [];
    list.push(key);
    groups.set(fingers[slot], list);
  });
  let sfb = 0;
  let total = 0;
  const next: [Finger, Point][] = [];
  for (const [finger, keys] of groups) {
    const points = keys.map((key) => geometry.keys.get(key)!);
    const offThumbKey = (finger === 'LT' || finger === 'RT') && points.some((p) => p.finger !== 'LT' && p.finger !== 'RT');
    const target: Point = {
      x: points.reduce((a, p) => a + p.x, 0) / points.length,
      y: points.reduce((a, p) => a + p.y, 0) / points.length,
      ...(offThumbKey ? { offThumbKey: true as const } : {}),
    };
    const gap = strokeIndex - state.last[finger] - 1;
    const inputDistance = stroke.ordinal - state.lastInput[finger];
    const stay = refDist(finger, state.prev[finger], target);
    const home = refDist(finger, geometry.homes[finger], target);
    if (gap === 0) {
      total += stay;
      if (state.prev[finger].x !== target.x || state.prev[finger].y !== target.y) sfb++;
    } else if (inputDistance <= windowSize) total += Math.min(stay, home);
    else total += home;
    next.push([finger, target]);
  }
  for (const [finger, target] of next) {
    state.prev[finger] = target;
    state.last[finger] = strokeIndex;
    state.lastInput[finger] = stroke.ordinal;
  }
  const base = stroke.keys.filter((key, slot) => geometry.keys.get(key)!.finger === fingers[slot]).length;
  return { sfb, distance: Math.round(total * 1e6), base };
}

/** 親指だけ、親指キーと親指キー以外の間を1uとする */
function refDist(finger: Finger, a: Point, b: Point): number {
  const thumb = finger === 'LT' || finger === 'RT';
  if (thumb && Boolean(a.offThumbKey) !== Boolean(b.offThumbKey)) return 1;
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function refChoices(geometry: Geometry, stroke: PlannedStroke): Finger[][] {
  let combos: Finger[][] = [[]];
  for (const key of stroke.keys) {
    const candidates = geometry.fingerCandidates.get(key)!;
    combos = combos.flatMap((combo) => candidates.map((finger) => [...combo, finger]));
  }
  const free = combos.filter((combo) => new Set(combo).size === combo.length);
  return free.length > 0 ? free : combos;
}

/** 各入力で、その入力からN入力先までの全通りを数え、最小の並びのうち今の入力の指だけを確定していく */
function referenceFingers(
  geometry: Geometry,
  strokes: readonly PlannedStroke[],
  windowSize: number,
): Finger[][] {
  const state: RefState = { prev: {} as RefState['prev'], last: {} as RefState['last'], lastInput: {} as RefState['lastInput'] };
  for (const finger of ALL_FINGERS) {
    state.prev[finger] = geometry.homes[finger];
    state.last[finger] = Number.NEGATIVE_INFINITY;
    state.lastInput[finger] = Number.NEGATIVE_INFINITY;
  }
  const result: Finger[][] = [];
  let index = 0;
  while (index < strokes.length) {
    const ordinal = strokes[index].ordinal;
    const end = strokes.findIndex((stroke) => stroke.ordinal > ordinal + windowSize);
    const windowEnd = end < 0 ? strokes.length : end;
    const firstEnd = strokes.findIndex((stroke) => stroke.ordinal > ordinal);
    const inputEnd = firstEnd < 0 ? strokes.length : firstEnd;

    let best: { sfb: number; distance: number; base: number; sequence: number[]; fingers: Finger[][] } | undefined;
    const visit = (
      at: number,
      s: RefState,
      sfb: number,
      distance: number,
      base: number,
      sequence: number[],
      fingers: Finger[][],
    ) => {
      if (at === windowEnd) {
        const candidate = { sfb, distance, base, sequence, fingers };
        if (best === undefined || isBetter(candidate, best)) best = candidate;
        return;
      }
      for (const combo of refChoices(geometry, strokes[at])) {
        const copy = cloneRef(s);
        const step = refStep(geometry, copy, strokes[at], at, combo, windowSize);
        visit(
          at + 1,
          copy,
          sfb + step.sfb,
          distance + step.distance,
          base + step.base,
          [...sequence, ...combo.map((finger) => ALL_FINGERS.indexOf(finger))],
          at < inputEnd ? [...fingers, combo] : fingers,
        );
      }
    };
    visit(index, state, 0, 0, 0, [], []);
    for (let at = index; at < inputEnd; at++) {
      const chosen = best!.fingers[at - index];
      refStep(geometry, state, strokes[at], at, chosen, windowSize);
      result.push(chosen);
    }
    index = inputEnd;
  }
  return result;
}

function isBetter(
  a: { sfb: number; distance: number; base: number; sequence: number[] },
  b: { sfb: number; distance: number; base: number; sequence: number[] },
): boolean {
  if (a.sfb !== b.sfb) return a.sfb < b.sfb;
  if (a.distance !== b.distance) return a.distance < b.distance;
  if (a.base !== b.base) return a.base > b.base;
  for (let i = 0; i < a.sequence.length; i++) {
    if (a.sequence[i] !== b.sequence[i]) return a.sequence[i] < b.sequence[i];
  }
  return false;
}

/** 決まった乱数列（再現のため） */
function lcg(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

function randomText(seed: number, alphabet: string, length: number): string {
  const random = lcg(seed);
  return Array.from({ length }, () => alphabet[Math.floor(random() * alphabet.length)]).join('');
}

/** 隣の列の指にも担当させた、担当する指の多い割り当て */
function richAssignment(): FingerAssignment {
  const columnFinger = DEFAULT_FINGER_ASSIGNMENT.fingerKeys;
  const extra: Record<string, Finger[]> = {};
  const rows = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'];
  const order: Finger[] = ['LP', 'LR', 'LM', 'LI', 'LI', 'RI', 'RI', 'RM', 'RR', 'RP'];
  for (const row of rows) {
    [...row].forEach((key, col) => {
      const around = [order[col - 1], order[col + 1]].filter((finger): finger is Finger => finger !== undefined);
      extra[key] = around.filter((finger) => !columnFinger[finger].includes(key));
    });
  }
  return withExtra(extra, 'rich');
}

test('範囲ごとの全通りを数え上げた結果と一致する（1入力が1打鍵）', () => {
  const layout = letterLayout();
  const geometry = buildGeometry(SHAPE, QWERTY_OPTIMIZED_FINGER_ASSIGNMENT);
  const defs = Object.fromEntries([...LETTERS].map((c) => [c, [[c]]]));
  for (const [seed, windowSize] of [[1, 1], [2, 2], [3, 3], [4, 1], [5, 2], [6, 3], [7, 0]] as const) {
    const text = randomText(seed, 'ykjiubnmgcdhxzrtaseol', 24);
    const expected = referenceFingers(geometry, planOf(text, defs), windowSize);
    const trace = generateTrace(text, layout, geometry, opts({ windowSize }));
    const actual = fingersOf(trace).map((map, index) => [...map.keys()].map((key) => map.get(key)!).slice(0, expected[index].length));
    assert.deepEqual(actual, expected, `text=${text} N=${windowSize}`);
  }
});

test('物理配列に無いキーで打鍵が0個になる入力が範囲の中にあっても、全通りを数え上げた結果と一致する', () => {
  // `-`の段を持たない物理配列では、「ー」の入力は打鍵が無いまま1入力として数えられる
  const shape = { ...PHYSICAL_SHAPES[SHAPE], rowWidths: [10, 10, 10, 10] };
  const geometry = buildGeometry(shape, QWERTY_OPTIMIZED_FINGER_ASSIGNMENT);
  assert.equal(geometry.keys.has('-'), false);
  const layout = withRomaji(LAYOUT_BY_ID.get('qwerty')!, kunrei());
  // ローマ字入力では、かなを綴りに展開した1文字ごとが1入力になる
  const romaji: Record<string, string> = { い: 'i', う: 'u', ふ: 'hu', き: 'ki', く: 'ku', し: 'si', ゆ: 'yu', ー: '-' };
  const defs: Record<string, string[][]> = {
    ...Object.fromEntries([...'iuhkysx'].map((c) => [c, [[c]]])),
    '-': [],
  };
  for (let seed = 21; seed < 61; seed++) {
    const windowSize = 1 + (seed % 4);
    const text = randomText(seed, 'いうふきくしゆーーー', 14);
    const expected = referenceFingers(geometry, planOf([...text].map((c) => romaji[c]).join(''), defs), windowSize);
    const trace = generateTrace(text, layout, geometry, opts({ windowSize }));
    const actual = fingersOf(trace).map((map, index) => [...map.keys()].map((key) => map.get(key)!).slice(0, expected[index].length));
    assert.deepEqual(actual, expected, `text=${text} N=${windowSize}`);
  }
});

test('範囲ごとの全通りを数え上げた結果と一致する（担当する指が多い割り当て・短い文章）', () => {
  const layout = letterLayout();
  const geometry = buildGeometry(SHAPE, richAssignment());
  const defs = Object.fromEntries([...LETTERS].map((c) => [c, [[c]]]));
  for (const [seed, windowSize] of [[11, 1], [12, 2], [13, 2], [14, 1]] as const) {
    const text = randomText(seed, 'qwertasdfgzxcvyuiophjklnm', 12);
    const expected = referenceFingers(geometry, planOf(text, defs), windowSize);
    const trace = generateTrace(text, layout, geometry, opts({ windowSize }));
    const actual = fingersOf(trace).map((map, index) => [...map.keys()].map((key) => map.get(key)!).slice(0, expected[index].length));
    assert.deepEqual(actual, expected, `text=${text} N=${windowSize}`);
  }
});

test('1つの入力が複数の打鍵になる時も、全通りを数え上げた結果と一致し、同じ入力の中の打鍵の間もg=0で数える', () => {
  const defs: Record<string, string[][]> = {
    ...Object.fromEntries([...LETTERS].map((c) => [c, [[c]]])),
    ゆ: [['y'], ['u']],
    き: [['k'], ['i']],
    む: [['m'], ['u']],
  };
  const layout = letterLayout({ ゆ: defs['ゆ'], き: defs['き'], む: defs['む'] });
  const geometry = buildGeometry(SHAPE, QWERTY_OPTIMIZED_FINGER_ASSIGNMENT);
  for (const [seed, windowSize] of [[21, 1], [22, 2], [23, 3]] as const) {
    const text = randomText(seed, 'ゆきむaoenk', 10);
    const strokes = planOf(text, defs);
    const expected = referenceFingers(geometry, strokes, windowSize);
    const trace = generateTrace(text, layout, geometry, opts({ windowSize }));
    assert.equal(trace.strokes.length, strokes.length);
    const actual = fingersOf(trace).map((map, index) => strokes[index].keys.map((key) => map.get(key)!));
    assert.deepEqual(actual, expected, `text=${text} N=${windowSize}`);
  }

  // 「ゆ」のyの次のuは、yを打った指が残っていればg=0の同指連続になる。
  // 同指連続を先に避けるので、yとuは別の指で打つ
  const trace = generateTrace('ゆ', layout, geometry, opts());
  const [first, second] = fingersOf(trace);
  assert.notEqual(first.get('y'), second.get('u'));
  assert.equal(computeMetrics(trace, geometry).sameFinger, 0);
});

test('同点の決め方: 基本の指を優先し、それでも同じなら指の固定の順で先の指を選ぶ', () => {
  // LP・LM・LIがどれもホームをfにする。fを打つ距離は3本とも0で、同指連続も0で同点になる
  const homes = { ...DEFAULT_FINGER_ASSIGNMENT.homeKey, LP: 'f', LM: 'f' };
  const make = (extra: Record<string, Finger[]>, base: 'LI' | 'RI') => makeFingerAssignment(
    'tie',
    'tie',
    { ...DEFAULT_FINGER_ASSIGNMENT.baseFinger, f: base },
    // 基本の指がRIの時、LIはfを担当しないので、ホームをgにする
    base === 'RI' ? { ...homes, LI: 'g' } : homes,
    extra,
  );
  const letters = letterLayout();

  // 基本の指(LI)が同点なら、固定の順で先のLP・LMより基本の指を選ぶ
  const baseWins = make({ f: ['LP', 'LM', 'LI'] }, 'LI');
  const g1 = buildGeometry(SHAPE, baseWins);
  assert.equal(fingersOf(generateTrace('f', letters, g1, opts()))[0].get('f'), 'LI');

  // 基本の指(RI)は距離で負けるので、距離が同じLPとLMのうち固定の順で先のLPを選ぶ
  const orderWins = make({ f: ['LP', 'LM', 'RI'] }, 'RI');
  const g2 = buildGeometry(SHAPE, orderWins);
  assert.equal(fingersOf(generateTrace('f', letters, g2, opts()))[0].get('f'), 'LP');
});

test('同時押しで1本の指が2つのキーを打つ選び方は、他の選び方がある時は外す。無い時だけ重心を目標にする', () => {
  const chord = letterLayout({ Ａ: [['k', 'i']] });
  // k・iはどちらもRI・RM・RRが担当する。別々の指で打つ選び方がある
  const geometry = buildGeometry(SHAPE, withExtra({ k: ['RI', 'RR'], i: ['RI', 'RR'] }, 'two-keys'));
  const separate = generateTrace('Ａ', chord, geometry, opts());
  assert.equal(separate.strokes[0].presses.length, 2);
  for (const press of separate.strokes[0].presses) assert.equal(press.keys.length, 1);

  // k・iを担当する指がRMだけなら、1本の指が両方を押し、目標は重心になる
  const forced = buildGeometry(SHAPE, withExtra({}, 'forced'));
  const trace = generateTrace('Ａ', chord, forced, opts());
  assert.equal(trace.strokes[0].presses.length, 1);
  const press = trace.strokes[0].presses[0];
  assert.deepEqual(press.keys.map((key) => key.id).sort(), ['i', 'k']);
  const k = forced.keys.get('k')!;
  const i = forced.keys.get('i')!;
  near(press.target.x, (k.x + i.x) / 2, '重心x');
  near(press.target.y, (k.y + i.y) / 2, '重心y');
});

test('押さえ続けている指は、押さえている間は他のキーに選ばない', () => {
  // fを押さえ続け、押さえている間にhを打つ。fとhはどちらもLIとRIが担当する
  const layout = fromFaces('hold', 'hold', [{
    ...faceFromEntries(['f'], 'simultaneous', { g: 'x', h: 'y' }),
    inputRole: 'modifier',
    triggerPersistence: 'hold-capable',
    triggerOrder: 'prefix',
  }]);
  const policy = opts({ triggerRealizationPolicy: { useHold: true }, windowSize: 3 });
  const both = withExtra({ f: ['RI'], g: ['RI'], h: ['LI'] }, 'hold-both');
  const geometry = buildGeometry(SHAPE, both);
  const trace = generateTrace('xy', layout, geometry, policy);
  assert.equal(trace.strokes.length, 2);
  const [start, cont] = fingersOf(trace);
  const holder = start.get('f')!;
  const second = cont.get('h')!;
  assert.notEqual(second, holder, '押さえている指でhを打たない');
  // 2打鍵目の参加(押さえ続けるf)の指は、1打鍵目にfを打った指
  const participation = trace.strokes[1].participations.find((p) => p.roles.includes('held-trigger'));
  assert.equal(participation?.finger, holder);

  // 担当する指がすべて押さえている最中なら、基本の指で打つ（hを担当するLIが、fを押さえている）
  const only = buildGeometry(SHAPE, withExtra({ h: ['LI'] }, 'hold-only'));
  const forced = generateTrace('xy', layout, only, policy);
  const [forcedStart, forcedContinue] = fingersOf(forced);
  assert.equal(forcedStart.get('f'), 'LI');
  assert.equal(forcedContinue.get('h'), 'RI', 'hの基本の指');
});

test('親指キーと親指キー以外のキーの間は、位置によらず1uになる', () => {
  const geometry = buildGeometry(SHAPE, withExtra({ n: ['RT'], m: ['RT'], b: ['RT'] }, 'thumb'));
  const home = geometry.homes.RT;
  const n = geometry.keys.get('n')!;
  const b = geometry.keys.get('b')!;
  const m = geometry.keys.get('m')!;
  const space = geometry.keys.get('thumb-r')!;
  // 遠いキーでも、座標の距離は1uではない
  const far = geometry.keys.get('/')!;
  assert.ok(Math.hypot(home.x - far.x, home.y - far.y) > 3);

  const offKey = (key: { x: number; y: number }): Point => ({ x: key.x, y: key.y, offThumbKey: true });
  near(fingerDist('RT', home, offKey(n)), 1, '親指キーからn');
  near(fingerDist('RT', offKey(m), home), 1, 'mから親指キー');
  near(fingerDist('RT', offKey(b), offKey(m)), Math.hypot(b.x - m.x, b.y - m.y), '親指キー以外どうしは座標');
  near(fingerDist('RT', { x: space.x, y: space.y }, { x: home.x, y: home.y }), 0, '親指キーどうし');
  near(fingerDist('RI', home, offKey(n)), Math.hypot(home.x - n.x, home.y - n.y), '親指以外は座標');

  // 親指がnを打つ選び方になる文章: ホームから1u。距離が座標なら人差し指より遠い
  const layout = letterLayout({ ' ': [['thumb-r']] });
  const trace = generateTrace('n', layout, geometry, opts());
  assert.equal(fingersOf(trace)[0].get('n'), 'RT');
  near(trace.strokes[0].distance, 1, 'ホームの親指キーからnまで');
  assert.equal(trace.strokes[0].presses[0].target.offThumbKey, true);

  // nから親指キーへ戻るのも1u。mはnの隣(座標で1u)なので、mへは座標の距離
  const back = generateTrace('n m', letterLayout({ ' ': [['thumb-r']] }), geometry, opts({ windowSize: 0 }));
  assert.equal(back.strokes.length, 3);
});

test('担当する指を足しても、大文字や親指シフトの入力の候補の選択は基本の指だけの割り当てと同じになる', () => {
  const plain = buildGeometry(SHAPE, DEFAULT_FINGER_ASSIGNMENT);
  const multi = buildGeometry(SHAPE, QWERTY_OPTIMIZED_FINGER_ASSIGNMENT);
  const keysOf = (trace: Trace) => trace.strokes.map((stroke) => stroke.presses.flatMap((press) => press.keys.map((key) => key.id)).sort());

  const qwerty = LAYOUTS.find((layout) => layout.id === 'qwerty')!;
  const text = 'Yuki Kimu Nobu Hajime';
  assert.deepEqual(keysOf(generateTrace(text, qwerty, multi, opts())), keysOf(generateTrace(text, qwerty, plain, opts())));
  // 大文字Yは、基本の指(右人差し指)の反対の左Shiftを選ぶ
  const upper = generateTrace('Y', qwerty, multi, opts());
  assert.ok(upper.strokes[0].presses.some((press) => press.keys.some((key) => key.id === 'shift-l')) || keysOf(upper).flat().includes('shift-l'));

  for (const id of ['naginata-v18', 'shin-jis-prefix']) {
    const layout = LAYOUT_BY_ID.get(id);
    if (layout === undefined) continue;
    for (const preferOppositeThumb of [false, true]) {
      const a = generateTrace('左右のこもれび', layout, multi, opts({ preferOppositeThumb }));
      const b = generateTrace('左右のこもれび', layout, plain, opts({ preferOppositeThumb }));
      assert.deepEqual(keysOf(a), keysOf(b), `${id} preferOppositeThumb=${preferOppositeThumb}`);
    }
  }
});

test('選んだ指とその手が、指ごとの距離・同指連続・指間距離・構造解析・手に使われる', () => {
  // yは基本の指が右人差し指。左人差し指でも担当する
  const geometry = buildGeometry(SHAPE, withExtra({ y: ['LI'] }, 'choose'));
  const layout = letterLayout();
  const trace = generateTrace('fyfy', layout, geometry, opts({ windowSize: 3 }));
  const fingers = fingersOf(trace);
  // 左人差し指がfを打った直後のyは、g=0で同じ指に続けず、右人差し指で打つ
  assert.equal(fingers[0].get('f'), 'LI');
  assert.equal(fingers[1].get('y'), 'RI');

  const press = trace.strokes[1].presses[0];
  assert.equal(press.finger, 'RI');
  const participation = trace.strokes[1].participations.find((p) => p.keys.some((key) => key.id === 'y'))!;
  assert.equal(participation.finger, 'RI');
  assert.equal(participation.hand, 'right');

  // 左人差し指がyを打つ場合: 先読みNを0にして、同じ指の連続を避ける理由が無い状況を作る
  const solo = generateTrace('y', layout, buildGeometry(SHAPE, withExtra({ y: ['LI'] }, 'solo')), opts());
  const soloPress = solo.strokes[0].presses[0];
  const m = computeMetrics(solo, buildGeometry(SHAPE, withExtra({ y: ['LI'] }, 'solo')));
  assert.equal(m.perFingerPresses[soloPress.finger], 1);
  assert.equal(m.perFinger[soloPress.finger], solo.strokes[0].distance);
  assert.equal(m.fingerAssignmentHasMultiFingerKeys, true);
  assert.equal(participationHand(solo), soloPress.finger.startsWith('L') ? 'left' : 'right');

  // 構造解析は選んだ指を読む: 担当する指が変わる分、同指連続の数え方が変わる
  const plain = buildGeometry(SHAPE, DEFAULT_FINGER_ASSIGNMENT);
  const multi = buildGeometry(SHAPE, QWERTY_OPTIMIZED_FINGER_ASSIGNMENT);
  const text = 'yuyuyuyujujuyuyu';
  const analyses = [plain, multi].map((g) => {
    const t = generateTrace(text, layout, g, opts());
    return {
      sfb: computeMetrics(t, g).sameFinger,
      analysis: analyzeStrokeStructure(
        t.strokes,
        { ...DEFAULT_CHAIN_INTERPRETATION, breakOnSameFinger: false },
        DEFAULT_ARPEGGIO_INTERPRETATION,
        DEFAULT_TRIGGER_REALIZATION_POLICY,
        DEFAULT_ACTION_REALIZATION_POLICY,
      ),
    };
  });
  assert.ok(analyses[0].sfb > analyses[1].sfb);
  assert.equal(analyses[0].analysis.aggregate.sfb.events, analyses[0].sfb);
  assert.equal(analyses[1].analysis.aggregate.sfb.events, analyses[1].sfb);
});

function participationHand(trace: Trace): 'left' | 'right' {
  return trace.strokes[0].participations[0].hand;
}

test('選んだ指は打鍵の指の位置に反映される（キーから引いた指ではない）', () => {
  const geometry = buildGeometry(SHAPE, withExtra({ y: ['RM'] }, 'position'));
  const layout = letterLayout();
  const trace = generateTrace('ky', layout, geometry, opts());
  const [first, second] = fingersOf(trace);
  // kはRMが担当する。次のyはRMが残っていれば同指連続になるので、基本のRIで打つ
  assert.equal(first.get('k'), 'RM');
  assert.equal(second.get('y'), 'RI');
  const k = geometry.keys.get('k')!;
  assert.deepEqual({ x: trace.strokes[1].positions.RM.x, y: trace.strokes[1].positions.RM.y }, { x: k.x, y: k.y });
});

test('担当する指が1本のキーだけの割り当ては、指の選び方を何も変えない', () => {
  const geometry = buildGeometry(SHAPE);
  const trace = generateTrace('the quick brown fox', letterLayout({ ' ': [['thumb-r']] }), geometry, opts());
  for (const stroke of trace.strokes) {
    for (const press of stroke.presses) {
      for (const key of press.keys) assert.equal(press.finger, key.finger);
    }
  }
});

test('組み込みのQWERTY最適化は、元の割り当ての担当と基本の指を残して、表のキーを足す', () => {
  const expected: Record<string, Finger[]> = {
    LP: [], LR: ['z'], LM: ['r', 't', 'x'], LI: ['c', 'd', 'y', 'h', 'n'], LT: ['x'],
    RT: ['b', 'n', 'm'], RI: ['g', 'b', 'k', 'i'], RM: ['y', 'u', 'j'], RR: ['k', 'i'], RP: [],
  } as unknown as Record<string, Finger[]>;
  const original = DEFAULT_FINGER_ASSIGNMENT;
  const optimized = QWERTY_OPTIMIZED_FINGER_ASSIGNMENT;
  assert.deepEqual(optimized.baseFinger, original.baseFinger);
  assert.deepEqual(optimized.homeKey, original.homeKey);
  for (const finger of ALL_FINGERS) {
    const added = optimized.fingerKeys[finger].filter((key) => !original.fingerKeys[finger].includes(key));
    assert.deepEqual([...added].sort(), [...(expected[finger] as unknown as string[])].sort(), finger);
    for (const key of original.fingerKeys[finger]) assert.ok(optimized.fingerKeys[finger].includes(key), `${finger} keeps ${key}`);
  }
});

test('columnFingerAssignmentは既定の割り当てと同じ内容を作る', () => {
  const same = columnFingerAssignment(
    'default',
    '既定（列固定）',
    ['LP', 'LR', 'LM', 'LI', 'LI', 'RI', 'RI', 'RM', 'RR', 'RP', 'RP', 'RP', 'RP'],
    { LP: 0, LR: 1, LM: 2, LI: 3, RI: 6, RM: 7, RR: 8, RP: 9 },
  );
  assert.deepEqual(same, DEFAULT_FINGER_ASSIGNMENT);
});

test('押さえ続けている指は、他のキーの候補から外れ、担当する指がすべて塞がっていれば基本の指になる', () => {
  const geometry = buildGeometry(SHAPE, DEFAULT_FINGER_ASSIGNMENT);
  const h = geometry.keys.get('h')!;
  const held = new Map<string, Finger>([['f', 'RI']]);
  const stroke = (candidates: Finger[]) => ({ keys: [h], candidates: [candidates], heldKeys: ['f'] });
  assert.deepEqual(strokeFingerChoices(stroke(['LI', 'RI']), held), [['LI']]);
  assert.deepEqual(strokeFingerChoices(stroke(['LI', 'RI']), new Map()), [['LI'], ['RI']]);
  // 候補が押さえている指だけなら、そのキーの基本の指で打つ
  assert.deepEqual(strokeFingerChoices(stroke(['RI']), held), [[h.finger]]);
});
