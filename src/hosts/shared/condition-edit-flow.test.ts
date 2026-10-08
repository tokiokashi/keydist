import assert from 'node:assert/strict';
import test from 'node:test';
import { initialWorkspaceLibrary } from '#engine/workspace.ts';
import { applyCommand, emptyCommandHistory, redo, undo, type Command, type CommandHistory } from '#input/commands/index.ts';
import { emptyCascadeOverrides } from '#input/settings/index.ts';
import { LAYOUT_BY_ID } from '#input/layouts/index.ts';
import { PHYSICAL_SHAPES, type PhysicalShape } from '#input/shapes/geometry.ts';
import type { SetupLibrary } from '#input/setup/index.ts';
import { DEFAULT_ACTION_REALIZATION_POLICY } from '#input/semantics/index.ts';
import { emptyTextLibrary } from '#input/text/library.ts';
import { initialTextSelection } from '#input/text/selection.ts';
import type { KeydistAssets } from '#engine/commands.ts';
import { initialMultiTargetSelection } from '#engine/multi-target-selection.ts';
import { initialSingleTargetSelection } from '#engine/single-target-selection.ts';
import { resolveEngineInput } from '#engine/resolved-input.ts';
import type { SettingsItemId, SettingsValueMap } from '#engine/settings-items.ts';
import {
  canPromoteLayoutValue,
  defaultShapeChipNotice,
  defaultShapeCommand,
  overrideWinsNotices,
  promoteToGlobalCommand,
  resetAllPlan,
  setGlobalCommand,
  setLayoutCommand,
  staticDefaultOf,
  withActionCountMode,
  withClassGrouping,
} from './condition-edit.ts';
import { conditionSummaryLine, traceConditionSummary, type ConditionSummaryRow } from './condition-summary.ts';

/**
 * 条件のモーダルの状態遷移を、画面と同じ経路（書き込みコマンド → 資産 → カスケードの解決 → 要約の行・理由）で確かめる。
 * ブラウザで同じ遷移を網羅していたe2eの代わり（値の組合せ・レベルの優先順・「全体へ移す」を出す条件）。
 * 画面とstoreがつながっていること自体は、e2eの1本（`standalone-bigram-flow.spec.ts`）が確かめる。
 */

const CATALOG = {
  layouts: LAYOUT_BY_ID,
  shapes: new Map<string, PhysicalShape>(Object.values(PHYSICAL_SHAPES).map((shape) => [shape.id, shape])),
};

interface Session {
  assets: KeydistAssets;
  history: CommandHistory<KeydistAssets>;
}

function newSession(): Session {
  const setupLibrary: SetupLibrary<SettingsValueMap> = { setups: [], overrides: emptyCascadeOverrides() };
  return {
    assets: {
      setupLibrary,
      fingerAssignments: [],
      textLibrary: emptyTextLibrary(),
      standaloneTextSelection: initialTextSelection(),
      standaloneAnalyzerOptions: {},
      multiTargetSelection: initialMultiTargetSelection(),
      singleTargetSelection: initialSingleTargetSelection(),
      workspaces: initialWorkspaceLibrary(),
      presetLibrary: { presets: [] },
      userLayouts: [],
      userRomajiRules: [],
    },
    history: emptyCommandHistory<KeydistAssets>(),
  };
}

function dispatch(session: Session, command: Command<KeydistAssets>): void {
  const step = applyCommand(session.assets, session.history, command);
  session.assets = step.assets;
  session.history = step.history;
}

function undoOnce(session: Session): void {
  const step = undo(session.assets, session.history);
  session.assets = step.assets;
  session.history = step.history;
}

function redoOnce(session: Session): void {
  const step = redo(session.assets, session.history);
  session.assets = step.assets;
  session.history = step.history;
}

