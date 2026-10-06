import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import './info-button.css';

/**
 * 短い説明に収まらない説明。あるⓘは、小窓ではなくモーダルを開く。
 * 説明の文（`description`）の後に、補足の文・名前と説明の組の一覧を出す。
 * ReactにもCSSにも依存させないので、Analyzerの`pane-meta.ts`が値として持てる。
 */
export interface InfoHelp {
  /** 一覧の前に置く補足の文（段落ごと）。 */
  readonly notes: readonly string[];
  /** 一覧の見出し。 */
  readonly listLabel: string;
  readonly items: readonly { readonly name: string; readonly description: string }[];
}

function InfoIcon() {
  return (
    <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
      <circle cx="8" cy="8" r="6.4" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <path d="M8 7.2v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="8" cy="4.9" r="0.95" fill="currentColor" />
    </svg>
  );
}

/**
 * 短い説明を出すⓘ。ペインの見出し（Analyzerの短い説明）と、Analyzerの図の横（図の読み方）の両方で使う。
 * hoverとフォーカスで出し、タップ（クリック）で出したままにする。
 * タップで開けるのは、タッチの端末にhoverが無いため。
 *
 * `floating`は、帯などはみ出しを切る入れ物（Workspaceのペインの本体の領域）の中に置く時に使う。説明を`body`直下へ出し、
 * ⓘの真下に画面基準で置くので、入れ物に隠れない。
 *
 * `help`を渡すと、小窓ではなくモーダルで開く（長い説明を、画面の外へ出さず、キーボードだけでも後半まで読めるように出すため）。
 * 小窓の実装は共有のまま触らず、`help`の有無で別のコンポーネントへ分ける。`help`の無いⓘの挙動と見た目は変わらない。
 */
export interface InfoButtonProps {
  readonly name: string;
  readonly description: string;
  readonly floating?: boolean;
  /** 親が移動の規則（ロービング）を持つ時だけ渡す。省略はブラウザの既定（Tabで届く）。 */
  readonly tabIndex?: number;
  readonly help?: InfoHelp;
}

export function InfoButton({ help, ...rest }: InfoButtonProps) {
  return help === undefined ? <InfoPopoverButton {...rest} /> : <InfoModalButton {...rest} help={help} />;
}

function InfoModalButton({ name, description, tabIndex, help }: InfoButtonProps & { readonly help: InfoHelp }) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const close = () => {
    setOpen(false);
    // 見出しを固定しないペインではボタンが画面外にあり、既定のfocus()はそこまでスクロールしてしまう。
    buttonRef.current?.focus({ preventScroll: true });
  };
  return (
    <span className="info">
      <button
        ref={buttonRef}
        type="button"
        className="info-button"
        tabIndex={tabIndex}
        aria-label={`${name}の説明`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <InfoIcon />
      </button>
      {/* body直下へ出す。ペインの入れ物（スクロール・transform・文字の設定）の影響を受けず、spanの中にdialogを入れずに済む */}
      {open ? createPortal(<InfoModal name={name} description={description} help={help} onClose={close} />, document.body) : null}
    </span>
  );
}

