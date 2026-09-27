import { useEffect, useMemo, useRef, useState } from 'react';
import type { Command } from '#input/commands/index.ts';
import { createSetupCommand, setStandaloneTextCommand, type KeydistAssets } from '#engine/commands.ts';
import { sampleTextEntries } from '#input/text/samples.ts';
import type { EngineCache } from '#engine/cache.ts';
import type { SetupIdGenerator } from '#input/setup/index.ts';
import { combinePaneStates, conditionHeaderInfoFromResolvedInput, traceConditionSummary, PaneFrame } from '#hosts/shared/index.ts';
import type { ResolvedInputResult } from '#engine/resolved-input.ts';
import { bigramFlowAnalyzer } from '#analyzers/bigram-flow/definition.tsx';
import type { BigramFlowOptions } from '#analyzers/bigram-flow/options.ts';
import { resolveStandalonePaneInput, type StandalonePaneCatalog } from './resolve-pane-input.ts';
import { selectInitialSetupId, DEFAULT_STANDALONE_SETUP_SPEC } from './setup-selection.ts';
import { decodeStoredAnalyzerOptions } from './standalone-analyzer-options.ts';
import { useAnalyzerPane } from './use-analyzer-pane.ts';
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
  dispatch,
  cache,
  catalog,
  generateSetupId,
  onBigramFlowOptionsCommit,
}: BigramFlowStandalonePageProps) {
  const setups = assets.setupLibrary.setups;
  const [selectedSetupId, setSelectedSetupId] = useState<string | undefined>(
    () => selectInitialSetupId(setups),
  );

  // 手持ちが空なら、簡単な初期値を1つ作る（#544指示書「空なら簡単な初期値を用意する」）。
  // 既存のSetupを作るコマンドをそのまま使う（書き込みはコマンドを通す。#544 §8-2）。
  useEffect(() => {
    if (setups.length > 0) return;
    dispatch(createSetupCommand(
      DEFAULT_STANDALONE_SETUP_SPEC.layoutId,
      DEFAULT_STANDALONE_SETUP_SPEC.shapeId,
      generateSetupId,
    ));
    // `setups`自体を依存に含めると、作成直後（setups.length===1）でまたこの効果が走ってしまう
    // ため、「空かどうか」という条件だけを依存にする。
  }, [setups.length === 0, dispatch, generateSetupId]);

  // 選んでいたSetupが手持ちから消えたら（削除・初回作成直後）選び直す。
  useEffect(() => {
    setSelectedSetupId((current) => selectInitialSetupId(setups, current));
  }, [setups]);

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
          settingsDiagnostics={decoded.diagnostics}
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
