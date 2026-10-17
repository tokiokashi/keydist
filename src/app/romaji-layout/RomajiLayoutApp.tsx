import { createUserLayoutCommand, updateUserLayoutCommand } from '#engine/commands.ts';
import { FINGER_ASSIGNMENT_REGISTRY } from '#engine/finger-assignment.ts';
import { RomajiLayoutEditor } from '#editors/romaji-layout/RomajiLayoutEditor.tsx';
import { useMemo } from 'react';
import { useKeydistAssets } from '../standalone/use-keydist-assets.ts';

/**
 * ローマ字配列の画面の組み立て。資産の読み書きと履歴は、個別画面と同じ仕組みに乗せる。
 * 新しいidは画面が発行してコマンドへ渡すので、作った配列をそのまま選べる。
 */
export function RomajiLayoutApp() {
  const { assets, ready, dispatch, canUndo, canRedo, undo, redo } = useKeydistAssets();
  const fingerAssignments = useMemo(() => [...Object.values(FINGER_ASSIGNMENT_REGISTRY), ...assets.fingerAssignments], [assets.fingerAssignments]);
  return (
    <RomajiLayoutEditor
      layouts={assets.userLayouts}
      rules={assets.userRomajiRules}
      fingerAssignments={fingerAssignments}
      ready={ready}
      canUndo={canUndo}
      canRedo={canRedo}
      onUndo={undo}
      onRedo={redo}
      onCreate={(id, content) => dispatch(createUserLayoutCommand(() => id, content))}
      onUpdate={(id, content) => dispatch(updateUserLayoutCommand(id, content))}
    />
  );
}
