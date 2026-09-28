import { useEffect, useMemo, useRef, useState } from 'react';
import type { Command } from '#input/commands/index.ts';
import { setAnalyzerTargetSelectionCommand, setStandaloneAnalyzerOptionsCommand, type KeydistAssets } from '#engine/commands.ts';
import { analyzerTargetSelectionFor } from '#engine/analyzer-target-selection.ts';
import { resolveTextSelection } from '#input/text/resolve.ts';
import type { TextIdGenerator } from '#input/text/library.ts';
import type { TextRef } from '#input/text/selection.ts';
import type { EngineCache } from '#engine/cache.ts';
import { DEFAULT_ANALYSIS_TARGET } from '#input/setup/index.ts';
import { combinePaneStates, conditionHeaderInfoFromResolvedInput, traceConditionSummary, PaneFrame } from '#hosts/shared/index.ts';
import type { CodecDiagnostic } from '#input/codec/index.ts';
import { bigramFlowAnalyzer } from '#analyzers/bigram-flow/definition.tsx';
import { bigramFlowOptions, type BigramFlowOptions } from '#analyzers/bigram-flow/options.ts';
import { resolveStandalonePaneInput, type StandalonePaneCatalog } from './resolve-pane-input.ts';
import { decodeStoredAnalyzerOptions } from './standalone-analyzer-options.ts';
import { TextControl } from './TextControl.tsx';
import { TargetPicker } from './TargetPicker.tsx';
import { DefaultShapeControl } from './DefaultShapeControl.tsx';
import { useOptionsDraft } from './use-options-draft.ts';
import { useAnalyzerPane } from './use-analyzer-pane.ts';
import './standalone.css';

/**
 * Bigram Flowの単体ページ（#544 Phase 3「最初の縦切り」）。
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
  readonly catalog: StandalonePaneCatalog;
  readonly generateTextId: TextIdGenerator;
  /** `TextControl`の本文debounce書き込み（`app/standalone`がuseDebouncedCommitで組み立てる）。 */
  readonly onTextContentCommit: (value: { readonly ref: TextRef; readonly text: string }) => void;
  /**
   * 解析設定の変更を資産へ反映する（間引き済み。`app/standalone/use-debounced-commit.ts`
   * 参照）。`dispatch`を直接使わないのは、`hosts`が`platform`をimportできず
   * （依存規則）debounce自体をここへ持てないため。
   */
  readonly onBigramFlowOptionsCommit: (options: BigramFlowOptions) => void;
}

