import { useMemo } from 'react';
import type { ContextBarHistory } from '#hosts/shared/ContextBar.tsx';
import { setStandaloneAnalyzerOptionsCommand } from '#engine/commands.ts';
import { bigramFlowAnalyzer } from '#analyzers/bigram-flow/definition.tsx';
import type { BigramFlowOptions } from '#analyzers/bigram-flow/options.ts';
import { BigramFlowStandalonePage } from '#hosts/standalone/index.ts';
import { builtinPaneCatalog } from './catalog.ts';
import { sharedEngineComputer } from './engine-computer.ts';
import { generatePresetId, generateTextId } from './id-generator.ts';
import { useKeydistAssets } from './use-keydist-assets.ts';
import { useDebouncedCommit } from './use-debounced-commit.ts';
import { useTextContentCommit } from './use-text-content-commit.ts';

/**
 * Bigram Flow単体ページの組み立て（#544 §9「app: 組み立て（platformの注入、Analyzerの
 * 登録）」）。
 *
 * Analyzerの登録は、`hosts/standalone/BigramFlowStandalonePage.tsx`が
 * `#analyzers/bigram-flow/definition.tsx`の`bigramFlowAnalyzer`（ペインに渡すもの。
 * `analyzers/pane-parts.tsx`）を直接importする形のまま。「idから動的に引く」必要が生じた
 * 時点で、`app`側にAnalyzer idごとのレジストリを立てる（先回りして作らない）。
 *
 * 計算の窓口は他の単体ページと共有する（`engine-computer.ts`。ブラウザではWorker）。
 */
export function StandaloneBigramFlowApp() {
  const { assets, ready, dispatch, getAssets, canUndo, canRedo, undo, redo } = useKeydistAssets();
  const catalog = useMemo(() => builtinPaneCatalog(), []);

  // 解析設定の書き込みは間引いてから`dispatch`する（`use-debounced-commit.ts`参照。
  // スライダーのような連続操作でstorage書き込み・Undo履歴が埋まらないようにするため）。
  const commitBigramFlowOptions = useDebouncedCommit<BigramFlowOptions>(dispatch, {
    commandFor: (options) => setStandaloneAnalyzerOptionsCommand(bigramFlowAnalyzer.definition.id, options),
  });

  // テキストの本文もdebounceしてから`dispatch`する。値は`{ ref, text }`のペアで運ぶ
  // （`TextChip`の`onTextContentCommit`コメント参照。打鍵時点の対象を明示し、
  // debounce完了時に「今の選択」を読み直して事故る競合を避ける）。
  const commitTextContent = useTextContentCommit(dispatch, getAssets, generateTextId);

  // 間引き待ちの変更を先に書いてから戻す。待ち中の値を残したまま戻すと、戻した後にその値が
  // 書かれて、戻したはずの変更がまた入るため。
  const history: ContextBarHistory = {
    canUndo,
    canRedo,
    undo: () => {
      commitTextContent.flush();
      commitBigramFlowOptions.flush();
      undo();
    },
    redo: () => {
      commitTextContent.flush();
      commitBigramFlowOptions.flush();
      redo();
    },
  };

  return (
    <BigramFlowStandalonePage
      assets={assets}
      assetsReady={ready}
      dispatch={dispatch}
      cache={sharedEngineComputer}
      catalog={catalog}
      generateTextId={generateTextId}
      generatePresetId={generatePresetId}
      history={history}
      onTextContentCommit={commitTextContent}
      onBigramFlowOptionsCommit={commitBigramFlowOptions}
    />
  );
}
