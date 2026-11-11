import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { SettingsCascadeOverrides } from '#engine/settings-items.ts';
import type { AnalysisTarget, Setup } from '#input/setup/index.ts';
import type { ReadingCandidateTable } from '#input/text/reading-candidates.ts';
import { isCorrectionReading } from '#input/text/reading.ts';
import type { TextRef } from '#input/text/selection.ts';
import { listReadingOccurrences, type ReadingOccurrence, type WordAnchor, type WordReadingCorrection } from '#input/text/word-reading.ts';
import { correctionCountText, type ReadingEvaluation, type ReadingSource } from './reading-evaluation.ts';
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
  /**
   * 語ごとの読みの直しを差し替える。`remove`の指定の直しをすべて消し、`add`があれば足す。
   * 語の読みを直す・直しを消す・見つからない直しを付け直す・消すの、どれもこれで行う。
   */
  readonly onCorrectWord: (ref: TextRef, remove: readonly WordAnchor[], add: WordReadingCorrection | undefined) => void;
}

type CandidateTableState = { readonly kind: 'loading' } | { readonly kind: 'failed' } | { readonly kind: 'ready'; readonly table: ReadingCandidateTable };

const NO_TABLE: ReadingCandidateTable = {};
const PAGE = 100;
/** 1つの表記の場所を一度に出す数。 */
const PLACE_PAGE = 20;
const NO_OCCURRENCES: readonly ReadingOccurrence[] = [];

/**
 * 文脈バーの読みのチップ。漢字を読みに直したテキストで、語ごとの読みを見て、直せる。
 * 直しは表記の単位で、同じ表記の語すべてに当たる。同じ表記の語が複数あれば、テキストの中の1つの語（場所）だけも直せる。
 * 場所ごとの直しが見つからなくなった時（本文の編集で語が変わった時）は、見つからない直しとして出し、付け直すか消すかを選ばせる。
 * 辞書を読み込めない時と読み込み中は、語の列が無いので、チップごと出さない。
 * 候補の表は、開いた時に初めて読み込む。
 */
export function ReadingChip(props: ReadingChipProps) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const { evaluation } = props;
  const fixedSurfaces = evaluation.text.reading?.corrections.length ?? 0;
  const fixedWords = evaluation.text.reading?.wordCorrections?.length ?? 0;
  const unfound = evaluation.wordCorrections.unfound.length;

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
        <span className="context-chip-value" data-reading-unfound-count={unfound > 0 ? unfound : undefined}>
          {fixedSurfaces + fixedWords > 0 ? `${correctionCountText(fixedSurfaces, fixedWords)}を直し済み` : `${evaluation.words.length}語`}
          {unfound > 0 ? `・見つからない直し${unfound}` : ''}
        </span>
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

