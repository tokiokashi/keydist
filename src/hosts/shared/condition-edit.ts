import type { Command } from '#input/commands/index.ts';
import { readOverride, type CascadeLevel } from '#input/settings/index.ts';
import {
  DEFAULT_ACTION_REALIZATION_POLICY,
  DEFAULT_TRIGGER_ACTIVATION_GROUPINGS,
  type ActionRealizationPolicy,
  type TriggerActivationClass,
  type TriggerActivationGrouping,
} from '#input/semantics/index.ts';
import {
  promoteCascadeOverrideCommand,
  resetCascadeItemCommand,
  resetCascadeItemsAtLevelsCommand,
  setCascadeOverrideCommand,
  type KeydistAssets,
} from '#engine/commands.ts';
import {
  SETTINGS_ITEMS,
  type SettingsCascadeOverrides,
  type SettingsItemId,
  type SettingsValueMap,
} from '#engine/settings-items.ts';
import { conditionLevelLabel, type ConditionSummaryRow, type ConditionValueNames } from './condition-summary.ts';

/**
 * 条件のモーダルが全体のレベルへ書き込む時の、純粋な部分（読み出し・書き込みコマンドの選び方・
 * 「動作数の扱い」の値の写像・理由の文）。描画は`ConditionEditor.tsx`が持つ。
 * 書き込みは必ずコマンドを通す（#544 §8-2）ので、文脈バーの元に戻す／やり直すがそのまま効く。
 */

export const GLOBAL_LEVEL: CascadeLevel = { kind: 'global' };

/** 全体のレベルから編集できる項目（モーダルの行）。配列・打ち方のレベルだけに置ける項目は含まない。 */
export type GlobalEditableId = Extract<
  SettingsItemId,
  | 'windowSize'
  | 'sfbHomeCost'
  | 'preferOppositeThumb'
  | 'triggerRealizationPolicy'
  | 'actionRealizationPolicy'
  | 'defaultShapeId'
  | 'fingerAssignmentId'
  | 'romajiRuleId'
  | 'chainInterpretation'
  | 'arpeggioInterpretation'
>;

/** モーダルに行がある項目。「すべて既定値に戻す」はこの項目の全体の上書きだけを消す。 */
export const GLOBAL_EDITABLE_IDS: readonly GlobalEditableId[] = [
  'windowSize',
  'sfbHomeCost',
  'preferOppositeThumb',
  'triggerRealizationPolicy',
  'actionRealizationPolicy',
  'defaultShapeId',
  'fingerAssignmentId',
  'romajiRuleId',
  'chainInterpretation',
  'arpeggioInterpretation',
];

/** 行を出している項目（`hiddenIds`を除く）のうち、全体の上書きがあるもの。 */
export function resettableGlobalIds(
  overrides: SettingsCascadeOverrides,
  hiddenIds: readonly SettingsItemId[] = [],
): readonly GlobalEditableId[] {
  return GLOBAL_EDITABLE_IDS.filter((id) => !hiddenIds.includes(id) && globalOverrideOf(overrides, id) !== undefined);
}

/** 行を出している項目のうち、今の配列のレベルに上書きがあるもの。 */
export function resettableLayoutIds(
  overrides: SettingsCascadeOverrides,
  layoutId: string,
  hiddenIds: readonly SettingsItemId[] = [],
): readonly GlobalEditableId[] {
  return GLOBAL_EDITABLE_IDS.filter((id) =>
    !hiddenIds.includes(id) && canEditAtLayout(id) && layoutOverrideOf(overrides, layoutId, id) !== undefined);
}

/**
 * 「すべて既定値に戻す」。全体の上書きと、今の配列の上書き（配列を対象にしている時）を、1コマンドで消す
 * （元に戻すの1回で全部戻る）。行の無い項目と、他の配列・Setupの上書きは消さない。
 */
