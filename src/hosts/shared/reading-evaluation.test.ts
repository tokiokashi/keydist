import assert from 'node:assert/strict';
import { test } from 'node:test';
import { stableStringify } from '#engine/cache-key.ts';
import type { ReadingToken } from '#input/text/reading.ts';
import type { ResolvedText } from '#input/text/resolve.ts';
import {
  analyzeForEvaluation,
  evaluationText,
  isWaitingForReading,
  outcomeFor,
  readingProvenance,
  type ReadingOutcome,
  type ReadingSource,
  type StoredReadingOutcome,
} from './reading-evaluation.ts';

const CONDITIONS = { dictionary: { name: 'IPADIC', version: '6.2.0' }, library: { name: 'lindera-wasm', version: '6.2.0' } } as const;

function resolved(text: string, language: ResolvedText['language'] = 'ja'): ResolvedText {
  return {
    ref: { kind: 'user', id: 't' },
    name: 't',
    text,
    language,
    languageOverride: undefined,
    isBuiltin: false,
    readingCorrections: {},
    wordReadingCorrections: [],
  };
}

/** 語を1つずつ返す偽の入口。呼ばれた回数も数える。 */
function source(tokenize: (text: string) => Promise<readonly ReadingToken[]>): ReadingSource & { readonly calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    conditions: CONDITIONS,
    loadCandidates: async () => ({}),
    tokenize: (text) => {
      calls.push(text);
      return tokenize(text);
    },
  };
}

const kyou: ReadingToken = { surface: '今日', byteStart: 0, byteEnd: 6, reading: 'キョウ', isUnknown: false };

test('解析できたら、語の列と解析した原文を返す', async () => {
  const reading = source(async () => [kyou]);
  assert.deepEqual(await analyzeForEvaluation(reading, '今日'), { kind: 'analyzed', sourceText: '今日', tokens: [kyou] });
});

test('辞書を読み込めない・語の位置が合わない時は、失敗の値を返し、例外にしない', async () => {
  const unavailable = source(async () => {
    throw new Error('辞書を取得できない');
  });
  assert.deepEqual(await analyzeForEvaluation(unavailable, '今日'), { kind: 'failed' });
  const mismatch = source(async () => [{ ...kyou, surface: '明日' }]);
  assert.deepEqual(await analyzeForEvaluation(mismatch, '今日'), { kind: 'failed' });
});

test('漢字を含まない日本語のテキストと英語のテキストは、状態がnoneで原文のまま', () => {
  const reading = source(async () => []);
  for (const [text, language] of [
    ['あいう', 'ja'],
    ['hello', 'en'],
    ['今日', 'en'],
  ] as const) {
    const input = resolved(text, language);
    const evaluation = evaluationText(input, reading, undefined);
    assert.equal(evaluation.state.kind, 'none');
    assert.equal(evaluation.text, input);
    assert.equal(evaluation.text.reading, undefined);
    assert.equal(evaluation.text.notationExcess, undefined);
  }
  assert.deepEqual(reading.calls, []);
});

test('漢字を含む日本語のテキストは、結果が出るまでloadingで、評価に渡すテキストは原文のまま', () => {
  const evaluation = evaluationText(
    resolved('今日は'),
    source(async () => []),
    undefined,
  );
  assert.deepEqual(evaluation.state, { kind: 'loading' });
  assert.equal(evaluation.text.text, '今日は');
  assert.equal(evaluation.text.reading, undefined);
});

test('読みに直せた時は、直した後のテキストと、辞書と解析器の版を持つ', () => {
  const evaluation = evaluationText(
    resolved('今日は'),
    source(async () => []),
    { kind: 'analyzed', sourceText: '今日は', tokens: [kyou, { surface: 'は', byteStart: 6, byteEnd: 9, reading: 'ハ', isUnknown: false }] },
  );
  assert.deepEqual(evaluation.state, { kind: 'converted' });
  assert.equal(evaluation.text.text, 'きょうは');
  assert.equal(evaluation.text.language, 'ja');
  assert.deepEqual(evaluation.text.reading, { status: 'converted', ...CONDITIONS, corrections: [] });
  // 今日(2字)が きょう(3字) になり、は(置き換えない)は足さない
  assert.deepEqual(evaluation.text.notationExcess, { base: -1, symbols: -1, alphanumerics: -1, both: -1 });
});

