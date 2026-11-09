import {
  useEffect,
  useEffectEvent,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react';
import { analysisTargetKey, type AnalysisTarget } from '#input/setup/index.ts';
import {
  filterTargetChoiceGroups,
  selectedVisibleTargetKeys,
  targetSummaryText,
  unselectedVisibleTargets,
  type TargetChoiceGroup,
  type TargetKindFilter,
} from './target-choices.ts';
import { isStrokeOnlyMark, targetMark, targetMarkPath, type TargetMark } from '#ui/theme/target-marks.ts';
import './target-selection.css';
import { MOBILE_QUERY } from '#ui/theme/breakpoints.ts';
import { FloatingWindow } from './FloatingWindow.tsx';
import { claimTargetSelection, openTargetSelectionId, releaseTargetSelection, subscribeTargetSelection } from './target-selection-open.ts';

/**
 * 見出しの「対象」ボタンと、そこから開く対象の選択（docs/architecture.md「対象の選択」）。
 *
 * - 絞り込み欄と、区分ごとのチェックリスト（1つだけ選ぶAnalyzerはラジオ）で選ぶ
 * - 選んだ瞬間に反映する。決定ボタンは置かない（戻したい時はUndo）
 * - 見出しには対象の名前を並べ、入り切らなければ「先頭 他N件」に畳む。全件はhover
 * - Analyzerが差し込む項目（比較表の基準）は、選択の中の一覧の下に置く
 *
 * 開く先は解析設定と同じ浮かぶ小窓（`FloatingWindow`）。非モーダルで背後を暗くせず、見出しをドラッグして動かせるので、
 * 選んだ結果の図を見ながら対象を足し引きできる。外を押しても、フォーカスが外へ移っても閉じない。閉じるのは×・Escape・
 * 対象ボタンをもう一度押す時。Escapeはフォーカスが小窓の外にあっても閉じる（別の小窓の中にフォーカスがあれば、その小窓が先に受ける）。
 * パソコン幅は対象ボタンの近くに出し、スマホ幅は解析設定と同じ下からのシートにする。
 * 閉じても、絞り込み欄の語・種類の切り替え・一覧のスクロールの位置は覚えていて、開き直すと同じ状態で開く（保存はしない）。
 * 開いている選択は画面全体で1つ（`target-selection-open.ts`）。別の選択を開くと、開いていた方は閉じる。
 * 小窓は`document.body`へ出る。ペインの枠はcontainer（レイアウト封じ込め）なので、中に置くと`position: fixed`が
 * 画面ではなくペインを基準にしてしまう。
 */
export interface TargetSummaryItem {
  readonly key: string;
  /** 集合に対して計算した表示名。 */
  readonly label: string;
  /** hoverに出すフルの名前。 */
  readonly fullName: string;
  /** 集合の中で配った色。色を使わないAnalyzerでは省く。 */
  readonly color?: string | undefined;
  /** 色以外の手がかり（点の形）。色と同じ番号から決まる。 */
  readonly mark?: TargetMark | undefined;
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
  /**
   * 開いているか（省略時は部品の中で持つ）。ペインの空の時のボタンからも開けるよう、ホストが持てる。
   */
  readonly open?: boolean;
  readonly onOpenChange?: (open: boolean) => void;
  /**
   * 自動で開くか。`undefined`の間はまだ決めない（資産の読み込み中）。最初に`true`/`false`が来た時の値で
   * 決めて固定し、`true`ならその時に一度だけ、フォーカスを奪わずに開く（対象が空のペインを開いた直後）。
   * 後から対象が空になっても開かない（最後の1件を外した・別のタブで外された時に勝手に開かないように）。
   * 別の選択が既に開いている時は開かず、後でその選択が閉じても開かない（利用者が開いた選択を閉じないため）。
   * パソコン幅だけ。スマホ幅のシートは画面を覆うので自動では出さない。
   */
  readonly autoOpen?: boolean | undefined;
  /**
   * 何を選ぶ部品か（読み上げ名とダイアログ名の先頭）。省略時は「対象」。1つの画面に選択が2つ並ぶ時に、
   * どちらの値を変えるのかを名前で区別する。
   */
  readonly label?: string;
}

/** スマホ幅（シートで出す幅）。解析設定のシートと同じ境目（`ui/theme/breakpoints.ts`）。 */
const SHEET_MEDIA = MOBILE_QUERY;

/** 種類の切り替え。並びは「すべて」を先頭に置く。 */
const KIND_FILTERS: readonly { readonly value: TargetKindFilter; readonly label: string }[] = [
  { value: 'all', label: 'すべて' },
  { value: 'kana', label: 'かな配列' },
  { value: 'alpha', label: '英字の配列' },
];

function isSheet(): boolean {
  return typeof window !== 'undefined' && window.matchMedia(SHEET_MEDIA).matches;
}

const TABBABLE = 'a[href], button, input, select, textarea, [tabindex]';

/**
 * Tabで止まる要素（文書順）。ラジオは同じ組の中で選ばれている1つ（無ければ先頭）だけが止まる。
 */
function tabbables(root: HTMLElement): HTMLElement[] {
  const seenRadioGroups = new Set<string>();
  const elements = [...root.querySelectorAll<HTMLElement>(TABBABLE)].filter((element) => {
    if (element.tabIndex < 0) return false;
    if ((element as HTMLButtonElement).disabled || element.closest('fieldset:disabled') !== null) return false;
    if (element.getClientRects().length === 0) return false;
    return true;
  });
  return elements.filter((element) => {
    if (!(element instanceof HTMLInputElement) || element.type !== 'radio' || element.name === '') return true;
    if (seenRadioGroups.has(element.name)) return false;
    const group = elements.filter((other): other is HTMLInputElement => other instanceof HTMLInputElement && other.name === element.name);
    const chosen = group.find((radio) => radio.checked) ?? group[0];
    if (chosen !== element) return false;
    seenRadioGroups.add(element.name);
    return true;
  });
}

export function TargetSelection({
  mode,
  groups,
  selected,
  summary,
  onChange,
  extraItem,
  open: controlledOpen,
  onOpenChange,
  autoOpen,
  label = '対象',
}: TargetSelectionProps) {
  const [innerOpen, setInnerOpen] = useState(false);
  const open = controlledOpen ?? innerOpen;
  const setOpen = (next: boolean) => {
    if (controlledOpen === undefined) setInnerOpen(next);
    onOpenChange?.(next);
  };
  // 開いた時にフォーカスを中へ移すか。自動で開いた時だけ移さない（他の操作を阻害しない）。
  const focusOnOpenRef = useRef(true);
  // 自動で開くかを決めたか（読み込みが終わった最初の1回で決め、以後は変えない）。
  const autoOpenDecidedRef = useRef(false);
  const [query, setQuery] = useState('');
  const [kindFilter, setKindFilter] = useState<TargetKindFilter>('all');
  const [fits, setFits] = useState(true);
  const panelId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const filterRef = useRef<HTMLInputElement>(null);
  const summaryRef = useRef<HTMLSpanElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const moreRef = useRef<HTMLSpanElement>(null);
  // 直前の操作がポインタか。ラジオを矢印キーで送っている間は閉じない（見比べながら送れるように）。
  const pointerRef = useRef(false);
  // 閉じた時の一覧のスクロールの位置。保存はせず、ページを読み込み直すと初期の状態に戻る。
  const scrollTopRef = useRef(0);

  const names = summary.map((item) => item.label);
  const fullText = names.join('、');
  const summaryText = targetSummaryText(names, fits);
  const title = summary
    .map((item) => item.fullName)
    .filter((name) => name !== '')
    .join('\n');
  const selectedKeys = useMemo(() => new Set(summary.map((item) => item.key)), [summary]);
  const swatchByKey = useMemo(() => new Map(summary.map((item) => [item.key, item] as const)), [summary]);
  const visibleGroups = filterTargetChoiceGroups(groups, query, kindFilter);
  // 一覧に出ている候補のうち、まだ選んでいないもの（一覧の順。同じ対象が複数の区分に出ても1回だけ）。
  const unselectedVisible = useMemo(() => unselectedVisibleTargets(visibleGroups, selectedKeys), [visibleGroups, selectedKeys]);
  // 一覧に出ていて、選んでいる対象（キーの集合）。「表示中を全部外す」はこれだけを外す。
  const selectedVisible = useMemo(() => selectedVisibleTargetKeys(visibleGroups, selectedKeys), [visibleGroups, selectedKeys]);

  // 全部の名前が入るかを実寸で測る。測る用の要素（見えない・全文）と、ボタンが使える幅を比べる。
  // 使える幅 = 見出しの対象の欄の幅 − ボタンの名前以外の部分の幅。
  // biome-ignore lint/correctness/useExhaustiveDependencies: fullTextは測り直す時を決める合図。本体では読まない（測る要素の中身が変わる）。依存から外すと、名前が変わっても収まるかを測り直さない
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

  // 自動で開くかを決めるのは、autoOpenが決まった最初の一度だけ。開いているか・開く関数は、決める時の値を読む。
  const decideAutoOpen = useEffectEvent((shouldOpen: boolean) => {
    // すでに開いている（読み込み中に押した）時は、フォーカスの扱いを変えない。
    // 別の選択が開いている時は開かない（利用者が開いた選択を閉じないため）。
    if (!shouldOpen || open || isSheet() || openTargetSelectionId() !== undefined) return;
    // 同じ描画で決まる別のペインが重ねて開かないよう、開く前に押さえる。
    claimTargetSelection(panelId);
    focusOnOpenRef.current = false;
    setOpen(true);
  });
  useEffect(() => {
    if (autoOpen === undefined || autoOpenDecidedRef.current) return;
    autoOpenDecidedRef.current = true;
    decideAutoOpen(autoOpen);
  }, [autoOpen]);

  const close = (focusButton: boolean) => {
    // 開き直した時に同じ場所から見られるよう、一覧のスクロールの位置を覚える（絞り込みの語と種類は状態に残す）。
    const list = document.getElementById(panelId)?.querySelector('.target-selection-list');
    if (list !== null && list !== undefined) scrollTopRef.current = list.scrollTop;
    setOpen(false);
    if (focusButton) buttonRef.current?.focus({ preventScroll: true });
  };

  // 閉じる時にフォーカスをボタンへ戻すのは、小窓の中かボタンにあった時だけ（自動で開いたまま別の所を操作している時に、フォーカスを奪わない）。
  const focusIsInside = () => {
    const active = document.activeElement;
    if (active === null) return false;
    return document.getElementById(panelId)?.contains(active) === true || buttonRef.current?.contains(active) === true;
  };

  // 開いている間は、画面全体で開いている選択として押さえる。別の選択が押さえたら閉じる。
  const closeByOther = useEffectEvent(() => close(false));
  useEffect(() => {
    if (!open) return undefined;
    claimTargetSelection(panelId);
    const unsubscribe = subscribeTargetSelection(() => {
      const current = openTargetSelectionId();
      if (current !== undefined && current !== panelId) closeByOther();
    });
    return () => {
      unsubscribe();
      releaseTargetSelection(panelId);
    };
  }, [open, panelId]);

  // Escapeは、フォーカスが小窓の外にあっても閉じる。小窓の中にフォーカスがある時は、小窓自身が受けて閉じる。
  const closeFromEscape = useEffectEvent(() => close(focusIsInside()));
  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeFromEscape();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  // 開いた時のフォーカス。パソコン幅は絞り込み欄へ（すぐ打てるように）。スマホ幅は小窓自体へ（絞り込み欄へ移すと
  // ソフトキーボードが開き、一覧が隠れる）。自動で開いた時は移さない。
  const initialFocus = () => {
    // 置き場が決まって一覧の高さが定まってから、前に閉じた時のスクロールの位置へ戻す。
    const list = document.getElementById(panelId)?.querySelector('.target-selection-list');
    if (list !== null && list !== undefined) list.scrollTop = scrollTopRef.current;
    if (!focusOnOpenRef.current) {
      focusOnOpenRef.current = true;
      return false;
    }
    return isSheet() ? null : filterRef.current;
  };

  /**
   * 小窓は`document.body`の末尾へ出しているので、Tabの順は画面上の位置とつながっていない。
   * 最後から先へ進んだらボタンの次へ、最初から戻ったらボタンへ、フォーカスだけを移す（閉じない）。
   */
  const leaveByTab = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const panel = document.getElementById(panelId);
    const button = buttonRef.current;
    if (!panel || !button) return;
    const inside = tabbables(panel);
    const active = document.activeElement;
    const atStart = active === panel || active === inside[0];
    const atEnd = active === inside[inside.length - 1];
    if (event.shiftKey && atStart) {
      event.preventDefault();
      button.focus({ preventScroll: true });
    } else if (!event.shiftKey && atEnd) {
      event.preventDefault();
      const page = tabbables(document.body).filter((element) => !panel.contains(element));
      const next = page[page.indexOf(button) + 1];
      (next ?? button).focus();
    }
  };

  const toggle = (target: AnalysisTarget, key: string, checked: boolean) => {
    if (mode === 'single') {
      if (checked) onChange([target]);
      if (pointerRef.current) close(true);
      return;
    }
    // 加えた対象は末尾に付ける。表示の並びはホストが一覧の順に並べ直す（色は集合の側が加えた順に配る）。
    onChange(checked ? [...selected, target] : selected.filter((target) => analysisTargetKey(target) !== key));
  };

  /**
   * 選ばれているラジオを押した・Space/Enterで確定した時の共通処理（書き込んで閉じる）。
   * 押す前から選ばれているのでchangeは起きない。ホストが既定の対象を表示しているだけの時も「選んだ」にする。
   */
  const confirmChecked = (target: AnalysisTarget, key: string) => {
    toggle(target, key, true);
    close(true);
  };

  const selectAllVisible = () => onChange([...selected, ...unselectedVisible]);
  // 一覧に出ていない選択中の対象は残す（絞り込みで隠れた対象を、見えないまま外さないため）。
  const clearVisible = () => onChange(selected.filter((target) => !selectedVisible.has(analysisTargetKey(target))));

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
        aria-label={`${label}: ${ariaSummary}`}
        title={title || undefined}
        onClick={() => (open ? close(false) : setOpen(true))}
      >
        {mode === 'multiple' && summary.some((item) => item.color !== undefined) ? (
          <span className="target-selection-swatches" aria-hidden="true">
            {summary.slice(0, 3).map((item) => (
              <TargetSwatch key={item.key} color={item.color} mark={item.mark} />
            ))}
          </span>
        ) : null}
        <span ref={summaryRef} className="target-selection-summary">
          {summaryText.text}
        </span>
        {summaryText.more !== undefined ? (
          <span ref={moreRef} className="target-selection-more">
            {summaryText.more}
          </span>
        ) : null}
        <span ref={measureRef} className="target-selection-measure" aria-hidden="true">
          {fullText}
        </span>
        <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true" className="target-selection-chevron">
          <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
      {open ? (
        <FloatingWindow
          open
          onClose={() => close(focusIsInside())}
          title={`${label}の選択`}
          closeLabel={`${label}の選択を閉じる`}
          kind="target-selection"
          id={panelId}
          anchor={buttonRef.current}
          placement="popover"
          initialFocus={initialFocus}
          onKeyDown={(event) => {
            pointerRef.current = false;
            if (event.key === 'Tab') leaveByTab(event);
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
            <fieldset className="plain-group target-selection-kind" aria-label="配列の種類で絞り込む">
              {KIND_FILTERS.map((item) => (
                <label key={item.value}>
                  <input type="radio" name={`${panelId}-kind`} checked={kindFilter === item.value} onChange={() => setKindFilter(item.value)} />
                  <span>{item.label}</span>
                </label>
              ))}
            </fieldset>
          </div>
          {/* 直前の操作がポインタかを覚えるだけの入れ物。操作の対象は中のチェックボックスとラジオ */}
          <div
            className="target-selection-list"
            role="presentation"
            onPointerDown={() => {
              pointerRef.current = true;
            }}
          >
            {visibleGroups.length === 0 ? (
              <p className="target-selection-empty">当てはまる配列・Setupはありません。</p>
            ) : (
              visibleGroups.map((group) => (
                <fieldset key={group.id} className="target-selection-group" data-target-group={group.id}>
                  <legend>{group.label}</legend>
                  {group.choices.map((choice) => {
                    const checked = selectedKeys.has(choice.key);
                    const swatch = swatchByKey.get(choice.key);
                    return (
                      <label key={choice.key} className="target-selection-choice" title={choice.fullName ?? choice.name}>
                        <input
                          type={mode === 'single' ? 'radio' : 'checkbox'}
                          name={mode === 'single' ? `${panelId}-target` : undefined}
                          value={choice.key}
                          checked={checked}
                          onChange={(event) => toggle(choice.target, choice.key, event.currentTarget.checked)}
                          // 選ばれているラジオを押してもchangeは起きない。ホストが既定の対象を表示しているだけの時も
                          // 「選んだ」として書き込み、押したら閉じる動きも揃える（描画時点で選ばれていたものだけ。
                          // 矢印キーで別のラジオへ移る時のclickは、移り先がまだ選ばれていないので対象にならない）。
                          onClick={mode === 'single' && checked ? () => confirmChecked(choice.target, choice.key) : undefined}
                          // Chromeでは選ばれているラジオでSpaceを押してもclickが起きないので、キーボードでも同じ確定を通す。
                          // 矢印キーはここでは扱わず、これまでどおりchangeで書いて閉じない。
                          onKeyDown={
                            mode === 'single' && checked
                              ? (event) => {
                                  if (event.key !== ' ' && event.key !== 'Enter') return;
                                  // Enterのフォーム送信・Spaceのスクロールやclick（ブラウザによっては二重に走る）を止める。
                                  event.preventDefault();
                                  confirmChecked(choice.target, choice.key);
                                }
                              : undefined
                          }
                        />
                        {mode === 'multiple' ? (
                          <TargetSwatch color={checked ? swatch?.color : undefined} mark={checked ? swatch?.mark : undefined} />
                        ) : null}
                        <span className="target-selection-choice-text">
                          <span className="target-selection-choice-name">{choice.name}</span>
                          {/* ラベル付きのSetupは、何の配列・物理配列かを2行目に出す（hoverの無いタッチでも見えるように）。 */}
                          {choice.fullName !== undefined ? <span className="target-selection-choice-detail">{choice.fullName}</span> : null}
                        </span>
                        {choice.tag !== undefined ? <span className="target-selection-choice-tag">{choice.tag}</span> : null}
                      </label>
                    );
                  })}
                </fieldset>
              ))
            )}
          </div>
          {extraItem !== undefined ? <div className="target-selection-extra">{extraItem}</div> : null}
          <div className="target-selection-foot">
            {mode === 'multiple' ? (
              <>
                <span className="target-selection-count" role="status">
                  <b>{selected.length}</b>件を選択中
                </span>
                <button type="button" onClick={selectAllVisible} disabled={unselectedVisible.length === 0}>
                  表示中を全部選ぶ
                </button>
                <button type="button" onClick={clearVisible} disabled={selectedVisible.size === 0}>
                  表示中を全部外す
                </button>
              </>
            ) : (
              <span className="target-selection-count">配列かSetupを1つ選んでください</span>
            )}
          </div>
        </FloatingWindow>
      ) : null}
    </div>
  );
}

/**
 * 対象の色見本。色に加えて点の形を持つので、色を見分けにくくても、図の凡例と対応づけられる。
 * 選ばれていない時（色が無い時）は、塗らない丸の枠で場所だけ空けておく。
 */
function TargetSwatch({ color, mark }: { readonly color: string | undefined; readonly mark: TargetMark | undefined }) {
  if (color === undefined) {
    return (
      <svg className="target-selection-swatch" viewBox="-5 -5 10 10" aria-hidden="true" data-off="true">
        <circle r={3.6} style={{ fill: 'none', stroke: 'var(--border-strong)' }} strokeWidth={1.2} />
      </svg>
    );
  }
  const shape = (mark ?? targetMark(0)).shape;
  const strokeOnly = isStrokeOnlyMark(shape);
  return (
    <svg className="target-selection-swatch" viewBox="-5 -5 10 10" aria-hidden="true" data-mark={shape}>
      <path
        d={targetMarkPath(shape, 3.8)}
        style={strokeOnly ? { fill: 'none', stroke: color } : { fill: color }}
        strokeWidth={strokeOnly ? 1.8 : undefined}
      />
    </svg>
  );
}
