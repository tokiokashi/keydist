import { useMemo } from 'react';
import type { ContextBarHistory } from '#hosts/shared/ContextBar.tsx';
import { setStandaloneAnalyzerOptionsCommand } from '#engine/commands.ts';
import { nSensitivityAnalyzer } from '#analyzers/n-sensitivity/definition.tsx';
import type { NSensitivityOptions } from '#analyzers/n-sensitivity/options.ts';
import { NSensitivityStandalonePage } from '#hosts/standalone/index.ts';
import { builtinPaneCatalog } from './catalog.ts';
import { sharedEngineComputer } from './engine-computer.ts';
import { generatePresetId, generateTextId } from './id-generator.ts';
import { useKeydistAssets } from './use-keydist-assets.ts';
import { useDebouncedCommit } from './use-debounced-commit.ts';
import { useTextContentCommit } from './use-text-content-commit.ts';

/**
 * N感度単体ページの組み立て（#544 Phase 3。`StandaloneComparisonApp.tsx`と同じ形）。
 * 計算の窓口は他の単体ページと共有する（`engine-computer.ts`。ブラウザではWorker）。
 */
export function StandaloneNSensitivityApp() {
  const { assets, ready, dispatch, getAssets, canUndo, canRedo, undo, redo } = useKeydistAssets();
  const catalog = useMemo(() => builtinPaneCatalog(), []);

  const commitOptions = useDebouncedCommit<NSensitivityOptions>(dispatch, {
    commandFor: (options) => setStandaloneAnalyzerOptionsCommand(nSensitivityAnalyzer.definition.id, options),
  });

  const commitTextContent = useTextContentCommit(dispatch, getAssets, generateTextId);

  // 間引き待ちの変更を先に書いてから戻す。待ち中の値を残したまま戻すと、戻した後にその値が
  // 書かれて、戻したはずの変更がまた入るため。
  const history: ContextBarHistory = {
    canUndo,
    canRedo,
    undo: () => {
      commitTextContent.flush();
      commitOptions.flush();
      undo();
    },
    redo: () => {
      commitTextContent.flush();
      commitOptions.flush();
      redo();
    },
  };

  return (
    <NSensitivityStandalonePage
      assets={assets}
      assetsReady={ready}
      dispatch={dispatch}
      cache={sharedEngineComputer}
      catalog={catalog}
      generateTextId={generateTextId}
      generatePresetId={generatePresetId}
      history={history}
      onTextContentCommit={commitTextContent}
      onOptionsCommit={commitOptions}
    />
  );
}
