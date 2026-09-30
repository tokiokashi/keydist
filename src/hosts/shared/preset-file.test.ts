import assert from 'node:assert/strict';
import { test } from 'node:test';
import { appendImportedPresets, type PresetLibrary } from '#input/presets/index.ts';
import type { SettingsValueMap } from '#engine/settings-items.ts';
import {
  PRESET_FILE_FORMAT,
  PRESET_FILE_MAX_PRESETS,
  parsePresetFile,
  presetFileBody,
  presetFileName,
  type PresetReferences,
} from './preset-file.ts';

const REFERENCES: PresetReferences = {
  fingerAssignmentIds: new Set(['standard']),
  romajiRuleIds: new Set(['qwerty']),
  shapeIds: new Set(['row-staggered']),
};

const LIBRARY: PresetLibrary<SettingsValueMap> = {
  presets: [
    { id: 'a', name: '自分用メモ', values: { windowSize: 5 } },
    { id: 'b', name: '比較用（N=5）', values: {} },
  ],
};

/** 書き出しと同じ形（`format`を先頭に付ける）。 */
function fileText(body: Record<string, unknown>): string {
  return JSON.stringify({ format: PRESET_FILE_FORMAT, ...body });
}

function failed(text: string) {
  const result = parsePresetFile(text, REFERENCES);
  assert.equal(result.ok, false);
  return result as Extract<typeof result, { ok: false }>;
}

test('封筒: 書き出して読み直すと、名前と値が往復する（idは持ち越さない）', () => {
  const result = parsePresetFile(fileText(presetFileBody(LIBRARY)), REFERENCES);
  assert.ok(result.ok);
  assert.deepEqual(result.presets, [
    { name: '自分用メモ', values: { windowSize: 5 } },
    { name: '比較用（N=5）', values: {} },
  ]);
  assert.equal(result.message, '2件のプリセットを読み込んだ');
  assert.deepEqual(result.details, []);
});

test('封筒: 本体はcodecの出力そのままで、format以外の印を足さない', () => {
  const body = presetFileBody(LIBRARY);
  assert.deepEqual(Object.keys(body), ['version', 'presets']);
  assert.equal(body.version, 1);
});

test('診断: JSONとして読めない', () => {
  const result = failed('{ 壊れた');
  assert.equal(result.message, '条件ファイルとして読めませんでした');
  assert.equal(result.details.length, 1);
});

test('診断: formatが無い・別の値・オブジェクトでない', () => {
  for (const text of ['{"version":1,"presets":[]}', '{"format":"other","version":1}', '[]', '3', 'null']) {
    assert.equal(failed(text).message, 'keydist の条件ファイルではありません', text);
  }
});

test('診断: 旧画面の条件ファイル（conditionsとversion 4）', () => {
  const result = failed('{"version":4,"conditions":{"defaults":{}},"layouts":[]}');
  assert.equal(result.message, '旧画面の条件ファイルは読み込めません');
  // 印が付いていれば旧形式とは見なさない
  assert.equal(failed('{"format":"x","version":4,"conditions":{}}').message, 'keydist の条件ファイルではありません');
});

test('診断: 新しい版', () => {
  const result = failed(fileText({ version: 2, presets: [] }));
  assert.equal(result.message, '新しい形式のファイルです。keydist を更新してから読み込んでください');
  assert.deepEqual(result.details, ['version: 2 (対応: 1)']);
});

test('診断: 形が正しくない（版が無い・版が不正・presetsがオブジェクトでない）', () => {
  for (const body of [{ presets: [] }, { version: 'x', presets: [] }, { version: 0, presets: [] }]) {
    assert.equal(failed(fileText(body)).message, 'ファイルの形式が正しくありません', JSON.stringify(body));
  }
});

test('診断: 読めるプリセットが1件も無い', () => {
  assert.equal(failed(fileText({ version: 1, presets: [] })).message, '読み込めるプリセットがありませんでした');
  const broken = failed(fileText({ version: 1, presets: [{ id: 'x', name: '  ', values: {} }] }));
  assert.equal(broken.message, '読み込めるプリセットがありませんでした');
  assert.equal(broken.details.length, 1);
});

