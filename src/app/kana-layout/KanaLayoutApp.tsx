import { createUserFaceLayoutCommand, updateUserFaceLayoutCommand } from '#engine/commands.ts';
import { FINGER_ASSIGNMENT_REGISTRY } from '#engine/finger-assignment.ts';
import { KanaLayoutEditor } from '#editors/kana-layout/KanaLayoutEditor.tsx';
import { downloadText } from '#platform/browser-download.ts';
import { useMemo } from 'react';
import { useKeydistAssets } from '../standalone/use-keydist-assets.ts';

const downloadJson = (filename: string, text: string) => downloadText(filename, text, 'application/json');

/**
 * かな配列の画面の組み立て。資産の読み書きと履歴は、個別画面と同じ仕組みに乗せる。
 * 新しいidは画面が発行してコマンドへ渡すので、作った配列をそのまま選べる。
 */
export function KanaLayoutApp() {
  const { assets, ready, dispatch, canUndo, canRedo, undo, redo } = useKeydistAssets();
  const fingerAssignments = useMemo(() => [...Object.values(FINGER_ASSIGNMENT_REGISTRY), ...assets.fingerAssignments], [assets.fingerAssignments]);
  return (
    <KanaLayoutEditor
      layouts={assets.userLayouts}
      ready={ready}
      fingerAssignments={fingerAssignments}
      canUndo={canUndo}
      canRedo={canRedo}
      onUndo={undo}
      onRedo={redo}
      onCreate={(id, content) => dispatch(createUserFaceLayoutCommand(() => id, content))}
      onUpdate={(id, content) => dispatch(updateUserFaceLayoutCommand(id, content))}
      onDownload={downloadJson}
    />
  );
}
