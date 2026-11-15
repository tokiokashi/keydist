import assert from 'node:assert/strict';
import test from 'node:test';
import { runChartDefinition, type RunChartRecord } from '#analyzers/run-chart/extract.ts';
import { DEFAULT_RUN_CHART_OPTIONS } from '#analyzers/run-chart/options.ts';
import { createEngineCache } from '#engine/cache.ts';
import { checkKeystrokeRecord } from '#engine/keystroke-record-check.ts';
import { recordBaseTrace } from '#engine/keystroke-record.ts';
import { EMPTY_SETTINGS_OVERRIDES, setSettingsOverride, type SettingsCascadeOverrides } from '#engine/settings-items.ts';
import type { KeystrokeRecord } from '#interpretation/record/keystroke-record.ts';
import { buildRecord, RECORD_TEXT, resolveRecordInput } from './keystroke-record-fixture.ts';

const RULE = (_unit: number, spellings: readonly string[]) => spellings[0]!;
const LAST = (_unit: number, spellings: readonly string[]) => spellings[spellings.length - 1]!;

function overridden(...args: Parameters<typeof setSettingsOverride>): SettingsCascadeOverrides {
  const written = setSettingsOverride(...args);
  assert.ok(written.ok);
  return written.overrides;
}

function check(layoutId: string, record: KeystrokeRecord, extra: Parameters<typeof resolveRecordInput>[1] = {}) {
  const input = resolveRecordInput(layoutId, extra);
  return checkKeystrokeRecord(input, recordBaseTrace(input), record);
}

test('同じ条件・同じテキストの記録は食い違わず、ストロークごとの事実を返す（条件の規則の綴り・混ぜた綴り）', () => {
  const input = resolveRecordInput('qwerty');
  const trace = recordBaseTrace(input);
  for (const choose of [RULE, LAST]) {
    const record = buildRecord(input, 0, choose);
    const result = checkKeystrokeRecord(input, trace, record);
    assert.deepEqual(result.mismatches, []);
    assert.equal(result.facts?.length, record.taps.length);
    assert.deepEqual(
      result.facts?.map((fact) => fact.end),
      record.ends,
    );
  }
});

test('句読点を打つストロークとその直後のストロークを、事実に印として載せる', () => {
  const input = resolveRecordInput('qwerty');
  const record = buildRecord(input, 0, RULE);
  const result = checkKeystrokeRecord(input, recordBaseTrace(input), record);
  const marked = result.facts!.filter((fact) => fact.adjoinsPunctuation).length;
  assert.ok(marked > 0 && marked < result.facts!.length);
});

test('テキストが違えば、テキストだけを挙げる（範囲は重ねない）', () => {
  const record = buildRecord(resolveRecordInput('qwerty'), 0, RULE);
  const result = check('qwerty', record, { text: `あ${RECORD_TEXT}` });
  assert.deepEqual(result.mismatches, ['text']);
  assert.equal(result.facts, undefined);
});

test('テキストが同じで、範囲が今の本文に無ければ、範囲を挙げる', () => {
  const record = buildRecord(resolveRecordInput('qwerty'), 0, RULE);
  const shifted: KeystrokeRecord = { ...record, range: { ...record.range, digest: '0000000000000000' } };
  assert.deepEqual(check('qwerty', shifted).mismatches, ['range']);
});

test('物理配列が違えば、物理配列を挙げる', () => {
  const record = buildRecord(resolveRecordInput('qwerty'), 0, RULE);
  const overrides = overridden(EMPTY_SETTINGS_OVERRIDES, { kind: 'layout', layoutId: 'qwerty' }, 'defaultShapeId', 'jis-row-staggered');
  const result = check('qwerty', record, { overrides });
  assert.ok(result.mismatches.includes('shape'), JSON.stringify(result.mismatches));
  assert.equal(result.facts, undefined);
});

test('条件が違えば、条件を挙げる。項目の並びが違うだけなら食い違わない', () => {
  const input = resolveRecordInput('qwerty');
  const record = buildRecord(input, 0, RULE);
  const overrides = overridden(EMPTY_SETTINGS_OVERRIDES, { kind: 'global' }, 'windowSize', 5);
  const changed = check('qwerty', record, { overrides });
  assert.deepEqual(changed.mismatches, ['conditions']);
  assert.deepEqual(changed.differingConditions, ['windowSize']);
  const reordered: KeystrokeRecord = {
    ...record,
    conditions: Object.fromEntries(Object.entries(record.conditions).reverse()) as KeystrokeRecord['conditions'],
  };
  assert.deepEqual(check('qwerty', reordered).mismatches, []);
});

test('モデルの版が違えば、版を挙げる', () => {
  const record = buildRecord(resolveRecordInput('qwerty'), 0, RULE);
  assert.deepEqual(check('qwerty', { ...record, modelVersion: record.modelVersion + 1 }).mismatches, ['version']);
});

test('打鍵の列が食い違えば、他の項目が一致していても打鍵の列を挙げる（コンボを止める境が変わった時）', () => {
  const barriers = [100, 400, 700, 1300, 1700];
  const withBarriers = resolveRecordInput('tk-onchoku', { comboBarriers: barriers });
  const record = buildRecord(withBarriers, 0, RULE, { meta: { target: { kind: 'layout', layoutId: 'tk-onchoku' } } });
  assert.deepEqual(checkKeystrokeRecord(withBarriers, recordBaseTrace(withBarriers), record).mismatches, []);
  // 境が無ければ、条件と本文は同じでも打鍵の列が変わる
  const without = check('tk-onchoku', record);
  assert.deepEqual(without.mismatches, ['keys']);
  assert.equal(without.facts, undefined);
});

