import assert from 'node:assert/strict';
import { test } from 'node:test';
import { emptyCascadeOverrides } from '#input/settings/index.ts';
import { emptyTextLibrary } from '#input/text/library.ts';
import { createSampleWorkspace } from '#engine/sample-workspace.ts';
import { initialWorkspaceLibrary, withWorkspaceText, type Workspace, type WorkspaceLibrary } from '#engine/workspace.ts';
import { mergeWorkspaces, type WorkspaceReferenceHoldings } from '#engine/workspace-import.ts';
import {
  PRESET_FILE_FORMAT,
  PRESET_FILE_MAX_WORKSPACES,
  parsePresetFile,
  parseWorkspaceFile,
  presetFileBody,
  workspaceFileName,
  type PresetReferences,
} from './preset-file.ts';

/**
 * Workspaceの書き出しファイルの、書き手（`presetFileBody`）から読み手（`parseWorkspaceFile`）までの往復と、
 * 読み込んだ後の突き合わせ（`mergeWorkspaces`）。書き手は本物を通す。
 */

const REFERENCES: PresetReferences = {
  fingerAssignmentIds: new Set(['standard']),
  romajiRuleIds: new Set(['qwerty']),
  shapeIds: new Set(['row-staggered']),
};

const HOLDINGS: WorkspaceReferenceHoldings = {
  setupLibrary: { setups: [], overrides: emptyCascadeOverrides() },
  userLayouts: [],
  fingerAssignments: [],
  userRomajiRules: [],
  textLibrary: emptyTextLibrary(),
};

let counter = 0;
const generateId = () => `new-${++counter}`;

/** 書き出しと同じ形（`format`を先頭に付けて文字列にする）。 */
function fileText(body: Record<string, unknown>): string {
  return JSON.stringify({ format: PRESET_FILE_FORMAT, ...body });
}

/** 本物の中身を持つWorkspace（サンプル。ペイン・連動の組・解析設定・Workspaceの条件を持つ）。 */
function sampleWorkspace(id: string, name?: string): Workspace {
  const made = createSampleWorkspace(
    initialWorkspaceLibrary(),
    () => id,
    (() => {
      let n = 0;
      return () => `pane-${++n}`;
    })(),
    'overview',
  ).created;
  return name === undefined ? made : { ...made, name };
}

function written(library: WorkspaceLibrary): string {
  return fileText(presetFileBody({ workspaces: library }));
}

function readWorkspaces(text: string): readonly Workspace[] {
  const result = parseWorkspaceFile(text);
  assert.ok(result.ok, JSON.stringify(result));
  return result.workspaces;
}

test('往復: 書き出したWorkspaceを読み直すと、ペインの並び・連動の組・固定の対象・解析設定が同じ値で戻る', () => {
  const library: WorkspaceLibrary = [sampleWorkspace('w1')];
  const result = parseWorkspaceFile(written(library));
  assert.ok(result.ok);
  assert.deepEqual(result.workspaces, library);
  assert.deepEqual(result.dropped, []);
  assert.deepEqual(result.details, []);
});

test('封筒: Workspaceだけの本体はworkspacesとversionだけを持つ（presetsを出さない）', () => {
  const body = presetFileBody({ workspaces: [sampleWorkspace('w1')] });
  assert.deepEqual(Object.keys(body), ['version', 'workspaces']);
  assert.equal(body.version, 2);
});

test('封筒: プリセットとWorkspaceの両方を持つファイルは、それぞれの読み手が自分の側だけを読む', () => {
  const text = fileText(
    presetFileBody({
      presets: [{ id: 'p1', name: '自分用メモ', values: { windowSize: 5 } }],
      workspaces: [sampleWorkspace('w1')],
    }),
  );
  const presets = parsePresetFile(text, REFERENCES);
  assert.ok(presets.ok);
  assert.deepEqual(
    presets.presets.map((preset) => preset.name),
    ['自分用メモ'],
  );
  assert.equal(presets.message, '1件のプリセットを読み込みました');
  assert.equal(readWorkspaces(text).length, 1);
});

test('封筒: 一方だけを持つファイルを、もう一方の読み手が読むと、その旨で断る', () => {
  const presetOnly = fileText(presetFileBody({ presets: [{ id: 'p1', name: 'A', values: {} }] }));
  const workspaceOnly = written([sampleWorkspace('w1')]);
  const noWorkspace = parseWorkspaceFile(presetOnly);
  assert.ok(!noWorkspace.ok);
  assert.equal(noWorkspace.message, 'このファイルにWorkspaceは含まれていません');
  const noPreset = parsePresetFile(workspaceOnly, REFERENCES);
  assert.ok(!noPreset.ok);
  assert.equal(noPreset.message, 'このファイルにプリセットは含まれていません');
  assert.equal(parseWorkspaceFile(fileText({ version: 2 })).ok, false);
});

test('版: 版1（プリセットだけ）のファイルも読める', () => {
  const result = parsePresetFile(fileText({ version: 1, presets: [{ id: 'a', name: 'A', values: {} }] }), REFERENCES);
  assert.ok(result.ok);
  assert.equal(result.presets.length, 1);
});

test('未知のキー: 最上位とプリセットの中の未知のキーは読まず、原文にだけ残し、件数の文には数えない', () => {
  const text = fileText({
    version: 2,
    futureField: { a: 1 },
    presets: [{ id: 'a', name: 'A', values: { windowSize: 5 }, note: 'x' }],
    workspaces: [],
  });
  const result = parsePresetFile(text, REFERENCES);
  assert.ok(result.ok);
  assert.equal(result.message, '1件のプリセットを読み込みました');
  assert.deepEqual(result.presets, [{ name: 'A', values: { windowSize: 5 } }]);
  assert.deepEqual(result.details, ['futureField: 未知のキーのため読み込みませんでした', 'presets[0].note: 未知のキーのため読み込みませんでした']);
});

