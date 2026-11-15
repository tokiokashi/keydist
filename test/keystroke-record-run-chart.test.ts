import assert from 'node:assert/strict';
import test from 'node:test';
import { pointPositionsOf } from '#analyzers/run-chart/extract.ts';
import { finishKeystrokeRecord, recordBaseTrace, recordPlanOf, recordRangeStatuses, type RecordMeta } from '#engine/keystroke-record.ts';
import { resolveEngineInput, type ResolvedInput } from '#engine/resolved-input.ts';
import { EMPTY_SETTINGS_OVERRIDES } from '#engine/settings-items.ts';
import { LAYOUT_BY_ID } from '#input/layouts/index.ts';
import { isThumbKeyId, PHYSICAL_SHAPES, type PhysicalShape } from '#input/shapes/geometry.ts';
import { textRangeBounds } from '#input/text/display-ranges.ts';
import { pressSentenceSessionKey, sentenceSessionFinished, startSentenceSession, type SentencePlan } from '#interpretation/timing/sentence-session.ts';

const CATALOG = {
  layouts: LAYOUT_BY_ID,
  shapes: new Map<string, PhysicalShape>(Object.values(PHYSICAL_SHAPES).map((shape) => [shape.id, shape])),
};

/** 約2300字、「。」で終わる文の繰り返し。範囲が2つになる。し・ち・つ・ふ・じ・ん・促音・拗音を含む。 */
const SENTENCES = [
  'ふじさんのしゃしんをとったよ。',
  'ぼくはちかくのきっさてんでいっぷくした。',
  'しんぶんをよんで、つぎのひにじゅぎょうがあった。',
  'ちゃいろのつくえのうえにしゅくだいがある。',
  'おんがくをきいてほんをよんだ。',
];
const TEXT = SENTENCES.join('').repeat(Math.ceil(2300 / SENTENCES.join('').length));

const META: RecordMeta = {
  id: 'r1',
  recordedAt: '2026-11-15T00:00:00.000Z',
  appVersion: 'test',
  target: { kind: 'layout', layoutId: 'qwerty' },
  targetName: 'QWERTY',
  textIdentity: 'user:t',
  textName: 'テスト',
};

function resolve(layoutId: string, comboBarriers?: readonly number[]): ResolvedInput {
  const result = resolveEngineInput({
    target: { kind: 'layout', layoutId },
    setups: new Map(),
    catalog: CATALOG,
    userLayouts: new Map(),
    overrides: EMPTY_SETTINGS_OVERRIDES,
    text: TEXT,
    language: 'ja',
    ...(comboBarriers === undefined ? {} : { comboBarriers }),
  });
  assert.ok(result.ok, result.ok ? '' : JSON.stringify(result.error));
  return result.input;
}

/** 範囲の計画を、単位ごとに`choose`が選ぶ綴りで最後まで打つ。 */
function typeRange(plan: SentencePlan, choose: (unit: number, spellings: readonly string[]) => string) {
  let session = startSentenceSession([plan], 1);
  const typed: string[] = [];
  let at = 1000;
  for (let unit = 0; unit < plan.units.length; unit++) {
    const spelling = choose(unit, plan.units[unit]!.spellings);
    const steps = plan.candidateSteps(typed, unit, spelling);
    assert.ok(steps !== undefined, `${unit}番目の単位を${spelling}で打てない`);
    typed.push(spelling);
    for (const step of steps) {
      for (const key of step.keys) {
        at += 90 + (unit % 7) * 13;
        const event = isThumbKeyId(key) ? { key: ' ', code: 'Space', physicalKey: key } : { key, code: '' };
        const pressed = pressSentenceSessionKey(session, event, at, (id) => id);
        assert.notEqual(pressed.outcome.kind, 'wrong-key', `${unit}番目の単位の${key}が違うキーになった`);
        session = pressed.session;
      }
    }
  }
  assert.ok(sentenceSessionFinished(session));
  return session.records[0]!;
}

const RULE = (_unit: number, spellings: readonly string[]) => spellings[0]!;
/** 綴りを混ぜる。候補が複数ある単位で、番号に応じて先頭以外の綴りを選ぶ。 */
const MIXED = (unit: number, spellings: readonly string[]) => spellings[unit % spellings.length]!;
const LAST = (_unit: number, spellings: readonly string[]) => spellings[spellings.length - 1]!;

