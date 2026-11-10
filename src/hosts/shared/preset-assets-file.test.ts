import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { UserRomajiRule } from '#input/romaji/rules.ts';
import { columnFingerAssignment, type FingerAssignment } from '#input/shapes/geometry.ts';
import type { KeydistAssets } from '#engine/commands.ts';
import { importPresetsWithAssetsCommand, mergePresetImport, presetAssetsOf } from '#engine/preset-assets.ts';
import { PRESET_FILE_FORMAT, missingReferences, parsePresetFile, presetFileBody } from './preset-file.ts';

/**
 * プリセットの書き出しに同梱する資産と、読み込みでの付け替え。書き手（`presetFileBody`）から読み手（`parsePresetFile`）、
 * 手元への書き込み（`importPresetsWithAssetsCommand`）までを本物で通す。
 */

const rule = (id: string, spelling = 'shi'): UserRomajiRule => ({ id, name: id, base: 'kunrei', overrides: { し: spelling }, generateSokuon: true });
const FINGER_COLUMNS = ['RP', 'RR', 'RM', 'RI', 'RI', 'LI', 'LI', 'LM', 'LR', 'LP', 'LP', 'LP', 'LP'] as const;
const FINGER_ORDER = { LP: 9, LR: 8, LM: 7, LI: 6, RI: 3, RM: 2, RR: 1, RP: 0 } as const;
/** `variant`が違えば担当の割り当てが違う。 */
const finger = (id: string, variant = 0): FingerAssignment =>
  columnFingerAssignment(id, id, [...FINGER_COLUMNS.slice(variant), ...FINGER_COLUMNS.slice(0, variant)], FINGER_ORDER);

interface Holdings {
  userRomajiRules: readonly UserRomajiRule[];
  fingerAssignments: readonly FingerAssignment[];
}

/** 書き手の手元: 参照される資産（rule-a・finger-a）と、参照されない資産（rule-z・finger-z）。 */
const EXPORTER: Holdings = {
  userRomajiRules: [rule('rule-a', 'shi'), rule('rule-z', 'zi')],
  fingerAssignments: [finger('finger-a'), finger('finger-z', 2)],
};

type Values = { readonly id: string; readonly name: string; readonly values: never };
const OWN: Values = { id: 'o', name: '自作の規則', values: { romajiRuleId: 'rule-a', fingerAssignmentId: 'finger-a', windowSize: 4 } as never };
const BUILTIN: Values = { id: 'b', name: '組み込みだけ', values: { romajiRuleId: 'qwerty', fingerAssignmentId: 'standard' } as never };
const PRESETS = [OWN, BUILTIN];

function fileOf(presets: readonly Values[], holdings: Holdings = EXPORTER): string {
  return JSON.stringify({ format: PRESET_FILE_FORMAT, ...presetFileBody({ presets: presets as never, userAssets: presetAssetsOf(presets, holdings) }) });
}

/** 資産を同梱せずに書き出したファイル。 */
function fileWithoutAssets(presets: readonly Values[]): string {
  return JSON.stringify({ format: PRESET_FILE_FORMAT, ...presetFileBody({ presets: presets as never }) });
}

function localOf(holdings: Holdings, presets: readonly unknown[] = []): KeydistAssets {
  return { ...holdings, userLayouts: [], presetLibrary: { presets } } as unknown as KeydistAssets;
}

function importInto(local: KeydistAssets, text: string) {
  const parsed = parsePresetFile(text);
  assert.ok(parsed.ok, parsed.ok ? '' : parsed.message);
  if (!parsed.ok) throw new Error('unreachable');
  let n = 0;
  const outcome = importPresetsWithAssetsCommand(parsed.presets, parsed.userAssets, () => `new-${++n}`, 'stamp')(local);
  return { outcome, after: outcome.kind === 'applied' ? ({ ...local, ...outcome.changes } as KeydistAssets) : local };
}

const idsOf = (items: readonly { readonly id: string }[]) => items.map((item) => item.id);
const valuesOf = (assets: KeydistAssets, name: string) =>
  assets.presetLibrary.presets.find((preset) => preset.name === name)!.values as Record<string, unknown>;

test('同梱: プリセットの値が指す自作の規則と指の割り当てだけを入れる', () => {
  const bundle = presetAssetsOf(PRESETS, EXPORTER);
  assert.deepEqual(idsOf(bundle.romajiRules), ['rule-a']);
  assert.deepEqual(idsOf(bundle.fingerAssignments), ['finger-a']);
  assert.deepEqual([bundle.layouts, bundle.setups], [[], []]);
});

test('同梱: 組み込みだけを指すプリセットは、userAssetsを出さない', () => {
  assert.equal('userAssets' in presetFileBody({ presets: [BUILTIN] as never, userAssets: presetAssetsOf([BUILTIN], EXPORTER) }), false);
});

test('読み込み: 手元に同じidで別の中身の資産があっても、プリセットの値は同梱した資産を指す', () => {
  const local = localOf({ userRomajiRules: [rule('rule-a', 'si')], fingerAssignments: [finger('finger-a', 3)] });
  const { after, outcome } = importInto(local, fileOf(PRESETS));
  assert.equal(outcome.kind, 'applied');
  const values = valuesOf(after, '自作の規則');
  assert.notEqual(values.romajiRuleId, 'rule-a');
  assert.notEqual(values.fingerAssignmentId, 'finger-a');
  // 指す先は、同梱した中身（手元の別の中身ではない）
  assert.deepEqual(after.userRomajiRules.find((candidate) => candidate.id === values.romajiRuleId)?.overrides, { し: 'shi' });
  const pointedFinger = after.fingerAssignments.find((candidate) => candidate.id === values.fingerAssignmentId)!;
  assert.deepEqual({ ...pointedFinger, id: 'x', name: 'x' }, { ...finger('finger-a'), id: 'x', name: 'x' });
  // 手元の資産は残る
  assert.equal(after.userRomajiRules[0]!.id, 'rule-a');
  assert.deepEqual(after.userRomajiRules[0]!.overrides, { し: 'si' });
  // 組み込みを指す値は触らない
  assert.equal(valuesOf(after, '組み込みだけ').romajiRuleId, 'qwerty');
});

