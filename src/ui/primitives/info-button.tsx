import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import './info-button.css';

/**
 * 短い説明を出すⓘ。ペインの見出し（Analyzerの短い説明）と、Analyzerの図の横（図の読み方）の両方で使う。
 * hoverとフォーカスで出し、タップ（クリック）で出したままにする。
 * タップで開けるのは、タッチの端末にhoverが無いため。
 *
 * `floating`は、帯などはみ出しを切る入れ物（Workspaceのタブの帯）の中に置く時に使う。説明を`body`直下へ出し、
 * ⓘの真下に画面基準で置くので、入れ物に隠れない。
 */
export function InfoButton({ name, description, floating = false }: { readonly name: string; readonly description: string; readonly floating?: boolean }) {
  const [hovered, setHovered] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [anchor, setAnchor] = useState<{ readonly top: number; readonly left: number } | undefined>(undefined);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const tooltipId = useId();
  const rootRef = useRef<HTMLSpanElement>(null);
  const visible = hovered || pinned;

  // 説明を出す時のⓘの位置を測る。画面の右端からはみ出さないよう、説明の最大幅（22rem）の分を残す
  useLayoutEffect(() => {
    if (!floating || !visible) return;
    const rect = buttonRef.current?.getBoundingClientRect();
    if (rect === undefined) return;
    const maxWidth = 22 * parseFloat(getComputedStyle(document.documentElement).fontSize);
    setAnchor({ top: rect.bottom + 6, left: Math.max(8, Math.min(rect.left, window.innerWidth - maxWidth - 8)) });
  }, [floating, visible]);

  // 出したままの説明は、外を押すかEscapeで閉じる（開いたままだと下の図に被るため）。
  useEffect(() => {
    if (!pinned) return undefined;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setPinned(false);
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
        aria-label={`${name}の説明`}
        aria-expanded={visible}
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
        <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
          <circle cx="8" cy="8" r="6.4" fill="none" stroke="currentColor" strokeWidth="1.3" />
          <path d="M8 7.2v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <circle cx="8" cy="4.9" r="0.95" fill="currentColor" />
        </svg>
      </button>
      {visible && !floating ? (
        <span className="info-popover" role="tooltip" id={tooltipId}>
          {description}
        </span>
      ) : null}
      {visible && floating && anchor !== undefined ? createPortal(
        <span className="info-popover info-popover-floating" role="tooltip" id={tooltipId} style={anchor}>
          {description}
        </span>,
        document.body,
      ) : null}
    </span>
  );
}