/** 単体ページが配列を対象にした時の、今の資産から見える画面（要約の行・理由・図の物理配列）。 */
function viewOf(session: Session, layoutId: string) {
  const result = resolveEngineInput({
    target: { kind: 'layout', layoutId },
    setups: new Map(),
    catalog: CATALOG,
    userLayouts: new Map(),
    overrides: session.assets.setupLibrary.overrides,
    text: 'あいうえお',
    language: 'ja',
  });
  assert.ok(result.ok);
  if (!result.ok) throw new Error('unreachable');
  const names = { shapes: CATALOG.shapes, layouts: new Map([[layoutId, { name: LAYOUT_BY_ID.get(layoutId)?.name ?? layoutId }]]) };
  const rows = traceConditionSummary(result.input.cascade, names);
  const rowOf = (id: SettingsItemId): ConditionSummaryRow => rows.find((row) => row.id === id)!;
  const line = conditionSummaryLine(rows);
  return {
    geometryId: result.input.geometry.id,
    rowOf,
    notices: overrideWinsNotices(rows, names),
    /** 閉じた1行の文字（「すべて既定値」か、変えた項目の先頭2件）。 */
    triggerText: line.changedCount === 0
      ? 'すべて既定値'
      : line.shown.map((row) => `${row.label}: ${row.displayValue}`).join(' · '),
    /** メニューに「全体へ移す」を出すか（配列の値を編集している行）。 */
    canPromote: (id: 'windowSize' | 'romajiRuleId') => canPromoteLayoutValue(
      session.assets.setupLibrary.overrides.layout?.[layoutId]?.[id],
      rowOf(id).promotedBase,
    ),
  };
}

const windowDefault = staticDefaultOf('windowSize');

test('全体の値を変えると要約と出どころに出て、元に戻す/やり直す/既定値と同じ値の書き込みで往復する', () => {
  const session = newSession();
  assert.equal(viewOf(session, 'qwerty').triggerText, 'すべて既定値');
  assert.equal(viewOf(session, 'qwerty').rowOf('windowSize').originLabel, '既定値');

  dispatch(session, setGlobalCommand('windowSize', windowDefault + 1, windowDefault));
  const changed = viewOf(session, 'qwerty');
  assert.equal(changed.rowOf('windowSize').displayValue, String(windowDefault + 1));
  assert.equal(changed.rowOf('windowSize').originLabel, '上書き: 全体');
  assert.equal(changed.triggerText, `先読みN: ${windowDefault + 1}`);

  undoOnce(session);
  assert.equal(viewOf(session, 'qwerty').triggerText, 'すべて既定値');
  redoOnce(session);
  assert.equal(viewOf(session, 'qwerty').triggerText, `先読みN: ${windowDefault + 1}`);

  dispatch(session, setGlobalCommand('windowSize', windowDefault, windowDefault));
  assert.equal(viewOf(session, 'qwerty').triggerText, 'すべて既定値');
});

test('すべて既定値に戻す（全体）: 押せるのは上書きがある時だけで、全体の上書きをまとめて消し、元に戻す1回で戻る', () => {
  const session = newSession();
  const plan = () => resetAllPlan(session.assets.setupLibrary.overrides, [], undefined, undefined);
  assert.equal(plan().disabled, true);
  dispatch(session, setGlobalCommand('windowSize', windowDefault + 1, windowDefault));
  dispatch(session, setGlobalCommand('sfbHomeCost', false, staticDefaultOf('sfbHomeCost')));
  assert.equal(plan().disabled, false);
  const both = `先読みN: ${windowDefault + 1} · 同指連続のホーム復帰距離: OFF`;
  assert.equal(viewOf(session, 'qwerty').triggerText, both);

  dispatch(session, plan().command);
  assert.equal(plan().disabled, true);
  assert.equal(viewOf(session, 'qwerty').triggerText, 'すべて既定値');
  undoOnce(session);
  assert.equal(viewOf(session, 'qwerty').triggerText, both);
});

