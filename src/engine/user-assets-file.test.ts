import { EMPTY_PERSONAL_SPEED } from '#interpretation/timing/calibration-codec.ts';
import assert from 'node:assert/strict';
import test from 'node:test';
import { applyCommand, emptyCommandHistory, undo } from '#input/commands/index.ts';
import { LAYOUT_BY_ID } from '#input/layouts/index.ts';
import { buildUserCatalog } from '#input/layouts/user-catalog.ts';
import type { UserLayout } from '#input/layouts/user-layouts.ts';
import type { UserRomajiRule } from '#input/romaji/rules.ts';
import { assignKeyFinger } from '#input/shapes/finger-assignment-edit.ts';
import { columnFingerAssignment, PHYSICAL_SHAPES, QWERTY_OPTIMIZED_FINGER_ASSIGNMENT, type FingerAssignment } from '#input/shapes/geometry.ts';
import type { TextLanguage } from '#input/text/language.ts';
import { emptyCascadeOverrides } from '#input/settings/index.ts';
import type { SetupLibrary } from '#input/setup/index.ts';
import { emptyTextLibrary } from '#input/text/library.ts';
import { initialTextSelection } from '#input/text/selection.ts';
import type { KeydistAssets } from './commands.ts';
import { initialMultiTargetSelection } from './multi-target-selection.ts';
import { generateEngineTrace, interpretEngineTrace } from './pipeline.ts';
import { resolveEngineInput } from './resolved-input.ts';
import { initialSingleTargetSelection } from './single-target-selection.ts';
import { EMPTY_SETTINGS_OVERRIDES, setSettingsOverride, type SettingsCascadeOverrides, type SettingsValueMap } from './settings-items.ts';
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
const NO_SETUPS: SetupLibrary<SettingsValueMap> = { setups: [], overrides: emptyCascadeOverrides() };
const EMPTY: UserAssetsHoldings = { userLayouts: [], userRomajiRules: [], fingerAssignments: [], setupLibrary: NO_SETUPS };
const STAMP = 'stamp';

const RULE: UserRomajiRule = { id: 'rule-a', name: 'し・ちをshi・chiで打つ', base: 'kunrei', overrides: { し: 'shi', ち: 'chi' }, generateSokuon: true };
const LAYOUT: UserLayout = { id: 'user-a', name: '自作A', rows: ['', 'poiuytrewq[]', "asdfghjkl;'", 'zxcvbnm,./'], romaji: 'rule-a' };
// 右手の列の担当を入れ替えた指の割り当て（既定と数値が変わる）
const FINGER: FingerAssignment = columnFingerAssignment(
  'finger-a',
  '自作の指',
  ['RP', 'RR', 'RM', 'RI', 'RI', 'LI', 'LI', 'LM', 'LR', 'LP', 'LP', 'LP', 'LP'],
  { LP: 9, LR: 8, LM: 7, LI: 6, RI: 3, RM: 2, RR: 1, RP: 0 },
);
const HOLDINGS: UserAssetsHoldings = { userLayouts: [LAYOUT], userRomajiRules: [RULE], fingerAssignments: [FINGER], setupLibrary: NO_SETUPS };

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
  assert.deepEqual(
    merged.entries.map((entry) => entry.outcome.kind),
    ['added', 'added', 'added'],
  );

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

test('複数の指が担当するキーを持つ指の割り当ては、書き出し・読み込みで担当と基本の指が保たれ、同じ数値が出る', () => {
  const multi: FingerAssignment = { ...structuredClone(QWERTY_OPTIMIZED_FINGER_ASSIGNMENT), id: 'finger-multi', name: '自作の最適化' };
  const holdings: UserAssetsHoldings = { userLayouts: [LAYOUT], userRomajiRules: [RULE], fingerAssignments: [multi], setupLibrary: NO_SETUPS };
  const merged = mergeUserAssets(EMPTY, read(holdings), STAMP);
  assert.deepEqual(merged.assets.fingerAssignments, [multi]);
  const loaded = merged.assets.fingerAssignments[0]!;
  assert.deepEqual(loaded.fingerKeys, QWERTY_OPTIMIZED_FINGER_ASSIGNMENT.fingerKeys);
  assert.deepEqual(loaded.baseFinger, QWERTY_OPTIMIZED_FINGER_ASSIGNMENT.baseFinger);

  const global = setSettingsOverride(EMPTY_SETTINGS_OVERRIDES, { kind: 'global' }, 'fingerAssignmentId', multi.id);
  assert.ok(global.ok);
  if (!global.ok) return;
  const text = 'こんにちは、きょうはしゃしんをとりにいきます。ゆうきとむぎ。';
  const before = measure(holdings, LAYOUT.id, 'ja', text, global.overrides);
  const after = measure(merged.assets, LAYOUT.id, 'ja', text, global.overrides);
  assert.deepEqual(after.trace.trace.strokes, before.trace.trace.strokes);
  assert.equal(after.metrics.fingerAssignmentHasMultiFingerKeys, true);
  // 追加の担当を持たない元の割り当てで測った値とは別になる
  const plain = measure(holdings, LAYOUT.id, 'ja', text, EMPTY_SETTINGS_OVERRIDES);
  assert.notDeepEqual(after.metrics.perFinger, plain.metrics.perFinger);
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
    setupLibrary: NO_SETUPS,
  };
  const merged = mergeUserAssets(local, read(HOLDINGS), STAMP);
  assert.deepEqual(merged.assets, local);
  assert.deepEqual(
    merged.entries.map((entry) => entry.outcome),
    [
      { kind: 'skipped-same', existingName: '手元の名前' },
      { kind: 'skipped-same', existingName: '手元の規則' },
      { kind: 'skipped-same', existingName: '手元の指' },
    ],
  );
});

