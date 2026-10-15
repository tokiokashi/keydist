import { useCallback } from 'react';
import {
  createFingerAssignmentCommand,
  duplicateFingerAssignmentCommand,
  renameFingerAssignmentCommand,
  setFingerAssignmentContentCommand,
} from '#engine/commands.ts';
import { FINGER_ASSIGNMENT_REGISTRY } from '#engine/finger-assignment.ts';
import { FingerAssignmentEditor } from '#editors/finger-assignment/FingerAssignmentEditor.tsx';
import { PHYSICAL_SHAPES } from '#input/shapes/geometry.ts';
import { defaultFingerAssignmentOf } from './default-assignment.ts';
import { useKeydistAssets } from '../standalone/use-keydist-assets.ts';

const SHAPES = Object.values(PHYSICAL_SHAPES);
const BUILTINS = Object.values(FINGER_ASSIGNMENT_REGISTRY);

/**
 * 指の割り当ての画面の組み立て。資産の読み書きと履歴は、個別画面と同じ仕組みに乗せる。
 * 新しいidは画面が発行してコマンドへ渡すので、作った割り当てをそのまま選べる。
 */
export function FingerAssignmentApp() {
  const { assets, ready, dispatch, canUndo, canRedo, undo, redo } = useKeydistAssets();
  const defaultAssignmentOf = useCallback((shapeId: string) => defaultFingerAssignmentOf(shapeId, SHAPES), []);
  return (
    <FingerAssignmentEditor
      assignments={assets.fingerAssignments}
      builtins={BUILTINS}
      ready={ready}
      shapes={SHAPES}
      defaultAssignmentOf={defaultAssignmentOf}
      canUndo={canUndo}
      canRedo={canRedo}
      onUndo={undo}
      onRedo={redo}
      onCreate={(id, name, base) => dispatch(createFingerAssignmentCommand(() => id, base, name))}
      onDuplicate={(sourceId, id) => dispatch(duplicateFingerAssignmentCommand(sourceId, () => id))}
      onRename={(id, name) => dispatch(renameFingerAssignmentCommand(id, name))}
      onUpdate={(id, content) => dispatch(setFingerAssignmentContentCommand(id, content))}
    />
  );
}
