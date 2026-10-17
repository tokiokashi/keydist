import { useMemo } from 'react';
import { useSearch } from '@tanstack/react-router';
import { paneCatalog } from '../standalone/catalog.ts';
import { generatePresetId, generateSetupId } from '../standalone/id-generator.ts';
import { useKeydistAssets } from '../standalone/use-keydist-assets.ts';
import { SetupPage } from './SetupPage.tsx';

/**
 * Setupの画面の組み立て。資産の読み書きと履歴は、個別画面と同じ仕組みに乗せる。
 * 新しいidは画面が発行してコマンドへ渡すので、作ったSetupをそのまま選べる。
 */
export function SetupApp() {
  const { assets, ready, dispatch, canUndo, canRedo, undo, redo } = useKeydistAssets();
  const search = useSearch({ from: '/setup' });
  const catalog = useMemo(() => paneCatalog(assets), [assets.userLayouts, assets.userRomajiRules, assets.fingerAssignments, assets.personalSpeed]);
  return (
    <SetupPage
      assets={assets}
      ready={ready}
      catalog={catalog}
      {...(search.setup === undefined ? {} : { initialSetupId: search.setup })}
      canUndo={canUndo}
      canRedo={canRedo}
      onUndo={undo}
      onRedo={redo}
      dispatch={dispatch}
      generateSetupId={generateSetupId}
      generatePresetId={generatePresetId}
    />
  );
}
