import { createPortal } from 'react-dom';
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { analysisTargetKey, type AnalysisTarget } from '#input/setup/index.ts';
import { filterTargetChoiceGroups, targetSummaryText, type TargetChoiceGroup } from './target-choices.ts';
import './target-selection.css';

/**
 * 見出しの「対象」ボタンと、そこから開く対象の選択（docs/architecture.md「対象の選択」）。
 *
 * - 絞り込み欄と、区分ごとのチェックリスト（1つだけ選ぶAnalyzerはラジオ）で選ぶ
 * - 選んだ瞬間に反映する。決定ボタンは置かない（戻したい時はUndo）
 * - 見出しには対象の名前を並べ、入り切らなければ「先頭 他N件」に畳む。全件はhover
 * - Analyzerが差し込む項目（比較表の基準）は、選択の中の一覧の下に置く
 *
 * パソコン幅ではボタンの下に重ねて開く非モーダルのポップオーバー、スマホ幅では画面下からのシート
 * （`target-selection.css`）。どちらも`document.body`へ出す。ペインの枠はcontainer（レイアウト封じ込め）
 * なので、中に置くと`position: fixed`が画面ではなくペインを基準にしてしまう。
 */
export interface TargetSummaryItem {
  readonly key: string;
  /** 集合に対して計算した表示名。 */
  readonly label: string;
  /** hoverに出すフルの名前。 */
  readonly fullName: string;
  /** 集合の中で配った色。色を使わないAnalyzerでは省く。 */
  readonly color?: string;
}

export interface TargetSelectionProps {
  /** `multiple`はチェックボックス、`single`はラジオ。 */
  readonly mode: 'multiple' | 'single';
  readonly groups: readonly TargetChoiceGroup[];
  /** 今の対象（並びが表示順）。 */
  readonly selected: readonly AnalysisTarget[];
  /** 見出しに出す名前と色。`selected`と同じ並び。 */
  readonly summary: readonly TargetSummaryItem[];
  readonly onChange: (next: readonly AnalysisTarget[]) => void;
  /** Analyzerが対象の選択に差し込む項目（`AnalyzerPaneParts.TargetItem`をホストが値と結んだもの）。 */
  readonly extraItem?: ReactNode;
}

/** スマホ幅（シートで出す幅）。解析設定の小窓（`pane-frame.css`）と同じ境目。 */
const SHEET_MEDIA = '(max-width: 640px)';
const EDGE = 8;

function isSheet(): boolean {
  return typeof window !== 'undefined' && window.matchMedia(SHEET_MEDIA).matches;
}

interface Position {
  readonly x: number;
  readonly y: number;
  /** 置いた位置から画面の端までの高さ。一覧はこの中でスクロールする。 */
  readonly maxHeight?: number;
}

/** 下に置いて一覧が見られる最低限の高さ。これより狭く、上の方が広い時だけ上に出す。 */
const MIN_BELOW = 280;

/**
 * ボタンの左端に揃えて真下に出す。下が狭ければ高さを詰め、それでも足りず上の方が広い時だけ上に出す。
 * 上に出すと、開いた選択が見出しより上（テキスト等）を隠すため、下を優先する。
 */
function popoverPosition(anchor: HTMLElement): Position {
  const rect = anchor.getBoundingClientRect();
  const width = Math.min(24 * 16, window.innerWidth - 2 * EDGE);
  const x = Math.max(EDGE, Math.min(rect.left, window.innerWidth - width - EDGE));
  const below = rect.bottom + 6;
  const spaceBelow = window.innerHeight - below - EDGE;
  const spaceAbove = rect.top - 6 - EDGE;
  if (spaceBelow >= MIN_BELOW || spaceBelow >= spaceAbove) return { x, y: below, maxHeight: spaceBelow };
  return { x, y: EDGE, maxHeight: spaceAbove };
}

/** スマホ幅はシート（位置はCSSが決める）、パソコン幅はボタンの近く。 */
function placeFor(anchor: HTMLElement): Position {
  return isSheet() ? { x: 0, y: 0 } : popoverPosition(anchor);
}