test('中身の比較: 数値に関わる項目はどれが違っても別の中身で、キーの並びは同じ中身', () => {
  const differs = (a: UserLayout, b: UserLayout): boolean => {
    const merged = mergeUserAssets({ ...EMPTY, userLayouts: [a] }, { layouts: [b], romajiRules: [], fingerAssignments: [], setups: [] }, STAMP);
    return merged.entries[0]!.outcome.kind === 'added-renamed';
  };
  const base: UserLayout = { id: 'u', name: 'U', rows: ROWS, romaji: 'kunrei' };
  assert.equal(differs(base, { ...base, rows: ['1234567890-=', 'qwertyuiop[]', "asdfghjkl;'", 'zxcvbnm,.-'] }), true);
  assert.equal(differs(base, { ...base, romaji: 'azik' }), true);
  assert.equal(differs(base, { ...base, sequences: [] }), true);
  assert.equal(differs(base, { ...base, legends: [['a', 'A']] }), true);
  assert.equal(differs(base, { ...base, homeKeys: { LI: 'f' } }), true);
  assert.equal(differs({ ...base, homeKeys: { LI: 'f', RI: 'j' } }, { ...base, homeKeys: { RI: 'j', LI: 'f' } }), false);

  const ruleDiffers = (rule: UserRomajiRule) =>
    mergeUserAssets({ ...EMPTY, userRomajiRules: [RULE] }, { layouts: [], romajiRules: [rule], fingerAssignments: [], setups: [] }, STAMP).entries[0]!
      .outcome.kind === 'added-renamed';
  assert.equal(ruleDiffers({ ...RULE, base: 'azik' }), true);
  assert.equal(ruleDiffers({ ...RULE, generateSokuon: false }), true);
  assert.equal(ruleDiffers({ ...RULE, overrides: { し: 'si' } }), true);
  assert.equal(ruleDiffers({ ...RULE, overrides: { ち: 'chi', し: 'shi' } }), false);

  const fingerDiffers = (assignment: FingerAssignment) =>
    mergeUserAssets({ ...EMPTY, fingerAssignments: [FINGER] }, { layouts: [], romajiRules: [], fingerAssignments: [assignment], setups: [] }, STAMP)
      .entries[0]!.outcome.kind === 'added-renamed';
  assert.equal(fingerDiffers({ ...FINGER, homeKey: { ...FINGER.homeKey, LI: 'g' } }), true);
  assert.equal(fingerDiffers(assignKeyFinger(FINGER, 'q', 'LP')), true);
  assert.equal(fingerDiffers({ ...FINGER, name: '別の名前' }), false);
});

test('同じidで中身が違う時は手元を残し、読み込んだ側を新しいidと別名で足す', () => {
  const local: UserAssetsHoldings = {
    userLayouts: [{ ...LAYOUT, rows: ROWS }],
    userRomajiRules: [{ ...RULE, overrides: { し: 'si' } }],
    fingerAssignments: [{ ...FINGER, homeKey: { ...FINGER.homeKey, LI: 'g' } }],
    setupLibrary: NO_SETUPS,
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
  assert.deepEqual(
    merged.entries.map((entry) => entry.outcome.kind),
    ['added-renamed', 'added-renamed', 'added-renamed'],
  );
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
    userLayouts: [
      { ...LAYOUT, rows: ROWS },
      { ...LAYOUT, id: 'user-b', name: '自作A (2)', rows: ROWS },
    ],
  };
  const merged = mergeUserAssets(local, { layouts: [LAYOUT], romajiRules: [], fingerAssignments: [], setups: [] }, STAMP);
  assert.equal(merged.assets.userLayouts[2]!.name, '自作A (3)');
});