test('既定の物理配列: 全体へ書くと図の物理配列に出る。既定と同じ値を選び直すと上書きを消す', () => {
  const session = newSession();
  assert.equal(viewOf(session, 'qwerty').geometryId, 'row-staggered');
  for (const id of ['split-ortholinear', 'jis-split-ortholinear']) {
    dispatch(session, defaultShapeCommand(id));
    assert.equal(viewOf(session, 'qwerty').geometryId, id);
    assert.equal(viewOf(session, 'qwerty').rowOf('defaultShapeId').originLabel, '上書き: 全体');
  }
  dispatch(session, defaultShapeCommand('row-staggered'));
  assert.equal(viewOf(session, 'qwerty').rowOf('defaultShapeId').originLabel, '既定値');
  // 既定の物理配列は物理配列名として別に出すので、閉じた1行には数えない
  assert.equal(viewOf(session, 'qwerty').triggerText, 'すべて既定値');
});

test('動作数の扱い: 2動作にすると要約に出て、例外を足すと「例外あり」が付く。1動作へ戻すと例外ごと消えて既定へ戻る', () => {
  const session = newSession();
  const policyOf = () => session.assets.setupLibrary.overrides.global?.actionRealizationPolicy ?? DEFAULT_ACTION_REALIZATION_POLICY;
  const write = (next: typeof DEFAULT_ACTION_REALIZATION_POLICY) =>
    dispatch(session, setGlobalCommand('actionRealizationPolicy', next, DEFAULT_ACTION_REALIZATION_POLICY));

  write(withActionCountMode(policyOf(), 'separate'));
  assert.equal(viewOf(session, 'qwerty').triggerText, '動作数の扱い: Shift→A で2動作');
  write(withClassGrouping(policyOf(), 'order-free', 'separate'));
  assert.equal(viewOf(session, 'qwerty').triggerText, '動作数の扱い: Shift→A で2動作（例外あり）');
  write(withActionCountMode(policyOf(), 'combined'));
  assert.equal(viewOf(session, 'qwerty').triggerText, 'すべて既定値');
  assert.equal(session.assets.setupLibrary.overrides.global?.actionRealizationPolicy, undefined);
});

test('下のレベルが勝つ行: 配列の上書きがあれば、全体を変えても変わらない理由を出す（QWERTYでも大西配列でも）', () => {
  for (const [layoutId, name] of [['oonishi', '大西配列'], ['qwerty', 'QWERTY']] as const) {
    const session = newSession();
    dispatch(session, setLayoutCommand(layoutId, 'windowSize', 2, windowDefault));
    const view = viewOf(session, layoutId);
    assert.equal(view.rowOf('windowSize').originLabel, `上書き: 配列「${name}」`, layoutId);
    assert.match(view.notices.get('windowSize')!, new RegExp(`^配列「${name}」の値が優先されるため、全体を変えてもこの画面は変わらない`), layoutId);
    // 編集はできるまま: 全体へ書いても、値は配列のまま
    dispatch(session, setGlobalCommand('windowSize', windowDefault + 1, windowDefault));
    assert.equal(viewOf(session, layoutId).rowOf('windowSize').displayValue, '2', layoutId);
  }
});

test('全体のローマ字規則: 推奨の無い配列（QWERTY）は従って要約に出る。推奨を持つ配列（大西配列）は推奨のままで理由を出す', () => {
  const session = newSession();
  dispatch(session, setGlobalCommand('romajiRuleId', 'azik', staticDefaultOf('romajiRuleId')));

  const qwerty = viewOf(session, 'qwerty');
  assert.equal(qwerty.rowOf('romajiRuleId').originLabel, '上書き: 全体');
  assert.equal(qwerty.notices.has('romajiRuleId'), false);
  assert.match(qwerty.triggerText, /^ローマ字規則: AZIK/);

  const oonishi = viewOf(session, 'oonishi');
  assert.match(oonishi.notices.get('romajiRuleId')!, /^この配列の推奨（大西式/);
  // 効いている値は推奨（大西式）のままなので、変えた項目には数えない
  assert.equal(oonishi.triggerText, 'すべて既定値');
});

