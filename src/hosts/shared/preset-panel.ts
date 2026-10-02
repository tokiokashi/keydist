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
 * 一覧の行。「今の値と同じ」は、流し込みが変化を起こさないかで決める（`applyPresetValues`は
 * 変化が無ければ同じ参照を返す。判定は流し込みの`sameLevel`と同じ規則）。値の一致を別に
 * 比べ直すと、既定と同じ値を含むプリセットで「同じ」と「流し込むと変わる」が食い違うため。
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
    sameAsCurrent: applyPresetValues(SETTINGS_ITEMS, overrides, level, preset.values).overrides === overrides,
  }));
}

/** 流し込み先のレベル（既定は全体）の上書きのうち、値が変わった（増えた・消えた・違う値になった）項目の数。 */
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
    if (JSON.stringify(left[id]) !== JSON.stringify(right[id])) count += 1;
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
  if (changedCount === 0) return { text: `「${name}」は今の値と同じで、変わった項目は無い${tail}`, undoable: false };
  return { text: `「${name}」の値にした（${changedCount}項目が変わった）${tail}`, undoable: true };
}

export function savedResultText(name: string, scope: string = '全体'): string {
  return `「${name}」として今の${scope}の値を保存した`;
}

export function deletedResultText(name: string): string {
  return `「${name}」を削除した`;
}

/** 保存できる名前か（trimして1文字以上）。ボタンの有効・無効に使う。 */
export function isSavableName(raw: string): boolean {
  return raw.trim() !== '';
}