test('中身の違うものを別名で足した後に同じファイルを読み直しても、増えない', () => {
  const local: UserAssetsHoldings = {
    userLayouts: [{ ...LAYOUT, rows: ROWS }],
    userRomajiRules: [{ ...RULE, overrides: { し: 'si' } }],
    fingerAssignments: [{ ...FINGER, homeKey: { ...FINGER.homeKey, LI: 'g' } }],
    setupLibrary: NO_SETUPS,
  };
  const bundle = read(HOLDINGS);
  const first = mergeUserAssets(local, bundle, STAMP);
  assert.equal(first.assets.userLayouts.length, 2);
  const again = mergeUserAssets(first.assets, bundle, 'stamp2');
  assert.deepEqual(again.assets, first.assets);
  assert.deepEqual(
    again.entries.map((entry) => entry.outcome),
    [
      { kind: 'skipped-same', existingName: '自作A (2)' },
      { kind: 'skipped-same', existingName: 'し・ちをshi・chiで打つ (2)' },
      { kind: 'skipped-same', existingName: '自作の指 (2)' },
    ],
  );
});

test('規則が同じで足さなかった時、配列の参照は手元の規則のまま', () => {
  const merged = mergeUserAssets({ ...EMPTY, userRomajiRules: [RULE] }, read(HOLDINGS), STAMP);
  assert.deepEqual(merged.assets.userLayouts, [LAYOUT]);
  assert.deepEqual(
    merged.entries.map((entry) => [entry.assetKind, entry.outcome.kind]),
    [
      ['layout', 'added'],
      ['romaji-rule', 'skipped-same'],
      ['finger-assignment', 'added'],
    ],
  );
});

test('組み込みの配列と同じidは別のidで足し、組み込みの規則と同じidはファイルの読み取りで落ちる', () => {
  const shadow: UserLayout = { ...LAYOUT, id: 'qwerty', romaji: 'kunrei' };
  const shadowRule: UserRomajiRule = { ...RULE, id: 'kunrei' };
  const parsed = parseUserAssetsFile(
    JSON.stringify({
      format: USER_ASSETS_FILE_FORMAT,
      version: 1,
      layouts: [shadow],
      romajiRules: [shadowRule],
    }),
  );
  assert.ok(parsed.ok);
  if (!parsed.ok) return;
  assert.equal(parsed.bundle.romajiRules.length, 0);
  assert.match(parsed.dropped.map((d) => d.message).join(), /組み込みの規則と同じ/);
  const merged = mergeUserAssets(EMPTY, parsed.bundle, STAMP);
  assert.equal(merged.assets.userLayouts.length, 1);
  assert.equal(merged.assets.userLayouts[0]!.id, 'user-stamp-1');
  assert.equal(LAYOUT_BY_ID.has(merged.assets.userLayouts[0]!.id), false);
  const outcome = merged.entries[0]!.outcome;
  assert.equal(outcome.kind, 'added-renamed');
  assert.deepEqual(outcome.kind === 'added-renamed' ? outcome.overlap : undefined, { with: 'builtin', name: LAYOUT_BY_ID.get('qwerty')!.name });
});

test('手元と重なって別名で足した時、重なった相手の手元の名前を持つ', () => {
  const local: UserAssetsHoldings = { ...EMPTY, userLayouts: [{ ...LAYOUT, name: '手元で名前を変えた配列', rows: ROWS }] };
  const outcome = mergeUserAssets(local, { layouts: [LAYOUT], romajiRules: [], fingerAssignments: [], setups: [] }, STAMP).entries[0]!.outcome;
  assert.deepEqual(outcome.kind === 'added-renamed' ? outcome.overlap : undefined, { with: 'own', name: '手元で名前を変えた配列' });
});

function emptyAssets(): KeydistAssets {
  return {
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
    personalSpeed: EMPTY_PERSONAL_SPEED,
  };
}

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
    personalSpeed: EMPTY_PERSONAL_SPEED,
  };
  const history = emptyCommandHistory<KeydistAssets>();
  const step = applyCommand(assets, history, importUserAssetsCommand(read(HOLDINGS), STAMP).command);
  assert.deepEqual([step.assets.userLayouts, step.assets.userRomajiRules, step.assets.fingerAssignments], [[LAYOUT], [RULE], [FINGER]]);
  const again = applyCommand(step.assets, step.history, importUserAssetsCommand(read(HOLDINGS), STAMP).command);
  assert.equal(again.outcome.kind, 'no-op');
  assert.equal(again.assets, step.assets);
  const undone = undo(step.assets, step.history);
  assert.deepEqual([undone.assets.userLayouts, undone.assets.userRomajiRules, undone.assets.fingerAssignments], [[], [], []]);
});

