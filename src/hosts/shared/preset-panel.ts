import { applyPresetValues, type PresetLibrary } from '#input/presets/index.ts';
import { levelOverrides, type CascadeLevel } from '#input/settings/index.ts';
import { SETTINGS_ITEMS, type SettingsCascadeOverrides, type SettingsValueMap } from '#engine/settings-items.ts';
import { GLOBAL_LEVEL } from './condition-edit.ts';
import { conditionItemLabel } from './condition-summary.ts';

/**
 * 条件のモーダルのプリセットの節の、表示の計算（描画は`PresetSection.tsx`）。
 * 流し込み・保存の先のレベルは引数で受ける（既定は全体。Workspaceのペインはそのレベルを渡す）。
 *
 * 流し込みは対象レベルの上書きを丸ごと置き換えるので、モーダルに行の無い項目（再生速度の平均など）の
 * 上書きも消える。今の画面はそれらを書き込まないので害は無いが、行を足す時は
 * この置き換えの範囲を思い出すこと。
 */

export interface PresetRowView {
  readonly id: string;
  readonly name: string;
  /** 流し込んでも全体の値が変わらない（＝今の値と同じ）。 */
  readonly sameAsCurrent: boolean;
}

/**
 * 項目の、そのレベルで解決した値（Workspaceは全体を継承する。上書きが無ければ既定値）。
 * 既定値が文脈で決まる項目（指の割当）は既定値を知れないので、上書きが無い時は`undefined`にする。
 */
function resolvedLevelValue(overrides: SettingsCascadeOverrides, level: CascadeLevel, itemId: string): unknown {
  const own = levelOverrides(overrides, level) as Record<string, unknown> | undefined;
  if (own !== undefined && Object.hasOwn(own, itemId)) return own[itemId];
  if (level.kind === 'workspace') {
    const global = levelOverrides(overrides, GLOBAL_LEVEL) as Record<string, unknown> | undefined;
    if (global !== undefined && Object.hasOwn(global, itemId)) return global[itemId];
  }
  const item = (SETTINGS_ITEMS as Record<string, { readonly defaultValue: unknown }>)[itemId];
  return typeof item?.defaultValue === 'function' ? undefined : item?.defaultValue;
}

/** 流し込んでも値が変わらず、入れられなかった項目も無い（入れなかった項目があれば、今の値とは言えない）。 */
function sameAfterApply(overrides: SettingsCascadeOverrides, level: CascadeLevel, values: PresetLibrary<SettingsValueMap>['presets'][number]['values']): boolean {
  const applied = applyPresetValues(SETTINGS_ITEMS, overrides, level, values);
  return applied.skipped.length === 0 && changedGlobalItemCount(overrides, applied.overrides, level) === 0;
}

/**
 * 一覧の行。「今の値と同じ」は、流し込んだ後に解決した値が変わらないかで決める。
 * 上書きの有無で比べると、Workspaceでは全体の値と同じ値を上書きとして持つ・持たないの違いで
 * 「同じ」と「流し込むと変わる」が食い違うため。流し込みの計算（`applyPresetValues`）と同じ規則で
 * 流し込んだ後の上書きを作り、`changedGlobalItemCount`で比べる。
 *
 * 指の割当は既定と同じ値でも上書きとして残る（既定が物理配列で決まるため）。そのため
 * 「今の値と同じ」の行でも、指の割当の行には「全体で変更」の札が出ることがある。
 */
export function presetRows(
  library: PresetLibrary<SettingsValueMap>,
  overrides: SettingsCascadeOverrides,
  level: CascadeLevel = GLOBAL_LEVEL,
): readonly PresetRowView[] {
  return library.presets.map((preset) => ({
    id: preset.id,
    name: preset.name,
    sameAsCurrent: sameAfterApply(overrides, level, preset.values),
  }));
}

/**
 * 流し込み先のレベル（既定は全体）で、解決した値が変わった（増えた・消えた・違う値になった）項目の数。
 * Workspaceのレベルは全体の値を継承した値で比べる。
 */
export function changedGlobalItemCount(
  before: SettingsCascadeOverrides,
  after: SettingsCascadeOverrides,
  level: CascadeLevel = GLOBAL_LEVEL,
): number {
  const left = (levelOverrides(before, level) ?? {}) as Record<string, unknown>;
  const right = (levelOverrides(after, level) ?? {}) as Record<string, unknown>;
  const ids = new Set([...Object.keys(left), ...Object.keys(right)]);
  let count = 0;
  for (const id of ids) {
    if (JSON.stringify(resolvedLevelValue(before, level, id)) !== JSON.stringify(resolvedLevelValue(after, level, id))) count += 1;
  }
  return count;
}

/**
 * 流し込まなかった項目を、行の名前で伝える文。名前へ写せない項目（行の無いもの・未知のもの）は
 * 件数だけにする。無ければ`undefined`。
 */
export function skippedItemsText(skipped: readonly string[]): string | undefined {
  if (skipped.length === 0) return undefined;
  const labels = skipped.map(conditionItemLabel).filter((label): label is string => label !== undefined);
  const others = skipped.length - labels.length;
  const parts = [...labels, ...(others > 0 ? [`ほか${others}項目`] : [])];
  return `入れなかった項目: ${parts.join('、')}`;
}

/** 流し込みの結果の1行。変わる項目が無ければ、その旨を言う（元に戻すは付けない）。 */
export function applyResultText(
  name: string,
  changedCount: number,
  skipped: readonly string[],
): { readonly text: string; readonly undoable: boolean } {
  const skippedText = skippedItemsText(skipped);
  const tail = skippedText === undefined ? '' : `。${skippedText}`;
  if (changedCount === 0 && skippedText !== undefined) return { text: `「${name}」で変わった項目はありませんでした${tail}`, undoable: false };
  if (changedCount === 0) return { text: `「${name}」は今の値と同じで、変わった項目はありませんでした${tail}`, undoable: false };
  return { text: `「${name}」の値にしました（${changedCount}項目が変わりました）${tail}`, undoable: true };
}

export function savedResultText(name: string, scope: string = '全体'): string {
  return `「${name}」として今の${scope}の値を保存しました`;
}

export function deletedResultText(name: string): string {
  return `「${name}」を削除しました`;
}

/** 保存できる名前か（trimして1文字以上）。ボタンの有効・無効に使う。 */
export function isSavableName(raw: string): boolean {
  return raw.trim() !== '';
}
