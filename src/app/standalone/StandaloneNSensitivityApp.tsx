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
import { useAddToWorkspace } from './use-add-to-workspace.ts';
import { OptionsWriteLogsProvider } from '#hosts/shared/OptionsWriteLogsContext.tsx';
import { createOptionsWriteLogs, STANDALONE_WRITE_LOG_KEY } from '#hosts/shared/options-write-log.ts';
import { useDebouncedCommit } from './use-debounced-commit.ts';
import { useTextContentCommit } from './use-text-content-commit.ts';

/**
 * N感度単体ページの組み立て（#544 Phase 3。`StandaloneComparisonApp.tsx`と同じ形）。
 * 計算の窓口は他の単体ページと共有する（`engine-computer.ts`。ブラウザではWorker）。
 */
export function StandaloneNSensitivityApp() {
  const { assets, ready, dispatch, getAssets, canUndo, canRedo, undo, redo } = useKeydistAssets();
  const catalog = useMemo(() => builtinPaneCatalog(), []);

  // 保存先へ書いた値を記録し、解析設定の下書きが自分の保存の反響を見分けるのに使う
  const writeLogs = useMemo(createOptionsWriteLogs, []);
  const commitOptions = useDebouncedCommit<NSensitivityOptions>(dispatch, {
    onWrite: (options) => writeLogs.forKey(STANDALONE_WRITE_LOG_KEY).record(options),
    commandFor: (options) => setStandaloneAnalyzerOptionsCommand(nSensitivityAnalyzer.definition.id, options),
  });

  const commitTextContent = useTextContentCommit(dispatch, getAssets, generateTextId);

  const addToWorkspace = useAddToWorkspace(nSensitivityAnalyzer.definition.id, dispatch, getAssets, () => {
    commitTextContent.flush();
    commitOptions.flush();
  });

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
    <OptionsWriteLogsProvider logs={writeLogs}>
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
        onAddToWorkspace={addToWorkspace}
        onOptionsCommit={commitOptions}
      />
    </OptionsWriteLogsProvider>
  );
}
