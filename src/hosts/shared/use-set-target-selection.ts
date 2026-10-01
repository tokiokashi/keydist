import { useMemo } from 'react';
import { multiColorSlots, type ColorSlotsByKey, type MultiTargetSelection, type TargetSet } from '#engine/multi-target-selection.ts';
import { analysisTargetKey, type Setup } from '#input/setup/index.ts';
import { targetPaletteColor } from '#ui/theme/target-colors.ts';
import { targetMark } from '#ui/theme/target-marks.ts';
import { sortTargetsByChoices, targetChoiceGroups } from './target-choices.ts';
import type { PaneCatalog } from './resolve-pane-input.ts';

/** 個別画面の集合が持つ色の番号を、ペインが受け取る形（対象のkey → 番号）にする。 */
export function useMultiColorSlots(selection: MultiTargetSelection): ColorSlotsByKey {
  return useMemo(() => multiColorSlots(selection), [selection]);
}

/**
 * 集合を見るページ（比較表・N感度）が対象の選択に渡す候補と、表示順に並べた対象・対象ごとの色。
 * 表示順は候補の一覧の順に固定し、色は器が配った番号（加えた順。個別画面は集合が、Workspaceは全ペインの和に対して配る）から引く（並びと色は別）。
 */
export function useSetTargetSelection(selection: TargetSet, colorSlots: ColorSlotsByKey, setups: readonly Setup[], catalog: PaneCatalog) {
  const choiceGroups = useMemo(() => targetChoiceGroups({
    layouts: catalog.setupCatalog.layouts,
    userLayoutIds: new Set(catalog.userLayouts.keys()),
    shapes: catalog.setupCatalog.shapes,
    setups,
    selected: selection.targets,
  }), [catalog, setups, selection.targets]);
  const targets = useMemo(() => sortTargetsByChoices(selection.targets, choiceGroups), [selection.targets, choiceGroups]);
  const colorByKey = useMemo(
    () => new Map(selection.targets.map((target) => {
      const key = analysisTargetKey(target);
      // 器は集合の全対象に番号を配っている。無い時（想定外）も例外にせず先頭の色にする
      return [key, targetPaletteColor(colorSlots[key] ?? 0)] as const;
    })),
    [selection.targets, colorSlots],
  );
  // 色以外の手がかり。色と同じ番号から決めるので、同じ対象はどのペインでも同じ形・線種になる。
  const markByKey = useMemo(
    () => new Map(selection.targets.map((target) => {
      const key = analysisTargetKey(target);
      return [key, targetMark(colorSlots[key] ?? 0)] as const;
    })),
    [selection.targets, colorSlots],
  );
  return { choiceGroups, targets, colorByKey, markByKey };
}
