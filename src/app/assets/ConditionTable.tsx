import { useMemo, useState } from 'react';
import type { Command } from '#input/commands/index.ts';
import type { PresetIdGenerator, PresetLibrary } from '#input/presets/index.ts';
import type { Setup } from '#input/setup/index.ts';
import type { KeydistAssets } from '#engine/commands.ts';
import type { SettingsCascadeOverrides, SettingsValueMap } from '#engine/settings-items.ts';
import type { Workspace } from '#engine/workspace.ts';
import { ConditionEditor, type ConditionEditorContext } from '#hosts/shared/ConditionEditor.tsx';
import { GLOBAL_EDITABLE_IDS } from '#hosts/shared/condition-edit.ts';
import type { PaneCatalog } from '#hosts/shared/resolve-pane-input.ts';
import type { OverrideGroup } from './cascade-override-groups.ts';
import {
  otherPlacementNotes,
  placementRows,
  type ConditionPlacement,
  type ConditionPlacementGroup,
} from './condition-table.ts';

export interface ConditionTableProps {
  readonly placementGroups: readonly ConditionPlacementGroup[];
  /** `setupLibrary`の上書き（Workspaceのレベルは含めない）。 */
  readonly overrides: SettingsCascadeOverrides;
  readonly workspaces: readonly Workspace[];
  readonly setups: readonly Setup[];
  readonly catalog: PaneCatalog;
  /** 上書きの一覧と同じ集合。他の置き場所の上書きの名前に使う。 */
  readonly overrideGroups: readonly OverrideGroup[];
  readonly presetLibrary: PresetLibrary<SettingsValueMap>;
  readonly generatePresetId: PresetIdGenerator;
  readonly dispatch: (command: Command<KeydistAssets>) => void;
  readonly undo: () => void;
}

const DEFAULT_PLACEMENT_KEY = 'global';

/** 編集先を置き場所に固定した、条件の行の表。置き場所を選ぶと、その置き場所に置ける項目が行で並ぶ。 */
export function ConditionTable({
  placementGroups,
  overrides,
  workspaces,
  setups,
  catalog,
  overrideGroups,
  presetLibrary,
  generatePresetId,
  dispatch,
  undo,
}: ConditionTableProps) {
  const [chosenKey, setChosenKey] = useState(DEFAULT_PLACEMENT_KEY);
  const placements = useMemo(() => placementGroups.flatMap((group) => group.placements), [placementGroups]);
  // 選んでいた置き場所が無くなった時（削除・元に戻す）は、いつも選べる全体に戻す
  const placement: ConditionPlacement = placements.find((candidate) => candidate.key === chosenKey) ?? placements[0]!;
  const resolved = useMemo(
    () => placementRows(placement, { overrides, workspaces, catalog, setups }),
    [placement, overrides, workspaces, catalog, setups],
  );

  const editor: ConditionEditorContext | undefined = !resolved.ok ? undefined : {
    overrides: resolved.overrides,
    dispatch,
    shapes: catalog.setupCatalog.shapes,
    ...(catalog.customFingerAssignments === undefined ? {} : { customFingerAssignments: catalog.customFingerAssignments }),
    ...(catalog.customRomajiRules === undefined ? {} : { customRomajiRules: catalog.customRomajiRules }),
    ...fixedTarget(placement, setups),
    otherScopeNotes: otherPlacementNotes(overrideGroups, placement.key, GLOBAL_EDITABLE_IDS),
    presetLibrary,
    generatePresetId,
    undo,
  };

  return (
    <section className="user-assets-section" data-user-assets-section="conditions">
      <h2>条件の設定</h2>
      <p className="user-assets-detail">
        置き場所を選ぶと、その置き場所に置ける項目が並びます。値を変えるとその置き場所に保存し、継承する値と同じ値にすると上書きは消えます。
      </p>
      <label className="conditions-table-select">
        置き場所
        <select
          aria-label="置き場所を選ぶ"
          data-conditions-placement-select="true"
          value={placement.key}
          onChange={(event) => setChosenKey(event.currentTarget.value)}
        >
          {placementGroups.map((group) => (
            <optgroup key={group.id} label={group.label}>
              {group.placements.map((candidate) => (
                <option key={candidate.key} value={candidate.key}>{candidate.title}</option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>
      {/* 置き場所を選び直すと別の要素になり、入れ替わりの動きが最初から流れる */}
      <div className="conditions-table-body" key={placement.key} data-conditions-placement={placement.key}>
        {resolved.ok && editor !== undefined ? (
          <ConditionEditor editor={editor} rows={resolved.rows} />
        ) : (
          <div data-conditions-unavailable="true">
            <p className="user-assets-empty">{resolved.ok ? '' : resolved.message}</p>
            {!resolved.ok && resolved.detail !== undefined ? <p className="user-assets-detail">{resolved.detail}</p> : null}
          </div>
        )}
      </div>
    </section>
  );
}

/** 置き場所に固定した編集先と、その書き込みに要る対象。 */
function fixedTarget(
  placement: ConditionPlacement,
  setups: readonly Setup[],
): Pick<ConditionEditorContext, 'fixedScope' | 'layout' | 'workspace' | 'setup'> {
  switch (placement.kind) {
    case 'global': return { fixedScope: 'global' };
    case 'workspace': return { fixedScope: 'workspace', workspace: { id: placement.workspaceId } };
    case 'layout': return { fixedScope: 'layout', layout: { id: placement.layoutId, name: placement.title } };
    case 'setup': {
      const layoutId = setups.find((setup) => setup.id === placement.setupId)?.layoutId ?? '';
      return { setup: { id: placement.setupId, layoutId } };
    }
  }
}
