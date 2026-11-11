import { addComboCommand, createComboSetCommand, removeComboCommand, renameComboSetCommand } from '#engine/commands.ts';
import { ComboSetEditor } from '#editors/combo-set/ComboSetEditor.tsx';
import { useKeydistAssets } from '../standalone/use-keydist-assets.ts';

/**
 * コンボの組の画面の組み立て。資産の読み書きと履歴は、個別画面と同じ仕組みに乗せる。
 * 新しいidは画面が発行してコマンドへ渡すので、作った組をそのまま選べる。
 */
export function ComboSetApp() {
  const { assets, ready, dispatch, canUndo, canRedo, undo, redo } = useKeydistAssets();
  return (
    <ComboSetEditor
      comboSets={assets.comboSets}
      userRomajiRules={assets.userRomajiRules}
      ready={ready}
      canUndo={canUndo}
      canRedo={canRedo}
      onUndo={undo}
      onRedo={redo}
      onCreate={(id, name, romajiRuleId) => dispatch(createComboSetCommand(() => id, name, romajiRuleId))}
      onRename={(id, name) => dispatch(renameComboSetCommand(id, name))}
      onAddCombo={(id, entry) => dispatch(addComboCommand(id, entry))}
      onRemoveCombo={(id, index) => dispatch(removeComboCommand(id, index))}
    />
  );
}