test('ファイルに無い規則を指す配列は、手元の同じidの規則に結び付けず、書き出した側と同じ数値で打つ', () => {
  // 書き出した側: 規則を消した後で、配列だけがその規則のidを指している（全体の値の規則で打つ）
  const exporter: UserAssetsHoldings = { userLayouts: [LAYOUT], userRomajiRules: [], fingerAssignments: [], setupLibrary: NO_SETUPS };
  // 読み込む側: 同じidで別の中身の規則（し・ちをshi・chiで打つ）を持っている
  const importer: UserAssetsHoldings = { userLayouts: [], userRomajiRules: [RULE], fingerAssignments: [], setupLibrary: NO_SETUPS };
  const text = 'こんにちは、きょうはしゃしんをとりにいきます。ちしきをしる。';
  const before = measure(exporter, LAYOUT.id, 'ja', text, EMPTY_SETTINGS_OVERRIDES);

  const newForm = fileText(exporter);
  // 書き出しは参照を外す。この変更より前に書かれたファイルは参照が残っている
  const oldForm = JSON.stringify({ format: USER_ASSETS_FILE_FORMAT, version: 1, layouts: [LAYOUT], romajiRules: [], fingerAssignments: [] });
  assert.equal(JSON.parse(newForm).layouts[0].romaji, undefined);
  assert.equal(JSON.parse(oldForm).layouts[0].romaji, 'rule-a');

  for (const body of [newForm, oldForm]) {
    const parsed = parseUserAssetsFile(body);
    assert.ok(parsed.ok);
    if (!parsed.ok) return;
    const merged = mergeUserAssets(importer, parsed.bundle, STAMP);
    assert.deepEqual(
      merged.entries.map((entry) => entry.outcome.kind),
      ['added'],
    );
    assert.equal(merged.assets.userLayouts[0]!.romaji, undefined);
    assert.deepEqual(merged.assets.userRomajiRules, [RULE]);
    const after = measure(merged.assets, LAYOUT.id, 'ja', text, EMPTY_SETTINGS_OVERRIDES);
    assert.ok(before.trace.trace.strokes.length > 0);
    assert.deepEqual(after.trace.trace.strokes, before.trace.trace.strokes);
    assert.deepEqual(after.metrics, before.metrics);
  }
  // 手元の規則に結び付けると別の数値になる（検査が何かを見ている確認）
  const bound = measure({ ...importer, userLayouts: [LAYOUT] }, LAYOUT.id, 'ja', text, EMPTY_SETTINGS_OVERRIDES);
  assert.notDeepEqual(bound.metrics, before.metrics);
});

test('ファイルに無い規則を指す配列は、手元で規則を指す同じ中身の配列とは別の中身として足す', () => {
  const dangling: UserAssetsBundle = { layouts: [LAYOUT], romajiRules: [], fingerAssignments: [], setups: [] };
  const merged = mergeUserAssets({ ...EMPTY, userLayouts: [LAYOUT], userRomajiRules: [RULE] }, dangling, STAMP);
  assert.deepEqual(
    merged.entries.map((entry) => entry.outcome.kind),
    ['added-renamed'],
  );
});

test('読み込みの内訳は、書き込みを決めた突き合わせから作られ、読み取りの間に手元が変わっても食い違わない', () => {
  const bundle = read(HOLDINGS);
  const plan = importUserAssetsCommand(bundle, STAMP);
  assert.equal(plan.entries(), undefined);
  // 読み取りの前に見た手元（空）では3件とも足す。実際に適用する時の手元は、別のタブが同じ資産を足した後
  const stale = mergeUserAssets(EMPTY, bundle, STAMP);
  assert.deepEqual(
    stale.entries.map((entry) => entry.outcome.kind),
    ['added', 'added', 'added'],
  );
  const outcome = plan.command({ ...emptyAssets(), ...HOLDINGS });
  assert.equal(outcome.kind, 'no-op');
  assert.deepEqual(
    plan.entries()!.map((entry) => entry.outcome.kind),
    ['skipped-same', 'skipped-same', 'skipped-same'],
  );
  // 手元が空のまま適用すれば、内訳は足す3件で、書き込みの中身もその突き合わせと同じ
  const applied = plan.command(emptyAssets());
  assert.equal(applied.kind, 'applied');
  assert.deepEqual(plan.entries(), stale.entries);
  if (applied.kind === 'applied') {
    assert.deepEqual([applied.changes.userLayouts, applied.changes.userRomajiRules, applied.changes.fingerAssignments], [[LAYOUT], [RULE], [FINGER]]);
  }
});

test('消した規則を指す手元の配列を書き出して自分へ読み直すと、同じ中身として足さない', () => {
  const holdings: UserAssetsHoldings = { userLayouts: [LAYOUT], userRomajiRules: [], fingerAssignments: [], setupLibrary: NO_SETUPS };
  const merged = mergeUserAssets(holdings, read(holdings), STAMP);
  assert.deepEqual(
    merged.entries.map((entry) => entry.outcome.kind),
    ['skipped-same'],
  );
  assert.equal(merged.assets.userLayouts.length, 1);
  assert.equal(merged.assets.userLayouts[0], LAYOUT);
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
  const parsed = parseUserAssetsFile(
    JSON.stringify({
      format: USER_ASSETS_FILE_FORMAT,
      version: 1,
      layouts: [LAYOUT, { id: 'broken' }],
      romajiRules: [RULE],
    }),
  );
  assert.ok(parsed.ok);
  if (!parsed.ok) return;
  assert.equal(parsed.bundle.layouts.length, 1);
  assert.equal(parsed.dropped.length, 1);
});