test('読み込み: 同じ中身の資産が手元にあれば、その手元の資産を指し、資産は増えない', () => {
  const local = localOf({ userRomajiRules: [{ ...rule('rule-a', 'shi'), name: '改名' }], fingerAssignments: [finger('finger-a')] });
  const { after } = importInto(local, fileOf(PRESETS));
  assert.deepEqual(idsOf(after.userRomajiRules), ['rule-a']);
  assert.deepEqual(idsOf(after.fingerAssignments), ['finger-a']);
  assert.equal(valuesOf(after, '自作の規則').romajiRuleId, 'rule-a');
});

test('読み込み: 手元に何も無い保存先には同じidで足す', () => {
  const { after } = importInto(localOf({ userRomajiRules: [], fingerAssignments: [] }), fileOf(PRESETS));
  assert.deepEqual(idsOf(after.userRomajiRules), ['rule-a']);
  assert.equal(valuesOf(after, '自作の規則').romajiRuleId, 'rule-a');
});

test('読み込み: 同じファイルを二度読んでも、資産もプリセットも増えない', () => {
  const text = fileOf(PRESETS);
  const local = localOf({ userRomajiRules: [rule('rule-a', 'si')], fingerAssignments: [finger('finger-a', 3)] });
  const first = importInto(local, text);
  assert.equal(first.after.presetLibrary.presets.length, 2);
  assert.equal(first.after.userRomajiRules.length, 2);
  const second = importInto(first.after, text);
  assert.equal(second.outcome.kind, 'no-op');
  assert.equal(second.after.presetLibrary.presets.length, 2);
  assert.equal(second.after.userRomajiRules.length, 2);
  assert.equal(second.after.fingerAssignments.length, 2);
});

test('読み込み: 同名で値の違うプリセットは、番号を付けて足す', () => {
  const local = localOf(EXPORTER, [{ id: 'p', name: '自作の規則', values: { windowSize: 9 } }]);
  const { after } = importInto(local, fileOf([OWN]));
  assert.deepEqual(
    after.presetLibrary.presets.map((preset) => preset.name),
    ['自作の規則', '自作の規則 2'],
  );
  assert.equal(valuesOf(after, '自作の規則 2').romajiRuleId, 'rule-a');
});

test('読み込み: 同名で値の違う手元に二度読んでも、プリセットは1件しか増えない', () => {
  const text = fileOf([OWN]);
  const local = localOf(EXPORTER, [{ id: 'p', name: '自作の規則', values: { windowSize: 3 } }]);
  const first = importInto(local, text);
  assert.equal(first.after.presetLibrary.presets.length, 2);
  const second = importInto(first.after, text);
  const third = importInto(second.after, text);
  assert.equal(second.outcome.kind, 'no-op');
  assert.equal(third.after.presetLibrary.presets.length, 2);
});

test('読み込み: 値が同じでも名前が違う手元のプリセットがあれば、足す', () => {
  const local = localOf(EXPORTER, [{ id: 'p', name: '別名', values: OWN.values }]);
  assert.equal(importInto(local, fileOf([OWN])).after.presetLibrary.presets.length, 2);
});

test('読み込み: 同梱の無いファイルは、値をそのまま手元に足す', () => {
  const { after } = importInto(localOf(EXPORTER), fileWithoutAssets([OWN]));
  assert.equal(valuesOf(after, '自作の規則').romajiRuleId, 'rule-a');
  assert.equal(after.userRomajiRules, EXPORTER.userRomajiRules);
});

function referencesAfter(merge: ReturnType<typeof mergePresetImport>) {
  return {
    fingerAssignmentIds: new Set(['standard', ...merge.assets.fingerAssignments.map((assignment) => assignment.id)]),
    romajiRuleIds: new Set(['qwerty', ...merge.assets.userRomajiRules.map((candidate) => candidate.id)]),
    shapeIds: new Set<string>(),
  };
}

test('注記: 同梱が無く手元にも無い資産を指す値だけが注記の対象になる', () => {
  const empty = { userRomajiRules: [], fingerAssignments: [], presets: [] };
  const plain = parsePresetFile(fileWithoutAssets([OWN]));
  assert.ok(plain.ok);
  const without = mergePresetImport(empty, plain.presets, plain.userAssets, 'stamp');
  assert.deepEqual(
    missingReferences(without.presets, referencesAfter(without)).map((missing) => missing.noun),
    ['指の割当', 'ローマ字規則'],
  );
  const bundled = parsePresetFile(fileOf([OWN]));
  assert.ok(bundled.ok);
  const merged = mergePresetImport(empty, bundled.presets, bundled.userAssets, 'stamp');
  assert.deepEqual(missingReferences(merged.presets, referencesAfter(merged)), []);
});

test('読み込み: 壊れた同梱の項目は捨てて数を伝え、プリセットは読む', () => {
  const body = JSON.parse(fileOf(PRESETS)) as { userAssets: { romajiRules: unknown[] } };
  body.userAssets.romajiRules.push(3);
  const parsed = parsePresetFile(JSON.stringify(body));
  assert.ok(parsed.ok);
  assert.equal(parsed.presets.length, 2);
});
