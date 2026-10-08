import { deleteUserLayoutCommand, deleteUserRomajiRuleCommand } from '#engine/commands.ts';
import { importUserAssetsCommand } from '#engine/user-assets-file.ts';
import { useKeydistAssets } from '../standalone/use-keydist-assets.ts';
import { UserAssetsPage } from './UserAssetsPage.tsx';

/** 自作の配列・規則の画面の組み立て。資産の読み書きと履歴は、個別画面と同じ仕組みに乗せる。 */
export function UserAssetsApp() {
  const { assets, ready, dispatch, canUndo, canRedo, undo, redo } = useKeydistAssets();
  return (
    <UserAssetsPage
      assets={assets}
      ready={ready}
      canUndo={canUndo}
      canRedo={canRedo}
      onUndo={undo}
      onRedo={redo}
      onDeleteLayout={(id) => dispatch(deleteUserLayoutCommand(id))}
      onDeleteRomajiRule={(id) => dispatch(deleteUserRomajiRuleCommand(id))}
      onImport={(bundle, stamp) => dispatch(importUserAssetsCommand(bundle, stamp))}
    />
  );
}