export function resetAllCommand(
  globalIds: readonly GlobalEditableId[],
  layout?: { readonly layoutId: string; readonly ids: readonly GlobalEditableId[] },
): Command<KeydistAssets> {
  return resetCascadeItemsAtLevelsCommand([
    { level: GLOBAL_LEVEL, itemIds: globalIds },
    ...(layout === undefined ? [] : [{ level: layoutLevel(layout.layoutId), itemIds: layout.ids }]),
  ]);
}

/** 全体のレベルの上書き。無ければ`undefined`（既定値のまま）。 */
export function globalOverrideOf<K extends GlobalEditableId>(
  overrides: SettingsCascadeOverrides,
  id: K,
): SettingsValueMap[K] | undefined {
  return readOverride(overrides, GLOBAL_LEVEL, id);
}

/**
 * 全体のレベルに書く。既定値と同じ値を書く時は上書きを消す（出どころを「既定値」へ戻す）。
 * 同じ値を上書きとして残すと、実質は既定なのに「全体で変更」と出てしまうため。
 */
export function setGlobalCommand<K extends GlobalEditableId>(
  id: K,
  next: SettingsValueMap[K],
  defaultValue: SettingsValueMap[K],
): Command<KeydistAssets> {
  return JSON.stringify(next) === JSON.stringify(defaultValue)
    ? resetCascadeItemCommand(GLOBAL_LEVEL, id)
    : setCascadeOverrideCommand(GLOBAL_LEVEL, id, next);
}

/** 配列のレベルを指す。「この配列だけ別に」の書き込み先。 */
export function layoutLevel(layoutId: string): CascadeLevel {
  return { kind: 'layout', layoutId };
}

/** 配列のレベルへ書ける項目。`allowedLevels`から引くので、項目の定義を変えれば行の導線も追従する。 */
export function canEditAtLayout(id: SettingsItemId): boolean {
  return SETTINGS_ITEMS[id].allowedLevels.has('layout');
}

/** 配列のレベルの上書き。無ければ`undefined`（全体などの値を継承している）。 */
export function layoutOverrideOf<K extends SettingsItemId>(
  overrides: SettingsCascadeOverrides,
  layoutId: string,
  id: K,
): SettingsValueMap[K] | undefined {
  return readOverride(overrides, layoutLevel(layoutId), id);
}

/**
 * 配列のレベルに書く。配列のレベルの手前までの値（`inherited`。全体・配列の推奨など）と同じ値を書く時は
 * 上書きを消す。同じ値を残すと、継承しているだけなのに「配列で変更」と出てしまうため。
 * 推奨を持つ配列は、推奨と違う値を選べば書き、推奨と同じ値へ戻せば消える（どちらも継承と一致する）。
 */
export function setLayoutCommand<K extends SettingsItemId>(
  layoutId: string,
  id: K,
  next: SettingsValueMap[K],
  inherited: SettingsValueMap[K],
): Command<KeydistAssets> {
  return JSON.stringify(next) === JSON.stringify(inherited)
    ? resetCascadeItemCommand(layoutLevel(layoutId), id)
    : setCascadeOverrideCommand(layoutLevel(layoutId), id, next);
}

/**
 * 配列のレベルの値を全体へ移す（昇格）。全体へ書き、配列の上書きは消す。1コマンドなので元に戻すの1回で戻る。
 * 全体へ書く値が既定値と同じなら、全体の上書きは消す（`setGlobalCommand`と同じ理由）。
 */
export function promoteToGlobalCommand<K extends GlobalEditableId>(
  layoutId: string,
  id: K,
  defaultValue: SettingsValueMap[K],
): Command<KeydistAssets> {
  return promoteCascadeOverrideCommand(layoutLevel(layoutId), GLOBAL_LEVEL, id, defaultValue);
}

/**
 * 文脈バーの既定の物理配列のチップが書く命令。条件のモーダルと同じ書き込み（`setGlobalCommand`）にして、
 * 既定と同じ物理配列を選び直した時に全体の上書きを消す（2か所で状態が食い違わないように）。
 */
export function defaultShapeCommand(next: string): Command<KeydistAssets> {
  return setGlobalCommand('defaultShapeId', next, staticDefaultOf('defaultShapeId'));
}

