import { useMemo } from 'react';
import type { ContextBarHistory } from '#hosts/shared/ContextBar.tsx';
import { setStandaloneAnalyzerOptionsCommand } from '#engine/commands.ts';
import { fingerDistanceAnalyzer } from '#analyzers/finger-distance/definition.tsx';
import type { FingerDistanceOptions } from '#analyzers/finger-distance/options.ts';
import { FingerDistanceStandalonePage } from '#hosts/standalone/index.ts';
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
 * 指ごとの距離の単体ページの組み立て（platformの注入、Analyzerの
 * 登録）。
 *
 * Analyzerの登録は、`hosts/standalone/FingerDistanceStandalonePage.tsx`が
 * `#analyzers/finger-distance/definition.tsx`の`fingerDistanceAnalyzer`（ペインに渡すもの。
 * `analyzers/pane-parts.tsx`）を直接importする形のまま。「idから動的に引く」必要が生じた
 * 時点で、`app`側にAnalyzer idごとのレジストリを立てる（先回りして作らない）。
 *
 * 計算の窓口は他の単体ページと共有する（`engine-computer.ts`。ブラウザではWorker）。
 */
export function StandaloneFingerDistanceApp() {
  const { assets, ready, dispatch, getAssets, canUndo, canRedo, undo, redo } = useKeydistAssets();
  const catalog = useMemo(() => builtinPaneCatalog(), []);

  // 解析設定の書き込みは間引いてから`dispatch`する（`use-debounced-commit.ts`参照。
  // スライダーのような連続操作でstorage書き込み・Undo履歴が埋まらないようにするため）。
  // 保存先へ書いた値を記録し、解析設定の下書きが自分の保存の反響を見分けるのに使う
  const writeLogs = useMemo(createOptionsWriteLogs, []);
  const commitFingerDistanceOptions = useDebouncedCommit<FingerDistanceOptions>(dispatch, {
    onWrite: (options) => writeLogs.forKey(STANDALONE_WRITE_LOG_KEY).record(options),
    commandFor: (options) => setStandaloneAnalyzerOptionsCommand(fingerDistanceAnalyzer.definition.id, options),
  });

  // テキストの本文もdebounceしてから`dispatch`する。値は`{ ref, text }`のペアで運ぶ
  // （`TextChip`の`onTextContentCommit`コメント参照。打鍵時点の対象を明示し、
  // debounce完了時に「今の選択」を読み直して事故る競合を避ける）。
  const commitTextContent = useTextContentCommit(dispatch, getAssets, generateTextId);

  const addToWorkspace = useAddToWorkspace(fingerDistanceAnalyzer.definition.id, dispatch, getAssets, () => {
    commitTextContent.flush();
    commitFingerDistanceOptions.flush();
  });

  // 間引き待ちの変更を先に書いてから戻す。待ち中の値を残したまま戻すと、戻した後にその値が
  // 書かれて、戻したはずの変更がまた入るため。
  const history: ContextBarHistory = {
    canUndo,
    canRedo,
    undo: () => {
      commitTextContent.flush();
      commitFingerDistanceOptions.flush();
      undo();
    },
    redo: () => {
      commitTextContent.flush();
      commitFingerDistanceOptions.flush();
      redo();
    },
  };

  return (
    <OptionsWriteLogsProvider logs={writeLogs}>
      <FingerDistanceStandalonePage
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
        onFingerDistanceOptionsCommit={commitFingerDistanceOptions}
      />
    </OptionsWriteLogsProvider>
  );
}
