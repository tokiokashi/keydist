import { useMemo } from 'react';
import type { ContextBarHistory } from '#hosts/shared/ContextBar.tsx';
import { generatePresetId, generateTextId } from '../standalone/id-generator.ts';
import { sharedReadingSource } from '../standalone/reading-source.ts';
import { useKeydistAssets } from '../standalone/use-keydist-assets.ts';
import { usePaneCatalog } from '../standalone/use-pane-catalog.ts';
import { useTextContentCommit } from '../standalone/use-text-content-commit.ts';
import { sharedRecordComputer } from './record-computer.ts';
import { RecordPage } from './RecordPage.tsx';

const generateRecordId = () => crypto.randomUUID();

/** 打鍵の記録の画面の組み立て。資産の読み書きと履歴は、個別画面と同じ仕組みに乗せる。 */
export function RecordApp() {
  const { assets, ready, dispatch, getAssets, canUndo, canRedo, undo, redo } = useKeydistAssets();
  const catalog = usePaneCatalog(assets);
  const commitTextContent = useTextContentCommit(dispatch, getAssets, generateTextId);
  const history: ContextBarHistory = useMemo(
    () => ({
      canUndo,
      canRedo,
      undo: () => {
        commitTextContent.flush();
        undo();
      },
      redo: () => {
        commitTextContent.flush();
        redo();
      },
    }),
    [canUndo, canRedo, undo, redo, commitTextContent],
  );
  return (
    <RecordPage
      assets={assets}
      assetsReady={ready}
      dispatch={dispatch}
      getAssets={getAssets}
      computer={sharedRecordComputer}
      reading={sharedReadingSource}
      catalog={catalog}
      generateTextId={generateTextId}
      generatePresetId={generatePresetId}
      generateRecordId={generateRecordId}
      onTextContentCommit={commitTextContent}
      history={history}
      appVersion={__KEYDIST_VERSION__}
    />
  );
}
