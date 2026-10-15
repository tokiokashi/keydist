import { useMemo } from 'react';
import { deleteFingerAssignmentCommand, deleteSetupCommand, resetCascadeItemCommand, deleteUserLayoutCommand, deleteUserRomajiRuleCommand } from '#engine/commands.ts';
import { importUserAssetsCommand } from '#engine/user-assets-file.ts';
import { paneCatalog } from '../standalone/catalog.ts';
import { useKeydistAssets } from '../standalone/use-keydist-assets.ts';
import { setupListItems } from '../setup/setup-view.ts';
import type { ConditionValueNames } from '#hosts/shared/condition-summary.ts';
import { cascadeOverrideGroups } from './cascade-override-groups.ts';
import { UserAssetsPage } from './UserAssetsPage.tsx';

/** データの管理の画面の組み立て。資産の読み書きと履歴は、個別画面と同じ仕組みに乗せる。 */
export function UserAssetsApp() {
  const { assets, ready, dispatch, canUndo, canRedo, undo, redo } = useKeydistAssets();
  const setupItems = useMemo(
    () => setupListItems(assets.setupLibrary.setups, paneCatalog(assets), assets.setupLibrary.overrides),
    [assets],
  );
  const overrideGroups = useMemo(() => {
    const { setupCatalog } = paneCatalog(assets);
    const names: ConditionValueNames = {
      shapes: setupCatalog.shapes,
      layouts: setupCatalog.layouts,
      romajiRules: new Map(assets.userRomajiRules.map((rule) => [rule.id, rule] as const)),
      fingerAssignments: new Map(assets.fingerAssignments.map((assignment) => [assignment.id, assignment] as const)),
    };
    return cascadeOverrideGroups({
      overrides: assets.setupLibrary.overrides,
      workspaces: assets.workspaces,
      setups: setupItems.map((item) => ({ id: item.setup.id, displayName: item.displayName })),
      names,
    });
  }, [assets, setupItems]);
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
