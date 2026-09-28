import { useMemo } from 'react';
import type { ContextBarHistory } from '#hosts/shared/ContextBar.tsx';
import { createEngineCache } from '#engine/cache.ts';
import { setStandaloneAnalyzerOptionsCommand, setTextContentCommand } from '#engine/commands.ts';
import type { TextRef } from '#input/text/selection.ts';
import { comparisonAnalyzer } from '#analyzers/comparison/definition.tsx';
import type { ComparisonOptions } from '#analyzers/comparison/options.ts';
import { ComparisonStandalonePage } from '#hosts/standalone/index.ts';
import { builtinStandaloneCatalog } from './catalog.ts';
import { generateTextId } from './id-generator.ts';
import { useKeydistAssets } from './use-keydist-assets.ts';
import { useDebouncedCommit } from './use-debounced-commit.ts';

/**
 * 比較表単体ページの組み立て（#544 Phase 3。`StandaloneBigramFlowApp.tsx`と同じ形）。
 *
 * `EngineCache`はこのAppの生存期間で1つだけ（モジュールscope）。Bigram Flow単体ページと
 * 別のモジュールscopeなので別インスタンスになるが、どちらも永続化しないメモリキャッシュ
 * （#544 §7）であり、単体ページ間でキャッシュを共有する要求は今のところ無いため
 * （タブをまたいだページ遷移のたびに作り直しても実害が無い規模。`engine/cache.ts`の
 * 「表示中のSetupだけを計算する前提なので大きくしなくてよい」コメント参照）、
 * ここでは`StandaloneBigramFlowApp`と同じパターンをそのまま踏襲する。
 */
const engineCache = createEngineCache();

export function StandaloneComparisonApp() {
  const { assets, ready, dispatch, canUndo, canRedo, undo, redo } = useKeydistAssets();
  const catalog = useMemo(() => builtinStandaloneCatalog(), []);

  const commitComparisonOptions = useDebouncedCommit<ComparisonOptions>(dispatch, {
    commandFor: (options) => setStandaloneAnalyzerOptionsCommand(comparisonAnalyzer.definition.id, options),
  });

  const commitTextContent = useDebouncedCommit<{ ref: TextRef; text: string }>(dispatch, {
    commandFor: ({ ref, text }) => setTextContentCommand('standalone', ref, text, generateTextId),
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
    <ComparisonStandalonePage
      assets={assets}
      assetsReady={ready}
      dispatch={dispatch}
      cache={engineCache}
      catalog={catalog}
      generateTextId={generateTextId}
      history={history}
      onTextContentCommit={commitTextContent}
      onComparisonOptionsCommit={commitComparisonOptions}
    />
  );
}