test('ローマ字規則の理由: 大西配列は全体未設定でも推奨の理由が出る。TK音直入力法は全体が訓令式の間は出ない', () => {
  const session = newSession();
  const oonishi = viewOf(session, 'oonishi');
  assert.equal(oonishi.rowOf('romajiRuleId').originLabel, '既定値');
  assert.match(oonishi.notices.get('romajiRuleId')!, /^この配列の推奨（大西式/);
  assert.equal(viewOf(session, 'oonishi-custom').notices.has('romajiRuleId'), false);
});

test('この配列だけ別にする: 配列のレベルへ書き、全体は既定のまま。全体へ移すと全体の値になり、配列の値を消すと継承へ戻る', () => {
  const session = newSession();
  const base = windowDefault;
  dispatch(session, setLayoutCommand('qwerty', 'windowSize', base + 1, base));
  const own = viewOf(session, 'qwerty');
  assert.equal(own.rowOf('windowSize').displayValue, String(base + 1));
  assert.equal(own.rowOf('windowSize').originLabel, '上書き: 配列「QWERTY」');
  // 継承する値（モーダルが「全体の値へ戻す」で戻す先）も、画面側と同じ経路で読める
  assert.equal(own.rowOf('windowSize').layoutBase, base);
  // 配列のレベルだけに書く。全体の値は既定のまま（「全体を編集」に切り替えた時に読む値）
  assert.equal(session.assets.setupLibrary.overrides.global?.windowSize, undefined);
  assert.match(own.notices.get('windowSize')!, /^配列「QWERTY」の値が優先されるため/);
  assert.equal(own.canPromote('windowSize'), true);

  dispatch(session, promoteToGlobalCommand('qwerty', 'windowSize', base));
  const promoted = viewOf(session, 'qwerty');
  assert.equal(promoted.rowOf('windowSize').displayValue, String(base + 1));
  assert.equal(promoted.rowOf('windowSize').originLabel, '上書き: 全体');
  assert.equal(promoted.notices.has('windowSize'), false);

  // 配列だけ別にしてから、配列の値を継承する値（全体の値）へ戻す
  dispatch(session, setLayoutCommand('qwerty', 'windowSize', base + 2, base + 1));
  assert.equal(viewOf(session, 'qwerty').rowOf('windowSize').displayValue, String(base + 2));
  dispatch(session, setLayoutCommand('qwerty', 'windowSize', base + 1, base + 1));
  const back = viewOf(session, 'qwerty');
  assert.equal(back.rowOf('windowSize').displayValue, String(base + 1));
  assert.equal(back.rowOf('windowSize').originLabel, '上書き: 全体');
});

test('すべて既定値に戻す（配列）: 配列の上書きだけがある時も押せて、今の配列を消し、元に戻す1回で戻る', () => {
  const session = newSession();
  const plan = () => resetAllPlan(session.assets.setupLibrary.overrides, [], 'qwerty', undefined);
  assert.equal(plan().disabled, true);
  dispatch(session, setLayoutCommand('qwerty', 'windowSize', windowDefault + 1, windowDefault));
  assert.equal(plan().disabled, false);
  dispatch(session, plan().command);
  assert.equal(plan().disabled, true);
  const reset = viewOf(session, 'qwerty');
  assert.equal(reset.rowOf('windowSize').displayValue, String(windowDefault));
  assert.equal(reset.rowOf('windowSize').originLabel, '既定値');
  assert.equal(reset.triggerText, 'すべて既定値');
  undoOnce(session);
  assert.equal(viewOf(session, 'qwerty').triggerText, `先読みN: ${windowDefault + 1}`);
});

test('推奨を持つ配列のローマ字規則: 配列だけ別にでき、推奨が勝つ行では「全体へ移す」を出さない。推奨へ戻すと上書きが消える', () => {
  const session = newSession();
  dispatch(session, setLayoutCommand('oonishi', 'romajiRuleId', 'azik', 'oonishi'));
  const own = viewOf(session, 'oonishi');
  assert.equal(own.rowOf('romajiRuleId').originLabel, '上書き: 配列「大西配列」');
  assert.match(own.triggerText, /^ローマ字規則: AZIK/);
  // 全体へ移すと画面の値が推奨へ戻って移した値が消えるので、移す導線を出さない
  assert.equal(own.canPromote('romajiRuleId'), false);
  assert.equal(own.rowOf('romajiRuleId').hasLayoutRecommendation, true);

  dispatch(session, setLayoutCommand('oonishi', 'romajiRuleId', 'oonishi', 'oonishi'));
  const back = viewOf(session, 'oonishi');
  assert.equal(back.rowOf('romajiRuleId').originLabel, '既定値');
  assert.equal(back.triggerText, 'すべて既定値');
});

