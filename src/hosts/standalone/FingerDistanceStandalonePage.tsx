import { useMemo } from 'react';
import type { Command } from '#input/commands/index.ts';
import { setSingleTargetCommand, type KeydistAssets } from '#engine/commands.ts';
import { effectiveSingleTarget } from '#engine/single-target-selection.ts';
import { layoutIdsOfTargets } from '#input/setup/index.ts';
import { resolveTextSelection } from '#input/text/resolve.ts';
import type { PresetIdGenerator } from '#input/presets/index.ts';
import type { TextIdGenerator } from '#input/text/library.ts';
import type { EngineComputer } from '#engine/computer.ts';
import { fingerDistanceAnalyzer } from '#analyzers/finger-distance/definition.tsx';
import { fingerDistanceOptions, type FingerDistanceOptions } from '#analyzers/finger-distance/options.ts';
import { useStableResolvedText } from '#hosts/shared/stable-resolved-text.ts';
import { ContextBar, type ContextBarHistory } from '#hosts/shared/ContextBar.tsx';
import { TextChip, type TextContentCommit } from '#hosts/shared/TextChip.tsx';
import { DefaultShapeChip } from '#hosts/shared/DefaultShapeChip.tsx';
import { decodeStoredAnalyzerOptions } from '#hosts/shared/decode-analyzer-options.ts';
import { FingerDistancePane } from '#hosts/shared/panes/FingerDistancePane.tsx';
import type { PaneChrome, PaneEnvironment } from '#hosts/shared/panes/pane-environment.ts';
import type { PaneCatalog } from '#hosts/shared/resolve-pane-input.ts';
import { useLatestCallback } from '#hosts/shared/use-latest-callback.ts';
import { useOptionsDraft } from '#hosts/shared/use-options-draft.ts';
import { STANDALONE_WRITE_LOG_KEY } from '#hosts/shared/options-write-log.ts';
import { AddToWorkspaceMenu, type AddToWorkspaceDestination } from '#hosts/shared/AddToWorkspaceMenu.tsx';
import { urlOptionsNotices, useSharedLink, useTargetShareSource } from './use-shared-link.ts';
import { describeShareEncodeNotice, encodeSingleTargetToUrl } from './target-share.ts';
import './standalone.css';

/**
 * 指ごとの距離の単体ページ。ペインは1枚だけで、Workspaceのペインと
 * 同じcomponent（`hosts/shared/panes/FingerDistancePane.tsx`）を使う。ここが持つのは個別画面の器の
 * 部分（文脈バー・共有のテキスト・URLからの解析設定の取り込み）と、値の持ち主（資産）への結び付け。
 *
 * 対象（配列かSetup）は1つ、テキストは単体ページ全体で共有の
 * 「最後に使ったテキスト」を使う。書き込みはすべて`dispatch`（呼び出し元の`app`が組み立てた
 * コマンド適用 + 永続化）を経由する。ここでは`applyCommand`もstorageも
 * 直接触らない。
 */
export interface FingerDistanceStandalonePageProps {
  readonly assets: KeydistAssets;
  /**
   * `assets`が資産（storage）からの初回読み込みを終えているか（`useKeydistAssets`の
   * `ready`）。URLパラメータを既存の解析設定へ
   * 部分マージする処理は、この読み込みより前に走ると既存の値を初期値へ巻き戻して
   * しまうため、`ready`になるまで待つ。
   */
  readonly assetsReady: boolean;
  readonly dispatch: (command: Command<KeydistAssets>) => void;
  readonly cache: EngineComputer;
  readonly catalog: PaneCatalog;
  readonly generateTextId: TextIdGenerator;
  /** `TextChip`の本文debounce書き込み（`app/standalone`がuseDebouncedCommitで組み立てる）。 */
  readonly onTextContentCommit: TextContentCommit;
  /**
   * 解析設定の変更を資産へ反映する（間引き済み。`app/standalone/use-debounced-commit.ts`
   * 参照）。`dispatch`を直接使わないのは、`hosts`が`platform`をimportできず
   * （依存規則）debounce自体をここへ持てないため。
   */
  readonly onFingerDistanceOptionsCommit: (options: FingerDistanceOptions) => void;
  /** 資産のコマンド履歴（文脈バーのUndo / Redo）。`app` が組み立てる。 */
  readonly history: ContextBarHistory;
  /** プリセットの新しいidの発行（条件のモーダルのプリセットの節が使う）。 */
  readonly generatePresetId: PresetIdGenerator;
  /**
   * 見出しの「Workspaceに追加」で送り先を選んだ時。今の解析設定（`options`）を添えて渡す。
   * 書き込みと通知は組み立て側（`app`）が持つ。
   */
  readonly onAddToWorkspace: (destination: AddToWorkspaceDestination, options: unknown) => void;
}

