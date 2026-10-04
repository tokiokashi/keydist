import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

/**
 * ペインの見出しに置く小さな部品（⋯のメニュー）。
 * ⓘの説明はペインの外（Analyzerの図の横）でも使うので `ui/primitives/info-button.tsx` に置く。
 */

export interface PaneMenuItem {
  readonly id: string;
  readonly label: string;
  /** 押すと何が変わり、何が変わらないかの短い説明。 */
  readonly description?: string;
  /** 択一のメニューで、今選ばれている項目（`menuitemradio`として読み上げる）。 */
  readonly selected?: boolean;
  /** 入り・切りの項目で、今入っているか（`menuitemcheckbox`として読み上げる）。 */
  readonly checked?: boolean;
  /** 項目の先頭に出す絵（対象の持ち方）。あれば1行で出す。 */
  readonly glyph?: { readonly kind: BindingGlyphKind; readonly number?: number };
  /** 読み上げ名。省略時は`label`。 */
  readonly ariaLabel?: string;
  readonly onSelect: () => void;
}

/**
 * ペインの見出しに置くメニュー。既定はペインへの操作（⋯）。`label`と`icon`を渡すと、別の用途
 * （対象の連動の選択など）のボタンになる。`selected`を持つ項目があれば択一のメニューとして出す。
 */
