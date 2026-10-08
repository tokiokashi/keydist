import assert from 'node:assert/strict';
import test from 'node:test';
import { applyCommand, emptyCommandHistory, undo } from '#input/commands/index.ts';
import { LAYOUT_BY_ID } from '#input/layouts/index.ts';
import { buildUserCatalog } from '#input/layouts/user-catalog.ts';
import type { UserLayout } from '#input/layouts/user-layouts.ts';
import type { UserRomajiRule } from '#input/romaji/rules.ts';
import { columnFingerAssignment, PHYSICAL_SHAPES, type FingerAssignment } from '#input/shapes/geometry.ts';
import type { TextLanguage } from '#input/text/language.ts';
import { emptyCascadeOverrides } from '#input/settings/index.ts';
import { emptyTextLibrary } from '#input/text/library.ts';
import { initialTextSelection } from '#input/text/selection.ts';
import type { KeydistAssets } from './commands.ts';
import { initialMultiTargetSelection } from './multi-target-selection.ts';
import { generateEngineTrace, interpretEngineTrace } from './pipeline.ts';
import { resolveEngineInput } from './resolved-input.ts';
import { initialSingleTargetSelection } from './single-target-selection.ts';
import { EMPTY_SETTINGS_OVERRIDES, setSettingsOverride, type SettingsCascadeOverrides } from './settings-items.ts';
import {
  USER_ASSETS_FILE_FORMAT,
  USER_ASSETS_FILE_MAX_ITEMS,
  importUserAssetsCommand,
  mergeUserAssets,
  parseUserAssetsFile,
  userAssetsFileBody,
  type UserAssetsBundle,
  type UserAssetsHoldings,
} from './user-assets-file.ts';

const SHAPES = new Map(Object.values(PHYSICAL_SHAPES).map((shape) => [shape.id, shape] as const));
const ROWS: UserLayout['rows'] = ['1234567890-=', 'qwertyuiop[]', "asdfghjkl;'", 'zxcvbnm,./'];
const EMPTY: UserAssetsHoldings = { userLayouts: [], userRomajiRules: [], fingerAssignments: [] };
const STAMP = 'stamp';

const RULE: UserRomajiRule = { id: 'rule-a', name: 'し・ちをshi・chiで打つ', base: 'kunrei', overrides: { し: 'shi', ち: 'chi' }, generateSokuon: true };
const LAYOUT: UserLayout = { id: 'user-a', name: '自作A', rows: ['', 'poiuytrewq[]', "asdfghjkl;'", 'zxcvbnm,./'], romaji: 'rule-a' };
// 右手の列の担当を入れ替えた指の割り当て（既定と数値が変わる）
const FINGER: FingerAssignment = columnFingerAssignment(
  'finger-a',
  '自作の指',
  ['RP', 'RR', 'RM', 'RI', 'RI', 'LI', 'LI', 'LM', 'LR', 'LP', 'LP', 'LP', 'LP'],
  { LP: 0, LR: 1, LM: 2, LI: 3, RI: 6, RM: 7, RR: 8, RP: 9 },
);
const HOLDINGS: UserAssetsHoldings = { userLayouts: [LAYOUT], userRomajiRules: [RULE], fingerAssignments: [FINGER] };

function fileText(assets: UserAssetsHoldings): string {
  return JSON.stringify({ format: USER_ASSETS_FILE_FORMAT, ...userAssetsFileBody(assets) });
}

function read(assets: UserAssetsHoldings): UserAssetsBundle {
  const parsed = parseUserAssetsFile(fileText(assets));
  assert.ok(parsed.ok, parsed.ok ? '' : parsed.message);
  if (!parsed.ok) throw new Error('unreachable');
  return parsed.bundle;
}

function measure(assets: UserAssetsHoldings, layoutId: string, language: TextLanguage, text: string, overrides: SettingsCascadeOverrides) {
  const user = buildUserCatalog(assets.userLayouts, assets.userRomajiRules);
  const result = resolveEngineInput({
    target: { kind: 'layout', layoutId },
    setups: new Map(),
    catalog: { layouts: new Map([...LAYOUT_BY_ID, ...user.layouts]), shapes: SHAPES },
    userLayouts: user.userLayouts,
    customRomajiRules: user.romajiRules,
    customFingerAssignments: new Map(assets.fingerAssignments.map((assignment) => [assignment.id, assignment] as const)),
    overrides,
    text,
    language,
  });
  assert.ok(result.ok, result.ok ? '' : JSON.stringify(result.error));
  if (!result.ok) throw new Error('unreachable');
  const trace = generateEngineTrace(result.input);
  return { trace, metrics: interpretEngineTrace(trace, result.input).metrics };
}

