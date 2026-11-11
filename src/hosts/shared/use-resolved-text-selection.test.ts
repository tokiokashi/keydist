import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ResolvedText } from '#input/text/resolve.ts';
import { NO_RESOLVED_WORD_CORRECTIONS } from '#input/text/word-reading.ts';
import { corpusBodyStatus, requestCorpusBody } from '#input/text/corpus-bodies.ts';
import { holdEvaluation } from './use-resolved-text-selection.ts';
import { isWaitingForReading, type ReadingEvaluation } from './reading-evaluation.ts';

const resolved: ResolvedText = {
  ref: { kind: 'builtin', id: 'b' },
  name: 'b',
  text: '',
  language: 'ja',
  languageOverride: undefined,
  isBuiltin: true,
  readingCorrections: {},
  wordReadingCorrections: [],
};
const evaluation: ReadingEvaluation = { text: resolved, state: { kind: 'none' }, words: [], wordCorrections: NO_RESOLVED_WORD_CORRECTIONS };

test('本文が使えない間は、読み込み中でも読み込みに失敗した後でも、ペインは計算を依頼しない', () => {
  for (const body of ['loading', 'failed'] as const) {
    const held = holdEvaluation(evaluation, body);
    assert.equal(isWaitingForReading(held?.state), true, body);
  }
  assert.equal(holdEvaluation(evaluation, 'ready'), evaluation);
});

test('本文の読み込みに失敗した後は、読み込み直すまで失敗のままで、読み込み直せば使える', async () => {
  await requestCorpusBody('held-test', 'x.txt', () => Promise.reject(new Error('offline')));
  assert.equal(corpusBodyStatus('held-test'), 'failed');
  await requestCorpusBody('held-test', 'x.txt', () => Promise.resolve('本文\n'));
  assert.equal(corpusBodyStatus('held-test'), 'loaded');
});