// --- Setup ---

function libraryOf(
  setups: readonly { id: string; number: number; layoutId: string; shapeId: string; label?: string }[],
  setupOverrides: Readonly<Record<string, Record<string, unknown>>> = {},
): SetupLibrary<SettingsValueMap> {
  return {
    setups,
    overrides: Object.keys(setupOverrides).length === 0 ? emptyCascadeOverrides() : { setup: setupOverrides as never },
  };
}

const SETUP_HOLDINGS: UserAssetsHoldings = {
  ...HOLDINGS,
  setupLibrary: libraryOf(
    [
      { id: 's1', number: 1, layoutId: 'user-a', shapeId: 'ortho', label: '練習用' },
      { id: 's2', number: 2, layoutId: 'qwerty', shapeId: 'row-staggered' },
    ],
    { s1: { windowSize: 5, fingerAssignmentId: 'finger-a', romajiRuleId: 'rule-a' } },
  ),
};

test('Setup: 書き出して空の手元へ読み込むと、Setupとそのレベルの条件・ラベル・番号が戻る', () => {
  const merged = mergeUserAssets(EMPTY, read(SETUP_HOLDINGS), STAMP);
  assert.deepEqual(merged.assets.setupLibrary, SETUP_HOLDINGS.setupLibrary);
  const unlabeled = `${LAYOUT_BY_ID.get('qwerty')!.name}/${PHYSICAL_SHAPES['row-staggered'].name}`;
  assert.deepEqual(
    merged.entries.filter((entry) => entry.assetKind === 'setup').map((entry) => [entry.name, entry.outcome.kind]),
    [
      ['練習用', 'added'],
      [unlabeled, 'added'],
    ],
  );
});

test('Setup: 同じファイルを二度読んでも増えず、二度目は全部を足さない', () => {
  const bundle = read(SETUP_HOLDINGS);
  const first = mergeUserAssets(EMPTY, bundle, STAMP).assets;
  const second = mergeUserAssets(first, bundle, 'stamp2');
  assert.equal(second.assets.setupLibrary, first.setupLibrary);
  assert.ok(second.entries.every((entry) => entry.outcome.kind === 'skipped-same'));
});

test('Setup: 中身が同じなら、idが違っても、ラベルが違っても足さない。手元の名前を添えて返す', () => {
  const local: UserAssetsHoldings = {
    ...EMPTY,
    setupLibrary: libraryOf([{ id: 'other', number: 7, layoutId: 'qwerty', shapeId: 'row-staggered', label: '手元の名前' }]),
  };
  const merged = mergeUserAssets(
    local,
    { layouts: [], romajiRules: [], fingerAssignments: [], setups: [{ id: 's2', layoutId: 'qwerty', shapeId: 'row-staggered', label: '別の名前' }] },
    STAMP,
  );
  assert.equal(merged.assets.setupLibrary, local.setupLibrary);
  assert.deepEqual(
    merged.entries.map((entry) => entry.outcome),
    [{ kind: 'skipped-same', existingName: '手元の名前' }],
  );
});

test('Setup: 中身の比較は、配列・物理配列・Setupのレベルの条件のどれが違っても別の中身', () => {
  const base = { id: 'b', layoutId: 'qwerty', shapeId: 'row-staggered' };
  const local: UserAssetsHoldings = { ...EMPTY, setupLibrary: libraryOf([{ ...base, number: 1 }], { b: { windowSize: 5 } }) };
  const kindOf = (setup: UserAssetsBundle['setups'][number]) =>
    mergeUserAssets(local, { layouts: [], romajiRules: [], fingerAssignments: [], setups: [setup] }, STAMP).entries[0]!.outcome.kind;
  assert.equal(kindOf({ ...base, id: 'x', overrides: { windowSize: 5 } }), 'skipped-same');
  assert.equal(kindOf({ ...base, id: 'x', overrides: { windowSize: 6 } }), 'added');
  assert.equal(kindOf({ ...base, id: 'x' }), 'added');
  assert.equal(kindOf({ ...base, id: 'x', layoutId: 'dvorak', overrides: { windowSize: 5 } }), 'added');
  assert.equal(kindOf({ ...base, id: 'x', shapeId: 'ortho', overrides: { windowSize: 5 } }), 'added');
});

