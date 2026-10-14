import assert from 'node:assert/strict';
import test from 'node:test';
import { applyCommand, emptyCommandHistory } from '#input/commands/index.ts';
import { LAYOUT_BY_ID } from '#input/layouts/index.ts';
import { buildUserCatalog } from '#input/layouts/user-catalog.ts';
import type { UserLayoutContent } from '#input/layouts/layout-edit.ts';
import { emptyCascadeOverrides } from '#input/settings/index.ts';
import { PHYSICAL_SHAPES } from '#input/shapes/geometry.ts';
import { emptyTextLibrary } from '#input/text/library.ts';
import { initialTextSelection } from '#input/text/selection.ts';
import { EMPTY_PERSONAL_SPEED } from '#interpretation/timing/calibration-codec.ts';
import { createUserLayoutCommand, updateUserLayoutCommand, type KeydistAssets } from './commands.ts';
import { initialMultiTargetSelection } from './multi-target-selection.ts';
import { generateEngineTrace, interpretEngineTrace } from './pipeline.ts';
import { resolveEngineInput } from './resolved-input.ts';
import { EMPTY_SETTINGS_OVERRIDES } from './settings-items.ts';
import { initialSingleTargetSelection } from './single-target-selection.ts';
import { initialWorkspaceLibrary } from './workspace.ts';

const SHAPES = new Map(Object.values(PHYSICAL_SHAPES).map((shape) => [shape.id, shape] as const));
/** かなだけ。自作の配列は大文字・記号のShift出力を持たないので、記号を含めない。 */
const TEXT = 'こんにちはきょうはしゃしんをとりにいきますじゃがいもをたべました';

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
    workspaceLibrary: initialWorkspaceLibrary(),
    userLayouts: [],
    userRomajiRules: [],
    presetLibrary: { presets: [] },
    personalSpeed: EMPTY_PERSONAL_SPEED,
  } as unknown as KeydistAssets;
}

/** 配列`layoutId`でTEXTを打った時の打鍵と指標。画面と同じ解決の経路を通す。 */
function measure(assets: KeydistAssets, layoutId: string) {
  const user = buildUserCatalog(assets.userLayouts, assets.userRomajiRules);
  const result = resolveEngineInput({
    target: { kind: 'layout', layoutId },
    setups: new Map(),
    catalog: { layouts: new Map([...LAYOUT_BY_ID, ...user.layouts]), shapes: SHAPES },
    userLayouts: user.userLayouts,
    customRomajiRules: user.romajiRules,
    overrides: EMPTY_SETTINGS_OVERRIDES,
    text: TEXT,
    language: 'ja',
  });
  assert.ok(result.ok, result.ok ? '' : JSON.stringify(result.error));
  if (!result.ok) throw new Error('unreachable');
  const trace = generateEngineTrace(result.input);
  assert.equal(trace.trace.skipped, 0);
  const metrics = interpretEngineTrace(trace, result.input).metrics;
  // 組み込みの配列はShift面の層を持ち、かなだけのテキストでは押下が0の行として残る。
  // 自作の配列はShift面を持たないので、その行は比べない
  return { strokes: trace.trace.strokes, metrics: { ...metrics, layers: metrics.layers.filter((layer) => layer.presses > 0) } };
}

/** 組み込みの配列の段の文字を、画面の入力欄の値として写す。 */
function contentOfBuiltin(layoutId: string, name: string, romaji: string): UserLayoutContent {
  const rows = ROWS[layoutId]!;
  return { name, rows, romaji, homeKeys: {} };
}

const ROWS: Record<string, readonly [string, string, string, string]> = {
  qwerty: ['1234567890-=', 'qwertyuiop[]', "asdfghjkl;'", 'zxcvbnm,./'],
  dvorak: ['1234567890[]', "',.pyfgcrl/=", 'aoeuidhtns-', ';qjkxbmwvz'],
  colemak: ['1234567890-=', 'qwfpgjluy;[]', "arstdhneio'", 'zxcvbkm,./'],
  oonishi: ['1234567890', 'qlu,.fwryp', 'eiao-ktnsh', 'zxcv;gdmjb'],
};

/** 組み込みの規則。大西配列は公式の綴りで打つ組み込みと揃えるため、規則も大西式にする。 */
const ROMAJI_OF: Record<string, string> = { qwerty: 'kunrei', dvorak: 'kunrei', colemak: 'kunrei', oonishi: 'oonishi' };

for (const layoutId of Object.keys(ROWS)) {
  test(`画面と同じ経路（コマンド）で保存した配列は、同じ定義の組み込み配列「${layoutId}」と同じ打鍵・同じ指標になる`, () => {
    const created = applyCommand(
      emptyAssets(),
      emptyCommandHistory<KeydistAssets>(),
      createUserLayoutCommand(() => 'user-edited', contentOfBuiltin(layoutId, '私の配列', ROMAJI_OF[layoutId]!)),
    );
    assert.equal(created.outcome.kind, 'applied');

    const builtin = measure(emptyAssets(), layoutId);
    const user = measure(created.assets, 'user-edited');
    assert.ok(user.strokes.length > 0);
    assert.deepEqual(user.strokes, builtin.strokes);
    assert.deepEqual(user.metrics, builtin.metrics);
  });
}

test('保存した配列を編集して段の文字を変えると、数値も変わる（比較が空振りしていない）', () => {
  const created = applyCommand(
    emptyAssets(),
    emptyCommandHistory<KeydistAssets>(),
    createUserLayoutCommand(() => 'user-edited', contentOfBuiltin('qwerty', '私の配列', 'kunrei')),
  );
  const edited = applyCommand(
    created.assets,
    created.history,
    updateUserLayoutCommand('user-edited', contentOfBuiltin('dvorak', '私の配列', 'kunrei')),
  );
  assert.equal(edited.outcome.kind, 'applied');
  const before = measure(created.assets, 'user-edited');
  const after = measure(edited.assets, 'user-edited');
  assert.notDeepEqual(before.strokes, after.strokes);
  assert.notDeepEqual(before.metrics, after.metrics);
  // 編集後は、同じ定義の組み込み配列と一致する
  assert.deepEqual(after, measure(emptyAssets(), 'dvorak'));
});

test('ホームキーを指定した配列は、指定しない配列と指標が変わる（ホームキーが計算に届く）', () => {
  const plain = applyCommand(
    emptyAssets(),
    emptyCommandHistory<KeydistAssets>(),
    createUserLayoutCommand(() => 'user-plain', contentOfBuiltin('qwerty', '素', 'kunrei')),
  );
  const withHome = applyCommand(
    plain.assets,
    plain.history,
    updateUserLayoutCommand('user-plain', { ...contentOfBuiltin('qwerty', '素', 'kunrei'), homeKeys: { LI: 'g', RI: 'h' } }),
  );
  assert.deepEqual(withHome.assets.userLayouts[0]!.homeKeys, { LI: 'g', RI: 'h' });
  assert.notDeepEqual(measure(withHome.assets, 'user-plain').metrics, measure(plain.assets, 'user-plain').metrics);
});
