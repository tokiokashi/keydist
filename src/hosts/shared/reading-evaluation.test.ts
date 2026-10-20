import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ReadingToken } from '#input/text/reading.ts';
import type { ResolvedText } from '#input/text/resolve.ts';
import {
  analyzeForEvaluation,
  evaluationText,
  outcomeFor,
  readingProvenance,
  type ReadingSource,
  type StoredReadingOutcome,
} from './reading-evaluation.ts';

const CONDITIONS = { dictionary: { name: 'IPADIC', version: '6.2.0' }, library: { name: 'lindera-wasm', version: '6.2.0' } } as const;

function resolved(text: string, language: ResolvedText['language'] = 'ja'): ResolvedText {
  return { ref: { kind: 'user', id: 't' }, name: 't', text, language, languageOverride: undefined, isBuiltin: false, readingCorrections: {} };
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
});

test('条件の要約には辞書の名前と版を出し、解析器の名前は出さない', () => {
  assert.deepEqual(readingProvenance({ status: 'converted', ...CONDITIONS, corrections: [] }), [{ label: '読みの辞書', value: 'IPADIC（6.2.0）' }]);
  const unavailable = readingProvenance({ status: 'unavailable', ...CONDITIONS, corrections: [] });
  assert.equal(unavailable.length, 1);
  assert.match(unavailable[0]?.value ?? '', /IPADIC（6\.2\.0）.*読み込めず/);
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
