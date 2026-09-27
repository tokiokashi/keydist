import { useEffect, useMemo, useRef, useState } from 'react';
import type { Command } from '#input/commands/index.ts';
import { createSetupCommand, setStandaloneTextCommand, type KeydistAssets } from '#engine/commands.ts';
import type { EngineCache } from '#engine/cache.ts';
import type { SetupIdGenerator } from '#input/setup/index.ts';
import { conditionHeaderInfoFromResolvedInput, traceConditionSummary, PaneFrame } from '#hosts/shared/index.ts';
import { bigramFlowAnalyzer } from '#analyzers/bigram-flow/definition.tsx';
import { DEFAULT_BIGRAM_FLOW_OPTIONS, type BigramFlowOptions } from '#analyzers/bigram-flow/options.ts';
import { resolveStandalonePaneInput, type StandalonePaneCatalog } from './resolve-pane-input.ts';
import { selectInitialSetupId, DEFAULT_STANDALONE_SETUP_SPEC } from './setup-selection.ts';
import { useAnalyzerPane } from './use-analyzer-pane.ts';
import './standalone.css';

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
}

const TEXT_COMMIT_DEBOUNCE_MS = 400;

export function BigramFlowStandalonePage({
  assets,
  dispatch,
  cache,
  catalog,
  generateSetupId,
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

  const [options, setOptions] = useState<BigramFlowOptions>(DEFAULT_BIGRAM_FLOW_OPTIONS);

  const resolution = useMemo(
    () => selectedSetup === undefined
      ? undefined
      : resolveStandalonePaneInput(selectedSetup, catalog, assets.setupLibrary.overrides, assets.standaloneText),
    [selectedSetup, catalog, assets.setupLibrary.overrides, assets.standaloneText],
  );

  const pane = useAnalyzerPane(
    cache,
    bigramFlowAnalyzer.definition,
    options,
    resolution ?? { ok: false, error: { kind: 'reference', errors: [] } },
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
      </section>

      {selectedSetup === undefined ? (
        <p aria-busy="true">Setupを準備している…</p>
      ) : (
        <PaneFrame
          title="Bigram Flow"
          header={header}
          conditionRows={conditionRows}
          engineState={extraction}
          traceErrors={traceErrors}
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
                options={options}
                onOptionsChange={setOptions}
              />
            );
          })()}
        </PaneFrame>
      )}
    </div>
  );
}
