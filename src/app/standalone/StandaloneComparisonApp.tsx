import { useMemo } from 'react';
import type { ContextBarHistory } from '#hosts/shared/ContextBar.tsx';
import { setStandaloneAnalyzerOptionsCommand } from '#engine/commands.ts';
import { comparisonAnalyzer } from '#analyzers/comparison/definition.tsx';
import type { ComparisonOptions } from '#analyzers/comparison/options.ts';
import { ComparisonStandalonePage } from '#hosts/standalone/index.ts';
import { builtinPaneCatalog } from './catalog.ts';
import { sharedEngineComputer } from './engine-computer.ts';
import { generatePresetId, generateTextId } from './id-generator.ts';
import { useKeydistAssets } from './use-keydist-assets.ts';
import { useAddToWorkspace } from './use-add-to-workspace.ts';
import { OptionsWriteLogsProvider } from '#hosts/shared/OptionsWriteLogsContext.ts';
import { createOptionsWriteLogs, STANDALONE_WRITE_LOG_KEY } from '#hosts/shared/options-write-log.ts';
import { useDebouncedCommit } from './use-debounced-commit.ts';
import { useTextContentCommit } from './use-text-content-commit.ts';

/**
 * 比較表単体ページの組み立て（`StandaloneBigramFlowApp.tsx`と同じ形）。
 *
 * 計算の窓口は他の単体ページと共有する（`engine-computer.ts`。ブラウザではWorker）。
 */
export function StandaloneComparisonApp() {
  const { assets, ready, dispatch, getAssets, canUndo, canRedo, undo, redo } = useKeydistAssets();
  const catalog = useMemo(() => builtinPaneCatalog(), []);

  // 保存先へ書いた値を記録し、解析設定の下書きが自分の保存の反響を見分けるのに使う
  const writeLogs = useMemo(createOptionsWriteLogs, []);
  const commitComparisonOptions = useDebouncedCommit<ComparisonOptions>(dispatch, {
    onWrite: (options) => writeLogs.forKey(STANDALONE_WRITE_LOG_KEY).record(options),
    commandFor: (options) => setStandaloneAnalyzerOptionsCommand(comparisonAnalyzer.definition.id, options),
  });

  const commitTextContent = useTextContentCommit(dispatch, getAssets, generateTextId);

  const addToWorkspace = useAddToWorkspace(comparisonAnalyzer.definition.id, dispatch, getAssets, () => {
    commitTextContent.flush();
    commitComparisonOptions.flush();
  });

  // 間引き待ちの変更を先に書いてから戻す。待ち中の値を残したまま戻すと、戻した後にその値が
  // 書かれて、戻したはずの変更がまた入るため。
  const history: ContextBarHistory = {
    canUndo,
    canRedo,
    undo: () => {
      commitTextContent.flush();
      commitComparisonOptions.flush();
      undo();
    },
    redo: () => {
      commitTextContent.flush();
      commitComparisonOptions.flush();
      redo();
    },
  };

  return (
    <OptionsWriteLogsProvider logs={writeLogs}>
      <ComparisonStandalonePage
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
        onComparisonOptionsCommit={commitComparisonOptions}
      />
    </OptionsWriteLogsProvider>
  );
}
