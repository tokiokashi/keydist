import { useMemo } from 'react';
import type { ContextBarHistory } from '#hosts/shared/ContextBar.tsx';
import { createEngineCache } from '#engine/cache.ts';
import { setStandaloneAnalyzerOptionsCommand } from '#engine/commands.ts';
import { nSensitivityAnalyzer } from '#analyzers/n-sensitivity/definition.tsx';
import type { NSensitivityOptions } from '#analyzers/n-sensitivity/options.ts';
import { NSensitivityStandalonePage } from '#hosts/standalone/index.ts';
import { builtinStandaloneCatalog } from './catalog.ts';
import { generateTextId } from './id-generator.ts';
import { useKeydistAssets } from './use-keydist-assets.ts';
import { useDebouncedCommit } from './use-debounced-commit.ts';
import { useTextContentCommit } from './use-text-content-commit.ts';

/**
 * N感度単体ページの組み立て（#544 Phase 3。`StandaloneComparisonApp.tsx`と同じ形）。
 * `EngineCache`はこのAppの生存期間で1つだけ（他の単体ページと別のモジュールscope。
 * `StandaloneComparisonApp.tsx`冒頭コメント参照）。
 */
const engineCache = createEngineCache();

export function StandaloneNSensitivityApp() {
  const { assets, ready, dispatch, getAssets, canUndo, canRedo, undo, redo } = useKeydistAssets();
  const catalog = useMemo(() => builtinStandaloneCatalog(), []);

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
      cache={engineCache}
      catalog={catalog}
      generateTextId={generateTextId}
      history={history}
      onTextContentCommit={commitTextContent}
      onOptionsCommit={commitOptions}
    />
  );
}
