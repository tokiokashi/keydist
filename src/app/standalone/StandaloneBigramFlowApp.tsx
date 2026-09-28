import { useMemo } from 'react';
import { createEngineCache } from '#engine/cache.ts';
import { setStandaloneAnalyzerOptionsCommand, setTextContentCommand } from '#engine/commands.ts';
import type { TextRef } from '#input/text/selection.ts';
import { bigramFlowAnalyzer } from '#analyzers/bigram-flow/definition.tsx';
import type { BigramFlowOptions } from '#analyzers/bigram-flow/options.ts';
import { BigramFlowStandalonePage } from '#hosts/standalone/index.ts';
import { builtinStandaloneCatalog } from './catalog.ts';
import { generateTextId } from './id-generator.ts';
import { useKeydistAssets } from './use-keydist-assets.ts';
import { useDebouncedCommit } from './use-debounced-commit.ts';

/**
 * Bigram Flow単体ページの組み立て（#544 §9「app: 組み立て（platformの注入、Analyzerの
 * 登録）」）。
 *
 * Analyzerの登録は、`hosts/standalone/BigramFlowStandalonePage.tsx`が
 * `#analyzers/bigram-flow/definition.tsx`の`bigramFlowAnalyzer`（ペインに渡すもの。
 * `analyzers/pane-parts.tsx`）を直接importする形のまま。「idから動的に引く」必要が生じた
 * 時点で、`app`側にAnalyzer idごとのレジストリを立てる（先回りして作らない）。
 *
 * `EngineCache`はこのAppの生存期間で1つだけ（モジュールscope）。永続化しない
 * メモリキャッシュなので、ページ遷移をまたいで使い回して問題ない（#544 §7）。
 */
const engineCache = createEngineCache();

export function StandaloneBigramFlowApp() {
  const { assets, ready, dispatch } = useKeydistAssets();
  const catalog = useMemo(() => builtinStandaloneCatalog(), []);

  // 解析設定の書き込みは間引いてから`dispatch`する（`use-debounced-commit.ts`参照。
  // スライダーのような連続操作でstorage書き込み・Undo履歴が埋まらないようにするため）。
  const commitBigramFlowOptions = useDebouncedCommit<BigramFlowOptions>(dispatch, {
    commandFor: (options) => setStandaloneAnalyzerOptionsCommand(bigramFlowAnalyzer.definition.id, options),
  });

  // テキストの本文もdebounceしてから`dispatch`する。値は`{ ref, text }`のペアで運ぶ
  // （`TextControl`の`onTextContentCommit`コメント参照。打鍵時点の対象を明示し、
  // debounce完了時に「今の選択」を読み直して事故る競合を避ける）。
  const commitTextContent = useDebouncedCommit<{ ref: TextRef; text: string }>(dispatch, {
    commandFor: ({ ref, text }) => setTextContentCommand('standalone', ref, text, generateTextId),
  });

  return (
    <BigramFlowStandalonePage
      assets={assets}
      assetsReady={ready}
      dispatch={dispatch}
      cache={engineCache}
      catalog={catalog}
      generateTextId={generateTextId}
      onTextContentCommit={commitTextContent}
      onBigramFlowOptionsCommit={commitBigramFlowOptions}
    />
  );
}
