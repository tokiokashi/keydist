import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { SettingsCascadeOverrides } from '#engine/settings-items.ts';
import type { AnalysisTarget, Setup } from '#input/setup/index.ts';
import type { ReadingCandidateTable } from '#input/text/reading-candidates.ts';
import { isCorrectionReading } from '#input/text/reading.ts';
import type { TextRef } from '#input/text/selection.ts';
import type { ReadingEvaluation, ReadingSource } from './reading-evaluation.ts';
import { createStrokeCounter, orderReadingWords, type OrderedReadingWord } from './reading-words.ts';
import type { PaneCatalog } from './resolve-pane-input.ts';
import './context-bar.css';
import './reading-chip.css';

export interface ReadingChipProps {
  readonly evaluation: ReadingEvaluation;
  readonly source: ReadingSource;
  /** 読みの候補の並べ方に使う、比べている配列。Workspaceではペインに載った配列すべて、個別画面ではその配列 */
  readonly targets: readonly AnalysisTarget[];
  readonly setups: readonly Setup[];
  readonly catalog: PaneCatalog;
  readonly overrides: SettingsCascadeOverrides;
  /** 表記の読みを直す（`reading`がundefinedなら辞書の読みに戻す）。書き込みは呼び出し側がコマンドで行う */
  readonly onCorrect: (ref: TextRef, surface: string, reading: string | undefined) => void;
}

type CandidateTableState = { readonly kind: 'loading' } | { readonly kind: 'failed' } | { readonly kind: 'ready'; readonly table: ReadingCandidateTable };

const NO_TABLE: ReadingCandidateTable = {};
const PAGE = 100;

/**
 * 文脈バーの読みのチップ。漢字を読みに直したテキストで、語ごとの読みを見て、直せる。
 * 直しは表記の単位で、同じ表記の語すべてに当たる。候補の表は、開いた時に初めて読み込む。
 */
export function ReadingChip(props: ReadingChipProps) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const { evaluation } = props;
  const fixed = evaluation.text.reading?.corrections.length ?? 0;

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  if (evaluation.state.kind !== 'converted') return null;

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: 内側のどこで押されたEscapeも受けて閉じるため、キー入力を受けるだけの外側の要素に付ける。この要素自体は操作の対象ではない
    <div
      ref={rootRef}
      className="text-chip-root reading-chip-root"
      onKeyDown={(event) => {
        if (event.key === 'Escape' && open) {
          event.stopPropagation();
          setOpen(false);
          buttonRef.current?.focus();
        }
      }}
    >
      <button
        ref={buttonRef}
        type="button"
        className="context-chip reading-chip"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        data-reading-chip="true"
        onClick={() => setOpen((current) => !current)}
      >
        <span className="context-chip-key">読み</span>
        <span className="context-chip-value">{fixed > 0 ? `${fixed}表記を直し済み` : `${evaluation.words.length}語`}</span>
        <svg className="context-chip-chevron" viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
          <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </button>
      {open ? (
        <div className="context-popover reading-chip-panel" id={panelId} role="dialog" aria-label="読みの確認と修正">
          <ReadingEditor {...props} />
        </div>
      ) : null}
    </div>
  );
}