test('辞書を読み込めなかった時は、原文のまま評価し、直せなかったことを条件に持つ', () => {
  const evaluation = evaluationText(
    resolved('今日は'),
    source(async () => []),
    { kind: 'failed' },
  );
  assert.deepEqual(evaluation.state, { kind: 'failed' });
  assert.equal(evaluation.text.text, '今日は');
  assert.deepEqual(evaluation.text.reading, { status: 'unavailable', ...CONDITIONS, corrections: [] });
  // 漢字を読みに直していないので、表記の字数との差は無い
  assert.equal(evaluation.text.notationExcess, undefined);
});

test('条件の要約には辞書の名前と版を出し、解析器の名前は出さない', () => {
  assert.deepEqual(readingProvenance({ status: 'converted', ...CONDITIONS, corrections: [] }), [{ label: '読みの辞書', value: 'IPADIC（6.2.0）' }]);
  const unavailable = readingProvenance({ status: 'unavailable', ...CONDITIONS, corrections: [] });
  assert.equal(unavailable.length, 1);
  assert.ok(unavailable[0]!.value.includes('IPADIC（6.2.0）'));
  assert.notEqual(unavailable[0]!.value, 'IPADIC（6.2.0）');
  assert.deepEqual(readingProvenance(null), []);
  assert.deepEqual(readingProvenance(undefined), []);
  for (const item of [...readingProvenance({ status: 'converted', ...CONDITIONS, corrections: [] }), ...unavailable]) {
    assert.ok(!/lindera/i.test(item.label + item.value), '画面にライブラリ名を出さない');
  }
});

function resolvedAs(id: string, text: string): ResolvedText {
  return { ...resolved(text), ref: { kind: 'user', id } };
}

test('同じテキストの編集では前の結果を残し、別のテキストへ切り替えた時は引き継がない（成功）', () => {
  const reading = source(async () => []);
  const stored: StoredReadingOutcome = { identity: 'user:a', outcome: { kind: 'analyzed', sourceText: '今日', tokens: [kyou] } };
  // 同じテキストで本文を編集した: 前の結果で読み直す間も、数値と状態は残る
  const edited = evaluationText(resolvedAs('a', '今日々'), reading, outcomeFor(resolvedAs('a', '今日々'), stored));
  assert.equal(edited.state.kind, 'converted');
  // 漢字を含む別のテキストへ切り替えた: 前のテキストの読みも状態も出さない
  const other = resolvedAs('b', '明日');
  const switched = evaluationText(other, reading, outcomeFor(other, stored));
  assert.deepEqual(switched.state, { kind: 'loading' });
  assert.equal(switched.text.text, '明日');
  assert.equal(switched.text.reading, undefined);
});

test('別のテキストへ切り替えた時は、前のテキストの失敗も引き継がない', () => {
  const reading = source(async () => []);
  const stored: StoredReadingOutcome = { identity: 'user:a', outcome: { kind: 'failed' } };
  const other = resolvedAs('b', '明日');
  const switched = evaluationText(other, reading, outcomeFor(other, stored));
  assert.deepEqual(switched.state, { kind: 'loading' });
  assert.equal(switched.text.reading, undefined);
  // 組み込みと自作は、idが同じ文字列でも別のテキスト
  assert.equal(outcomeFor({ ...resolved('明日'), ref: { kind: 'builtin', id: 'a' } }, stored), undefined);
});

const wa: ReadingToken = { surface: 'は', byteStart: 6, byteEnd: 9, reading: 'ハ', isUnknown: false };
const mystery: ReadingToken = { surface: '謎', byteStart: 9, byteEnd: 12, reading: null, isUnknown: true };
const analyzed = (text: string, tokens: readonly ReadingToken[]) => ({ kind: 'analyzed' as const, sourceText: text, tokens });