test('診断: 壊れた値・未知の項目は捨てて残りを読み、項目名と件数で伝える', () => {
  const result = parsePresetFile(
    fileText({
      version: 1,
      presets: [
        { id: 'a', name: '自分用メモ', values: { windowSize: 5, sfbHomeCost: 'yes', futureItem: 1 } },
        { id: 'b', name: '比較用（N=5）', values: { windowSize: 'x', playbackRateWindow: 'z' } },
      ],
    }),
    REFERENCES,
  );
  assert.ok(result.ok);
  assert.deepEqual(result.presets.map((preset) => preset.values), [{ windowSize: 5 }, {}]);
  assert.match(result.message, /^2件のプリセットを読み込んだ。4件の値は読み込めませんでした（/);
  assert.match(result.message, /先読みN/);
  assert.match(result.message, /同指連続のホーム復帰距離/);
  assert.match(result.message, /この版に無い項目 1件/);
  // 内部のid・パスは画面の文に出さない。原文は詳細へ
  assert.doesNotMatch(result.message, /sfbHomeCost|windowSize|futureItem|presets\[/);
  assert.equal(result.details.length, 4);
  assert.ok(result.details.some((line) => line.includes('futureItem')));
});

test('診断: 行の無い既知の項目は「この版に無い」とは言わず、その他の項目にまとめる', () => {
  const result = parsePresetFile(
    fileText({ version: 1, presets: [{ id: 'a', name: 'A', values: { playbackRateWindow: 'z' } }] }),
    REFERENCES,
  );
  assert.ok(result.ok);
  assert.match(result.message, /1件の値は読み込めませんでした（その他の項目 1件）/);
});

test('診断: 壊れたプリセットは件数で伝え、残りは読む', () => {
  const result = parsePresetFile(
    fileText({ version: 1, presets: [{ id: 'a', name: 'A', values: {} }, { id: 'b', values: {} }, 3] }),
    REFERENCES,
  );
  assert.ok(result.ok);
  assert.equal(result.presets.length, 1);
  assert.equal(result.message, '1件のプリセットを読み込んだ。2件のプリセットは読み込めませんでした');
});

test('上限: 件数が上限を超えたら丸ごと断る。上限ちょうどは読む', () => {
  const make = (count: number) =>
    fileText({ version: 1, presets: Array.from({ length: count }, (_, index) => ({ id: `p${index}`, name: `P${index}`, values: {} })) });
  const over = failed(make(PRESET_FILE_MAX_PRESETS + 1));
  assert.equal(over.message, `プリセットが多すぎます（${PRESET_FILE_MAX_PRESETS}件まで）`);
  const exact = parsePresetFile(make(PRESET_FILE_MAX_PRESETS), REFERENCES);
  assert.ok(exact.ok);
  assert.equal(exact.presets.length, PRESET_FILE_MAX_PRESETS);
});

test('参照先: この端末に無い指の割当・ローマ字規則・物理配列は、値を残して注記する', () => {
  const result = parsePresetFile(
    fileText({
      version: 1,
      presets: [
        { id: 'a', name: '自分用メモ', values: { fingerAssignmentId: 'custom-1', windowSize: 4 } },
        { id: 'b', name: '比較用（N=5）', values: { fingerAssignmentId: 'standard', romajiRuleId: 'mine', defaultShapeId: 'gone' } },
        { id: 'c', name: '手元にあるだけ', values: { fingerAssignmentId: 'standard', romajiRuleId: 'qwerty' } },
      ],
    }),
    REFERENCES,
  );
  assert.ok(result.ok);
  // 値は捨てない
  assert.equal((result.presets[0]!.values as Record<string, unknown>).fingerAssignmentId, 'custom-1');
  assert.match(result.message, /「自分用メモ」はこの端末に無い指の割当を使っています。流し込むと既定に戻ります/);
  assert.match(result.message, /「比較用（N=5）」はこの端末に無いローマ字規則を使っています/);
  assert.match(result.message, /「比較用（N=5）」はこの端末に無い物理配列を使っています/);
  assert.doesNotMatch(result.message, /手元にあるだけ/);
});

test('参照先: 手元にある参照先なら注記しない', () => {
  const result = parsePresetFile(
    fileText({ version: 1, presets: [{ id: 'a', name: 'A', values: { fingerAssignmentId: 'standard' } }] }),
    REFERENCES,
  );
  assert.ok(result.ok);
  assert.equal(result.message, '1件のプリセットを読み込んだ');
});

test('同名の番号付け: 読み込みは常に追加し、既存と同じ名前は「名前 2」になる', () => {
  const parsed = parsePresetFile(fileText(presetFileBody(LIBRARY)), REFERENCES);
  assert.ok(parsed.ok);
  let counter = 0;
  const once = appendImportedPresets(LIBRARY, parsed.presets, () => `new-${++counter}`);
  assert.deepEqual(once.presets.map((preset) => preset.name), ['自分用メモ', '比較用（N=5）', '自分用メモ 2', '比較用（N=5） 2']);
  // 元のidは持ち越さない
  assert.deepEqual(once.presets.map((preset) => preset.id), ['a', 'b', 'new-1', 'new-2']);
  const twice = appendImportedPresets(once, parsed.presets, () => `new-${++counter}`);
  assert.equal(twice.presets[4]!.name, '自分用メモ 3');
});

test('presetFileName: 全件は日付、1件は名前。使えない文字は置き換え、長い名前は切る', () => {
  assert.equal(presetFileName({ kind: 'all', date: new Date(2026, 8, 5) }), 'keydist-プリセット-2026-09-05.json');
  assert.equal(presetFileName({ kind: 'one', name: '比較用（N=5）' }), 'keydist-プリセット-比較用（N=5）.json');
  assert.equal(presetFileName({ kind: 'one', name: 'a/b:c*d' }), 'keydist-プリセット-a_b_c_d.json');
  assert.equal(presetFileName({ kind: 'one', name: '  ' }), 'keydist-プリセット-名前なし.json');
  assert.equal(presetFileName({ kind: 'one', name: 'あ'.repeat(100) }), `keydist-プリセット-${'あ'.repeat(40)}.json`);
});