function InfoModal({ name, description, help, onClose }: {
  readonly name: string;
  readonly description: string;
  readonly help: InfoHelp;
  readonly onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null || dialog.open) return;
    dialog.showModal();
    // 片付けでcloseを呼ばない（開発時の二重実行で、開いた直後に閉じてしまう。閉じる時は親が描画をやめ、要素ごと外れる）。
  }, []);
  return (
    <dialog
      ref={dialogRef}
      className="info-modal"
      aria-labelledby={titleId}
      onClose={onClose}
      // 中身は器いっぱいに広げてあるので、器自身への押下は背後（暗い部分）を押した時だけ。
      onClick={(event) => {
        if (event.target === event.currentTarget) event.currentTarget.close();
      }}
    >
      <div className="info-modal-inner">
        <header className="info-modal-head">
          <h2 id={titleId}>{name}</h2>
          <button type="button" className="info-modal-close" aria-label="閉じる" onClick={() => dialogRef.current?.close()}>
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </header>
        {/* 本文だけがスクロールする。キーボードだけでも後半を読めるよう、フォーカスを受けられるようにする */}
        <div className="info-modal-body" tabIndex={0} role="region" aria-labelledby={titleId}>
          <p>{description}</p>
          {help.notes.map((note) => <p key={note}>{note}</p>)}
          <h3>{help.listLabel}</h3>
          <dl className="info-modal-list">
            {help.items.map((item) => (
              <div key={item.name} className="info-modal-item">
                <dt>{item.name}</dt>
                <dd>{item.description}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </dialog>
  );
}

function InfoPopoverButton({
  name,
  description,
  floating = false,
  tabIndex,
}: Omit<InfoButtonProps, 'help'>) {
  const [hovered, setHovered] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [anchor, setAnchor] = useState<{ readonly top: number; readonly left: number } | undefined>(undefined);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const tooltipId = useId();
  const rootRef = useRef<HTMLSpanElement>(null);
  const popoverRef = useRef<HTMLSpanElement>(null);
  const visible = hovered || pinned;

  // 説明の位置を測る。画面の右端からはみ出さないよう、説明の最大幅（22rem）の分を残す。
  // 下に収まらない時はⓘの上に出す（説明の高さは、描いた後に測れるので、描いた後にもう一度測る）
  const placed = anchor !== undefined;
  useLayoutEffect(() => {
    if (!floating || !visible) return undefined;
    const place = () => {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (rect === undefined) return;
      const maxWidth = 22 * parseFloat(getComputedStyle(document.documentElement).fontSize);
      const height = popoverRef.current?.getBoundingClientRect().height ?? 0;
      const below = rect.bottom + 6;
      const above = rect.top - 6 - height;
      const top = below + height > window.innerHeight - 8 && above >= 8 ? above : below;
      const left = Math.max(8, Math.min(rect.left, window.innerWidth - maxWidth - 8));
      setAnchor((current) => (current !== undefined && current.top === top && current.left === left ? current : { top, left }));
    };
    place();
    // position: fixedなので、スクロールや窓の大きさの変化でⓘが動いても、説明は画面の同じ位置に残る。
    // スクロールは入れ物の中（Workspaceの板など）でも起きるので、captureで拾う
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [floating, visible, placed]);

  // 出したままの説明は、外を押すかEscapeで閉じる（開いたままだと下の図に被るため）。
  // floatingの説明はbody直下に出るのでrootの外にある。説明そのものを押しても閉じない
  useEffect(() => {
    if (!pinned) return undefined;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!rootRef.current?.contains(target) && !popoverRef.current?.contains(target)) setPinned(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPinned(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [pinned]);

  return (
    <span
      ref={rootRef}
      className="info"
      onPointerEnter={(event) => {
        if (event.pointerType === 'mouse') setHovered(true);
      }}
      onPointerLeave={() => setHovered(false)}
    >
      <button
        ref={buttonRef}
        type="button"
        className="info-button"
        tabIndex={tabIndex}
        aria-label={`${name}の説明`}
        aria-expanded={visible}
        data-pinned={pinned || undefined}
        aria-describedby={visible ? tooltipId : undefined}
        onClick={() => setPinned((current) => !current)}
        onFocus={() => setHovered(true)}
        onBlur={() => setHovered(false)}
        onKeyDown={(event) => {
          // フォーカスで出した説明も、Escapeで閉じられるようにする（WCAG 1.4.13）。
          if (event.key === 'Escape') {
            setHovered(false);
            setPinned(false);
          }
        }}
      >
        <InfoIcon />
      </button>
      {visible && !floating ? (
        <span className="info-popover" role="tooltip" id={tooltipId}>
          {description}
        </span>
      ) : null}
      {visible && floating && anchor !== undefined ? createPortal(
        <span ref={popoverRef} className="info-popover info-popover-floating" role="tooltip" id={tooltipId} style={anchor}>
          {description}
        </span>,
        document.body,
      ) : null}
    </span>
  );
}