test('記録のストロークの数や位置が今の打鍵の列と違えば、打鍵の列を挙げる', () => {
  const input = resolveRecordInput('qwerty');
  const trace = recordBaseTrace(input);
  const record = buildRecord(input, 0, RULE);
  assert.deepEqual(checkKeystrokeRecord(input, trace, { ...record, taps: record.taps.slice(1) }).mismatches, ['keys']);
  assert.deepEqual(checkKeystrokeRecord(input, trace, { ...record, ends: record.ends.map((end, index) => (index === 3 ? end + 1 : end)) }).mismatches, [
    'keys',
  ]);
  assert.deepEqual(checkKeystrokeRecord(input, trace, { ...record, range: { ...record.range, keysDigest: 'ffffffffffffffff' } }).mismatches, ['keys']);
});

/** 実際のengineの経路（`cache.getSetExtraction`）で、Run Chartの抽出を求める。 */
function extractRecord(
  layoutId: string,
  record: KeystrokeRecord | undefined,
  options: typeof DEFAULT_RUN_CHART_OPTIONS,
  segmentationBoundaries?: readonly number[],
) {
  const base = resolveRecordInput(layoutId);
  const input = {
    ...base,
    extractionAssets: {
      ...base.extractionAssets,
      keystrokeRecord: record,
      ...(segmentationBoundaries === undefined
        ? {}
        : { segmentation: { boundaries: segmentationBoundaries, origin: 'kana-only' as const, splitter: { name: 'test', version: '1' } } }),
    },
  };
  return createEngineCache().getSetExtraction([{ target: { kind: 'layout', layoutId }, resolution: { ok: true, input } }], runChartDefinition, options)
    .extracted.record;
}

test('Run Chartの抽出: 記録を選ぶと、eごとの間隔と、文節の区切りの直後の表を出す', () => {
  const input = resolveRecordInput('qwerty');
  const record = buildRecord(input, 0, RULE, { gapOf: (unit) => (unit % 10 === 9 ? 400 : 100), unclean: [5] });
  const boundaries = [...new Set(record.ends)].filter((end) => end % 9 === 0 && end > 0);
  const result = extractRecord('qwerty', record, { ...DEFAULT_RUN_CHART_OPTIONS, record: record.id }, boundaries) as Extract<
    RunChartRecord,
    { kind: 'ready' }
  >;
  assert.equal(result.kind, 'ready');
  assert.equal(result.positions.length, new Set(record.ends).size);
  assert.equal(result.values[0], null, '範囲の最初のeは間隔を持たない');
  assert.ok(result.values.some((value) => value === null) && result.values.some((value) => value !== null));
  assert.ok(result.table !== undefined && result.table.after.count > 0 && result.table.others.count > 0);
  assert.equal(result.origin.range.start, record.range.start);
  assert.equal(result.targetKey, 'layout:qwerty');
});

test('Run Chartの抽出: 区切りを得られない時は、間隔は出して表だけを出さない', () => {
  const input = resolveRecordInput('qwerty');
  const record = buildRecord(input, 0, RULE);
  const result = extractRecord('qwerty', record, { ...DEFAULT_RUN_CHART_OPTIONS, record: record.id });
  assert.equal(result?.kind, 'ready');
  assert.equal(result?.kind === 'ready' ? result.table : 'x', undefined);
});

test('Run Chartの抽出: 手元に記録が無い時は見つからない、対象が合わない時と条件が食い違う時は食い違いにする', () => {
  const input = resolveRecordInput('qwerty');
  const record = buildRecord(input, 0, RULE);
  const options = { ...DEFAULT_RUN_CHART_OPTIONS, record: record.id };
  assert.deepEqual(extractRecord('qwerty', undefined, options), { kind: 'missing', id: record.id });
  const otherTarget = extractRecord('oonishi', record, options);
  assert.deepEqual(otherTarget?.kind === 'mismatch' ? otherTarget.items : undefined, ['target']);
  const stale = extractRecord('qwerty', { ...record, modelVersion: record.modelVersion + 1 }, options);
  assert.deepEqual(stale?.kind === 'mismatch' ? stale.items : undefined, ['version']);
  assert.equal(extractRecord('qwerty', record, DEFAULT_RUN_CHART_OPTIONS), undefined);
});

test('Run Chartの抽出: 食い違う時の出どころは記録が持つ値で、今の入力の値を入れない。値が違う条件の項目を挙げる', () => {
  const input = resolveRecordInput('qwerty');
  const record = buildRecord(input, 0, RULE);
  const options = { ...DEFAULT_RUN_CHART_OPTIONS, record: record.id };
  const stale = extractRecord(
    'qwerty',
    { ...record, shapeId: 'recorded-shape', targetName: '記録した時の名前', conditions: { ...record.conditions, windowSize: 9 } },
    options,
  );
  assert.equal(stale?.kind, 'mismatch');
  if (stale?.kind !== 'mismatch') return;
  assert.deepEqual(stale.items, ['shape', 'conditions']);
  assert.deepEqual(stale.conditionKeys, ['windowSize']);
  assert.equal(stale.origin.targetName, '記録した時の名前');
  assert.deepEqual(Object.keys(stale.origin).sort(), [
    'appVersion',
    'modelVersion',
    'range',
    'recordedAt',
    'targetName',
    'textChars',
    'textName',
    'typedStrokes',
  ]);
});