test('直しは解析済みの語の列に後から当たり、語の区切りと直していない語の読みは変わらない', () => {
  const reading = source(async () => []);
  const outcome = analyzed('今日は謎', [kyou, wa, mystery]);
  const plain = evaluationText(resolved('今日は謎'), reading, outcome);
  assert.equal(plain.text.text, 'きょうは謎');
  assert.deepEqual(plain.text.reading?.corrections, []);
  const fixed = evaluationText({ ...resolved('今日は謎'), readingCorrections: { 今日: 'こんにち', 謎: 'なぞ' } }, reading, outcome);
  assert.equal(fixed.text.text, 'こんにちはなぞ');
  assert.deepEqual(fixed.text.reading?.corrections, [
    { surface: '今日', reading: 'こんにち' },
    { surface: '謎', reading: 'なぞ' },
  ]);
  assert.deepEqual(
    fixed.words.map((word) => word.surface),
    ['今日', '謎'],
  );
});

test('テキストに現れない表記の直しは、数値の条件に入れない', () => {
  const reading = source(async () => []);
  const evaluation = evaluationText({ ...resolved('今日は'), readingCorrections: { 明日: 'あす' } }, reading, analyzed('今日は', [kyou, wa]));
  assert.equal(evaluation.text.text, 'きょうは');
  assert.deepEqual(evaluation.text.reading?.corrections, []);
});

test('辞書を読み込めなかった時は、語の列が無いので直しを当てず、条件にも入れない', () => {
  const reading = source(async () => []);
  const evaluation = evaluationText({ ...resolved('今日は'), readingCorrections: { 今日: 'こんにち' } }, reading, { kind: 'failed' });
  assert.equal(evaluation.text.text, '今日は');
  assert.deepEqual(evaluation.text.reading, { status: 'unavailable', ...CONDITIONS, corrections: [] });
});

test('直した読みで測った数値には、読みを直したことと表記の数を条件の要約に出す', () => {
  const items = readingProvenance({ status: 'converted', ...CONDITIONS, corrections: [{ surface: '今日', reading: 'こんにち' }] });
  assert.deepEqual(items, [
    { label: '読みの辞書', value: 'IPADIC（6.2.0）' },
    { label: '読みの直し', value: '1表記の読みを直して測定' },
  ]);
});

test('ペインが数値を出すのを待つのは、読みの結果が出るまでの漢字を含む日本語のテキストだけ', () => {
  const reading = source(async () => []);
  const waiting = (text: string, language: ResolvedText['language'], outcome: ReadingOutcome | undefined) =>
    isWaitingForReading(evaluationText(resolved(text, language), reading, outcome).state);
  assert.equal(waiting('今日は', 'ja', undefined), true);
  assert.equal(waiting('今日は', 'ja', { kind: 'failed' }), false);
  assert.equal(waiting('今日は', 'ja', { kind: 'analyzed', sourceText: '今日は', tokens: [kyou] }), false);
  assert.equal(waiting('あいう', 'ja', undefined), false);
  assert.equal(waiting('hello', 'en', undefined), false);
  // 読みの状態を持たない画面は待たない
  assert.equal(isWaitingForReading(undefined), false);
});

// 「今日は雨。今日は雪。」。同じ表記の「今日」が2回現れる
const TWICE = '今日は雨。今日は雪。';
const TWICE_TOKENS: ReadingToken[] = [
  kyou,
  wa,
  { surface: '雨', byteStart: 9, byteEnd: 12, reading: 'アメ', isUnknown: false },
  { surface: '。', byteStart: 12, byteEnd: 15, reading: '。', isUnknown: false },
  { surface: '今日', byteStart: 15, byteEnd: 21, reading: 'キョウ', isUnknown: false },
  { surface: 'は', byteStart: 21, byteEnd: 24, reading: 'ハ', isUnknown: false },
  { surface: '雪', byteStart: 24, byteEnd: 27, reading: 'ユキ', isUnknown: false },
  { surface: '。', byteStart: 27, byteEnd: 30, reading: '。', isUnknown: false },
];
const SECOND_KYOU = { surface: '今日', order: 1, before: '日は雨。', after: 'は雪。', reading: 'こんにち' };

