import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { WorkspaceImportEntry } from '#engine/workspace-import.ts';
import { workspaceImportResultText } from './workspace-import-result.ts';

const added = (name: string, missing: WorkspaceImportEntry['missing'] = []): WorkspaceImportEntry => ({
  name,
  outcome: { kind: 'added', addedId: name },
  missing,
});

test('結果の文: 足した件数を見出しに出し、注記が無ければ一覧は空', () => {
  const result = workspaceImportResultText([added('A'), added('B')], []);
  assert.equal(result.summary, '2件のWorkspaceを読み込みました');
  assert.deepEqual(result.lines, []);
});

test('結果の文: 読めなかった部分は見出しに続ける', () => {
  const result = workspaceImportResultText([added('A')], ['1件のWorkspaceは読み込めませんでした']);
  assert.equal(result.summary, '1件のWorkspaceを読み込みました。1件のWorkspaceは読み込めませんでした');
});

test('結果の文: 別名で足したものは追加後の名前で、理由を添える', () => {
  const result = workspaceImportResultText([
    { name: '比較', outcome: { kind: 'added-renamed', addedName: '比較 (2)', addedId: 'x' }, missing: ['layout', 'setup'] },
  ], []);
  assert.equal(result.summary, '1件のWorkspaceを読み込みました');
  assert.deepEqual(result.lines, [
    '「比較 (2)」は、同じWorkspaceで中身の違うものが既にあるため、別の名前で追加しました',
    '「比較 (2)」はこの端末にない配列、Setupを使っています',
  ]);
});

test('結果の文: 参照先が自作のテキストなら、既定のテキストを使うことを添える', () => {
  const result = workspaceImportResultText([added('A', ['text'])], []);
  assert.deepEqual(result.lines, ['「A」はこの端末にない自作のテキストを使っています。既定のテキストで測ります']);
});

test('結果の文: 全部が同じ中身で足さなかった時は、足したと言わない', () => {
  const result = workspaceImportResultText([
    { name: 'A', outcome: { kind: 'skipped-same', existingName: 'A' }, missing: [] },
  ], []);
  assert.equal(result.summary, '読み込んだWorkspaceはありません。同じ中身のものが既にあります');
  assert.deepEqual(result.lines, ['「A」は同じ中身のものが既にあるため、追加しませんでした']);
});
