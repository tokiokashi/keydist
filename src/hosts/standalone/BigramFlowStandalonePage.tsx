import { useEffect, useMemo, useRef, useState } from 'react';
import type { Command } from '#input/commands/index.ts';
import { setStandaloneAnalyzerOptionsCommand, setStandaloneTextCommand, type KeydistAssets } from '#engine/commands.ts';
import { sampleTextEntries } from '#input/text/samples.ts';
import type { EngineCache } from '#engine/cache.ts';
import type { SetupIdGenerator } from '#input/setup/index.ts';
import { combinePaneStates, conditionHeaderInfoFromResolvedInput, traceConditionSummary, PaneFrame } from '#hosts/shared/index.ts';
import type { ResolvedInputResult } from '#engine/resolved-input.ts';
import type { CodecDiagnostic } from '#input/codec/index.ts';
import { bigramFlowAnalyzer } from '#analyzers/bigram-flow/definition.tsx';
import { bigramFlowOptions, type BigramFlowOptions } from '#analyzers/bigram-flow/options.ts';
import { resolveStandalonePaneInput, type StandalonePaneCatalog } from './resolve-pane-input.ts';
import { decodeStoredAnalyzerOptions } from './standalone-analyzer-options.ts';
import { useAnalyzerPane } from './use-analyzer-pane.ts';
import { useEnsureSetup } from './use-ensure-setup.ts';
import './standalone.css';

// Setupが用意される前の一瞬に渡す値。レンダーごとに作ると`useAnalyzerPane`の依存が毎回変わり、
// 依頼を作り直し続けるので、参照が変わらないようモジュールに1つだけ置く。
const NO_SETUP_YET: ResolvedInputResult = { ok: false, error: { kind: 'reference', errors: [] } };

/**
 * Bigram Flowの単体ページ（#544 Phase 3「最初の縦切り」）。
 *
 * 対象Setupは1つ、テキストは単体ページ全体で共有の「最後に使ったテキスト」を使う
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
  readonly generateSetupId: SetupIdGenerator;
  /**
   * 解析設定の変更を資産へ反映する（間引き済み。`app/standalone/use-debounced-commit.ts`
   * 参照）。`dispatch`を直接使わないのは、`hosts`が`platform`をimportできず
   * （依存規則）debounce自体をここへ持てないため。
   */
  readonly onBigramFlowOptionsCommit: (options: BigramFlowOptions) => void;
}

const TEXT_COMMIT_DEBOUNCE_MS = 400;