export function TargetSelection({ mode, groups, selected, summary, onChange, extraItem }: TargetSelectionProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [position, setPosition] = useState<Position | undefined>(undefined);
  const [fits, setFits] = useState(true);
  const panelId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const filterRef = useRef<HTMLInputElement>(null);
  const summaryRef = useRef<HTMLSpanElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const moreRef = useRef<HTMLSpanElement>(null);
  // 直前の操作がポインタか。ラジオを矢印キーで送っている間は閉じない（見比べながら送れるように）。
  const pointerRef = useRef(false);

  const names = summary.map((item) => item.label);
  const fullText = names.join('、');
  const summaryText = targetSummaryText(names, fits);
  const title = summary.map((item) => item.fullName).filter((name) => name !== '').join('\n');
  const selectedKeys = useMemo(() => new Set(summary.map((item) => item.key)), [summary]);
  const colorByKey = useMemo(() => new Map(summary.map((item) => [item.key, item.color] as const)), [summary]);
  const visibleGroups = filterTargetChoiceGroups(groups, query);

  // 全部の名前が入るかを実寸で測る。測る用の要素（見えない・全文）と、ボタンが使える幅を比べる。
  // 使える幅 = 見出しの対象の欄の幅 − ボタンの名前以外の部分の幅。
  useLayoutEffect(() => {
    const button = buttonRef.current;
    const measure = measureRef.current;
    const label = summaryRef.current;
    const container = button?.parentElement;
    if (!button || !measure || !label || !container) return undefined;
    const update = () => {
      const more = moreRef.current;
      const gap = Number.parseFloat(getComputedStyle(button).columnGap) || 0;
      // ボタンの名前以外の部分（色見本・矢印・余白）の幅。畳んでいる時の「他N件」とその間隔も除く。
      const chrome = button.offsetWidth - label.offsetWidth - (more ? more.offsetWidth + gap : 0);
      setFits(measure.scrollWidth <= container.clientWidth - chrome + 1);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(container);
    return () => observer.disconnect();
  }, [fullText]);

  const close = (focusButton: boolean) => {
    setOpen(false);
    setQuery('');
    setPosition(undefined);
    if (focusButton) buttonRef.current?.focus();
  };

  // 開いたら置き場を決める（描く前に決まるので、置く前の位置は見えない）。
  useLayoutEffect(() => {
    if (open && buttonRef.current) setPosition(placeFor(buttonRef.current));
  }, [open]);

  // フォーカスは置き場が決まって見えるようになってから移す（見えない要素へはフォーカスが入らない）。
  // パソコン幅は絞り込み欄へ（すぐ打てるように）。スマホ幅はシート自体へ（絞り込み欄へ移すと
  // ソフトキーボードが開き、一覧が隠れる）。
  const placed = position !== undefined;
  useEffect(() => {
    if (!placed) return;
    if (isSheet()) panelRef.current?.focus();
    else filterRef.current?.focus();
  }, [placed]);

  // 外を押す・Escapeで閉じる。画面の大きさ・スクロールが変わったら置き直す。
  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (panelRef.current?.contains(target) || buttonRef.current?.contains(target)) return;
      close(false);
    };
    const reposition = () => {
      if (buttonRef.current) setPosition(placeFor(buttonRef.current));
    };
    // Escapeは、フォーカスが選択の外（ボタン等）にあっても閉じる。
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close(true);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, { passive: true, capture: true });
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, { capture: true });
    };
  }, [open]);

  const toggle = (target: AnalysisTarget, key: string, checked: boolean) => {
    if (mode === 'single') {
      if (checked) onChange([target]);
      if (pointerRef.current) close(true);
      return;
    }
    // 加えた対象は末尾に付く（並びが表示順。色は集合の側が加えた順に配る）。
    onChange(checked ? [...selected, target] : selected.filter((target) => analysisTargetKey(target) !== key));
  };

  const ariaSummary = names.length === 0 ? '未選択' : names.join('、');

  return (
    <div className="target-selection">
      <button
        ref={buttonRef}
        type="button"
        className="target-selection-button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label={`対象: ${ariaSummary}`}
        title={title || undefined}
        onClick={() => (open ? close(false) : setOpen(true))}
      >
        {mode === 'multiple' && summary.some((item) => item.color !== undefined) ? (
          <span className="target-selection-swatches" aria-hidden="true">
            {summary.slice(0, 3).map((item) => (
              <i key={item.key} className="target-selection-swatch" style={{ ['--swatch' as string]: item.color }} />
            ))}
          </span>
        ) : null}
        <span ref={summaryRef} className="target-selection-summary">{summaryText.text}</span>
        {summaryText.more !== undefined ? <span ref={moreRef} className="target-selection-more">{summaryText.more}</span> : null}
        <span ref={measureRef} className="target-selection-measure" aria-hidden="true">{fullText}</span>
        <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true" className="target-selection-chevron">
          <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
      {open ? createPortal(
        <>
          <div className="target-selection-scrim" aria-hidden="true" onClick={() => close(true)} />
          <div
            ref={panelRef}
            id={panelId}
            className="target-selection-panel"
            role="dialog"
            aria-modal="false"
            aria-label="対象の選択"
            tabIndex={-1}
            data-target-selection="true"
            style={position === undefined
              ? { visibility: 'hidden' }
              : {
                ['--target-selection-x' as string]: `${position.x}px`,
                ['--target-selection-y' as string]: `${position.y}px`,
                ...(position.maxHeight === undefined ? {} : { ['--target-selection-max-height' as string]: `${position.maxHeight}px` }),
              }}
            onKeyDown={() => {
              pointerRef.current = false;
            }}
            onPointerDown={() => {
              pointerRef.current = true;
            }}
          >
            <div className="target-selection-filter">
              <input
                ref={filterRef}
                type="search"
                value={query}
                placeholder="配列・Setupを名前で絞り込む"
                aria-label="配列・Setupを名前で絞り込む"
                onChange={(event) => setQuery(event.currentTarget.value)}
              />
            </div>
            <div className="target-selection-list">
              {visibleGroups.length === 0 ? (
                <p className="target-selection-empty">当てはまる配列・Setupは無い。</p>
              ) : visibleGroups.map((group) => (
                <fieldset key={group.id} className="target-selection-group" data-target-group={group.id}>
                  <legend>{group.label}</legend>
                  {group.choices.map((choice) => {
                    const checked = selectedKeys.has(choice.key);
                    const color = colorByKey.get(choice.key);
                    return (
                      <label key={choice.key} className="target-selection-choice" title={choice.fullName ?? choice.name}>
                        <input
                          type={mode === 'single' ? 'radio' : 'checkbox'}
                          name={mode === 'single' ? `${panelId}-target` : undefined}
                          value={choice.key}
                          checked={checked}
                          onChange={(event) => toggle(choice.target, choice.key, event.currentTarget.checked)}
                        />
                        {mode === 'multiple' ? (
                          <i
                            className="target-selection-swatch"
                            data-off={checked && color !== undefined ? undefined : 'true'}
                            style={checked && color !== undefined ? { ['--swatch' as string]: color } : undefined}
                            aria-hidden="true"
                          />
                        ) : null}
                        <span className="target-selection-choice-name">{choice.name}</span>
                        {choice.tag !== undefined ? <span className="target-selection-choice-tag">{choice.tag}</span> : null}
                      </label>
                    );
                  })}
                </fieldset>
              ))}
            </div>
            {extraItem !== undefined ? <div className="target-selection-extra">{extraItem}</div> : null}
            <div className="target-selection-foot">
              {mode === 'multiple' ? (
                <>
                  <span className="target-selection-count" role="status">
                    <b>{selected.length}</b>件を選択中
                  </span>
                  <button type="button" onClick={() => onChange([])} disabled={selected.length === 0}>すべて外す</button>
                </>
              ) : (
                <span className="target-selection-count">配列かSetupを1つ選ぶ</span>
              )}
              <button type="button" onClick={() => close(true)}>閉じる</button>
            </div>
          </div>
        </>,
        document.body,
      ) : null}
    </div>
  );
}
