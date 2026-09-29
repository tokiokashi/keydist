import { useMemo } from 'react';
import type { Command } from '#input/commands/index.ts';
import { setSingleTargetCommand, type KeydistAssets } from '#engine/commands.ts';
import { effectiveSingleTarget } from '#engine/single-target-selection.ts';
import { resolveTextSelection } from '#input/text/resolve.ts';
import type { TextIdGenerator } from '#input/text/library.ts';
import type { EngineCache } from '#engine/cache.ts';
import { bigramFlowAnalyzer } from '#analyzers/bigram-flow/definition.tsx';
import { bigramFlowOptions, type BigramFlowOptions } from '#analyzers/bigram-flow/options.ts';
import { ContextBar, type ContextBarHistory } from '#hosts/shared/ContextBar.tsx';
import { TextChip, type TextContentCommit } from '#hosts/shared/TextChip.tsx';
import { DefaultShapeChip } from '#hosts/shared/DefaultShapeChip.tsx';
import { decodeStoredAnalyzerOptions } from '#hosts/shared/decode-analyzer-options.ts';
import { BigramFlowPane } from '#hosts/shared/panes/BigramFlowPane.tsx';
import type { PaneChrome, PaneEnvironment } from '#hosts/shared/panes/pane-environment.ts';
import type { PaneCatalog } from '#hosts/shared/resolve-pane-input.ts';
import { useOptionsDraft } from '#hosts/shared/use-options-draft.ts';
import { useUrlOptions } from './use-url-options.ts';
import './standalone.css';

/**
 * Bigram Flowの単体ページ（#544 Phase 3「最初の縦切り」）。ペインは1枚だけで、Workspaceのペインと
 * 同じcomponent（`hosts/shared/panes/BigramFlowPane.tsx`）を使う。ここが持つのは個別画面の器の
 * 部分（文脈バー・共有のテキスト・URLからの解析設定の取り込み）と、値の持ち主（資産）への結び付け。
 *
 * 対象（配列かSetup。#578指摘1）は1つ、テキストは単体ページ全体で共有の
 * 「最後に使ったテキスト」を使う
 * （#544 §5・§6）。書き込みはすべて`dispatch`（呼び出し元の`app`が組み立てた
 * コマンド適用 + 永続化）を経由する（#544 §8-2）。ここでは`applyCommand`もstorageも
 * 直接触らない。
 */
export interface BigramFlowStandalonePageProps {
  readonly assets: KeydistAssets;
  /**
   * `assets`が資産（storage）からの初回読み込みを終えているか（`useKeydistAssets`の
   * `ready`。#544 Phase 3「URLでの受け取り」）。URLパラメータを既存の解析設定へ
   * 部分マージする処理は、この読み込みより前に走ると既存の値を初期値へ巻き戻して
   * しまうため、`ready`になるまで待つ。
   */
  readonly assetsReady: boolean;
  readonly dispatch: (command: Command<KeydistAssets>) => void;
  readonly cache: EngineCache;
  readonly catalog: PaneCatalog;
  readonly generateTextId: TextIdGenerator;
  /** `TextChip`の本文debounce書き込み（`app/standalone`がuseDebouncedCommitで組み立てる）。 */
  readonly onTextContentCommit: TextContentCommit;
  /**
   * 解析設定の変更を資産へ反映する（間引き済み。`app/standalone/use-debounced-commit.ts`
   * 参照）。`dispatch`を直接使わないのは、`hosts`が`platform`をimportできず
   * （依存規則）debounce自体をここへ持てないため。
   */
  readonly onBigramFlowOptionsCommit: (options: BigramFlowOptions) => void;
  /** 資産のコマンド履歴（文脈バーのUndo / Redo）。`app` が組み立てる。 */
  readonly history: ContextBarHistory;
}

/** 個別画面のペインの枠まわり。ペインのAnalyzer名がページのh1で、見出しを文脈バーの下に固定する。 */
const STANDALONE_CHROME: PaneChrome = { headingLevel: 1, stickyHeader: true, autoOpenTargetSelection: true };

