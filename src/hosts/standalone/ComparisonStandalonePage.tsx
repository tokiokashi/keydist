import { useMemo, useRef } from 'react';
import type { Command } from '#input/commands/index.ts';
import { setMultiBaselineCommand, setMultiTargetsCommand, type KeydistAssets } from '#engine/commands.ts';
import type { EngineComputer } from '#engine/computer.ts';
import type { PresetIdGenerator } from '#input/presets/index.ts';
import type { TextIdGenerator } from '#input/text/library.ts';
import { resolveTextSelection } from '#input/text/resolve.ts';
import { comparisonAnalyzer } from '#analyzers/comparison/definition.tsx';
import { comparisonOptions, type ComparisonOptions } from '#analyzers/comparison/options.ts';
import { useStableResolvedText } from '#hosts/shared/stable-resolved-text.ts';
import { ContextBar, type ContextBarHistory } from '#hosts/shared/ContextBar.tsx';
import { TextChip, type TextContentCommit } from '#hosts/shared/TextChip.tsx';
import { DefaultShapeChip } from '#hosts/shared/DefaultShapeChip.tsx';
import { decodeStoredAnalyzerOptions } from '#hosts/shared/decode-analyzer-options.ts';
import { ComparisonPane } from '#hosts/shared/panes/ComparisonPane.tsx';
import type { PaneChrome, PaneEnvironment } from '#hosts/shared/panes/pane-environment.ts';
import type { PaneCatalog } from '#hosts/shared/resolve-pane-input.ts';
import { useLatestCallback } from '#hosts/shared/use-latest-callback.ts';
import { useOptionsDraft } from '#hosts/shared/use-options-draft.ts';
import { effectiveMultiBaseline } from '#engine/multi-target-selection.ts';
import { AddToWorkspaceMenu, type AddToWorkspaceDestination } from '#hosts/shared/AddToWorkspaceMenu.tsx';
import { urlOptionsNotices, useUrlOptions } from './use-url-options.ts';
import { useTargetShareSource, useUrlTargets } from './use-url-targets.ts';
import { encodeMultiTargetsToUrl, hasSharedTargetParams } from './target-share.ts';
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
  readonly cache: EngineComputer;
  readonly catalog: PaneCatalog;
  readonly generateTextId: TextIdGenerator;
  /** `TextChip`の本文debounce書き込み（`app/standalone`がuseDebouncedCommitで組み立てる）。 */
  readonly onTextContentCommit: TextContentCommit;
  /** 資産のコマンド履歴（文脈バーのUndo / Redo）。`app` が組み立てる。 */
  readonly history: ContextBarHistory;
  /** プリセットの新しいidの発行（条件のモーダルのプリセットの節が使う）。 */
  readonly generatePresetId: PresetIdGenerator;
  readonly onComparisonOptionsCommit: (options: ComparisonOptions) => void;
  /**
   * 見出しの「Workspaceに追加」で送り先を選んだ時。今の解析設定（`options`）を添えて渡す。
   * 書き込みと通知は組み立て側（`app`）が持つ。
   */
  readonly onAddToWorkspace: (destination: AddToWorkspaceDestination, options: unknown) => void;
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
  generatePresetId,
  onAddToWorkspace,
}: ComparisonStandalonePageProps) {
  const resolvedText = useStableResolvedText(useMemo(
    () => resolveTextSelection(assets.standaloneTextSelection, assets.textLibrary),
    [assets.standaloneTextSelection, assets.textLibrary],
  ));

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

  // URL経由で対象（集合と基準）を受け取る（`use-url-targets.ts`）。
  const shareSource = useTargetShareSource(catalog, assets.setupLibrary.setups);
  const targetNotices = useUrlTargets({ kind: 'multi', assetsReady, source: shareSource, dispatch });

  const undo = useLatestCallback(history.undo);
  const env: PaneEnvironment = useMemo(() => ({
    setups: assets.setupLibrary.setups,
    overrides: assets.setupLibrary.overrides,
    catalog,
    resolvedText,
    cache,
    dispatch,
    presetLibrary: assets.presetLibrary,
    generatePresetId,
    undo,
    assetsReady,
  }), [assets.setupLibrary, assets.presetLibrary, catalog, resolvedText, cache, dispatch, generatePresetId, undo, assetsReady]);

  const changeOptions = (next: ComparisonOptions) => {
    setOptionsDraft(next);
    onComparisonOptionsCommit(next);
  };

  // 共有リンクで対象が届く間は、空の対象の選択を自動で開かない。開くかの判断は資産の読み込み後の
  // 最初の描画で1回だけ決まるので、その時点のURLを一度だけ読んで保持する（取り込み後にURLから
  // パラメータが消えても、判断を「開く」へ戻さない）。`window`はブラウザでだけ読む。
  const sharedTargetsAtReadyRef = useRef<boolean | undefined>(undefined);
  if (assetsReady && sharedTargetsAtReadyRef.current === undefined) {
    sharedTargetsAtReadyRef.current = hasSharedTargetParams(window.location.search, 'multi');
  }
  const baseChrome: PaneChrome = sharedTargetsAtReadyRef.current === true
    ? { ...STANDALONE_CHROME, holdTargetSelectionClosed: true }
    : STANDALONE_CHROME;
  const chrome: PaneChrome = {
    ...baseChrome,
    headerAction: (
      <AddToWorkspaceMenu workspaces={assets.workspaces} onAdd={(destination) => onAddToWorkspace(destination, optionsDraft)} />
    ),
  };

  return (
    <div className="standalone-page">
      <ContextBar
        disabled={!assetsReady}
        history={history}
        share={{
          description: '今の対象と解析設定を含むこの画面のURLをコピーする',
          query: () => {
            const params = comparisonOptions.encodeOptionsToUrl(optionsDraft);
            const selection = assets.multiTargetSelection;
            encodeMultiTargetsToUrl(selection.targets, effectiveMultiBaseline(selection), shareSource)
              .forEach((value, key) => params.append(key, value));
            return params;
          },
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
            chrome={chrome}
            selection={assets.multiTargetSelection}
            onTargetsChange={(next) => dispatch(setMultiTargetsCommand(next))}
            onBaselineChange={(next) => dispatch(setMultiBaselineCommand(next))}
            options={optionsDraft}
            onOptionsChange={changeOptions}
            settingsDiagnostics={decoded.diagnostics}
            linkNotices={[...urlOptionsNotices(urlDiagnostics), ...targetNotices]}
          />
        </div>
      </fieldset>
    </div>
  );
}
