import assert from 'node:assert/strict';
import test from 'node:test';
import type { WorkspaceLibrary } from '#engine/workspace.ts';
import { repairStandaloneAnalyzerOptions, repairWorkspaceAnalyzerOptions } from './analyzer-options-repair.ts';

test('個別画面: 読める解析設定・知らないAnalyzer・値の無い解析設定は同じ参照のまま返す', () => {
  const state = { 'bigram-flow': { source: 'within-hand' }, 'future-analyzer': { z: 1 }, playback: undefined };
  assert.equal(repairStandaloneAnalyzerOptions(state), state);
});

test('個別画面: 読めない項目を含む解析設定だけを読める形に置き換える', () => {
  const future = { unknown: 1 };
  const state = { 'bigram-flow': { source: 'no-such-source' }, 'future-analyzer': future };
  const repaired = repairStandaloneAnalyzerOptions(state);
  assert.notEqual(repaired, state);
  assert.equal((repaired['bigram-flow'] as Record<string, unknown>).source, 'actual');
  assert.equal(repaired['future-analyzer'], future);
});

function library(paneOptions: unknown, setOptions: unknown): WorkspaceLibrary {
  return [
    {
      id: 'w',
      optionSets: [{ id: 's', analyzerId: 'bigram-flow', options: setOptions }],
      panes: [{ id: 'p', analyzerId: 'bigram-flow', options: paneOptions, optionsBinding: { mode: 'own' }, binding: { mode: 'none' } }],
    },
  ] as unknown as WorkspaceLibrary;
}

test('Workspace: 読める解析設定だけなら同じ参照のまま返す', () => {
  const input = library({ source: 'within-hand' }, undefined);
  assert.equal(repairWorkspaceAnalyzerOptions(input), input);
});

test('Workspace: ペインと解析設定の組の読めない項目を捨てる', () => {
  const repaired = repairWorkspaceAnalyzerOptions(library({ source: 'no-such-source' }, { lineScale: 'cube' }));
  const workspace = repaired[0]!;
  assert.equal((workspace.panes[0]!.options as Record<string, unknown>).source, 'actual');
  assert.equal((workspace.optionSets[0]!.options as Record<string, unknown>).lineScale, 'linear');
});