test('Setup: 同じidで中身が違う時は手元を残し、新しいidでラベルのまま足す。番号は手元の最大＋1から振る', () => {
  const local: UserAssetsHoldings = {
    ...EMPTY,
    setupLibrary: libraryOf([
      { id: 's1', number: 1, layoutId: 'qwerty', shapeId: 'row-staggered', label: '練習用' },
      { id: 'z', number: 4, layoutId: 'dvorak', shapeId: 'row-staggered' },
    ]),
  };
  const incoming: UserAssetsBundle = {
    layouts: [],
    romajiRules: [],
    fingerAssignments: [],
    setups: [
      { id: 's1', layoutId: 'qwerty', shapeId: 'ortho', label: '練習用' },
      { id: 'fresh', layoutId: 'colemak', shapeId: 'row-staggered' },
    ],
  };
  const merged = mergeUserAssets(local, incoming, STAMP);
  const { setups } = merged.assets.setupLibrary;
  assert.deepEqual(setups.slice(0, 2), local.setupLibrary.setups);
  assert.deepEqual(
    setups.slice(2).map((setup) => [setup.id, setup.number, setup.layoutId, setup.shapeId, setup.label]),
    [
      ['setup-stamp-1', 5, 'qwerty', 'ortho', '練習用'],
      ['fresh', 6, 'colemak', 'row-staggered', undefined],
    ],
  );
  assert.deepEqual(
    merged.entries.map((entry) => entry.outcome.kind),
    ['added-renamed', 'added'],
  );
  // 足した後に同じファイルを読み直しても増えない
  const again = mergeUserAssets(merged.assets, incoming, 'stamp2');
  assert.equal(again.assets.setupLibrary, merged.assets.setupLibrary);
});

test('Setup: 読み込みで別のidになった配列・指の割り当て・ローマ字規則を指すSetupは、新しいidへ付け替える', () => {
  // 手元に同じidで中身の違う資産があるので、ファイルの資産は新しいidで足される
  const local: UserAssetsHoldings = {
    userLayouts: [{ ...LAYOUT, rows: ROWS }],
    userRomajiRules: [{ ...RULE, overrides: { し: 'si' } }],
    fingerAssignments: [{ ...FINGER, homeKey: { ...FINGER.homeKey, LI: 'g' } }],
    setupLibrary: NO_SETUPS,
  };
  const merged = mergeUserAssets(local, read(SETUP_HOLDINGS), STAMP);
  const added = merged.assets.setupLibrary.setups.find((setup) => setup.label === '練習用')!;
  assert.equal(added.layoutId, 'user-stamp-1');
  const conditions = merged.assets.setupLibrary.overrides.setup?.[added.id];
  assert.equal(conditions?.fingerAssignmentId, 'finger-stamp-1');
  assert.equal(conditions?.romajiRuleId, 'romaji-stamp-1');
  assert.equal(conditions?.windowSize, 5);
  assert.ok(merged.assets.userLayouts.some((layout) => layout.id === 'user-stamp-1'));
});

test('Setup: 書き出しでは、ファイルに入れない自作の資産を指す条件の参照を外し、組み込みと入れる資産への参照は残す', () => {
  const holdings: UserAssetsHoldings = {
    ...EMPTY,
    fingerAssignments: [FINGER],
    setupLibrary: libraryOf(
      [
        { id: 'a', number: 1, layoutId: 'qwerty', shapeId: 'row-staggered' },
        { id: 'b', number: 2, layoutId: 'qwerty', shapeId: 'row-staggered' },
        { id: 'c', number: 3, layoutId: 'qwerty', shapeId: 'row-staggered' },
      ],
      {
        a: { windowSize: 5, fingerAssignmentId: 'finger-gone', romajiRuleId: 'rule-gone' },
        b: { fingerAssignmentId: 'finger-a', romajiRuleId: 'kunrei' },
        c: { fingerAssignmentId: 'finger-gone' },
      },
    ),
  };
  const body = userAssetsFileBody(holdings) as { setups: { id: string; overrides?: Record<string, unknown> }[] };
  assert.deepEqual(
    body.setups.map((setup) => [setup.id, setup.overrides]),
    [
      ['a', { windowSize: 5 }],
      ['b', { fingerAssignmentId: 'finger-a', romajiRuleId: 'kunrei' }],
      ['c', undefined],
    ],
  );
});

test('Setup: 配列がファイルにも手元にも無いSetupと、分からない物理配列のSetupは捨てずに残す', () => {
  const merged = mergeUserAssets(
    EMPTY,
    {
      layouts: [],
      romajiRules: [],
      fingerAssignments: [],
      setups: [{ id: 'gone', layoutId: 'user-not-here', shapeId: 'future-shape', label: '古い' }],
    },
    STAMP,
  );
  assert.deepEqual(merged.assets.setupLibrary.setups, [{ id: 'gone', number: 1, layoutId: 'user-not-here', shapeId: 'future-shape', label: '古い' }]);
});

