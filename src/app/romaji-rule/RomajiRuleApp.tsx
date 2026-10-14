import {
  createUserRomajiRuleCommand,
  duplicateUserRomajiRuleCommand,
  renameUserRomajiRuleCommand,
  setUserRomajiRuleContentCommand,
} from '#engine/commands.ts';
import { RomajiRuleEditor } from '#editors/romaji-rule/RomajiRuleEditor.tsx';
import { useKeydistAssets } from '../standalone/use-keydist-assets.ts';

/**
 * ローマ字の綴りの画面の組み立て。資産の読み書きと履歴は、個別画面と同じ仕組みに乗せる。
 * 新しいidは画面が発行してコマンドへ渡すので、作った規則をそのまま選べる。
 */
export function RomajiRuleApp() {
  const { assets, ready, dispatch, canUndo, canRedo, undo, redo } = useKeydistAssets();
  return (
    <RomajiRuleEditor
      rules={assets.userRomajiRules}
      ready={ready}
      canUndo={canUndo}
      canRedo={canRedo}
      onUndo={undo}
      onRedo={redo}
      onCreate={(id, name, base) => dispatch(createUserRomajiRuleCommand(() => id, name, base))}
      onDuplicate={(sourceId, id) => dispatch(duplicateUserRomajiRuleCommand(sourceId, () => id))}
      onRename={(id, name) => dispatch(renameUserRomajiRuleCommand(id, name))}
      onUpdate={(id, content) => dispatch(setUserRomajiRuleContentCommand(id, content))}
    />
  );
}