test('書き出して空の手元へ読み込むと同じ資産が戻り、同じ条件で同じ数値が出る', () => {
  const merged = mergeUserAssets(EMPTY, read(HOLDINGS), STAMP);
  assert.deepEqual(merged.assets, HOLDINGS);
  assert.deepEqual(merged.entries.map((entry) => entry.outcome.kind), ['added', 'added', 'added']);

  const withFinger = setSettingsOverride(EMPTY_SETTINGS_OVERRIDES, { kind: 'global' }, 'fingerAssignmentId', FINGER.id);
  assert.ok(withFinger.ok);
  if (!withFinger.ok) return;
  const text = 'こんにちは、きょうはしゃしんをとりにいきます。';
  const before = measure(HOLDINGS, LAYOUT.id, 'ja', text, withFinger.overrides);
  const after = measure(merged.assets, LAYOUT.id, 'ja', text, withFinger.overrides);
  assert.ok(before.trace.trace.strokes.length > 0);
  assert.deepEqual(after.trace.trace.strokes, before.trace.trace.strokes);
  assert.deepEqual(after.metrics, before.metrics);
  // 規則と指の割り当てが数値に効いている（既定の指で測った値とは別になる）
  const plain = measure(HOLDINGS, LAYOUT.id, 'ja', text, EMPTY_SETTINGS_OVERRIDES);
  assert.notDeepEqual(before.metrics, plain.metrics);
});

test('同じファイルを二度読んでも増えず、二度目は全部を足さない', () => {
  const bundle = read(HOLDINGS);
  const first = mergeUserAssets(EMPTY, bundle, STAMP).assets;
  const second = mergeUserAssets(first, bundle, STAMP);
  assert.deepEqual(second.assets, first);
  assert.ok(second.entries.every((entry) => entry.outcome.kind === 'skipped-same'));
});

test('中身が同じで名前だけ違う時は足さず、手元の名前を残して旨を返す', () => {
  const local: UserAssetsHoldings = {
    userLayouts: [{ ...LAYOUT, name: '手元の名前' }],
    userRomajiRules: [{ ...RULE, name: '手元の規則' }],
    fingerAssignments: [{ ...FINGER, name: '手元の指' }],
  };
  const merged = mergeUserAssets(local, read(HOLDINGS), STAMP);
  assert.deepEqual(merged.assets, local);
  assert.deepEqual(
    merged.entries.map((entry) => entry.outcome),
    [{ kind: 'skipped-same', existingName: '手元の名前' }, { kind: 'skipped-same', existingName: '手元の規則' }, { kind: 'skipped-same', existingName: '手元の指' }],
  );
});

test('中身の比較: 数値に関わる項目はどれが違っても別の中身で、directの省略とfalse・キーの並びは同じ中身', () => {
  const differs = (a: UserLayout, b: UserLayout): boolean => {
    const merged = mergeUserAssets({ ...EMPTY, userLayouts: [a] }, { layouts: [b], romajiRules: [], fingerAssignments: [] }, STAMP);
    return merged.entries[0]!.outcome.kind === 'added-renamed';
  };
  const base: UserLayout = { id: 'u', name: 'U', rows: ROWS, romaji: 'kunrei' };
  assert.equal(differs(base, { ...base, rows: ['1234567890-=', 'qwertyuiop[]', "asdfghjkl;'", 'zxcvbnm,.-'] }), true);
  assert.equal(differs(base, { ...base, romaji: 'azik' }), true);
  assert.equal(differs(base, { ...base, sequences: [] }), true);
  assert.equal(differs(base, { ...base, legends: [['a', 'A']] }), true);
  assert.equal(differs(base, { ...base, direct: true }), true);
  assert.equal(differs(base, { ...base, homeKeys: { LI: 'f' } }), true);
  assert.equal(differs(base, { ...base, direct: false }), false);
  assert.equal(differs({ ...base, homeKeys: { LI: 'f', RI: 'j' } }, { ...base, homeKeys: { RI: 'j', LI: 'f' } }), false);
  // ローマ字を経ない配列は推奨の規則を使わないので、規則のidが違っても同じ中身
  assert.equal(differs({ ...base, direct: true }, { ...base, direct: true, romaji: 'azik' }), false);

  const ruleDiffers = (rule: UserRomajiRule) =>
    mergeUserAssets({ ...EMPTY, userRomajiRules: [RULE] }, { layouts: [], romajiRules: [rule], fingerAssignments: [] }, STAMP).entries[0]!.outcome.kind === 'added-renamed';
  assert.equal(ruleDiffers({ ...RULE, base: 'azik' }), true);
  assert.equal(ruleDiffers({ ...RULE, generateSokuon: false }), true);
  assert.equal(ruleDiffers({ ...RULE, overrides: { し: 'si' } }), true);
  assert.equal(ruleDiffers({ ...RULE, overrides: { ち: 'chi', し: 'shi' } }), false);

  const fingerDiffers = (assignment: FingerAssignment) =>
    mergeUserAssets({ ...EMPTY, fingerAssignments: [FINGER] }, { layouts: [], romajiRules: [], fingerAssignments: [assignment] }, STAMP).entries[0]!.outcome.kind === 'added-renamed';
  assert.equal(fingerDiffers({ ...FINGER, homeKey: { ...FINGER.homeKey, LI: 'g' } }), true);
  assert.equal(fingerDiffers({ ...FINGER, keyFinger: { ...FINGER.keyFinger, q: 'LP' } }), true);
  assert.equal(fingerDiffers({ ...FINGER, name: '別の名前' }), false);
});