test('Setup: setupsの無い古いファイルは読め、壊れたSetupとSetupのレベルに置けない項目は診断つきで捨てる', () => {
  const old = parseUserAssetsFile(JSON.stringify({ format: USER_ASSETS_FILE_FORMAT, version: 1, layouts: [LAYOUT] }));
  assert.ok(old.ok);
  if (old.ok) assert.deepEqual(old.bundle.setups, []);

  const parsed = parseUserAssetsFile(
    JSON.stringify({
      format: USER_ASSETS_FILE_FORMAT,
      version: 1,
      setups: [
        { id: 'ok', layoutId: 'qwerty', shapeId: 'row-staggered', overrides: { windowSize: 4, defaultShapeId: 'ortho', unknown: 1 } },
        { id: 'ok', layoutId: 'qwerty', shapeId: 'ortho' },
        { layoutId: 'qwerty', shapeId: 'ortho' },
        'x',
      ],
    }),
  );
  assert.ok(parsed.ok);
  if (!parsed.ok) return;
  assert.deepEqual(parsed.bundle.setups, [{ id: 'ok', layoutId: 'qwerty', shapeId: 'row-staggered', overrides: { windowSize: 4 } }]);
  const paths = parsed.dropped.map((diagnostic) => diagnostic.path);
  assert.ok(paths.includes('setups[0].overrides.defaultShapeId'));
  assert.ok(paths.includes('setups[0].overrides.unknown'));
  assert.ok(paths.includes('setups[1]'));
  assert.ok(paths.includes('setups[2]'));
  assert.ok(paths.includes('setups[3]'));
});

test('Setup: 件数が多すぎるファイルは断る。Setupだけのファイルは読める', () => {
  const many = Array.from({ length: USER_ASSETS_FILE_MAX_ITEMS + 1 }, (_, i) => ({ id: `s${i}`, layoutId: 'qwerty', shapeId: 'row-staggered' }));
  const tooMany = parseUserAssetsFile(JSON.stringify({ format: USER_ASSETS_FILE_FORMAT, version: 1, setups: many }));
  assert.equal(tooMany.ok, false);
  const only = parseUserAssetsFile(JSON.stringify({ format: USER_ASSETS_FILE_FORMAT, version: 1, setups: [many[0]] }));
  assert.ok(only.ok);
});

test('Setup: コマンドは1回でSetupを足し、元に戻すと戻る。二度目は履歴に積まない', () => {
  const bundle = read(SETUP_HOLDINGS);
  const step = applyCommand(emptyAssets(), emptyCommandHistory<KeydistAssets>(), importUserAssetsCommand(bundle, STAMP).command);
  assert.deepEqual(step.assets.setupLibrary, SETUP_HOLDINGS.setupLibrary);
  const again = applyCommand(step.assets, step.history, importUserAssetsCommand(bundle, STAMP).command);
  assert.equal(again.outcome.kind, 'no-op');
  const undone = undo(step.assets, step.history);
  assert.deepEqual(undone.assets.setupLibrary.setups, []);
  assert.deepEqual(undone.assets.setupLibrary.overrides, {});
});

test('Setup: ファイルにも組み込みにも無い自作の指の割り当て・ローマ字規則への参照は、手元の同じidの資産に結び付けず外し、Setupは残す', () => {
  const local: UserAssetsHoldings = {
    ...EMPTY,
    userRomajiRules: [RULE],
    fingerAssignments: [FINGER],
  };
  const incoming: UserAssetsBundle = {
    layouts: [],
    romajiRules: [],
    fingerAssignments: [],
    setups: [
      { id: 'x', layoutId: 'qwerty', shapeId: 'row-staggered', overrides: { windowSize: 5, fingerAssignmentId: FINGER.id, romajiRuleId: RULE.id } },
    ],
  };
  const merged = mergeUserAssets(local, incoming, STAMP);
  assert.deepEqual(
    merged.assets.setupLibrary.setups.map((setup) => setup.id),
    ['x'],
  );
  assert.deepEqual(merged.assets.setupLibrary.overrides.setup?.x, { windowSize: 5 });
  // 組み込みへの参照は残す
  const builtin = mergeUserAssets(
    EMPTY,
    {
      ...incoming,
      setups: [{ id: 'y', layoutId: 'qwerty', shapeId: 'row-staggered', overrides: { romajiRuleId: 'kunrei' } }],
    },
    STAMP,
  );
  assert.deepEqual(builtin.assets.setupLibrary.overrides.setup?.y, { romajiRuleId: 'kunrei' });
});

test('Setup: 参照を外した結果が手元と同じ中身なら足さず、二度読んでも増えない', () => {
  const incoming: UserAssetsBundle = {
    layouts: [],
    romajiRules: [],
    fingerAssignments: [],
    setups: [{ id: 'x', layoutId: 'qwerty', shapeId: 'row-staggered', overrides: { fingerAssignmentId: 'finger-gone', romajiRuleId: 'romaji-gone' } }],
  };
  const first = mergeUserAssets(EMPTY, incoming, STAMP);
  assert.equal(first.assets.setupLibrary.setups.length, 1);
  assert.equal(first.assets.setupLibrary.overrides.setup, undefined);
  const second = mergeUserAssets(first.assets, incoming, 'stamp2');
  assert.equal(second.assets.setupLibrary, first.assets.setupLibrary);
  assert.deepEqual(
    second.entries.map((entry) => entry.outcome.kind),
    ['skipped-same'],
  );
});