test('canPromoteLayoutValue: 移した後の継承値が今の値と同じ時だけ出す。配列の値か継承値が無ければ出さない', () => {
  assert.equal(canPromoteLayoutValue(5, 5), true);
  assert.equal(canPromoteLayoutValue({ a: 1 }, { a: 1 }), true);
  assert.equal(canPromoteLayoutValue(5, 3), false);
  assert.equal(canPromoteLayoutValue(undefined, 3), false);
  assert.equal(canPromoteLayoutValue(5, undefined), false);
});

test('既定の物理配列を配列だけ別にする: その配列だけ物理配列が変わり、文脈バーのチップは全体へ書いて、配列の値が勝つ理由を添える', () => {
  const session = newSession();
  dispatch(session, setLayoutCommand('qwerty', 'defaultShapeId', 'ortholinear', 'row-staggered'));
  const own = viewOf(session, 'qwerty');
  assert.equal(own.geometryId, 'ortholinear');
  assert.equal(own.rowOf('defaultShapeId').originLabel, '上書き: 配列「QWERTY」');
  assert.match(own.notices.get('defaultShapeId')!, /^配列「QWERTY」の値が優先されるため/);
  assert.equal(session.assets.setupLibrary.overrides.global?.defaultShapeId, undefined);

  const names = new Map([['qwerty', { name: 'QWERTY' }]]);
  assert.equal(
    defaultShapeChipNotice(session.assets.setupLibrary.overrides, ['qwerty'], names),
    '配列「QWERTY」は物理配列を別に決めているため、ここで変えても変わらない',
  );
  // チップで全体を変えても、配列の値が勝つので図の物理配列は変わらない
  dispatch(session, defaultShapeCommand('column-staggered'));
  assert.equal(viewOf(session, 'qwerty').geometryId, 'ortholinear');
  assert.equal(session.assets.setupLibrary.overrides.global?.defaultShapeId, 'column-staggered');
  // 別の配列は全体の値に従う
  assert.equal(viewOf(session, 'dvorak').geometryId, 'column-staggered');
});

test('配列の既定の物理配列: 全体へ移すと全体の値になり理由が消える。配列の値を消すと全体の値へ戻る', () => {
  const session = newSession();
  dispatch(session, setLayoutCommand('qwerty', 'defaultShapeId', 'ortholinear', 'row-staggered'));
  dispatch(session, promoteToGlobalCommand('qwerty', 'defaultShapeId', staticDefaultOf('defaultShapeId')));
  const promoted = viewOf(session, 'qwerty');
  assert.equal(promoted.rowOf('defaultShapeId').originLabel, '上書き: 全体');
  assert.equal(session.assets.setupLibrary.overrides.global?.defaultShapeId, 'ortholinear');
  assert.equal(defaultShapeChipNotice(session.assets.setupLibrary.overrides, ['qwerty']), undefined);

  // 配列だけ別にしてから、全体の値へ戻す
  dispatch(session, setLayoutCommand('qwerty', 'defaultShapeId', 'column-staggered', 'ortholinear'));
  assert.equal(viewOf(session, 'qwerty').geometryId, 'column-staggered');
  dispatch(session, setLayoutCommand('qwerty', 'defaultShapeId', 'ortholinear', 'ortholinear'));
  assert.equal(viewOf(session, 'qwerty').geometryId, 'ortholinear');
  assert.equal(viewOf(session, 'qwerty').rowOf('defaultShapeId').originLabel, '上書き: 全体');
});
