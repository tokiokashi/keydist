import { useMemo } from 'react';
import { createEngineCache } from '#engine/cache.ts';
import { setStandaloneAnalyzerOptionsCommand, setTextContentCommand } from '#engine/commands.ts';
import type { TextRef } from '#input/text/selection.ts';
import { bigramFlowAnalyzer } from '#analyzers/bigram-flow/definition.tsx';
import type { BigramFlowOptions } from '#analyzers/bigram-flow/options.ts';
import { BigramFlowStandalonePage } from '#hosts/standalone/index.ts';
import { builtinStandaloneCatalog } from './catalog.ts';
import { generateSetupId, generateTextId } from './id-generator.ts';
import { useKeydistAssets } from './use-keydist-assets.ts';
import { useDebouncedCommit } from './use-debounced-commit.ts';

/**
 * Bigram Flow単体ページの組み立て（#544 §9「app: 組み立て（platformの注入、Analyzerの
 * 登録）」）。
 *
 * Analyzerの登録は、この作業単位では`hosts/standalone/BigramFlowStandalonePage.tsx`が
 * `#analyzers/bigram-flow/definition.tsx`の`bigramFlowAnalyzer`（`{ definition, View }`。
 * 前作業単位からある形）を直接importする、選択肢(a)「そのまま」を採る。Analyzerが
 * 1つしか無い段階でレジストリ（選択肢(c)）を作っても、キーと値が1組しか無いレジストリを
 * 正当化する使い手が無い（AGENTS.md「設定項目を足すか決める」と同じ「先回りして足さない」
 * 判断）。次のAnalyzer（比較表など、#544 Phase 3残り）が単体ページかWorkspaceのどちらかで
 * 「idから動的に引く」必要が生じた時点で、`app`側にAnalyzer idごとのレジストリを立てる
 * （定義と可視化を分けて持つ理由が無ければ選択肢(b)は採らない）。
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
      generateSetupId={generateSetupId}
      generateTextId={generateTextId}
      onTextContentCommit={commitTextContent}
      onBigramFlowOptionsCommit={commitBigramFlowOptions}
    />
  );
}