test('同じidで中身が違う時は手元を残し、読み込んだ側を新しいidと別名で足す', () => {
  const local: UserAssetsHoldings = {
    userLayouts: [{ ...LAYOUT, rows: ROWS }],
    userRomajiRules: [{ ...RULE, overrides: { し: 'si' } }],
    fingerAssignments: [{ ...FINGER, homeKey: { ...FINGER.homeKey, LI: 'g' } }],
  };
  const merged = mergeUserAssets(local, read(HOLDINGS), STAMP);
  assert.equal(merged.assets.userLayouts.length, 2);
  assert.equal(merged.assets.userRomajiRules.length, 2);
  assert.equal(merged.assets.fingerAssignments.length, 2);
  // 手元は先頭にそのまま残る
  assert.deepEqual(merged.assets.userLayouts[0], local.userLayouts[0]);
  assert.deepEqual(merged.assets.userRomajiRules[0], local.userRomajiRules[0]);
  assert.deepEqual(merged.assets.fingerAssignments[0], local.fingerAssignments[0]);
  assert.deepEqual(merged.assets.userLayouts[1]!.name, '自作A (2)');
  assert.deepEqual(merged.assets.userRomajiRules[1]!.name, 'し・ちをshi・chiで打つ (2)');
  assert.deepEqual(merged.assets.fingerAssignments[1]!.name, '自作の指 (2)');
  assert.deepEqual(merged.entries.map((entry) => entry.outcome.kind), ['added-renamed', 'added-renamed', 'added-renamed']);
  // 新しいidは、idの接頭辞を保ち、手元のidと重ならない
  assert.equal(merged.assets.userLayouts[1]!.id, 'user-stamp-1');
  assert.equal(merged.assets.userRomajiRules[1]!.id, 'romaji-stamp-1');
  assert.equal(merged.assets.fingerAssignments[1]!.id, 'finger-stamp-1');
  // 足した配列は、別名で足した規則を指す
  assert.equal(merged.assets.userLayouts[1]!.romaji, 'romaji-stamp-1');
});

test('別名「(2)」が手元で使われていれば(3)にする', () => {
  const local: UserAssetsHoldings = {
    ...EMPTY,
    userLayouts: [{ ...LAYOUT, rows: ROWS }, { ...LAYOUT, id: 'user-b', name: '自作A (2)', rows: ROWS }],
  };
  const merged = mergeUserAssets(local, { layouts: [LAYOUT], romajiRules: [], fingerAssignments: [] }, STAMP);
  assert.equal(merged.assets.userLayouts[2]!.name, '自作A (3)');
});

test('中身の違うものを別名で足した後に同じファイルを読み直しても、増えない', () => {
  const local: UserAssetsHoldings = {
    userLayouts: [{ ...LAYOUT, rows: ROWS }],
    userRomajiRules: [{ ...RULE, overrides: { し: 'si' } }],
    fingerAssignments: [{ ...FINGER, homeKey: { ...FINGER.homeKey, LI: 'g' } }],
  };
  const bundle = read(HOLDINGS);
  const first = mergeUserAssets(local, bundle, STAMP);
  assert.equal(first.assets.userLayouts.length, 2);
  const again = mergeUserAssets(first.assets, bundle, 'stamp2');
  assert.deepEqual(again.assets, first.assets);
  assert.deepEqual(again.entries.map((entry) => entry.outcome), [
    { kind: 'skipped-same', existingName: '自作A (2)' },
    { kind: 'skipped-same', existingName: 'し・ちをshi・chiで打つ (2)' },
    { kind: 'skipped-same', existingName: '自作の指 (2)' },
  ]);
});

test('規則が同じで足さなかった時、配列の参照は手元の規則のまま', () => {
  const merged = mergeUserAssets({ ...EMPTY, userRomajiRules: [RULE] }, read(HOLDINGS), STAMP);
  assert.deepEqual(merged.assets.userLayouts, [LAYOUT]);
  assert.deepEqual(merged.entries.map((entry) => [entry.assetKind, entry.outcome.kind]), [
    ['layout', 'added'],
    ['romaji-rule', 'skipped-same'],
    ['finger-assignment', 'added'],
  ]);
});

