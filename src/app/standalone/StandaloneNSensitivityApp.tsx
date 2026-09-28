import { useMemo } from 'react';
import { createEngineCache } from '#engine/cache.ts';
import { setStandaloneAnalyzerOptionsCommand, setTextContentCommand } from '#engine/commands.ts';
import type { TextRef } from '#input/text/selection.ts';
import { nSensitivityAnalyzer } from '#analyzers/n-sensitivity/definition.tsx';
import type { NSensitivityOptions } from '#analyzers/n-sensitivity/options.ts';
import { NSensitivityStandalonePage } from '#hosts/standalone/index.ts';
import { builtinStandaloneCatalog } from './catalog.ts';
import { generateTextId } from './id-generator.ts';
import { useKeydistAssets } from './use-keydist-assets.ts';
import { useDebouncedCommit } from './use-debounced-commit.ts';

/**
 * N感度単体ページの組み立て（#544 Phase 3。`StandaloneComparisonApp.tsx`と同じ形）。
 * `EngineCache`はこのAppの生存期間で1つだけ（他の単体ページと別のモジュールscope。
 * `StandaloneComparisonApp.tsx`冒頭コメント参照）。
 */
const engineCache = createEngineCache();

export function StandaloneNSensitivityApp() {
  const { assets, ready, dispatch } = useKeydistAssets();
  const catalog = useMemo(() => builtinStandaloneCatalog(), []);

  const commitOptions = useDebouncedCommit<NSensitivityOptions>(dispatch, {
    commandFor: (options) => setStandaloneAnalyzerOptionsCommand(nSensitivityAnalyzer.definition.id, options),
  });

  const commitTextContent = useDebouncedCommit<{ ref: TextRef; text: string }>(dispatch, {
    commandFor: ({ ref, text }) => setTextContentCommand('standalone', ref, text, generateTextId),
  });

  return (
    <NSensitivityStandalonePage
      assets={assets}
      assetsReady={ready}
      dispatch={dispatch}
      cache={engineCache}
      catalog={catalog}
      generateTextId={generateTextId}
      onTextContentCommit={commitTextContent}
      onOptionsCommit={commitOptions}
    />
  );
}