export function BigramFlowStandalonePage({
  assets,
  assetsReady,
  dispatch,
  cache,
  catalog,
  generateSetupId,
  onBigramFlowOptionsCommit,
}: BigramFlowStandalonePageProps) {
  const setups = assets.setupLibrary.setups;
  // 手持ちが空なら初期値を1つ作る（#544指示書「空なら簡単な初期値を用意する」）。
  // `assetsReady`を待ってから「本当に空か」を判定する配線は`hosts/standalone`の
  // 共通hookへ1本化してある（`use-ensure-setup.ts`のコメント参照。レビュー対応:
  // 待たずに判定すると保存済みのSetupを巻き戻す事故になる）。
  const { selectedSetupId, setSelectedSetupId } = useEnsureSetup(
    setups,
    assetsReady,
    dispatch,
    generateSetupId,
  );

  const selectedSetup = setups.find((setup) => setup.id === selectedSetupId);

  // テキストは即座に見た目へ反映しつつ（controlled textarea）、コマンドへの反映は
  // 軽くdebounceする（1打鍵ごとにTrace再計算が走らないようにするため）。
  const [textDraft, setTextDraft] = useState(assets.standaloneText.text);
  const textDraftRef = useRef(textDraft);
  textDraftRef.current = textDraft;
  useEffect(() => {
    setTextDraft(assets.standaloneText.text);
  }, [assets.standaloneText.text]);
  useEffect(() => {
    const timer = setTimeout(() => {
      if (textDraftRef.current !== assets.standaloneText.text) {
        dispatch(setStandaloneTextCommand(textDraftRef.current));
      }
    }, TEXT_COMMIT_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [textDraft, dispatch, assets.standaloneText.text]);

  // 解析設定は資産（assets.standaloneAnalyzerOptions）が正で、ページはローカルには持たない
  // （#544指示書「解析設定は資産として個人で保持する」）。`optionsDraft`はtextDraftと同じ形の
  // UI用の一時状態: 見た目は即座に反映しつつ（controlled）、資産への書き込みは
  // `onBigramFlowOptionsCommit`（呼び出し元がdebounceする）経由にする。
  const analyzerId = bigramFlowAnalyzer.definition.id;
  const storedOptionsRaw = assets.standaloneAnalyzerOptions[analyzerId];
  const decoded = useMemo(
    () => decodeStoredAnalyzerOptions(bigramFlowAnalyzer.definition, storedOptionsRaw),
    [storedOptionsRaw],
  );
  const [optionsDraft, setOptionsDraft] = useState<BigramFlowOptions>(decoded.options);
  useEffect(() => {
    setOptionsDraft(decoded.options);
    // 資産側が変わった（初回読み込み・他タブからの反映・自分のcommitの反響）時だけ
    // draftを揃え直す。`decoded`は`storedOptionsRaw`が同じ参照なら同じ内容の
    // オブジェクトを毎回作るだけなので、無限ループにはならない（依存はdecoded自身）。
  }, [decoded]);

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

  // サンプルは選べれば十分で、言語を選ぶUIは作らない（#544指示書）。テキストが今どの
  // サンプルと一致するかを`<select>`の値に反映する（自由入力中はどれとも一致せず空になる）。
  const sampleEntries = useMemo(() => sampleTextEntries(), []);
  const currentSampleKey = useMemo(() => {
    const match = sampleEntries.find((entry) => entry.text === assets.standaloneText.text);
    return match === undefined ? '' : `${match.language}:${match.sampleId}`;
  }, [sampleEntries, assets.standaloneText.text]);

  const resolution = useMemo(
    () => selectedSetup === undefined
      ? undefined
      : resolveStandalonePaneInput(selectedSetup, catalog, assets.setupLibrary.overrides, assets.standaloneText),
    [selectedSetup, catalog, assets.setupLibrary.overrides, assets.standaloneText],
  );

  const pane = useAnalyzerPane(
    cache,
    bigramFlowAnalyzer.definition,
    optionsDraft,
    resolution ?? NO_SETUP_YET,
  );

  const conditionRows = resolution?.ok ? traceConditionSummary(resolution.input.cascade) : [];
  const header = resolution?.ok
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
        <p className="eyebrow">単体ページ</p>
        <h1>Bigram Flow</h1>
      </header>

      <section className="standalone-controls" aria-label="対象と入力">
        <label className="standalone-control">
          <span>対象Setup</span>
          <select
            value={selectedSetupId ?? ''}
            onChange={(event) => setSelectedSetupId(event.currentTarget.value || undefined)}
            aria-label="対象Setup"
          >
            {setups.length === 0 ? <option value="">作成中…</option> : null}
            {setups.map((setup) => (
              <option key={setup.id} value={setup.id}>
                {setup.label ?? `${setup.layoutId} / ${setup.shapeId}`}
              </option>
            ))}
          </select>
        </label>

        <label className="standalone-control standalone-text-control">
          <span>テキスト</span>
          <textarea
            value={textDraft}
            onChange={(event) => setTextDraft(event.currentTarget.value)}
            rows={3}
            aria-label="テキスト"
          />
          <small>
            言語判定: {assets.standaloneText.language.override ?? assets.standaloneText.language.detected}
            {assets.standaloneText.language.override ? '（手動指定）' : '（自動）'}
          </small>
        </label>

        <label className="standalone-control">
          <span>サンプル</span>
          <select
            value={currentSampleKey}
            onChange={(event) => {
              const key = event.currentTarget.value;
              if (key === '') return;
              const entry = sampleEntries.find((candidate) => `${candidate.language}:${candidate.sampleId}` === key);
              if (entry === undefined) return;
              // サンプルの選択は連続入力ではなく1回きりの決定なので、textareaのdebounce
              // （TEXT_COMMIT_DEBOUNCE_MS）を待たずに即座にコマンドとして反映する。
              setTextDraft(entry.text);
              dispatch(setStandaloneTextCommand(entry.text));
            }}
            aria-label="サンプル"
          >
            <option value="">（自由入力）</option>
            {sampleEntries.map((entry) => (
              <option key={`${entry.language}:${entry.sampleId}`} value={`${entry.language}:${entry.sampleId}`}>
                {entry.name}
              </option>
            ))}
          </select>
        </label>

        <div className="standalone-control">
          <span>解析設定</span>
          <button type="button" onClick={copyOptionsLink}>
            {copyLinkFeedback ? 'コピーした' : '今の設定のURLをコピー'}
          </button>
        </div>
      </section>

      {selectedSetup === undefined ? (
        <p aria-busy="true">Setupを準備している…</p>
      ) : (
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
            if (!resolution?.ok || !hasExtraction || !hasTrace) {
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
      )}
    </div>
  );
}
