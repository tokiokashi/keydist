import { useMemo } from 'react';
import type { ContextBarHistory } from '#hosts/shared/ContextBar.tsx';
import { setStandaloneAnalyzerOptionsCommand } from '#engine/commands.ts';
import { comparisonAnalyzer } from '#analyzers/comparison/definition.tsx';
import type { ComparisonOptions } from '#analyzers/comparison/options.ts';
import { ComparisonStandalonePage } from '#hosts/standalone/index.ts';
import { builtinStandaloneCatalog } from './catalog.ts';
import { sharedEngineComputer } from './engine-computer.ts';
import { generateTextId } from './id-generator.ts';
import { useKeydistAssets } from './use-keydist-assets.ts';
import { useDebouncedCommit } from './use-debounced-commit.ts';
import { useTextContentCommit } from './use-text-content-commit.ts';

/**
 * 比較表単体ページの組み立て（#544 Phase 3。`StandaloneBigramFlowApp.tsx`と同じ形）。
 *
 * 計算の窓口は他の単体ページと共有する（`engine-computer.ts`）。
 */
export function StandaloneComparisonApp() {
  const { assets, ready, dispatch, getAssets, canUndo, canRedo, undo, redo } = useKeydistAssets();
  const catalog = useMemo(() => builtinStandaloneCatalog(), []);

  const commitComparisonOptions = useDebouncedCommit<ComparisonOptions>(dispatch, {
    commandFor: (options) => setStandaloneAnalyzerOptionsCommand(comparisonAnalyzer.definition.id, options),
  });

  const commitTextContent = useTextContentCommit(dispatch, getAssets, generateTextId);

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
    <ComparisonStandalonePage
      assets={assets}
      assetsReady={ready}
      dispatch={dispatch}
      cache={sharedEngineComputer}
      catalog={catalog}
      generateTextId={generateTextId}
      history={history}
      onTextContentCommit={commitTextContent}
      onComparisonOptionsCommit={commitComparisonOptions}
    />
  );
}