test('組み込みの配列と同じidは別のidで足し、組み込みの規則と同じidはファイルの読み取りで落ちる', () => {
  const shadow: UserLayout = { ...LAYOUT, id: 'qwerty', romaji: 'kunrei' };
  const shadowRule: UserRomajiRule = { ...RULE, id: 'kunrei' };
  const parsed = parseUserAssetsFile(JSON.stringify({
    format: USER_ASSETS_FILE_FORMAT,
    version: 1,
    layouts: [shadow],
    romajiRules: [shadowRule],
  }));
  assert.ok(parsed.ok);
  if (!parsed.ok) return;
  assert.equal(parsed.bundle.romajiRules.length, 0);
  assert.match(parsed.dropped.map((d) => d.message).join(), /組み込みの規則と同じ/);
  const merged = mergeUserAssets(EMPTY, parsed.bundle, STAMP);
  assert.equal(merged.assets.userLayouts.length, 1);
  assert.equal(merged.assets.userLayouts[0]!.id, 'user-stamp-1');
  assert.equal(LAYOUT_BY_ID.has(merged.assets.userLayouts[0]!.id), false);
  assert.equal(merged.entries[0]!.outcome.kind, 'added-renamed');
});

test('コマンド: 1回で3つの資産を足し、元に戻すと全部が戻る。足すものが無ければ履歴に積まない', () => {
  const assets: KeydistAssets = {
    setupLibrary: { setups: [], overrides: emptyCascadeOverrides() },
    fingerAssignments: [],
    textLibrary: emptyTextLibrary(),
    standaloneTextSelection: initialTextSelection(),
    standaloneAnalyzerOptions: {},
    multiTargetSelection: initialMultiTargetSelection(),
    singleTargetSelection: initialSingleTargetSelection(),
    workspaces: [],
    presetLibrary: { presets: [] },
    userLayouts: [],
    userRomajiRules: [],
  };
  const history = emptyCommandHistory<KeydistAssets>();
  const step = applyCommand(assets, history, importUserAssetsCommand(read(HOLDINGS), STAMP));
  assert.deepEqual([step.assets.userLayouts, step.assets.userRomajiRules, step.assets.fingerAssignments], [[LAYOUT], [RULE], [FINGER]]);
  const again = applyCommand(step.assets, step.history, importUserAssetsCommand(read(HOLDINGS), STAMP));
  assert.equal(again.outcome.kind, 'no-op');
  assert.equal(again.assets, step.assets);
  const undone = undo(step.assets, step.history);
  assert.deepEqual([undone.assets.userLayouts, undone.assets.userRomajiRules, undone.assets.fingerAssignments], [[], [], []]);
});

test('ファイルの分類: 印の無いもの・別の種類・新しい版・空・多すぎるものを理由つきで断る', () => {
  const messageOf = (text: string): string => {
    const result = parseUserAssetsFile(text);
    assert.equal(result.ok, false, text);
    return result.ok ? '' : result.message;
  };
  assert.match(messageOf('{'), /読めませんでした/);
  assert.match(messageOf(JSON.stringify({ version: 1, layouts: [LAYOUT] })), /自作の資産のファイルではありません/);
  assert.match(messageOf(JSON.stringify({ format: 'keydist-presets', version: 1, presets: [] })), /自作の資産のファイルではありません/);
  assert.match(messageOf(JSON.stringify({ format: USER_ASSETS_FILE_FORMAT, version: 2, layouts: [LAYOUT] })), /新しい形式/);
  assert.match(messageOf(JSON.stringify({ format: USER_ASSETS_FILE_FORMAT, layouts: [LAYOUT] })), /形式が正しくありません/);
  assert.match(messageOf(JSON.stringify({ format: USER_ASSETS_FILE_FORMAT, version: 1 })), /読み込める資産がありません/);
  const many = Array.from({ length: USER_ASSETS_FILE_MAX_ITEMS + 1 }, (_, i) => ({ ...LAYOUT, id: `u${i}` }));
  assert.match(messageOf(JSON.stringify({ format: USER_ASSETS_FILE_FORMAT, version: 1, layouts: many })), /多すぎます/);
});

test('壊れた要素は捨てて残りを読み、捨てた診断を返す', () => {
  const parsed = parseUserAssetsFile(JSON.stringify({
    format: USER_ASSETS_FILE_FORMAT,
    version: 1,
    layouts: [LAYOUT, { id: 'broken' }],
    romajiRules: [RULE],
  }));
  assert.ok(parsed.ok);
  if (!parsed.ok) return;
  assert.equal(parsed.bundle.layouts.length, 1);
  assert.equal(parsed.dropped.length, 1);
});