function ReadingEditor({ evaluation, source, targets, setups, catalog, overrides, onCorrect }: ReadingChipProps) {
  const [tableState, setTableState] = useState<CandidateTableState>({ kind: 'loading' });
  const [filter, setFilter] = useState('');
  const [limit, setLimit] = useState(PAGE);

  useEffect(() => {
    let cancelled = false;
    source.loadCandidates().then(
      (table) => {
        if (!cancelled) setTableState({ kind: 'ready', table });
      },
      () => {
        if (!cancelled) setTableState({ kind: 'failed' });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [source]);

  const text = evaluation.text;
  const table = tableState.kind === 'ready' ? tableState.table : NO_TABLE;
  // 候補の表が読み込めるまで並べない（読み込んだ後に並びが変わって、操作中の行が動くのを避ける）
  const ordered = useMemo(() => {
    if (tableState.kind === 'loading') return [];
    const counter = createStrokeCounter(targets, new Map(setups.map((setup) => [setup.id, setup] as const)), catalog, overrides, text);
    return orderReadingWords(evaluation.words, table, counter);
  }, [tableState.kind, evaluation.words, table, targets, setups, catalog, overrides, text]);

  const visible = useMemo(() => {
    const needle = filter.trim();
    if (needle === '') return ordered;
    return ordered.filter((entry) => {
      const current = text.readingCorrections[entry.word.surface];
      return (
        entry.word.surface.includes(needle) ||
        (current ?? '').includes(needle) ||
        entry.word.dictionaryReadings.some((reading) => reading.includes(needle))
      );
    });
  }, [ordered, filter, text.readingCorrections]);

  return (
    <div className="reading-editor">
      <p className="reading-editor-hint">漢字を含む語の読みです。直すと、このテキストの同じ表記の語すべてに当たります。</p>
      {tableState.kind === 'failed' ? (
        <p className="reading-editor-note" role="status" data-reading-candidates="failed">
          読みの候補を読み込めませんでした。読みを入力して直せます。
        </p>
      ) : null}
      {tableState.kind === 'loading' ? (
        <p className="reading-editor-note" role="status" aria-busy="true" data-reading-candidates="loading">
          読みの候補を読み込み中…
        </p>
      ) : (
        <>
          <input
            type="search"
            className="reading-editor-filter"
            value={filter}
            onChange={(event) => {
              setFilter(event.currentTarget.value);
              setLimit(PAGE);
            }}
            placeholder="表記や読みで絞り込む"
            aria-label="語を絞り込む"
          />
          <ul className="reading-editor-list" data-reading-list="true">
            {visible.slice(0, limit).map((entry) => (
              <ReadingWordRow
                key={entry.word.surface}
                entry={entry}
                correction={Object.hasOwn(text.readingCorrections, entry.word.surface) ? text.readingCorrections[entry.word.surface] : undefined}
                onCorrect={(surface, reading) => onCorrect(text.ref, surface, reading)}
              />
            ))}
          </ul>
          {visible.length > limit ? (
            <button type="button" className="reading-editor-more" onClick={() => setLimit((current) => current + PAGE)}>
              さらに表示
            </button>
          ) : null}
          {visible.length === 0 ? <p className="reading-editor-note">該当する語がありません。</p> : null}
        </>
      )}
    </div>
  );
}

interface ReadingWordRowProps {
  readonly entry: OrderedReadingWord;
  readonly correction: string | undefined;
  readonly onCorrect: (surface: string, reading: string | undefined) => void;
}

function ReadingWordRow({ entry, correction, onCorrect }: ReadingWordRowProps) {
  const { word, candidates } = entry;
  const [draft, setDraft] = useState('');
  const [invalid, setInvalid] = useState(false);
  const current = correction ?? word.dictionaryReadings[0];

  const commit = () => {
    const value = draft.trim();
    if (value === '') {
      // 空にする操作は、直しを消して辞書の読みに戻す操作
      if (correction !== undefined) onCorrect(word.surface, undefined);
      setInvalid(false);
      return;
    }
    if (!isCorrectionReading(value)) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    setDraft('');
    if (value !== correction) onCorrect(word.surface, value);
  };

  return (
    <li className="reading-word" data-reading-word={word.surface} data-reading-corrected={correction !== undefined || undefined}>
      <span className="reading-word-surface">{word.surface}</span>
      <span className="reading-word-count">{word.count}回</span>
      <span className="reading-word-current" data-reading-current="true">
        {current ?? '読みなし'}
      </span>
      {correction !== undefined ? <span className="reading-word-badge">直し済み</span> : null}
      <div className="reading-word-controls">
        {candidates.length >= 2 ? (
          <select
            aria-label={`${word.surface}の読みの候補`}
            value={correction !== undefined && candidates.includes(correction) ? correction : ''}
            onChange={(event) => {
              const value = event.currentTarget.value;
              if (value !== '') onCorrect(word.surface, value);
            }}
          >
            <option value="">候補から選ぶ</option>
            {candidates.map((candidate) => (
              <option key={candidate} value={candidate}>
                {candidate}
              </option>
            ))}
          </select>
        ) : null}
        <input
          type="text"
          value={draft}
          aria-label={`${word.surface}の読みを入力`}
          aria-invalid={invalid || undefined}
          placeholder="ひらがなで入力"
          onChange={(event) => {
            setDraft(event.currentTarget.value);
            setInvalid(false);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') commit();
          }}
        />
        <button type="button" onClick={commit}>
          直す
        </button>
        {correction !== undefined ? (
          <button type="button" onClick={() => onCorrect(word.surface, undefined)}>
            辞書の読みに戻す
          </button>
        ) : null}
      </div>
      {invalid ? (
        <p className="reading-word-error" role="alert">
          読みはひらがなと「ー」で入力してください。
        </p>
      ) : null}
    </li>
  );
}