function ReadingEditor({ evaluation, source, targets, setups, catalog, overrides, onCorrect, onCorrectWord }: ReadingChipProps) {
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

  // 同じ表記の語の場所。語ごとの直しがどの語に当たるかは本文を編集するたびに変わるので、評価のたびに求め直す
  const occurrencesBySurface = useMemo(() => {
    const basis = text.segmentationBasis;
    const bySurface = new Map<string, ReadingOccurrence[]>();
    if (basis === undefined) return bySurface;
    for (const occurrence of listReadingOccurrences(basis.sourceText, basis.tokens, evaluation.wordCorrections)) {
      const list = bySurface.get(occurrence.surface);
      if (list === undefined) bySurface.set(occurrence.surface, [occurrence]);
      else list.push(occurrence);
    }
    return bySurface;
  }, [text.segmentationBasis, evaluation.wordCorrections]);

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
      <p className="reading-editor-hint">
        漢字を含む語の読みです。直すと、このテキストの同じ表記の語すべてに当たります。同じ表記が複数ある語は、場所ごとにも直せます。
      </p>
      {evaluation.wordCorrections.unfound.length > 0 ? (
        <section className="reading-unfound" role="status" data-reading-unfound="true" aria-label="見つからない読みの直し">
          <p className="reading-editor-note">本文の編集で語が変わり、見つからない読みの直しがあります。数値には使っていません。</p>
          <ul className="reading-editor-list">
            {evaluation.wordCorrections.unfound.map((entry) => (
              <UnfoundCorrectionRow
                key={`${entry.surface}:${entry.order}:${entry.before}:${entry.after}`}
                entry={entry}
                places={occurrencesBySurface.get(entry.surface) ?? NO_OCCURRENCES}
                onCorrectWord={(remove, add) => onCorrectWord(text.ref, remove, add)}
              />
            ))}
          </ul>
        </section>
      ) : null}
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
                places={occurrencesBySurface.get(entry.word.surface) ?? NO_OCCURRENCES}
                onCorrectWord={(remove, add) => onCorrectWord(text.ref, remove, add)}
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

/** 語の前後の文字を添えた表示。改行は目に見える記号にする。 */
function snippetOf(anchor: WordAnchor): string {
  const visible = (text: string) => text.replace(/[\r\n]+/g, '↵');
  return `${visible(anchor.before)}【${anchor.surface}】${visible(anchor.after)}`;
}

interface ReadingControlsProps {
  /** 読みを入力する欄と候補の選択の名前に使う対象の言い方 */
  readonly subject: string;
  readonly candidates: readonly string[];
  /** 今の直し。無ければundefined */
  readonly correction: string | undefined;
  readonly onSet: (reading: string) => void;
  readonly onClear: () => void;
  readonly clearLabel: string;
}

/** 読みを直す操作（候補から選ぶ・ひらがなで入力する・直しを消す）。表記ごとの行と場所ごとの行で同じ形を使う。 */
function ReadingControls({ subject, candidates, correction, onSet, onClear, clearLabel }: ReadingControlsProps) {
  const [draft, setDraft] = useState('');
  const [invalid, setInvalid] = useState(false);

  const commit = () => {
    const value = draft.trim();
    if (value === '') {
      // 空にする操作は、直しを消す操作
      if (correction !== undefined) onClear();
      setInvalid(false);
      return;
    }
    if (!isCorrectionReading(value)) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    setDraft('');
    if (value !== correction) onSet(value);
  };

  return (
    <>
      <div className="reading-word-controls">
        {candidates.length >= 2 ? (
          <select
            aria-label={`${subject}の読みの候補`}
            value={correction !== undefined && candidates.includes(correction) ? correction : ''}
            onChange={(event) => {
              const value = event.currentTarget.value;
              if (value !== '') onSet(value);
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
          aria-label={`${subject}の読みを入力`}
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
          <button type="button" onClick={onClear}>
            {clearLabel}
          </button>
        ) : null}
      </div>
      {invalid ? (
        <p className="reading-word-error" role="alert">
          読みはひらがなと「ー」で入力してください。
        </p>
      ) : null}
    </>
  );
}

interface ReadingWordRowProps {
  readonly entry: OrderedReadingWord;
  readonly correction: string | undefined;
  readonly onCorrect: (surface: string, reading: string | undefined) => void;
  /** 同じ表記の語の場所（出現の順） */
  readonly places: readonly ReadingOccurrence[];
  readonly onCorrectWord: (remove: readonly WordAnchor[], add: WordReadingCorrection | undefined) => void;
}

function ReadingWordRow({ entry, correction, onCorrect, places, onCorrectWord }: ReadingWordRowProps) {
  const { word, candidates } = entry;
  const [showPlaces, setShowPlaces] = useState(false);
  const current = correction ?? word.dictionaryReadings[0];
  const fixedPlaces = places.filter((place) => place.stored !== undefined).length;
  const placesId = useId();

  return (
    <li className="reading-word" data-reading-word={word.surface} data-reading-corrected={correction !== undefined || undefined}>
      <span className="reading-word-surface">{word.surface}</span>
      <span className="reading-word-count">{word.count}回</span>
      <span className="reading-word-current" data-reading-current="true">
        {current ?? '読みなし'}
      </span>
      {correction !== undefined ? <span className="reading-word-badge">直し済み</span> : null}
      {fixedPlaces > 0 ? <span className="reading-word-badge">場所ごとに{fixedPlaces}件直し済み</span> : null}
      <ReadingControls
        subject={word.surface}
        candidates={candidates}
        correction={correction}
        onSet={(reading) => onCorrect(word.surface, reading)}
        onClear={() => onCorrect(word.surface, undefined)}
        clearLabel="辞書の読みに戻す"
      />
      {places.length >= 2 ? (
        <>
          <button
            type="button"
            className="reading-places-toggle"
            aria-expanded={showPlaces}
            aria-controls={showPlaces ? placesId : undefined}
            data-reading-places-toggle={word.surface}
            onClick={() => setShowPlaces((value) => !value)}
          >
            場所ごとに直す
          </button>
          {showPlaces ? (
            <ReadingPlaces
              id={placesId}
              surface={word.surface}
              surfaceCorrection={correction}
              candidates={candidates}
              places={places}
              onCorrectWord={onCorrectWord}
            />
          ) : null}
        </>
      ) : null}
    </li>
  );
}

interface ReadingPlacesProps {
  readonly id: string;
  readonly surface: string;
  readonly surfaceCorrection: string | undefined;
  readonly candidates: readonly string[];
  readonly places: readonly ReadingOccurrence[];
  readonly onCorrectWord: (remove: readonly WordAnchor[], add: WordReadingCorrection | undefined) => void;
}

/** 同じ表記の語を場所ごとに並べ、1つの語だけの読みを直す。 */
function ReadingPlaces({ id, surface, surfaceCorrection, candidates, places, onCorrectWord }: ReadingPlacesProps) {
  const [limit, setLimit] = useState(PLACE_PAGE);
  return (
    <div className="reading-places" id={id}>
      <ul className="reading-places-list">
        {places.slice(0, limit).map((place) => {
          const wordReading = place.stored?.reading;
          const shown = wordReading ?? surfaceCorrection ?? place.dictionaryReading;
          return (
            <li
              key={place.tokenIndex}
              className="reading-place"
              data-reading-place={place.order}
              data-reading-place-corrected={wordReading !== undefined || undefined}
            >
              <span className="reading-place-snippet">{snippetOf(place)}</span>
              <span className="reading-word-current" data-reading-place-current="true">
                {shown ?? '読みなし'}
              </span>
              {wordReading !== undefined ? <span className="reading-word-badge">この語を直し済み</span> : null}
              <ReadingControls
                subject={`${surface}（${snippetOf(place)}）`}
                candidates={candidates}
                correction={wordReading}
                onSet={(reading) =>
                  onCorrectWord(place.stored === undefined ? [] : [place.stored], {
                    surface,
                    order: place.order,
                    before: place.before,
                    after: place.after,
                    reading,
                  })
                }
                onClear={() => onCorrectWord(place.stored === undefined ? [] : [place.stored], undefined)}
                clearLabel="この語の直しを消す"
              />
            </li>
          );
        })}
      </ul>
      {places.length > limit ? (
        <button type="button" className="reading-editor-more" onClick={() => setLimit((current) => current + PLACE_PAGE)}>
          さらに表示
        </button>
      ) : null}
    </div>
  );
}

interface UnfoundCorrectionRowProps {
  readonly entry: WordReadingCorrection;
  /** 同じ表記の語の場所。付け直し先になる */
  readonly places: readonly ReadingOccurrence[];
  readonly onCorrectWord: (remove: readonly WordAnchor[], add: WordReadingCorrection | undefined) => void;
}

/** 見つからない直し。同じ表記の語の1つへ付け直すか、消す。 */
function UnfoundCorrectionRow({ entry, places, onCorrectWord }: UnfoundCorrectionRowProps) {
  return (
    <li className="reading-word" data-reading-unfound-entry={entry.surface}>
      <span className="reading-word-surface">{entry.surface}</span>
      <span className="reading-word-current">{entry.reading}</span>
      <span className="reading-place-snippet">{snippetOf(entry)}</span>
      <div className="reading-word-controls">
        {places.length > 0 ? (
          <select
            aria-label={`${entry.surface}の付け直し先`}
            value=""
            onChange={(event) => {
              const place = places[Number(event.currentTarget.value)];
              if (place === undefined) return;
              // 付け直し先の語にすでに当たっている直しも、置き換える
              onCorrectWord([entry, ...(place.stored === undefined ? [] : [place.stored])], {
                surface: entry.surface,
                order: place.order,
                before: place.before,
                after: place.after,
                reading: entry.reading,
              });
            }}
          >
            <option value="">付け直す語を選ぶ</option>
            {places.map((place, index) => (
              <option key={place.tokenIndex} value={index}>
                {snippetOf(place)}
              </option>
            ))}
          </select>
        ) : (
          <span className="reading-editor-note">同じ表記の語がありません。</span>
        )}
        <button type="button" onClick={() => onCorrectWord([entry], undefined)}>
          消す
        </button>
      </div>
    </li>
  );
}