const FACE_LAYOUT: UserLayout = {
  id: 'user-face',
  name: '面の配列',
  faces: [
    { trigger: [], inputRole: 'layer', outputs: { a: 'あ', s: 'か', d: 'さ', f: '゛' } },
    {
      trigger: ['thumb-l'],
      mode: 'simultaneous',
      triggerPersistence: 'single',
      inputRole: 'modifier',
      layer: '左親指',
      outputs: { a: 'ぁ', s: 'い' },
    },
  ],
  composition: { dakuten: true, handakuten: false },
};
const FACE_HOLDINGS: UserAssetsHoldings = { userLayouts: [LAYOUT, FACE_LAYOUT], userRomajiRules: [RULE], fingerAssignments: [], setupLibrary: NO_SETUPS };

test('面で定義する配列は、書き出して空の手元へ読み込むと同じ配列が戻り、同じ条件で同じ打鍵列が出る', () => {
  const merged = mergeUserAssets(EMPTY, read(FACE_HOLDINGS), STAMP);
  assert.deepEqual(merged.assets, FACE_HOLDINGS);
  const text = 'あかさがぁい';
  const before = measure(FACE_HOLDINGS, FACE_LAYOUT.id, 'ja', text, EMPTY_SETTINGS_OVERRIDES);
  const after = measure(merged.assets, FACE_LAYOUT.id, 'ja', text, EMPTY_SETTINGS_OVERRIDES);
  assert.equal(before.trace.trace.skipped, 0);
  assert.equal(before.trace.trace.strokes.length, 7);
  assert.deepEqual(after.trace.trace.strokes, before.trace.trace.strokes);
  assert.deepEqual(after.metrics, before.metrics);
});

test('面で定義する配列は、二度読んでも増えず、面の中身が違えば別名で足す', () => {
  const bundle = read(FACE_HOLDINGS);
  const first = mergeUserAssets(EMPTY, bundle, STAMP).assets;
  const second = mergeUserAssets(first, bundle, STAMP);
  assert.deepEqual(second.assets, first);
  assert.ok(second.entries.every((entry) => entry.outcome.kind === 'skipped-same'));

  const edited: UserLayout = {
    ...FACE_LAYOUT,
    faces: [{ ...FACE_LAYOUT.faces![0]!, outputs: { a: 'あ', s: 'く', d: 'さ', f: '゛' } }, FACE_LAYOUT.faces![1]!],
  };
  const clash = mergeUserAssets({ ...EMPTY, userLayouts: [edited] }, bundle, STAMP);
  assert.equal(clash.entries.find((entry) => entry.name === '面の配列')?.outcome.kind, 'added-renamed');
  assert.deepEqual(
    clash.assets.userLayouts.map((layout) => layout.name),
    ['面の配列', '自作A', '面の配列 (2)'],
  );
});

test('面で定義する配列の比較: 合成の有無・面の並びのどれが違っても別の中身で、出力のキーの並びは同じ中身', () => {
  const differs = (a: UserLayout, b: UserLayout): boolean =>
    mergeUserAssets({ ...EMPTY, userLayouts: [a] }, { layouts: [b], romajiRules: [], fingerAssignments: [], setups: [] }, STAMP).entries[0]!.outcome
      .kind === 'added-renamed';
  assert.equal(differs(FACE_LAYOUT, { ...FACE_LAYOUT, composition: { dakuten: true, handakuten: true } }), true);
  const reordered: UserLayout = {
    ...FACE_LAYOUT,
    faces: [{ ...FACE_LAYOUT.faces![0]!, outputs: { f: '゛', d: 'さ', s: 'か', a: 'あ' } }, FACE_LAYOUT.faces![1]!],
  };
  assert.equal(differs(FACE_LAYOUT, reordered), false);
  const swapped: UserLayout = { ...FACE_LAYOUT, faces: [FACE_LAYOUT.faces![1]!, FACE_LAYOUT.faces![0]!] };
  assert.equal(differs(FACE_LAYOUT, swapped), true);
});

test('面で定義する配列を含む資産のファイルは、壊れた面の配列だけを捨てて残りを読み、理由を返す', () => {
  const body = userAssetsFileBody(FACE_HOLDINGS);
  const layouts = body.layouts as Record<string, unknown>[];
  const broken = structuredClone(layouts[1]!);
  broken.id = 'user-broken';
  (broken.faces as Record<string, unknown>[])[0]!.outputs = { zz: 'あ' };
  const parsed = parseUserAssetsFile(JSON.stringify({ format: USER_ASSETS_FILE_FORMAT, ...body, layouts: [...layouts, broken] }));
  assert.ok(parsed.ok);
  if (!parsed.ok) return;
  assert.deepEqual(
    parsed.bundle.layouts.map((layout) => layout.id),
    ['user-a', 'user-face'],
  );
  assert.equal(parsed.dropped.length, 1);
  assert.equal(parsed.dropped[0]!.path, 'layouts[2]');
  assert.match(parsed.dropped[0]!.message, /面1の出力のキー「zz」/);
});