/** 個別画面のペインの枠まわり。ペインのAnalyzer名がページのh1で、見出しを文脈バーの下に固定する。 */
const STANDALONE_CHROME: PaneChrome = { headingLevel: 1, stickyHeader: true, autoOpenTargetSelection: true };

export function FingerDistanceStandalonePage({
  assets,
  assetsReady,
  dispatch,
  cache,
  catalog,
  generateTextId,
  onTextContentCommit,
  onFingerDistanceOptionsCommit,
  history,
  generatePresetId,
  onAddToWorkspace,
}: FingerDistanceStandalonePageProps) {
  // 対象（`AnalysisTarget`）はSingleのAnalyzerが共有する資産（`singleTargetSelection`）が正。
  // まだ選んでいなければ既定の配列を使う（`effectiveSingleTarget`）。
  const analyzerId = fingerDistanceAnalyzer.definition.id;
  const target = effectiveSingleTarget(assets.singleTargetSelection);

  // テキストは資産（textLibrary + standaloneTextSelection）が正。編集・選択・複製・削除は
  // すべて共有部品`TextChip`（文脈バーのテキストのチップ。比較表・N感度と3ページで同じ操作を持つため）。
  const resolvedText = useStableResolvedText(useMemo(
    () => resolveTextSelection(assets.standaloneTextSelection, assets.textLibrary),
    [assets.standaloneTextSelection, assets.textLibrary],
  ));

  // 解析設定は資産（assets.standaloneAnalyzerOptions）が正で、ページはローカルには持たない。`optionsDraft`はtextDraftと同じ形の
  // UI用の一時状態: 見た目は即座に反映しつつ（controlled）、資産への書き込みは
  // `onFingerDistanceOptionsCommit`（呼び出し元がdebounceする）経由にする。
  const storedOptionsRaw = assets.standaloneAnalyzerOptions[analyzerId];
  const decoded = useMemo(
    () => decodeStoredAnalyzerOptions(fingerDistanceAnalyzer.definition, storedOptionsRaw),
    [storedOptionsRaw],
  );
  const [optionsDraft, setOptionsDraft] = useOptionsDraft<FingerDistanceOptions>(decoded.options, STANDALONE_WRITE_LOG_KEY);

  // URL経由で解析設定と対象を受け取る（共有リンク。`use-shared-link.ts`）。書き込みは1つのコマンドで、Undo 1回で戻る。
  const shareSource = useTargetShareSource(catalog, assets.setupLibrary.setups);
  const { optionDiagnostics: urlDiagnostics, targetNotices } = useSharedLink({
    analyzerId: analyzerId,
    optionsDefinition: fingerDistanceOptions,
    currentOptions: decoded.options,
    kind: 'single',
    assetsReady,
    source: shareSource,
    dispatch,
    setOptionsDraft,
  });

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

  const changeOptions = (next: FingerDistanceOptions) => {
    setOptionsDraft(next);
    onFingerDistanceOptionsCommit(next);
  };

  const chrome: PaneChrome = {
    ...STANDALONE_CHROME,
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
            const params = fingerDistanceOptions.encodeOptionsToUrl(optionsDraft);
            const encoded = encodeSingleTargetToUrl(target, shareSource);
            encoded.params.forEach((value, key) => params.append(key, value));
            return { params, notices: describeShareEncodeNotice(encoded.notice) };
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
          layoutIds={layoutIdsOfTargets([target])}
          layouts={catalog.setupCatalog.layouts}
        />
      </ContextBar>
      {/*
       * プリレンダーされたHTMLはハイドレーション前から操作できてしまう。
       * ハイドレーション完了までの約750〜850msの間にクリック・入力すると、見た目は
       * 変わっても実際には何も起きず、そのまま消える。加えてプリレンダー時点のDOMは
       * `initialAssets()`＝ユーザーの保存済み資産ではない。`assetsReady`が経由する
       * `useKeydistAssets`はハイドレーション後にstorageを読み終えてからtrueになるので、
       * それまでは操作系を丸ごと`disabled`にして「触れるが効かない」状態を作らない。
       * `display:contents`でレイアウトへの影響を無くす（fieldsetは既定でblock）。
       */}
      <fieldset
        disabled={!assetsReady}
        style={{ display: 'contents', border: 0, padding: 0, margin: 0, minWidth: 0 }}
      >
        <div className="standalone-stage">
          <FingerDistancePane
            env={env}
            chrome={chrome}
            target={target}
            onTargetChange={(next) => dispatch(setSingleTargetCommand(next))}
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
