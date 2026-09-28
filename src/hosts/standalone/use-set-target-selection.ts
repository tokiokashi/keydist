import { useMemo } from 'react';
import type { SetSelectionState } from '#engine/analyzer-set-selection.ts';
import { analysisTargetKey, type Setup } from '#input/setup/index.ts';
import { targetPaletteColor } from '#ui/theme/target-colors.ts';
import { sortTargetsByChoices, targetChoiceGroups } from '#hosts/shared/index.ts';
import type { StandalonePaneCatalog } from './resolve-pane-input.ts';

/**
 * 集合を見るページ（比較表・N感度）が対象の選択に渡す候補と、表示順に並べた対象・対象ごとの色。
 * 表示順は候補の一覧の順に固定し、色は集合が配った番号（加えた順）から引く（並びと色は別）。
 */
export function useSetTargetSelection(selection: SetSelectionState, setups: readonly Setup[], catalog: StandalonePaneCatalog) {
  const choiceGroups = useMemo(() => targetChoiceGroups({
    layouts: catalog.setupCatalog.layouts,
    userLayoutIds: new Set(catalog.userLayouts.keys()),
    shapes: catalog.setupCatalog.shapes,
    setups,
    selected: selection.targets,
  }), [catalog, setups, selection.targets]);
  const targets = useMemo(() => sortTargetsByChoices(selection.targets, choiceGroups), [selection.targets, choiceGroups]);
  const colorByKey = useMemo(
    () => new Map(selection.targets.map((target, index) => [analysisTargetKey(target), targetPaletteColor(selection.colorSlots[index]!)] as const)),
    [selection.targets, selection.colorSlots],
  );
  return { choiceGroups, targets, colorByKey };
}