export function BigramFlowStandalonePage({
  assets,
  assetsReady,
  dispatch,
  cache,
  catalog,
  generateTextId,
  onTextContentCommit,
  onBigramFlowOptionsCommit,
}: BigramFlowStandalonePageProps) {
  const setups = assets.setupLibrary.setups;
  const setupsById = useMemo(() => new Map(setups.map((setup) => [setup.id, setup] as const)), [setups]);

  // 対象（`AnalysisTarget`）は資産（`analyzerTargetSelections`）が正（#578指摘1）。
  // 手持ちが空でも配列（既定`DEFAULT_ANALYSIS_TARGET` = qwerty）が常に選べるので、
  // 旧`use-ensure-setup.ts`のような「空なら初期Setupを作る」副作用は不要になった。
  const analyzerId = bigramFlowAnalyzer.definition.id;
  const target = analyzerTargetSelectionFor(assets.analyzerTargetSelections, analyzerId, DEFAULT_ANALYSIS_TARGET);
  const setTarget = (next: typeof target) => dispatch(setAnalyzerTargetSelectionCommand(analyzerId, next));

  // テキストは資産（textLibrary + standaloneTextSelection）が正。編集・選択・複製・削除は
  // すべて共有部品`TextControl`（比較表・N感度と3ページで同じ操作を持つため。
  // `resolve-pane-input.ts`が使う`resolveTextSelection`と同じものをここでも呼び、
  // 実効テキストを求める）へ切り出した。
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

  // URL経由で解析設定を受け取る（#544 Phase 3「URLでの受け取り」）。取り込む対象は
  // 解析設定だけ（配列・形状・条件をURLへ載せる共有リンクはPhase 5の範囲外）。
  // 資産（`assets`）がstorageからの初回読み込みを終える（`assetsReady`）まで待ってから
  // 読み込んだらURLから該当パラメータを消す（#544「取り込み後はローカルが正」）。
  // `assetsReady`を待たずに`decoded.options`をベースへマージすると、読み込み前の
  // 初期値（空）をベースにしてしまい、既存の解析設定を巻き戻す事故になる
  // （`useKeydistAssets`の`ready`のコメント参照。#544レビューで見つかった競合）。
  //
  // 取り込みは、URLで指定された項目だけを現在の解析設定へ上書きする部分マージにする:
  // フルスクラッチの上書きだと「URLで指定していない項目まで既定値に戻る」事故になりやすく、
  // 共有リンクを開いただけで自分の設定が丸ごと消える方が「一部だけ変わる」より驚きが
  // 大きいと判断した（確認ダイアログは挟まない。単体ページの解析設定はUndo対象の資産なので、
  // 誤って開いた場合もUndo/元のURLに戻すことで復旧できる）。
  const decodedOptionsRef = useRef(decoded.options);
  decodedOptionsRef.current = decoded.options;
  const appliedUrlOptionsRef = useRef(false);
  const [urlDiagnostics, setUrlDiagnostics] = useState<readonly CodecDiagnostic[]>([]);
  useEffect(() => {
    if (!assetsReady) return;
    if (appliedUrlOptionsRef.current) return;
    appliedUrlOptionsRef.current = true;
    const params = new URLSearchParams(window.location.search);
    const diagnostics: CodecDiagnostic[] = [];
    const result = bigramFlowOptions.decodeOptionsFromUrl(params, diagnostics);
    if (diagnostics.length > 0) setUrlDiagnostics(diagnostics);
    if (result.consumedParamNames.length === 0) return;

    if (Object.keys(result.values).length > 0) {
      const merged = { ...decodedOptionsRef.current, ...result.values };
      dispatch(setStandaloneAnalyzerOptionsCommand(analyzerId, merged));
      setOptionsDraft(merged);
    }

    const nextParams = new URLSearchParams(window.location.search);
    for (const name of result.consumedParamNames) nextParams.delete(name);
    const nextQuery = nextParams.toString();
    const nextUrl = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ''}${window.location.hash}`;
    window.history.replaceState(null, '', nextUrl);
    // `assetsReady`がtrueになった最初の1回だけ実行する（`appliedUrlOptionsRef`）。
    // `analyzerId`はAnalyzer定義由来の定数、`dispatch`は`useKeydistAssets`が返す
    // 安定した参照なので、依存に含めても再実行の心配は無い。
  }, [assetsReady, analyzerId, dispatch]);

  const [copyLinkFeedback, setCopyLinkFeedback] = useState(false);
  const copyOptionsLink = () => {
    // 「今の設定のURLをコピー」導線（#544指示書「小さく済むなら足す」）。既定値と同じ項目は
    // URLへ出ない（`encodeOptionsToUrl`）ので、変更した項目だけを含む短いリンクになる。
    const params = bigramFlowOptions.encodeOptionsToUrl(optionsDraft);
    const query = params.toString();
    const url = `${window.location.origin}${window.location.pathname}${query ? `?${query}` : ''}`;
    void navigator.clipboard.writeText(url).then(() => {
      setCopyLinkFeedback(true);
      setTimeout(() => setCopyLinkFeedback(false), 1500);
    });
  };

  const resolution = useMemo(
    () => resolveStandalonePaneInput(target, setupsById, catalog, assets.setupLibrary.overrides, resolvedText),
    [target, setupsById, catalog, assets.setupLibrary.overrides, resolvedText],
  );

  const pane = useAnalyzerPane(
    cache,
    bigramFlowAnalyzer.definition,
    optionsDraft,
    resolution,
  );

  const conditionRows = resolution.ok ? traceConditionSummary(resolution.input.cascade, catalog.setupCatalog) : [];
  const header = resolution.ok
    ? conditionHeaderInfoFromResolvedInput(resolution.input.layout, resolution.input.geometry)
    : undefined;
  const traceErrors = pane.trace.status === 'ready' || pane.trace.status === 'stale'
    ? pane.trace.value.trace.errors
    : [];

  const View = bigramFlowAnalyzer.View;
  const extraction = pane.extraction;

  return (
    <div className="standalone-page">
      <header className="standalone-page-header">
        <h1>Bigram Flow</h1>
      </header>

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
        <section className="standalone-controls" aria-label="対象と入力">
          <label className="standalone-control">
            <span>対象</span>
            <TargetPicker
              aria-label="対象"
              layouts={catalog.setupCatalog.layouts}
              shapes={catalog.setupCatalog.shapes}
              setups={setups}
              value={target}
              onChange={setTarget}
            />
          </label>

          <DefaultShapeControl overrides={assets.setupLibrary.overrides} dispatch={dispatch} catalog={catalog} />

          <div className="standalone-control">
            <span>解析設定</span>
            <button type="button" onClick={copyOptionsLink}>
              {copyLinkFeedback ? 'コピーした' : '今の設定のURLをコピー'}
            </button>
          </div>
        </section>

        <TextControl
          holder="standalone"
          textLibrary={assets.textLibrary}
          selection={assets.standaloneTextSelection}
          dispatch={dispatch}
          generateTextId={generateTextId}
          onTextContentCommit={onTextContentCommit}
        />

        <PaneFrame
          title="Bigram Flow"
          header={header}
          conditionRows={conditionRows}
          engineState={combinePaneStates(extraction, pane.trace)}
          traceErrors={traceErrors}
          settingsDiagnostics={[...decoded.diagnostics, ...urlDiagnostics]}
        >
          {(() => {
            // 失敗はPaneFrame自身が値として表示する（#544 §8-5）ので、ここでは何も描かない。
            if (extraction.status === 'failed') return null;
            const hasExtraction = extraction.status === 'ready' || extraction.status === 'stale';
            const hasTrace = pane.trace.status === 'ready' || pane.trace.status === 'stale';
            if (!resolution.ok || !hasExtraction || !hasTrace) {
              return <p aria-busy="true">計算している…</p>;
            }
            return (
              <View
                layout={resolution.input.layout}
                geometry={resolution.input.geometry}
                trace={pane.trace.value.trace}
                extracted={extraction.value.extracted}
                options={optionsDraft}
                onOptionsChange={(next) => {
                  setOptionsDraft(next);
                  onBigramFlowOptionsCommit(next);
                }}
              />
            );
          })()}
        </PaneFrame>
      </fieldset>
    </div>
  );
}
