import { useMemo } from 'react';
import type { Command } from '#input/commands/index.ts';
import { setMultiBaselineCommand, setMultiTargetsCommand, type KeydistAssets } from '#engine/commands.ts';
import type { EngineCache } from '#engine/cache.ts';
import type { TextIdGenerator } from '#input/text/library.ts';
import { resolveTextSelection } from '#input/text/resolve.ts';
import { comparisonAnalyzer } from '#analyzers/comparison/definition.tsx';
import { comparisonOptions, type ComparisonOptions } from '#analyzers/comparison/options.ts';
import { ContextBar, type ContextBarHistory } from '#hosts/shared/ContextBar.tsx';
import { TextChip, type TextContentCommit } from '#hosts/shared/TextChip.tsx';
import { DefaultShapeChip } from '#hosts/shared/DefaultShapeChip.tsx';
import { decodeStoredAnalyzerOptions } from '#hosts/shared/decode-analyzer-options.ts';
import { ComparisonPane } from '#hosts/shared/panes/ComparisonPane.tsx';
import type { PaneChrome, PaneEnvironment } from '#hosts/shared/panes/pane-environment.ts';
import type { PaneCatalog } from '#hosts/shared/resolve-pane-input.ts';
import { useOptionsDraft } from '#hosts/shared/use-options-draft.ts';
import { useUrlOptions } from './use-url-options.ts';
import './standalone.css';

/**
 * 比較表の単体ページ（#544 Phase 3「集合を対象にする最初のAnalyzer（比較表）と、
 * その単体ページ」、#578指摘1「対象を配列かSetupにする」）。ペインは1枚だけで、Workspaceのペインと
 * 同じcomponent（`hosts/shared/panes/ComparisonPane.tsx`）を使う。
 *
 * 対象は**配列かSetupの集合**（用語表「対象」）。集合（選んだ対象・色・基準）は
 * MultiのAnalyzerが共有する資産（`assets.multiTargetSelection`。#663）が持ち、
 * 書き込みはすべて`dispatch`を経由する
 * （`BigramFlowStandalonePage.tsx`と同じ形。#544 §8-2）。テキストは単体ページ全体で
 * 共有の「最後に使ったテキスト」を使う（#544 §5）。
 *
 * 配列は常に選べる（組み込みカタログに最初から入っている）ため、旧`use-ensure-setup.ts`の
 * ような「手持ちが空なら初期Setupを作る」副作用は無くなった。
 */
export interface ComparisonStandalonePageProps {
  readonly assets: KeydistAssets;
  readonly assetsReady: boolean;
  readonly dispatch: (command: Command<KeydistAssets>) => void;
  readonly cache: EngineCache;
  readonly catalog: PaneCatalog;
  readonly generateTextId: TextIdGenerator;
  /** `TextChip`の本文debounce書き込み（`app/standalone`がuseDebouncedCommitで組み立てる）。 */
  readonly onTextContentCommit: TextContentCommit;
  /** 資産のコマンド履歴（文脈バーのUndo / Redo）。`app` が組み立てる。 */
  readonly history: ContextBarHistory;
  readonly onComparisonOptionsCommit: (options: ComparisonOptions) => void;
}

const ANALYZER_ID = comparisonAnalyzer.definition.id;

/** 個別画面のペインの枠まわり。ペインのAnalyzer名がページのh1で、見出しを文脈バーの下に固定する。 */
const STANDALONE_CHROME: PaneChrome = { headingLevel: 1, stickyHeader: true, autoOpenTargetSelection: true };

export function ComparisonStandalonePage({
  assets,
  assetsReady,
  dispatch,
  cache,
  catalog,
  generateTextId,
  onTextContentCommit,
  onComparisonOptionsCommit,
  history,
}: ComparisonStandalonePageProps) {
  const resolvedText = useMemo(
    () => resolveTextSelection(assets.standaloneTextSelection, assets.textLibrary),
    [assets.standaloneTextSelection, assets.textLibrary],
  );

  // 解析設定（列の表示・基準比の表示可否）は資産（standaloneAnalyzerOptions）が正
  // （BigramFlowStandalonePageと同じ形）。
  const storedOptionsRaw = assets.standaloneAnalyzerOptions[ANALYZER_ID];
  const decoded = useMemo(
    () => decodeStoredAnalyzerOptions(comparisonAnalyzer.definition, storedOptionsRaw),
    [storedOptionsRaw],
  );
  // `BigramFlowStandalonePage`と同じ形: 見た目は即座に反映しつつ（controlled）、
  // 資産への書き込みは呼び出し側がdebounceする（`onComparisonOptionsCommit`）。
  const [optionsDraft, setOptionsDraft] = useOptionsDraft<ComparisonOptions>(decoded.options);
  // URL経由で解析設定を受け取る（共有リンク。`use-url-options.ts`）。対象は載らない。
  const urlDiagnostics = useUrlOptions({
    analyzerId: ANALYZER_ID,
    optionsDefinition: comparisonOptions,
    currentOptions: decoded.options,
    assetsReady,
    dispatch,
    setOptionsDraft,
  });

  const env: PaneEnvironment = useMemo(() => ({
    setups: assets.setupLibrary.setups,
    overrides: assets.setupLibrary.overrides,
    catalog,
    resolvedText,
    cache,
    assetsReady,
  }), [assets.setupLibrary, catalog, resolvedText, cache, assetsReady]);

  const changeOptions = (next: ComparisonOptions) => {
    setOptionsDraft(next);
    onComparisonOptionsCommit(next);
  };

  return (
    <div className="standalone-page">
      <ContextBar
        disabled={!assetsReady}
        history={history}
        share={{
          description: '今の解析設定を含むこの画面のURLをコピーする',
          query: () => comparisonOptions.encodeOptionsToUrl(optionsDraft),
        }}
      >
        <TextChip
          holder="standalone"
          textLibrary={assets.textLibrary}
          selection={assets.standaloneTextSelection}
          dispatch={dispatch}
          generateTextId={generateTextId}
          onTextContentCommit={onTextContentCommit}
        />
        <DefaultShapeChip
          overrides={assets.setupLibrary.overrides}
          dispatch={dispatch}
          shapes={catalog.setupCatalog.shapes}
        />
      </ContextBar>
      {/* プリレンダーされたページはハイドレーション完了まで操作を効かせない（レビュー指摘1）。 */}
      <fieldset
        disabled={!assetsReady}
        style={{ display: 'contents', border: 0, padding: 0, margin: 0, minWidth: 0 }}
      >
        <div className="standalone-stage">
          <ComparisonPane
            env={env}
            chrome={STANDALONE_CHROME}
            selection={assets.multiTargetSelection}
            onTargetsChange={(next) => dispatch(setMultiTargetsCommand(next))}
            onBaselineChange={(next) => dispatch(setMultiBaselineCommand(next))}
            options={optionsDraft}
            onOptionsChange={changeOptions}
            settingsDiagnostics={[...decoded.diagnostics, ...urlDiagnostics]}
          />
        </div>
      </fieldset>
    </div>
  );
}