export function BigramFlowStandalonePage({
  assets,
  assetsReady,
  dispatch,
  cache,
  catalog,
  generateTextId,
  onTextContentCommit,
  onBigramFlowOptionsCommit,
  history,
}: BigramFlowStandalonePageProps) {
  // 対象（`AnalysisTarget`）はSingleのAnalyzerが共有する資産（`singleTargetSelection`。#663）が正。
  // まだ選んでいなければ既定の配列を使う（`effectiveSingleTarget`）。
  const analyzerId = bigramFlowAnalyzer.definition.id;
  const target = effectiveSingleTarget(assets.singleTargetSelection);

  // テキストは資産（textLibrary + standaloneTextSelection）が正。編集・選択・複製・削除は
  // すべて共有部品`TextChip`（文脈バーのテキストのチップ。比較表・N感度と3ページで同じ操作を持つため）。
  const resolvedText = useMemo(
    () => resolveTextSelection(assets.standaloneTextSelection, assets.textLibrary),
    [assets.standaloneTextSelection, assets.textLibrary],
  );

  // 解析設定は資産（assets.standaloneAnalyzerOptions）が正で、ページはローカルには持たない
  // （#544指示書「解析設定は資産として個人で保持する」）。`optionsDraft`はtextDraftと同じ形の
  // UI用の一時状態: 見た目は即座に反映しつつ（controlled）、資産への書き込みは
  // `onBigramFlowOptionsCommit`（呼び出し元がdebounceする）経由にする。
  const storedOptionsRaw = assets.standaloneAnalyzerOptions[analyzerId];
  const decoded = useMemo(
    () => decodeStoredAnalyzerOptions(bigramFlowAnalyzer.definition, storedOptionsRaw),
    [storedOptionsRaw],
  );
  const [optionsDraft, setOptionsDraft] = useOptionsDraft<BigramFlowOptions>(decoded.options);

  // URL経由で解析設定を受け取る（3つの単体ページ共通。`use-url-options.ts`）。
  const urlDiagnostics = useUrlOptions({
    analyzerId,
    optionsDefinition: bigramFlowOptions,
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

  const changeOptions = (next: BigramFlowOptions) => {
    setOptionsDraft(next);
    onBigramFlowOptionsCommit(next);
  };

  return (
    <div className="standalone-page">
      <ContextBar
        disabled={!assetsReady}
        history={history}
        share={{
          description: '今の解析設定を含むこの画面のURLをコピーする',
          query: () => bigramFlowOptions.encodeOptionsToUrl(optionsDraft),
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
      {/*
       * プリレンダーされたHTMLはハイドレーション前から操作できてしまう（レビュー指摘:
       * ハイドレーション完了までの約750〜850msの間にクリック・入力すると、見た目は
       * 変わっても実際には何も起きず、そのまま消える。加えてプリレンダー時点のDOMは
       * `initialAssets()`＝ユーザーの保存済み資産ではない）。`assetsReady`が経由する
       * `useKeydistAssets`はハイドレーション後にstorageを読み終えてから true になるので、
       * それまでは操作系を丸ごと`disabled`にして「触れるが効かない」状態を作らない。
       * `display:contents`でレイアウトへの影響を無くす（fieldsetは既定でblock）。
       */}
      <fieldset
        disabled={!assetsReady}
        style={{ display: 'contents', border: 0, padding: 0, margin: 0, minWidth: 0 }}
      >
        <div className="standalone-stage">
          <BigramFlowPane
            env={env}
            chrome={STANDALONE_CHROME}
            target={target}
            onTargetChange={(next) => dispatch(setSingleTargetCommand(next))}
            options={optionsDraft}
            onOptionsChange={changeOptions}
            settingsDiagnostics={[...decoded.diagnostics, ...urlDiagnostics]}
          />
        </div>
      </fieldset>
    </div>
  );
}
