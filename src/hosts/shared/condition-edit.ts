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
  resetCascadeItemCommand,
  resetCascadeItemsCommand,
  setCascadeOverrideCommand,
  type KeydistAssets,
} from '#engine/commands.ts';
import {
  SETTINGS_ITEMS,
  type SettingsCascadeOverrides,
  type SettingsItemId,
  type SettingsValueMap,
} from '#engine/settings-items.ts';
import { conditionLevelLabel, isChangedConditionRow, type ConditionSummaryRow, type ConditionValueNames } from './condition-summary.ts';

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

/** 全体のレベルの上書きを、モーダルに行がある項目だけまとめて消す（行の無い項目は消さない）。 */
export function resetAllGlobalCommand(ids: readonly GlobalEditableId[]): Command<KeydistAssets> {
  return resetCascadeItemsCommand(GLOBAL_LEVEL, ids);
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
      notices.set(row.id, 'この配列の推奨が優先されるため、全体を変えてもこの画面は変わらない');
      continue;
    }
    if (!isChangedConditionRow(row)) continue;
    if (row.origin.kind === 'default' || row.origin.kind === 'global') continue;
    notices.set(row.id, `${conditionLevelLabel(row.origin, names)}の値が優先されるため、全体を変えてもこの画面は変わらない`);
  }
  return notices;
}