test('語ごとの直しは同じ表記の1語だけの読みを変え、当たった語を条件に持つ。直しが無い数値は語ごとの項目を持たない', () => {
  const reading = source(async () => []);
  const outcome = analyzed(TWICE, TWICE_TOKENS);
  const plain = evaluationText(resolved(TWICE), reading, outcome);
  assert.equal(plain.text.text, 'きょうはあめ。きょうはゆき。');
  assert.equal(Object.hasOwn(plain.text.reading!, 'wordCorrections'), false);
  const fixed = evaluationText({ ...resolved(TWICE), wordReadingCorrections: [SECOND_KYOU] }, reading, outcome);
  assert.equal(fixed.text.text, 'きょうはあめ。こんにちはゆき。');
  assert.deepEqual(fixed.text.reading?.corrections, []);
  assert.deepEqual(fixed.text.reading?.wordCorrections, [SECOND_KYOU]);
  // 同じ表記・同じ読みでも、当たった語が違えば条件が変わる
  const first = evaluationText(
    { ...resolved(TWICE), wordReadingCorrections: [{ ...SECOND_KYOU, order: 0, before: '', after: 'は雨。今' }] },
    reading,
    outcome,
  );
  assert.notEqual(stableStringify(first.text.reading), stableStringify(fixed.text.reading));
});

test('語ごとの直しは表記ごとの直しより優先され、見つからない直しは数値にも条件にも入れず、別の語に当てない', () => {
  const reading = source(async () => []);
  const outcome = analyzed(TWICE, TWICE_TOKENS);
  const both = evaluationText({ ...resolved(TWICE), readingCorrections: { 今日: 'ほんじつ' }, wordReadingCorrections: [SECOND_KYOU] }, reading, outcome);
  assert.equal(both.text.text, 'ほんじつはあめ。こんにちはゆき。');
  assert.deepEqual(both.text.reading?.corrections, [{ surface: '今日', reading: 'ほんじつ' }]);
  const stale = { ...SECOND_KYOU, before: '日は曇。' };
  const lost = evaluationText({ ...resolved(TWICE), wordReadingCorrections: [stale] }, reading, outcome);
  assert.equal(lost.text.text, 'きょうはあめ。きょうはゆき。');
  assert.equal(Object.hasOwn(lost.text.reading!, 'wordCorrections'), false);
  assert.deepEqual(lost.wordCorrections.unfound, [stale]);
});

test('辞書を読み込めない時と読み込み中は、語ごとの直しを当てず、条件に入れず、見つからない直しにもしない', () => {
  const reading = source(async () => []);
  const input = { ...resolved(TWICE), wordReadingCorrections: [SECOND_KYOU] };
  const failed = evaluationText(input, reading, { kind: 'failed' });
  assert.equal(failed.text.text, TWICE);
  assert.deepEqual(failed.text.reading, { status: 'unavailable', ...CONDITIONS, corrections: [] });
  assert.deepEqual(failed.wordCorrections.unfound, []);
  const loading = evaluationText(input, reading, undefined);
  assert.equal(loading.state.kind, 'loading');
  assert.deepEqual(loading.wordCorrections.unfound, []);
});

test('集合のペインの組の項目は、全対象が同じ組なら1つの値、違う時は組を使う対象だけを対象名つきで並べる', async () => {
  const { comboSetProvenanceOfTargets } = await import('./reading-evaluation.ts');
  const a = { name: '組A', romajiRuleId: 'kunrei', combos: [{ keys: ['s', 't'], output: 'site' }], dropped: 0 };
  assert.deepEqual(
    comboSetProvenanceOfTargets([
      { targetName: 'X', comboSet: a },
      { targetName: 'Y', comboSet: a },
    ]),
    [{ label: 'コンボの組', value: '組A（1件を計算に入れて測定）' }],
  );
  assert.deepEqual(
    comboSetProvenanceOfTargets([
      { targetName: 'X', comboSet: a },
      { targetName: 'Y', comboSet: undefined },
    ]),
    [{ label: 'コンボの組', value: 'X: 組A（1件を計算に入れて測定）' }],
  );
  assert.deepEqual(comboSetProvenanceOfTargets([{ targetName: 'X', comboSet: undefined }]), []);
});