test('未知のキー: Workspaceの読み手も最上位の未知のキーを原文に残し、読める部分は読む', () => {
  const body = { ...presetFileBody({ workspaces: [sampleWorkspace('w1')] }), futureField: 1 };
  const result = parseWorkspaceFile(fileText(body));
  assert.ok(result.ok);
  assert.equal(result.workspaces.length, 1);
  assert.deepEqual(result.dropped, []);
  assert.deepEqual(result.details, ['futureField: 未知のキーのため読み込みませんでした']);
});

test('診断: 壊れたWorkspaceは件数で伝え、ペインなどの一部だけ壊れた分は別の件数で伝える。残りは読む', () => {
  const good = presetFileBody({ workspaces: [sampleWorkspace('w1')] }).workspaces as Record<string, unknown>[];
  const withBrokenPane = { ...good[0]!, id: 'w2', panes: [3, ...(good[0]!.panes as unknown[])] };
  const result = parseWorkspaceFile(fileText({ version: 2, workspaces: [good[0], withBrokenPane, 'x', { name: 'idなし' }] }));
  assert.ok(result.ok);
  assert.deepEqual(
    result.workspaces.map((workspace) => workspace.id),
    ['w1', 'w2'],
  );
  assert.deepEqual(result.dropped, ['2件のWorkspaceは読み込めませんでした', '1件のペインや設定は読み込めませんでした']);
  assert.equal(result.details.length, 3);
});

test('上限: Workspaceの件数が上限を超えたら丸ごと断る', () => {
  const workspaces = Array.from({ length: PRESET_FILE_MAX_WORKSPACES + 1 }, (_, index) => ({ id: `w${index}` }));
  const result = parseWorkspaceFile(fileText({ version: 2, workspaces }));
  assert.ok(!result.ok);
  assert.equal(result.message, `Workspaceが多すぎます（${PRESET_FILE_MAX_WORKSPACES}件まで）`);
});

test('ファイル名: Workspaceの名前を入れ、使えない文字は置き換える', () => {
  assert.equal(workspaceFileName('比較/用'), 'keydist-Workspace-比較_用.json');
  assert.equal(workspaceFileName('  '), 'keydist-Workspace-名前なし.json');
});

test('読み込み: 同じファイルを二度読んでも増えない', () => {
  const file = written([sampleWorkspace('w1')]);
  const first = mergeWorkspaces([], readWorkspaces(file), HOLDINGS, generateId);
  assert.equal(first.library.length, 1);
  assert.deepEqual(
    first.entries.map((entry) => entry.outcome.kind),
    ['added'],
  );
  const second = mergeWorkspaces(first.library, readWorkspaces(file), HOLDINGS, generateId);
  assert.deepEqual(second.library, first.library);
  assert.deepEqual(
    second.entries.map((entry) => entry.outcome.kind),
    ['skipped-same'],
  );
});

test('読み込み: 同じidで中身が違えば別のidと別名で足し、同じファイルを読み直しても増えない', () => {
  const local = withWorkspaceText([sampleWorkspace('w1', '比較')], 'w1', { ref: { kind: 'builtin', id: 'ja.legacy' } });
  const file = written([{ ...sampleWorkspace('w1', '比較'), conditions: { windowSize: 6 } }]);
  const first = mergeWorkspaces(local, readWorkspaces(file), HOLDINGS, generateId);
  assert.equal(first.library.length, 2);
  assert.deepEqual(first.library[0], local[0]);
  const added = first.library[1]!;
  assert.notEqual(added.id, 'w1');
  assert.equal(added.name, '比較 (2)');
  assert.deepEqual(added.conditions, { windowSize: 6 });
  assert.equal(first.entries[0]!.outcome.kind, 'added-renamed');
  // 別名で足した後に読み直す
  const again = mergeWorkspaces(first.library, readWorkspaces(file), HOLDINGS, generateId);
  assert.deepEqual(again.library, first.library);
  assert.deepEqual(
    again.entries.map((entry) => entry.outcome.kind),
    ['skipped-same'],
  );
  // 別名で足した方の名前を手元で変えても、同じ中身として扱う
  const renamed = first.library.map((workspace) => (workspace.id === added.id ? { ...workspace, name: '自分で付けた名前' } : workspace));
  const afterRename = mergeWorkspaces(renamed, readWorkspaces(file), HOLDINGS, generateId);
  assert.deepEqual(afterRename.library, renamed);
});

test('読み込み: 名前だけが違い中身が同じなら、同じidのものとして足さない', () => {
  const local = [sampleWorkspace('w1', '手元の名前')];
  const result = mergeWorkspaces(local, readWorkspaces(written([sampleWorkspace('w1', 'ファイルの名前')])), HOLDINGS, generateId);
  assert.deepEqual(result.library, local);
  assert.deepEqual(result.entries[0]!.outcome, { kind: 'skipped-same', existingName: '手元の名前' });
});

test('読み込み: 別のidのWorkspaceはそのまま末尾に足し、並びを保つ', () => {
  const local = [sampleWorkspace('w0', '手元')];
  const result = mergeWorkspaces(local, readWorkspaces(written([sampleWorkspace('w1', 'A'), sampleWorkspace('w2', 'B')])), HOLDINGS, generateId);
  assert.deepEqual(
    result.library.map((workspace) => workspace.id),
    ['w0', 'w1', 'w2'],
  );
});
