import { useMemo } from 'react';
import {
  deleteFingerAssignmentCommand,
  deleteSetupCommand,
  resetCascadeItemCommand,
  deleteUserLayoutCommand,
  deleteUserRomajiRuleCommand,
} from '#engine/commands.ts';
import { importUserAssetsCommand } from '#engine/user-assets-file.ts';
import { paneCatalog } from '../standalone/catalog.ts';
import { useKeydistAssets } from '../standalone/use-keydist-assets.ts';
import { usePaneCatalog } from '../standalone/use-pane-catalog.ts';
import { setupListItems } from '../setup/setup-view.ts';
import { generatePresetId } from '../standalone/id-generator.ts';
import { cascadeOverrideGroups } from './cascade-override-groups.ts';
import { ConditionTable } from './ConditionTable.tsx';
import { conditionPlacementGroups, conditionValueNames } from './condition-table.ts';
import { UserAssetsPage } from './UserAssetsPage.tsx';

/** データ・設定の管理の画面の組み立て。資産の読み書きと履歴は、個別画面と同じ仕組みに乗せる。 */
export function UserAssetsApp() {
  const { assets, ready, dispatch, canUndo, canRedo, undo, redo } = useKeydistAssets();
  const setupItems = useMemo(() => setupListItems(assets.setupLibrary.setups, paneCatalog(assets), assets.setupLibrary.overrides), [assets]);
  const catalog = usePaneCatalog(assets);
  const names = useMemo(
    () => conditionValueNames(catalog, assets.userLayouts, assets.userRomajiRules, assets.fingerAssignments),
    [catalog, assets.userLayouts, assets.userRomajiRules, assets.fingerAssignments],
  );
  const setupNames = useMemo(() => setupItems.map((item) => ({ id: item.setup.id, displayName: item.displayName })), [setupItems]);
  const overrideGroups = useMemo(
    () =>
      cascadeOverrideGroups({
        overrides: assets.setupLibrary.overrides,
        workspaces: assets.workspaces,
        setups: setupNames,
        names,
      }),
    [assets.setupLibrary.overrides, assets.workspaces, setupNames, names],
  );
  const placementGroups = useMemo(
    () =>
      conditionPlacementGroups({
        catalog,
        userLayouts: assets.userLayouts,
        userRomajiRules: assets.userRomajiRules,
        workspaces: assets.workspaces,
        setups: setupNames,
        names,
      }),
    [catalog, assets.userLayouts, assets.userRomajiRules, assets.workspaces, setupNames, names],
  );
  return (
    <UserAssetsPage
      assets={assets}
      setupItems={setupItems}
      ready={ready}
      canUndo={canUndo}
      canRedo={canRedo}
      onUndo={undo}
      onRedo={redo}
      onDeleteLayout={(id) => dispatch(deleteUserLayoutCommand(id))}
      onDeleteRomajiRule={(id) => dispatch(deleteUserRomajiRuleCommand(id))}
      onDeleteFingerAssignment={(id) => dispatch(deleteFingerAssignmentCommand(id))}
      onDeleteSetup={(id) => dispatch(deleteSetupCommand(id))}
      conditionTable={
        <ConditionTable
          placementGroups={placementGroups}
          overrides={assets.setupLibrary.overrides}
          workspaces={assets.workspaces}
          setups={assets.setupLibrary.setups}
          catalog={catalog}
          overrideGroups={overrideGroups}
          presetLibrary={assets.presetLibrary}
          generatePresetId={generatePresetId}
          dispatch={dispatch}
          undo={undo}
        />
      }
      overrideGroups={overrideGroups}
      onResetOverride={(group, itemId) => dispatch(resetCascadeItemCommand(group.level, itemId, group.workspaceId))}
      onImport={(bundle, stamp) => {
        const plan = importUserAssetsCommand(bundle, stamp);
        dispatch(plan.command);
        return plan.entries();
      }}
    />
  );
}
