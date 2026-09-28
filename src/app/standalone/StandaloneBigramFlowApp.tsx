import { useMemo } from 'react';
import { createEngineCache } from '#engine/cache.ts';
import { BigramFlowStandalonePage } from '#hosts/standalone/index.ts';
import { builtinStandaloneCatalog } from './catalog.ts';
import { generateSetupId } from './id-generator.ts';
import { useKeydistAssets } from './use-keydist-assets.ts';

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
  const { assets, dispatch } = useKeydistAssets();
  const catalog = useMemo(() => builtinStandaloneCatalog(), []);

  return (
    <BigramFlowStandalonePage
      assets={assets}
      dispatch={dispatch}
      cache={engineCache}
      catalog={catalog}
      generateSetupId={generateSetupId}
    />
  );
}
