import { useEffect, useEffectEvent, useId, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import type { OptionChoice } from './option-fields.tsx';
import './popover-select.css';

/** 画面の端から残す余白と、札と一覧の間隔（px）。 */
const EDGE = 8;
const GAP = 4;
/** 一覧に取りたい高さ（px）。選択肢が多い時は、この高さの中でスクロールする。 */
const WANTED_HEIGHT = 320;

interface Place {
  readonly left: number;
  readonly top: number;
  readonly minWidth: number;
  readonly maxHeight: number;
}

/** 一覧の置き場所。札の下に入れば下、入らなければ上に置く。画面の端からはみ出さない。 */
function placeBelow(anchor: Element): Place {
  const rect = anchor.getBoundingClientRect();
  const below = rect.bottom + GAP;
  const spaceBelow = window.innerHeight - below - EDGE;
  const spaceAbove = rect.top - GAP - EDGE;
  const wanted = Math.min(WANTED_HEIGHT, Math.max(spaceBelow, spaceAbove));
  const top = spaceBelow >= Math.min(WANTED_HEIGHT, spaceAbove) ? below : rect.top - GAP - wanted;
  const left = Math.max(EDGE, Math.min(rect.left, window.innerWidth - rect.width - EDGE));
  return { left, top, minWidth: rect.width, maxHeight: wanted };
}

/**
 * 1つだけ選ぶ項目の、札の形の選択（見出しの対象の欄の札と同じ見た目）。
 * 札に今の選択肢の名前を出し、押すと選択肢の一覧が浮かぶ小窓で開く。選ぶと閉じる。
 * 項目名は画面に出さず、読み上げ名（`label`）に使う。
 *
 * 札でEnter・Space・↓を押すと開き、一覧では↑↓・Home・Endで動かしてEnter・Spaceで選ぶ。Escapeで閉じて札へフォーカスを戻す。
 * 一覧は`document.body`へ出す。ペインの枠はcontainerなので、中に置くと`position: fixed`が画面ではなくペインを基準にしてしまう。
 */
export function PopoverSelect<T extends string>({
  label,
  value,
  choices,
  onChange,
}: {
  readonly label: string;
  readonly value: T;
  readonly choices: readonly OptionChoice<T>[];
  readonly onChange: (next: T) => void;
}) {
  const [open, setOpen] = useState(false);
  const [place, setPlace] = useState<Place | undefined>(undefined);
  const listId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const current = choices.find((choice) => choice.value === value);

  const close = (focusTrigger: boolean) => {
    setOpen(false);
    if (focusTrigger) triggerRef.current?.focus({ preventScroll: true });
  };

  useLayoutEffect(() => {
    if (!open) {
      setPlace(undefined);
      return undefined;
    }
    const update = () => {
      if (triggerRef.current !== null) setPlace(placeBelow(triggerRef.current));
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, { passive: true, capture: true });
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, { capture: true });
    };
  }, [open]);

  // 位置が決まってから、選んでいる選択肢へフォーカスを移す。
  const focused = useRef(false);
  useEffect(() => {
    if (!open) {
      focused.current = false;
      return;
    }
    if (place === undefined || focused.current) return;
    focused.current = true;
    const options = [...(listRef.current?.querySelectorAll<HTMLElement>('[role="option"]') ?? [])];
    const selected = options.find((element) => element.getAttribute('aria-selected') === 'true');
    (selected ?? options[0])?.focus({ preventScroll: true });
  }, [open, place]);

  const closeByOutside = useEffectEvent(() => close(false));
  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (listRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      closeByOutside();
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, [open]);

  const onListKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      event.preventDefault();
      close(true);
      return;
    }
    if (event.key === 'Tab') {
      close(true);
      return;
    }
    const options = [...(listRef.current?.querySelectorAll<HTMLElement>('[role="option"]') ?? [])];
    const index = options.indexOf(document.activeElement as HTMLElement);
    const move = (next: number) => {
      event.preventDefault();
      options[(next + options.length) % options.length]?.focus();
    };
    if (event.key === 'ArrowDown') move(index + 1);
    else if (event.key === 'ArrowUp') move(index - 1);
    else if (event.key === 'Home') move(0);
    else if (event.key === 'End') move(options.length - 1);
  };

  const onTriggerKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowDown' && !open) {
      event.preventDefault();
      setOpen(true);
    }
  };

  const style: CSSProperties =
    place === undefined ? { visibility: 'hidden' } : { left: place.left, top: place.top, minWidth: place.minWidth, maxHeight: place.maxHeight };
  const name = `${label}: ${current?.label ?? ''}`;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="popover-select-button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={name}
        title={name}
        onClick={() => (open ? close(false) : setOpen(true))}
        onKeyDown={onTriggerKeyDown}
      >
        <span className="popover-select-text">{current?.label}</span>
        <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true" className="popover-select-chevron">
          <path d="M3.5 6l4.5 4.5L12.5 6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open
        ? createPortal(
            <div ref={listRef} id={listId} className="popover-select-list" role="listbox" aria-label={label} style={style} onKeyDown={onListKeyDown}>
              {choices.map((choice) => (
                <button
                  key={choice.value}
                  type="button"
                  role="option"
                  className="popover-select-option"
                  aria-selected={choice.value === value}
                  tabIndex={-1}
                  onClick={() => {
                    onChange(choice.value);
                    close(true);
                  }}
                >
                  {choice.label}
                </button>
              ))}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
