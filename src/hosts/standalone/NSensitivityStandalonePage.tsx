import { useMemo, useRef } from 'react';
import type { Command } from '#input/commands/index.ts';
import { setMultiTargetsCommand, type KeydistAssets } from '#engine/commands.ts';
import type { EngineComputer } from '#engine/computer.ts';
import { layoutIdsOfTargets } from '#input/setup/index.ts';
import type { PresetIdGenerator } from '#input/presets/index.ts';
import type { TextIdGenerator } from '#input/text/library.ts';
import { resolveTextSelection } from '#input/text/resolve.ts';
import { nSensitivityAnalyzer } from '#analyzers/n-sensitivity/definition.tsx';
import { nSensitivityOptions, type NSensitivityOptions } from '#analyzers/n-sensitivity/options.ts';
import { useStableResolvedText } from '#hosts/shared/stable-resolved-text.ts';
import { ContextBar, type ContextBarHistory } from '#hosts/shared/ContextBar.tsx';
import { TextChip, type TextContentCommit } from '#hosts/shared/TextChip.tsx';
import { DefaultShapeChip } from '#hosts/shared/DefaultShapeChip.tsx';
import { decodeStoredAnalyzerOptions } from '#hosts/shared/decode-analyzer-options.ts';
import { NSensitivityPane } from '#hosts/shared/panes/NSensitivityPane.tsx';
import type { PaneChrome, PaneEnvironment } from '#hosts/shared/panes/pane-environment.ts';
import type { PaneCatalog } from '#hosts/shared/resolve-pane-input.ts';
import { useMultiColorSlots } from '#hosts/shared/use-set-target-selection.ts';
import { useLatestCallback } from '#hosts/shared/use-latest-callback.ts';
import { useOptionsDraft } from '#hosts/shared/use-options-draft.ts';
import { STANDALONE_WRITE_LOG_KEY } from '#hosts/shared/options-write-log.ts';
import { effectiveMultiBaseline } from '#engine/multi-target-selection.ts';
import { AddToWorkspaceMenu, type AddToWorkspaceDestination } from '#hosts/shared/AddToWorkspaceMenu.tsx';
import { urlOptionsNotices, useUrlOptions } from './use-url-options.ts';
import { useTargetShareSource, useUrlTargets } from './use-url-targets.ts';
import { encodeMultiTargetsToUrl, hasSharedTargetParams } from './target-share.ts';
import './standalone.css';

/**
 * N感度の単体ページ（#544 Phase 3「N感度」、#578指摘1「対象を配列かSetupにする」）。
 * `ComparisonStandalonePage.tsx`と同じ形（対象は配列かSetupの**集合**。書き込みは`dispatch`を経由する）。
 * ペインは1枚だけで、Workspaceのペインと同じcomponent（`hosts/shared/panes/NSensitivityPane.tsx`）を使う。
 *
 * 集合はMultiのAnalyzerが共有する`assets.multiTargetSelection`（`engine/multi-target-selection.ts`。
 * #663）。比較表で選んだ基準も集合に入っているが、このページは基準を使わないので触らない
 * （基準の対象をここで外しても記録は残り、比較表では効く基準が無くなる。付け直すと戻る）。
 */
export interface NSensitivityStandalonePageProps {
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
  readonly onOptionsCommit: (options: NSensitivityOptions) => void;
  /**
   * 見出しの「Workspaceに追加」で送り先を選んだ時。今の解析設定（`options`）を添えて渡す。
   * 書き込みと通知は組み立て側（`app`）が持つ。
   */
  readonly onAddToWorkspace: (destination: AddToWorkspaceDestination, options: unknown) => void;
}

const ANALYZER_ID = nSensitivityAnalyzer.definition.id;

/** 個別画面のペインの枠まわり。ペインのAnalyzer名がページのh1で、見出しを文脈バーの下に固定する。 */
const STANDALONE_CHROME: PaneChrome = { headingLevel: 1, stickyHeader: true, autoOpenTargetSelection: true };

export function NSensitivityStandalonePage({
  assets,
  assetsReady,
  dispatch,
  cache,
  catalog,
  generateTextId,
  onTextContentCommit,
  onOptionsCommit,
  history,
  generatePresetId,
  onAddToWorkspace,
}: NSensitivityStandalonePageProps) {
  const resolvedText = useStableResolvedText(useMemo(
    () => resolveTextSelection(assets.standaloneTextSelection, assets.textLibrary),
    [assets.standaloneTextSelection, assets.textLibrary],
  ));

  const storedOptionsRaw = assets.standaloneAnalyzerOptions[ANALYZER_ID];
  const decoded = useMemo(
    () => decodeStoredAnalyzerOptions(nSensitivityAnalyzer.definition, storedOptionsRaw),
    [storedOptionsRaw],
  );
  const [optionsDraft, setOptionsDraft] = useOptionsDraft<NSensitivityOptions>(decoded.options, STANDALONE_WRITE_LOG_KEY);
  // URL経由で解析設定を受け取る（共有リンク。`use-url-options.ts`）。対象は載らない。
  const urlDiagnostics = useUrlOptions({
    analyzerId: ANALYZER_ID,
    optionsDefinition: nSensitivityOptions,
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

  const changeOptions = (next: NSensitivityOptions) => {
    setOptionsDraft(next);
    onOptionsCommit(next);
  };

  // 共有リンクで対象が届く間は、空の対象の選択を自動で開かない。開くかの判断は資産の読み込み後の
  // 最初の描画で1回だけ決まるので、その時点のURLを一度だけ読んで保持する（取り込み後にURLから
  // パラメータが消えても、判断を「開く」へ戻さない）。`window`はブラウザでだけ読む。
  const sharedTargetsAtReadyRef = useRef<boolean | undefined>(undefined);
  if (assetsReady && sharedTargetsAtReadyRef.current === undefined) {
    sharedTargetsAtReadyRef.current = hasSharedTargetParams(window.location.search, 'multi');
  }
  const colorSlots = useMultiColorSlots(assets.multiTargetSelection);
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
            const params = nSensitivityOptions.encodeOptionsToUrl(optionsDraft);
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
          layoutIds={layoutIdsOfTargets(assets.multiTargetSelection.targets)}
          layouts={catalog.setupCatalog.layouts}
        />
      </ContextBar>
      {/* プリレンダーされたページはハイドレーション完了まで操作を効かせない（レビュー指摘1）。 */}
      <fieldset
        disabled={!assetsReady}
        style={{ display: 'contents', border: 0, padding: 0, margin: 0, minWidth: 0 }}
      >
        <div className="standalone-stage">
          <NSensitivityPane
            env={env}
            chrome={chrome}
            selection={assets.multiTargetSelection}
            colorSlots={colorSlots}
            onTargetsChange={(next) => dispatch(setMultiTargetsCommand(next))}
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
