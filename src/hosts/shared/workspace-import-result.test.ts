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
  assert.ok(result.summary.includes('2件'));
  assert.deepEqual(result.lines, []);
});

test('結果の文: 読めなかった部分は見出しに続ける', () => {
  const dropped = '1件のWorkspaceは読み込めませんでした';
  const result = workspaceImportResultText([added('A')], [dropped]);
  assert.ok(result.summary.endsWith(dropped));
  assert.ok(result.summary.startsWith(workspaceImportResultText([added('A')], []).summary));
});

test('結果の文: 別名で足したものは追加後の名前で、理由を添える', () => {
  const result = workspaceImportResultText(
    [{ name: '比較', outcome: { kind: 'added-renamed', addedName: '比較 (2)', addedId: 'x' }, missing: ['layout', 'setup'] }],
    [],
  );
  assert.equal(result.lines.length, 2);
  assert.ok(result.lines.every((line) => line.startsWith('「比較 (2)」')));
  assert.ok(result.lines[1]!.includes('配列') && result.lines[1]!.includes('Setup'));
});

test('結果の文: 参照先が自作のテキストなら、既定のテキストを使うことを添える', () => {
  const result = workspaceImportResultText([added('A', ['text'])], []);
  assert.equal(result.lines.length, 1);
  assert.ok(result.lines[0]!.startsWith('「A」') && result.lines[0]!.includes('テキスト'));
});

test('結果の文: 全部が同じ中身で足さなかった時は、足したと言わない', () => {
  const result = workspaceImportResultText([{ name: 'A', outcome: { kind: 'skipped-same', existingName: 'A' }, missing: [] }], []);
  assert.ok(!result.summary.includes('を読み込みました'));
  assert.equal(result.lines.length, 1);
  assert.ok(result.lines[0]!.startsWith('「A」'));
});
