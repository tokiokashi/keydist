import {
  useEffect,
  useEffectEvent,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { MOBILE_QUERY } from '#ui/theme/breakpoints.ts';
import { isDefaultValue, ResetButton, type OptionBinding, type OptionChoice } from './option-fields.tsx';
import './chip-select-option-field.css';

/** 画面の端から残す余白と、ボタンと小窓の間隔（px）。 */
const EDGE = 8;
const GAP = 4;
/** 小窓に取りたい高さ（px）。選択肢が多い時に、一覧を十分な行数で見られる高さ。 */
const WANTED_HEIGHT = 480;

interface PopoverPlace {
  readonly left: number;
  readonly top: number;
  readonly maxHeight: number;
}

/**
 * 小窓の置き場所。下に取りたい高さが入れば下、上に入れば上に置く。どちらにも入らない時は、ボタンに重なっても
 * 画面に収まる位置まで持ち上げて取りたい高さを確保する。ボタンの下の狭い隙間に置くと、一覧が数行しか見えないため。
 * 上端の位置で置くので、絞り込みで一覧が縮んでも検索欄は動かない。ボタンが画面の外にある時も、画面の中に収める。
 */
function placeNear(anchor: Element, width: number): PopoverPlace {
  const rect = anchor.getBoundingClientRect();
  const left = Math.max(EDGE, Math.min(rect.left, window.innerWidth - width - EDGE));
  const wanted = Math.min(WANTED_HEIGHT, window.innerHeight - EDGE * 2);
  const below = rect.bottom + GAP;
  const spaceBelow = window.innerHeight - below - EDGE;
  const spaceAbove = rect.top - GAP - EDGE;
  const preferred = spaceBelow >= wanted ? below : spaceAbove >= wanted ? rect.top - GAP - wanted : window.innerHeight - EDGE - wanted;
  const top = Math.max(EDGE, Math.min(preferred, window.innerHeight - EDGE - wanted));
  return { left, top, maxHeight: wanted };
}

/** 検索の語で選択肢の名前を絞る。大文字小文字と全角半角の違いは無視する。 */
function matchesQuery(label: string, query: string): boolean {
  const normalize = (text: string) => text.normalize('NFKC').toLowerCase();
  return normalize(label).includes(normalize(query.trim()));
}

/**
 * 多くの選択肢から複数を選ぶ項目（散布図の軸・比較表の表示する列）。
 * 選んだ選択肢だけを札で並べ、札ごとに外せる。足す時は「＋」から浮かぶ小窓を開き、名前で絞り込んで選ぶ。
 * 札は選択肢の並びで出す（既定値と比べた時に、同じ集合なら同じ値になるように）。選べない状態（`disabled`）の選択肢は
 * 小窓の中で選べない状態で見せ、選んでいるものは外せる。空も1つの値として扱う（全選択の意味にはしない）。
 *
 * 小窓は非モーダルで、外側を押すかEscapeで閉じる。`document.body`へ出すのは、解析設定の小窓が内側をスクロールさせるため、
 * 中に置くと小窓の端で切れるから。
 */
export function ChipSelectOptionField<T extends string>({
  label,
  binding,
  choices,
  order,
  hint,
}: {
  readonly label: string;
  readonly binding: OptionBinding<readonly T[]>;
  /** 小窓に並べる順。`group`を持つ選択肢は、見出しごとにまとめて、見出しは最初に現れた順に出す。 */
  readonly choices: readonly OptionChoice<T>[];
  /** 札と保存する値の並び。省略は`choices`の順。 */
  readonly order?: readonly T[];
  readonly hint?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [place, setPlace] = useState<PopoverPlace | undefined>(undefined);
  const pickerName = `${label}を選ぶ`;
  const labelId = useId();
  const panelId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const ordered = useMemo(
    () => (order === undefined ? choices : order.flatMap((value) => choices.filter((choice) => choice.value === value))),
    [choices, order],
  );
  const selected = ordered.filter((choice) => binding.value.includes(choice.value));
  const visible = useMemo(() => choices.filter((choice) => matchesQuery(choice.label, query)), [choices, query]);
  const groups = useMemo(() => {
    const plain = visible.filter((choice) => choice.group === undefined);
    const grouped = new Map<string, OptionChoice<T>[]>();
    for (const choice of visible) {
      if (choice.group === undefined) continue;
      grouped.set(choice.group, [...(grouped.get(choice.group) ?? []), choice]);
    }
    return { plain, grouped: [...grouped] };
  }, [visible]);

  const write = (values: ReadonlySet<T>) => binding.onChange(ordered.map((choice) => choice.value).filter((value) => values.has(value)));
  const toggle = (value: T) => {
    const next = new Set(binding.value);
    if (!next.delete(value)) next.add(value);
    write(next);
  };
  // 表示中の選択肢だけを対象にする。選べない状態のものは足さない。
  const selectVisible = () => write(new Set([...binding.value, ...visible.filter((choice) => choice.disabled !== true).map((choice) => choice.value)]));
  const clearVisible = () => write(new Set(binding.value.filter((value) => !visible.some((choice) => choice.value === value))));
  const hasUnselectedVisible = visible.some((choice) => choice.disabled !== true && !binding.value.includes(choice.value));
  const addMembers = (members: readonly OptionChoice<T>[]) =>
    write(new Set([...binding.value, ...members.filter((choice) => choice.disabled !== true).map((choice) => choice.value)]));
  const removeMembers = (members: readonly OptionChoice<T>[]) =>
    write(new Set(binding.value.filter((value) => !members.some((choice) => choice.value === value))));
  const hasSelectedVisible = visible.some((choice) => binding.value.includes(choice.value));

  const close = (focusTrigger: boolean) => {
    setOpen(false);
    if (focusTrigger) triggerRef.current?.focus({ preventScroll: true });
  };

  // 置き場は開いた時と、画面の大きさやスクロールが変わった時に測り直す（小窓の中のスクロールは除く）。
  useLayoutEffect(() => {
    if (!open) {
      setPlace(undefined);
      return undefined;
    }
    const update = () => {
      const trigger = triggerRef.current;
      if (trigger === null) return;
      setPlace(placeNear(trigger, Math.min(22 * 16, window.innerWidth - EDGE * 2)));
    };
    const onScroll = (event: Event) => {
      if (event.target instanceof Node && panelRef.current?.contains(event.target)) return;
      update();
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', onScroll, { passive: true, capture: true });
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', onScroll, { capture: true });
    };
  }, [open]);

  // 位置が決まって見えるようになってから、フォーカスを中へ移す。スマホ幅は検索欄へ移すとソフトキーボードが一覧を隠すので、小窓自体へ移す。
  const focused = useRef(false);
  useEffect(() => {
    if (!open) {
      focused.current = false;
      return;
    }
    if (place === undefined || focused.current) return;
    focused.current = true;
    (window.matchMedia(MOBILE_QUERY).matches ? panelRef.current : searchRef.current)?.focus({ preventScroll: true });
  }, [open, place]);

  // 外側を押したら閉じる。ボタンを押した時はボタン自身の開閉に任せる。
  const closeByOutside = useEffectEvent(() => close(false));
  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (panelRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      closeByOutside();
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, [open]);

  // フォーカスがどこにも無い時（押した「すべて外す」が操作できない状態になった直後など）のEscape。中や欄にフォーカスがある時は、下の処理が先に受けている。
  const closeFromDocument = useEffectEvent(() => close(true));
  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented) closeFromDocument();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  // Escapeは、解析設定の小窓まで閉じないよう、ここで止める。
  const onEscape = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key !== 'Escape' || !open) return;
    event.stopPropagation();
    event.preventDefault();
    close(true);
  };

  // 小窓は文書の末尾に出ているので、Tabで端を越えたら閉じてボタンへ戻す。
  const onPanelKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    onEscape(event);
    if (event.key !== 'Tab') return;
    const panel = panelRef.current;
    if (panel === null) return;
    const stops = [...panel.querySelectorAll<HTMLElement>('button, input')].filter((element) => !(element as HTMLButtonElement).disabled);
    const active = document.activeElement;
    const atStart = active === panel || active === stops[0];
    const atEnd = active === stops[stops.length - 1];
    if ((event.shiftKey && atStart) || (!event.shiftKey && atEnd)) {
      event.preventDefault();
      close(true);
    }
  };

  const renderChoice = (choice: OptionChoice<T>) => {
    const checked = binding.value.includes(choice.value);
    return (
      <label key={choice.value} className="chip-select-choice" data-disabled={(!checked && choice.disabled === true) || undefined}>
        <input type="checkbox" checked={checked} disabled={!checked && choice.disabled === true} onChange={() => toggle(choice.value)} />
        <span>{choice.label}</span>
      </label>
    );
  };

  // まとまりの見出しのチェック。選べる選択肢（選んでいるものを含む）が全部選ばれていればオン、一部ならindeterminate。
  const renderGroupCheck = (group: string, members: readonly OptionChoice<T>[]) => {
    const isSelected = (choice: OptionChoice<T>) => binding.value.includes(choice.value);
    const pool = members.filter((choice) => choice.disabled !== true || isSelected(choice));
    const selectedCount = pool.filter(isSelected).length;
    const checked = pool.length > 0 && selectedCount === pool.length;
    const canAdd = members.some((choice) => choice.disabled !== true && !isSelected(choice));
    const canRemove = members.some(isSelected);
    return (
      <label className="chip-select-group-check">
        <input
          type="checkbox"
          checked={checked}
          disabled={!canAdd && !canRemove}
          ref={(element) => {
            if (element !== null) element.indeterminate = selectedCount > 0 && !checked;
          }}
          onChange={() => (checked ? removeMembers(members) : addMembers(members))}
        />
        <span>{group}</span>
      </label>
    );
  };

  const panelStyle: CSSProperties | undefined =
    place === undefined ? { visibility: 'hidden' } : { left: place.left, top: place.top, maxHeight: place.maxHeight };

  return (
    <fieldset
      className="option-field option-field-group chip-select"
      aria-labelledby={labelId}
      data-option-default={isDefaultValue(binding) || undefined}
      onKeyDown={onEscape}
    >
      <div className="option-field-head">
        <span className="option-field-label" id={labelId}>
          {label}
        </span>
        <button
          ref={triggerRef}
          type="button"
          className="chip-select-add"
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={open ? panelId : undefined}
          aria-label={pickerName}
          title={pickerName}
          onClick={() => (open ? close(false) : setOpen(true))}
        >
          <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
            <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>
        <ResetButton label={label} binding={binding} />
      </div>
      <div className="chip-select-chips">
        {selected.map((choice) => (
          <span key={choice.value} className="chip-select-chip">
            <span className="chip-select-chip-text">{choice.label}</span>
            <button type="button" className="chip-select-chip-remove" aria-label={`${choice.label}を外す`} onClick={() => toggle(choice.value)}>
              <svg viewBox="0 0 16 16" width="10" height="10" aria-hidden="true">
                <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </button>
          </span>
        ))}
        {selected.length === 0 ? <span className="chip-select-empty">未選択</span> : null}
      </div>
      {hint !== undefined ? <p className="option-field-hint">{hint}</p> : null}
      {open
        ? createPortal(
            <div
              ref={panelRef}
              id={panelId}
              className="chip-select-popover"
              role="dialog"
              aria-modal="false"
              aria-label={pickerName}
              tabIndex={-1}
              style={panelStyle}
              onKeyDown={onPanelKeyDown}
            >
              <div className="chip-select-search">
                <input
                  ref={searchRef}
                  type="search"
                  value={query}
                  placeholder="名前で絞り込む"
                  aria-label="名前で絞り込む"
                  onChange={(event) => setQuery(event.currentTarget.value)}
                />
              </div>
              <div className="chip-select-list">
                {visible.length === 0 ? (
                  <p className="chip-select-none">当てはまる項目はありません。</p>
                ) : (
                  <>
                    {groups.plain.map(renderChoice)}
                    {groups.grouped.map(([group, members]) => (
                      <fieldset key={group} className="chip-select-group">
                        <legend>{renderGroupCheck(group, members)}</legend>
                        {members.map(renderChoice)}
                      </fieldset>
                    ))}
                  </>
                )}
              </div>
              <div className="chip-select-foot">
                <button type="button" onClick={selectVisible} disabled={!hasUnselectedVisible}>
                  すべて選ぶ
                </button>
                <button type="button" onClick={clearVisible} disabled={!hasSelectedVisible}>
                  すべて外す
                </button>
              </div>
            </div>,
            document.body,
          )
        : null}
    </fieldset>
  );
}