function checkPositions(layoutId: string, choose: typeof RULE, comboBarriers?: readonly number[]) {
  const input = resolve(layoutId, comboBarriers);
  const trace = recordBaseTrace(input);
  const positions = pointPositionsOf(trace);
  const bounds = textRangeBounds(input.text);
  assert.ok(bounds.length >= 3, '範囲が複数ある');
  const statuses = recordRangeStatuses(input, trace);
  for (const [rangeIndex, status] of statuses.entries()) {
    assert.equal(status.unmeasurable, undefined, `${layoutId}の範囲${rangeIndex}`);
    const planned = recordPlanOf(input, trace, rangeIndex);
    assert.ok(planned.ok);
    const record = typeRange(planned.plan, choose);
    const finished = finishKeystrokeRecord(input, trace, rangeIndex, record.typed, record.taps, META);
    assert.ok(finished.ok, finished.ok ? '' : finished.reason);
    const expected = positions.filter((position) => position >= status.start && position < status.end);
    const actual = [...new Set(finished.record.ends)].sort((a, b) => a - b);
    assert.deepEqual(actual, expected, `${layoutId}の範囲${rangeIndex}`);
    assert.equal(finished.record.taps.length, finished.record.ends.length);
    assert.equal(finished.record.taps[0]!.atMs, 0);
  }
  return { input, trace, statuses };
}

test('条件の規則の綴りで打った記録のeの集合は、同じ条件のRun Chartの点の位置と等しい（ローマ字の配列）', () => {
  const { statuses } = checkPositions('qwerty', RULE);
  assert.equal(statuses.length, 2);
});

test('綴りを混ぜて打った記録でも、eの集合はRun Chartの点の位置と等しい（si・shi・sshiなど）', () => {
  const input = resolve('qwerty');
  const planned = recordPlanOf(input, recordBaseTrace(input), 0);
  assert.ok(planned.ok && planned.spellings);
  const spellings = planned.plan.units.flatMap((unit) => unit.spellings);
  assert.ok(spellings.includes('shi') && spellings.includes('si'));
  assert.ok(
    planned.plan.units.some((unit) =>
      unit.spellings.some((spelling) => spelling.startsWith('kk') || spelling.startsWith('tt') || spelling.startsWith('ss')),
    ),
  );
  checkPositions('qwerty', MIXED);
  checkPositions('qwerty', LAST);
});

test('混ぜて打った記録は、ストロークの数が条件の規則の綴りの列と違っても同じeの集合になる', () => {
  const input = resolve('qwerty');
  const trace = recordBaseTrace(input);
  const planned = recordPlanOf(input, trace, 0);
  assert.ok(planned.ok);
  const rule = finishKeystrokeRecord(input, trace, 0, typeRange(planned.plan, RULE).typed, typeRange(planned.plan, RULE).taps, META);
  const mixedRecord = typeRange(planned.plan, LAST);
  const mixed = finishKeystrokeRecord(input, trace, 0, mixedRecord.typed, mixedRecord.taps, META);
  assert.ok(rule.ok && mixed.ok);
  assert.notEqual(mixed.record.ends.length, rule.record.ends.length);
  assert.deepEqual([...new Set(mixed.record.ends)], [...new Set(rule.record.ends)]);
});

test('かな配列でも、eの集合はRun Chartの点の位置と等しい', () => {
  checkPositions('naginata-v18', RULE);
});

test('コンボを持つ配列で、範囲の中に境がある時も、eの集合はRun Chartの点の位置と等しい', () => {
  // 範囲0の内側（100・400・700）と、範囲の境目の付近（範囲1の先頭の少し後）に境を置く
  const barriers = [100, 400, 700, 1300, 1700];
  const input = resolve('tk-onchoku', barriers);
  assert.deepEqual(input.comboBarriers.length > 0, true, '境が評価に渡るテキストの位置へ写っている');
  const withBarriers = checkPositions('tk-onchoku', RULE, barriers);
  const withoutBarriers = recordBaseTrace(resolve('tk-onchoku'));
  assert.notDeepEqual(
    withBarriers.trace.strokes.map((stroke) => stroke.char),
    withoutBarriers.strokes.map((stroke) => stroke.char),
    '境がコンボを止めて打鍵の列が変わっている',
  );
});

test('同時押しのかな配列でも、eの集合はRun Chartの点の位置と等しい', () => {
  checkPositions('nicola', RULE);
});