/** 既定値が文脈に依らない項目の既定値。 */
export function staticDefaultOf<K extends Exclude<GlobalEditableId, 'fingerAssignmentId'>>(id: K): SettingsValueMap[K] {
  return SETTINGS_ITEMS[id].defaultValue as SettingsValueMap[K];
}

/** 「動作数の扱い」。値の語はオーナー決定（`ACTION_COUNT_TEXT`）。 */
export type ActionCountMode = 'combined' | 'separate';

export function actionCountModeOf(policy: ActionRealizationPolicy): ActionCountMode {
  return policy.triggerActivation === 'semantic' ? 'separate' : 'combined';
}

/**
 * 1動作へ戻す時は例外ごと既定へ戻す。例外はShift→Aを2動作にする時だけ読まれる
 * （`input/semantics/action-realization.ts`）ので、残すと効かない例外で「変更あり」に見えてしまう。
 */
export function withActionCountMode(policy: ActionRealizationPolicy, mode: ActionCountMode): ActionRealizationPolicy {
  if (mode === 'combined') return DEFAULT_ACTION_REALIZATION_POLICY;
  return { ...policy, triggerActivation: 'semantic' };
}

/** 全体のレベルで例外に出す、キーの種類。キーの組ごと・物理キーごとは配列を選んだ時だけ意味を持つので出さない。 */
export const ACTION_EXCEPTION_CLASSES: readonly { readonly key: TriggerActivationClass; readonly label: string }[] = [
  { key: 'prepress-required', label: '先に押しておくキー（Shift・レイヤーキーなど）' },
  { key: 'order-free', label: '押す順を問わないキー（同時押し）' },
];

/** 'combined' = 文字と1動作、'separate' = 別の動作（2動作）。 */
export function classGroupingOf(policy: ActionRealizationPolicy, key: TriggerActivationClass): TriggerActivationGrouping {
  return policy.triggerActivationClassOverrides?.[key] ?? DEFAULT_TRIGGER_ACTIVATION_GROUPINGS[key];
}

/** 既定と同じ値は例外として持たない（「例外あり」の表示が、実質の違いだけを指すように）。 */
export function withClassGrouping(
  policy: ActionRealizationPolicy,
  key: TriggerActivationClass,
  grouping: TriggerActivationGrouping,
): ActionRealizationPolicy {
  const rest = { ...(policy.triggerActivationClassOverrides ?? {}) };
  delete rest[key];
  const classOverrides = grouping === DEFAULT_TRIGGER_ACTIVATION_GROUPINGS[key] ? rest : { ...rest, [key]: grouping };
  return { ...policy, triggerActivationClassOverrides: classOverrides };
}

/**
 * 全体を変えても下のレベルの値・配列の推奨が勝って画面が変わらない行の理由。モーダルの行は編集できるまま、
 * 行の下に文を添える。配列を問わず出す（オーナー決定 #655）。
 * 勝つものが無い行（効いている値が全体か既定値）は理由が要らない。
 */
export function overrideWinsNotices(
  rows: readonly ConditionSummaryRow[],
  names?: ConditionValueNames,
): ReadonlyMap<SettingsItemId, string> {
  const notices = new Map<SettingsItemId, string>();
  for (const row of rows) {
    // 配列の推奨が勝つ行は、推奨が実効値なので「変えた行」ではない（出どころは既定値のまま）。
    if (row.recommendationWinsOverGlobal) {
      notices.set(row.id, `この配列の推奨（${row.displayValue}）が優先されるため、全体を変えてもこの画面は変わらない`);
      continue;
    }
    // 効かない行は理由が要らない。出どころが下のレベルなら、値が既定と同じ（「動作数の扱い」の1動作など）でも
    // 全体の値には勝つので、変えた行かどうかでは絞らない。
    if (!row.applicable) continue;
    if (row.origin.kind === 'default' || row.origin.kind === 'global') continue;
    notices.set(row.id, `${conditionLevelLabel(row.origin, names)}の値が優先されるため、全体を変えてもこの画面は変わらない`);
  }
  return notices;
}
