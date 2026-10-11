import { useMemo } from 'react';
import { setPersonalSpeedCommand } from '#engine/commands.ts';
import { PersonalSpeedEditor } from '#editors/personal-speed/PersonalSpeedEditor.tsx';
import { useKeydistAssets } from '../standalone/use-keydist-assets.ts';
import { defaultFingerAssignmentIdOf, initialPersonalSpeedSelection, personalSpeedCatalog } from './personal-speed-setup.ts';

/**
 * 個人速度の画面の組み立て。資産の読み書きと履歴は、個別画面と同じ仕組みに乗せる。
 * 画面を開いた時の選択は保存済みの資産が読み込まれた後の値で決めるので、読み込みの前後で作り直す。
 */
export function PersonalSpeedApp() {
  const { assets, ready, dispatch, canUndo, canRedo, undo, redo } = useKeydistAssets();
  const catalog = useMemo(
    () => personalSpeedCatalog(assets),
    [assets.userLayouts, assets.userRomajiRules, assets.fingerAssignments],
  );
  return (
    <PersonalSpeedEditor
      key={ready ? 'ready' : 'loading'}
      calibration={assets.personalSpeed.calibration}
      ready={ready}
      catalog={catalog}
      initialSelection={initialPersonalSpeedSelection(assets, catalog)}
      defaultFingerAssignmentId={(shapeId) => defaultFingerAssignmentIdOf(shapeId, catalog)}
      canUndo={canUndo}
      canRedo={canRedo}
      onUndo={undo}
      onRedo={redo}
      onSave={(calibration) => dispatch(setPersonalSpeedCommand(calibration))}
      onDiscard={() => dispatch(setPersonalSpeedCommand(undefined))}
    />
  );
}