test('打てない範囲は、理由を返して記録を始めさせない', () => {
  // 名前が複数文字のキー（°）が要る配列は、取れないキーが要る
  const jisKana = resolve('jis-kana');
  const statuses = recordRangeStatuses(jisKana, recordBaseTrace(jisKana));
  assert.ok(statuses.every((status) => status.unmeasurable === 'uncapturable-key'));
  assert.deepEqual(recordPlanOf(jisKana, recordBaseTrace(jisKana), 0), { ok: false, reason: 'uncapturable-key' });
  assert.deepEqual(recordPlanOf(jisKana, recordBaseTrace(jisKana), 99), { ok: false, reason: 'no-range' });
});

test('範囲に打てずに飛ばした文字がある時は、その範囲だけを打てない範囲にする', () => {
  const text = `${TEXT.slice(0, 1200)}ａｂ${TEXT.slice(1200)}`;
  const result = resolveEngineInput({
    target: { kind: 'layout', layoutId: 'qwerty' },
    setups: new Map(),
    catalog: CATALOG,
    userLayouts: new Map(),
    overrides: EMPTY_SETTINGS_OVERRIDES,
    text,
    language: 'ja',
    verbatimText: true,
  });
  assert.ok(result.ok);
  const trace = recordBaseTrace(result.input);
  assert.ok(trace.skippedPositions.length > 0);
  const statuses = recordRangeStatuses(result.input, trace);
  const skippedAt = trace.skippedPositions[0]!;
  for (const status of statuses) {
    assert.equal(status.unmeasurable === 'skipped', skippedAt >= status.start && skippedAt < status.end);
  }
  assert.equal(statuses.filter((status) => status.unmeasurable === 'skipped').length, 1);
  assert.ok(statuses.some((status) => status.unmeasurable === undefined));
});

test('範囲だけを作り直した打鍵の列は、全文の経路で作り直した範囲と同じ打つキーの列になる（混ぜた綴り）', () => {
  // `finishKeystrokeRecord`が、打つ時に使った範囲だけの作り直しと全文の作り直しの一致を確かめる。合わなければ保存しない。
  for (const layoutId of ['qwerty', 'oonishi']) {
    const input = resolve(layoutId);
    const trace = recordBaseTrace(input);
    for (const rangeIndex of [0, 1]) {
      const planned = recordPlanOf(input, trace, rangeIndex);
      assert.ok(planned.ok);
      const record = typeRange(planned.plan, MIXED);
      const finished = finishKeystrokeRecord(input, trace, rangeIndex, record.typed, record.taps, META);
      assert.ok(finished.ok, `${layoutId}の範囲${rangeIndex}`);
    }
  }
});

test('作り直した打鍵の列のストロークの数が、記録した打鍵の数と合わない時は保存しない', () => {
  const input = resolve('qwerty');
  const trace = recordBaseTrace(input);
  const planned = recordPlanOf(input, trace, 0);
  assert.ok(planned.ok);
  const record = typeRange(planned.plan, MIXED);
  const finished = finishKeystrokeRecord(input, trace, 0, record.typed, record.taps.slice(1), META);
  assert.deepEqual(finished, { ok: false, reason: 'count-mismatch' });
});

test('綴りの組が違えば、同じ文の窓でも作り直した打鍵の列は別になる', () => {
  const input = resolve('qwerty');
  const trace = recordBaseTrace(input);
  const planned = recordPlanOf(input, trace, 0);
  assert.ok(planned.ok && planned.rebuild !== undefined);
  const { rebuild } = planned;
  const units = rebuild.context.units.slice(rebuild.span.from, rebuild.span.to);
  // 先頭の文の中で、綴りを選べる単位を2つ選び、それぞれ先頭以外の綴りにする
  const choosable = units.flatMap((unit, index) => (index < 12 && unit.spellings.length > 1 ? [index] : []));
  assert.ok(choosable.length >= 2);
  const withChange = (index: number) => rebuild.base.map((spelling, at) => (at === index ? units[index]!.spellings[1]! : spelling));
  const first = rebuild.strokes(withChange(choosable[0]!));
  const second = rebuild.strokes(withChange(choosable[1]!));
  assert.ok(first !== undefined && second !== undefined);
  const keys = (strokes: NonNullable<typeof first>) => JSON.stringify(strokes.map((stroke) => stroke.char));
  assert.notEqual(keys(first), keys(second));
  // 同じ組をもう一度作ると、同じ列になる
  assert.equal(keys(rebuild.strokes(withChange(choosable[0]!))!), keys(first));
});