export function PaneMenu({
  paneName,
  items,
  label,
  title,
  icon,
  text,
  caption,
  className,
  data,
}: {
  readonly paneName: string;
  readonly items: readonly PaneMenuItem[];
  /** ボタンとメニューの読み上げ名。省略時は「<ペイン名>の操作」。 */
  readonly label?: string;
  /** hoverで出す説明。 */
  readonly title?: string;
  readonly icon?: ReactNode;
  /** アイコンの隣に出すボタンの文字。省略すればアイコンだけ。 */
  readonly text?: string;
  /**
   * 開いたメニューの先頭に出す1行の見出し（いまの状態の名前）。項目ではないので選べない。
   * 読み上げはメニューの名前（`label`）が同じ内容を持つので、見出しは読み上げから外す。
   */
  readonly caption?: string;
  readonly className?: string;
  readonly data?: Readonly<Record<string, string>>;
}) {
  const accessibleName = label ?? `${paneName}の操作`;
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  // メニューが枠（ペイン）の左右からはみ出す分を戻す横のずれ [px]。ペインの枠は角丸のためにはみ出しを切るので、
  // 切れた項目は見えず押せない。見出しが1行の狭いペインでは、連動のボタンが枠の左寄りに来て右端揃えだと左へはみ出す
  const [shift, setShift] = useState(0);

  useLayoutEffect(() => {
    const list = listRef.current;
    // 条件のモーダル（<dialog>）の中に置いたメニューは、ペインの枠ではなくモーダルの枠を基準にずらす。
    // ペインの枠を基準にすると、ボタンから離れて開く。モーダルの枠は角丸とoverflowで中身を切るので、
    // 群が右の列へ移った行のメニューも、枠の中に収まるまで横へ戻す
    const root = rootRef.current;
    const frame = root === null ? null : root.closest('dialog') ?? root.closest('.pane-frame');
    if (!open || list === null || frame === null || frame === undefined) {
      setShift(0);
      return;
    }
    // ずれを外した位置で測る（開き直し・幅の変化で積み上げない）
    list.style.transform = '';
    const margin = 8;
    const box = list.getBoundingClientRect();
    const bounds = frame.getBoundingClientRect();
    if (box.left < bounds.left + margin) setShift(bounds.left + margin - box.left);
    else if (box.right > bounds.right - margin) setShift(bounds.right - margin - box.right);
    else setShift(0);
    // モーダルの中では、下へ開くと本文の下端を超える行（最後の群の行）のメニューは、上に余裕があれば上へ開く。
    // 本文の下端を超えた分は、本文をスクロールしないと見えない
    const body = root?.closest('.condition-modal-body');
    if (body !== null && body !== undefined) {
      const room = body.getBoundingClientRect();
      const button = buttonRef.current?.getBoundingClientRect();
      if (button !== undefined && box.bottom > room.bottom - margin && button.top - room.top > box.height + margin) {
        list.style.top = 'auto';
        list.style.bottom = 'calc(100% + 4px)';
      }
    }
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    // 開いたら、選ばれている項目（択一のメニューの時）、無ければ先頭の項目へフォーカスを移す（キーボードでそのまま選べるように）。
    const items = rootRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"]');
    const target = items === undefined ? undefined : [...items].find((item) => item.getAttribute('aria-checked') === 'true') ?? items[0];
    target?.focus();
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  if (items.length === 0) return null;

  const close = () => {
    setOpen(false);
    buttonRef.current?.focus({ preventScroll: true });
  };

  return (
    <div
      ref={rootRef}
      className={className === undefined ? 'pane-menu' : `pane-menu ${className}`}
      {...data}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && open) {
          // モーダルの中に置いた時に、メニューを閉じるだけでモーダルまで閉じないようにする
          event.preventDefault();
          event.stopPropagation();
          close();
        }
      }}
    >
      <button
        ref={buttonRef}
        type="button"
        className="pane-icon-button pane-menu-button"
        data-with-text={text === undefined ? undefined : ''}
        aria-label={accessibleName}
        title={title}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((current) => !current)}
      >
        {icon ?? (
          <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
            <circle cx="3.5" cy="8" r="1.3" fill="currentColor" />
            <circle cx="8" cy="8" r="1.3" fill="currentColor" />
            <circle cx="12.5" cy="8" r="1.3" fill="currentColor" />
          </svg>
        )}
        {text === undefined ? null : <span className="pane-menu-button-text">{text}</span>}
      </button>
      {open ? (
        <div
          ref={listRef}
          className="pane-menu-list"
          role="menu"
          id={menuId}
          aria-label={accessibleName}
          style={shift === 0 ? undefined : { transform: `translateX(${shift}px)` }}
        >
          {caption === undefined ? null : <div className="pane-menu-caption" aria-hidden="true">{caption}</div>}
          {items.map((item) => (
            <button
              type="button"
              role={item.checked !== undefined ? 'menuitemcheckbox' : item.selected === undefined ? 'menuitem' : 'menuitemradio'}
              aria-label={item.ariaLabel}
              data-glyph={item.glyph === undefined ? undefined : ''}
              aria-checked={item.checked ?? item.selected}
              key={item.id}
              className="pane-menu-item"
              data-selected={item.selected || undefined}
              data-checked={item.checked === undefined ? undefined : item.checked}
              onClick={() => {
                item.onSelect();
                close();
              }}
            >
              {item.glyph === undefined ? null : <BindingGlyph kind={item.glyph.kind} number={item.glyph.number} />}
              <span className="pane-menu-item-label">{item.label}</span>
              {item.description === undefined ? null : (
                <span className="pane-menu-item-description">{item.description}</span>
              )}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** 解析設定を開くボタンのアイコン（狭いペインではアイコンだけにする）。 */
export function SettingsIcon() {
  return (
    <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
      <path d="M2.5 4.5h6M11.5 4.5h2M2.5 11.5h2M7.5 11.5h6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="10" cy="4.5" r="1.6" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="6" cy="11.5" r="1.6" fill="none" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

export type BindingGlyphKind = 'pin' | 'link' | 'link-new';

const CHAIN_PATH = 'M6.7 9.3l2.6-2.6M7.2 4.6l.9-.9a2.5 2.5 0 013.5 3.5l-.9.9M8.8 11.4l-.9.9a2.5 2.5 0 01-3.5-3.5l.9-.9';

/**
 * 対象の持ち方の絵。固定はピン、連動に従う間は鎖（`number`の組の番号を添える）、
 * 新しい連動は鎖に「＋」。番号は組の見分け用で、対象の色（配列ごとの色）とは無関係。
 * 文字の名前は持たず、読み上げ名は呼び出し側のボタン・項目が持つ。
 */
export function BindingGlyph({ kind, number }: { readonly kind: BindingGlyphKind; readonly number?: number }) {
  return (
    <span className="pane-binding-icon" data-linked={kind !== 'pin'}>
      {kind === 'pin' ? (
        <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true" data-icon="pin">
          <path
            d="M6 2h4l-.6 4.2L12 9H4l2.6-2.8L6 2z M8 9v5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        </svg>
      ) : (
        <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true" data-icon={kind}>
          <g transform={kind === 'link-new' ? 'translate(-1 -1) scale(.85)' : undefined}>
            <path d={CHAIN_PATH} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </g>
          {kind === 'link-new' ? (
            <path d="M12.5 9.8v5M10 12.3h5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          ) : null}
        </svg>
      )}
      {number === undefined ? null : <span className="pane-binding-icon-number">{number}</span>}
    </span>
  );
}
