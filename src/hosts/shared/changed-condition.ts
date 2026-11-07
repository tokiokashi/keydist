import type { SettingsCascadeOverrides } from '#engine/settings-items.ts';
import type { AnalysisTarget, Setup } from '#input/setup/index.ts';
import type { PaneText } from './reading-evaluation.ts';
import {
  isChangedConditionRow,
  settingsItemIds,
  textInapplicableIdsOf,
  traceConditionSummary,
  type ConditionSummaryRow,
  type ConditionSummaryScope,
} from './condition-summary.ts';
import { resolvePaneInput, type PaneCatalog } from './resolve-pane-input.ts';

/**
 * 対象を1つ見るペインが条件の要約に数える範囲。ペインの見出しと、共有の知らせの判定が同じ範囲を読むよう、
 * 両方がこれを使う。
 */
export function singlePaneConditionScope(conditionExtraIds: readonly string[] | undefined, language: PaneText['language']): ConditionSummaryScope {
  return { extraIds: settingsItemIds(conditionExtraIds), textInapplicableIds: textInapplicableIdsOf(language) };
}

/** 複数の対象を比べるペインが条件の要約に数える範囲（`singlePaneConditionScope`と同じ理由で共有する）。 */
export function setPaneConditionScope(language: PaneText['language']): ConditionSummaryScope {
  return { textInapplicableIds: textInapplicableIdsOf(language) };
}

/**
 * 並んでいる対象のどれかで既定と違う条件の項目名（条件の要約の行に出る名前）。全ての対象を合わせた和集合で、
 * 項目の定義順に並ぶ。対象ごとに解決したカスケード（全体・物理配列・配列・Setupなどの上書きを重ねたもの）の行へ、
 * 見出しの「変更あり」と同じ`isChangedConditionRow`を掛ける。
 * 解決できない対象は、見出しに条件が出ないので数えない。`excludeIds`の項目はそのペインが条件として見せないので数えない。
 */
export function changedConditionLabels(input: {
  readonly targets: readonly AnalysisTarget[];
  readonly setups: ReadonlyMap<string, Setup>;
  readonly catalog: PaneCatalog;
  readonly overrides: SettingsCascadeOverrides;
  readonly text: PaneText;
  readonly scope: ConditionSummaryScope;
  readonly excludeIds?: readonly string[];
}): readonly string[] {
  const excludeIds = input.excludeIds ?? [];
  const changedIds = new Set<string>();
  let definitionOrder: readonly ConditionSummaryRow[] = [];
  for (const target of input.targets) {
    const resolution = resolvePaneInput(target, input.setups, input.catalog, input.overrides, input.text);
    if (!resolution.ok) continue;
    const rows = traceConditionSummary(resolution.input.cascade, input.catalog.setupCatalog, input.scope);
    // 同じ範囲で作った行は、どの対象でも同じ項目が同じ順で並ぶ。
    if (definitionOrder.length === 0) definitionOrder = rows;
    for (const row of rows) {
      if (isChangedConditionRow(row) && !excludeIds.includes(row.id)) changedIds.add(row.id);
    }
  }
  return definitionOrder.filter((row) => changedIds.has(row.id)).map((row) => row.label);
}
