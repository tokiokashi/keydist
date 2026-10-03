import { useLayoutEffect, useState, type RefObject } from 'react';

/**
 * Workspaceのペインの狭い見出しで、状態のバッジを文字で出せるか（入らなければ文字の無い点で出す）。
 *
 * 固定の幅では決めない。条件のchipの幅は条件の中身（「既定値」「N件変更」「対象ごとに差あり」）で変わり、
 * 対象の選択や名前の長さも変わるので、実際の要素を測って決める。
 * 判定は「名前を最小幅まで縮め、対象の選択も最小幅にした時の見出しの合計」に、バッジの全文が入るか。
 * 名前が最小幅より広い間は、名前が先に縮んで空きを作るので、点にしない（名前を先に省略する）。
 *
 * 判定に使う値は、バッジが文字か点かで変わらないものだけにする。バッジの全文の幅は、点の時に隠れている
 * 文字の要素のscrollWidthで測る。見出しの幅は、文字・点のどちらでも同じ。こうしておくと、
 * 判定が切り替わって幅が変わり、また切り替わる、という往復が起きない。
 */
export function useStatusBadgeFit(headerRef: RefObject<HTMLElement | null>, enabled: boolean): boolean {
  const [fits, setFits] = useState(false);
  // 条件のchipなどの中身が変わる再描画のたびに、観測の対象を取り直す（対象の数は数個で、費用は小さい）
  useLayoutEffect(() => {
    const header = headerRef.current;
    if (!enabled || header === null) {
      setFits(false);
      return undefined;
    }
    setFits(badgeTextFits(header));
    if (typeof ResizeObserver === 'undefined') return undefined;
    // 観測の通知の中で見出しの中身を変えると、同じフレームで通知が続いてブラウザが警告するので、次のフレームで測る
    let frame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setFits(badgeTextFits(header)));
    });
    observer.observe(header);
    for (const element of header.querySelectorAll('.pane-frame-target > *, .pane-settings-button, .pane-frame-menu')) {
      observer.observe(element);
    }
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  });
  return enabled && fits;
}

const px = (value: string): number => Number.parseFloat(value) || 0;

/**
 * 1段の見出し（`pane-frame.css`の`@container pane (width > 19.4rem)`）で、バッジの全文が入るか。
 * 2段の見出しでは文字を出さない（常に点）。
 */
function badgeTextFits(header: HTMLElement): boolean {
  const headerStyle = getComputedStyle(header);
  if (headerStyle.display !== 'flex') return false;
  const lead = header.querySelector<HTMLElement>('.pane-frame-lead');
  const target = header.querySelector<HTMLElement>('.pane-frame-target');
  const text = target?.querySelector<HTMLElement>('.pane-status-badge-text');
  if (lead === null || target === null || text === null || text === undefined) return false;
  const targetGap = px(getComputedStyle(target).columnGap);
  const selection = target.querySelector<HTMLElement>('.target-selection');
  const selectMin = selection === null ? 0 : px(getComputedStyle(selection).minWidth);
  // 対象の欄のうち、選択とバッジ以外（連動・条件）は縮まない。今の幅をそのまま使う
  let others = 0;
  let otherCount = 0;
  for (const child of target.children) {
    if (child === selection || child.classList.contains('pane-status-badge')) continue;
    others += child.getBoundingClientRect().width;
    otherCount += 1;
  }
  // 文字で出す時のバッジ（左右の余白は0.55rem）。点の時は文字の要素が1px四方に隠れているのでscrollWidthで、文字の時は要素の幅で、全文の幅を得る
  const rootFont = px(getComputedStyle(document.documentElement).fontSize);
  const badgeFull = Math.max(text.scrollWidth, text.getBoundingClientRect().width) + 2 * 0.55 * rootFont;
  // 選択・連動・条件・バッジの間隔は、選択と（連動・条件）と バッジ の数だけ
  const targetMin = selectMin + others + badgeFull + (otherCount + 1) * targetGap;
  const headerGap = px(headerStyle.columnGap);
  let fixed = 0;
  let flowCount = 0;
  for (const child of header.children) {
    if (getComputedStyle(child).position === 'absolute') continue;
    flowCount += 1;
    if (child !== lead && child !== target) fixed += child.getBoundingClientRect().width;
  }
  const leadMin = px(getComputedStyle(lead).minWidth);
  const needed = leadMin + targetMin + fixed + (flowCount - 1) * headerGap;
  // 間隔（約5.6px）を見込んだ値なので、測り誤差の分（0.5px）は引いてよい
  return header.clientWidth >= needed - 0.5;
}
