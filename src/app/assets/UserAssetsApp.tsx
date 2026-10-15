import { useMemo } from 'react';
import { deleteFingerAssignmentCommand, deleteSetupCommand, deleteUserLayoutCommand, deleteUserRomajiRuleCommand } from '#engine/commands.ts';
import { importUserAssetsCommand } from '#engine/user-assets-file.ts';
import { paneCatalog } from '../standalone/catalog.ts';
import { useKeydistAssets } from '../standalone/use-keydist-assets.ts';
import { setupListItems } from '../setup/setup-view.ts';
import { UserAssetsPage } from './UserAssetsPage.tsx';

/** 自作の配列・規則の画面の組み立て。資産の読み書きと履歴は、個別画面と同じ仕組みに乗せる。 */
export function UserAssetsApp() {
  const { assets, ready, dispatch, canUndo, canRedo, undo, redo } = useKeydistAssets();
  const setupItems = useMemo(
    () => setupListItems(assets.setupLibrary.setups, paneCatalog(assets), assets.setupLibrary.overrides),
    [assets],
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
      onImport={(bundle, stamp) => {
        const plan = importUserAssetsCommand(bundle, stamp);
        dispatch(plan.command);
        return plan.entries();
      }}
    />
  );
}
