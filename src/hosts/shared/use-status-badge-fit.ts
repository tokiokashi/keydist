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
 * バッジの全文が入るか。先頭（`.pane-frame-lead`）を持つWorkspaceの見出しと、名前の行にバッジを出す個別画面の見出しで測り方が違う。
 */
function badgeTextFits(header: HTMLElement): boolean {
  const headerStyle = getComputedStyle(header);
  if (header.querySelector('.pane-frame-lead') === null) return nameBadgeTextFits(header, headerStyle);
  // 1段の見出し（`pane-frame.css`の`@container pane (width > 19.4rem)`）で、バッジの全文が入るか。
  // 2段の見出しでは文字を出さない（常に点）。
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

/**
 * 個別画面の見出し（名前の行にバッジを出す）で、バッジの全文が入るか。
 * 名前の行にバッジが文字で入ると名前の欄が広がり、その分だけ対象の欄が縮んで対象名が省略される。
 * スマホ幅の1行（flex）だけ測る。それ以外の段組みは名前の行に十分な幅があるので、文字で出す。
 * 名前・対象・固定の欄は、バッジが文字か点かで変わらない部分の幅で測る（往復を起こさないため）。
 */
function nameBadgeTextFits(header: HTMLElement, headerStyle: CSSStyleDeclaration): boolean {
  if (headerStyle.display !== 'flex') return true;
  const name = header.querySelector<HTMLElement>('.pane-frame-name');
  const target = header.querySelector<HTMLElement>('.pane-frame-target');
  if (name === null || target === null) return false;
  const text = name.querySelector<HTMLElement>('.pane-status-badge-text');
  if (text === null) return false;
  const rootFont = px(getComputedStyle(document.documentElement).fontSize);
  const badgeFull = Math.max(text.scrollWidth, text.getBoundingClientRect().width) + 2 * 0.55 * rootFont;
  // 名前の行のうち、バッジ以外（ⓘ）の幅。絶対配置の見出し（名前の文字は読み上げ用に隠す）は行の幅に入らない
  const nameGap = px(getComputedStyle(name).columnGap);
  let nameBase = 0;
  let nameCount = 0;
  for (const child of name.children) {
    if (child.classList.contains('pane-status-badge') || getComputedStyle(child).position === 'absolute') continue;
    nameBase += child.getBoundingClientRect().width;
    nameCount += 1;
  }
  const nameNeeded = nameBase + nameCount * nameGap + badgeFull;
  // 対象の欄は、選択の全文（測るための見えない要素の幅）と、ボタンの枠・記号の分で決まる。
  // 枠・記号は、ボタンの幅から文字（要約と「他N件」）の幅を除いたもの。どちらも今の幅で縮むので、差し引いて測る
  let targetNeeded = 0;
  for (const child of target.children) {
    if (child.classList.contains('target-selection')) continue;
    targetNeeded += child.getBoundingClientRect().width;
  }
  const selectionButton = target.querySelector<HTMLElement>('.target-selection-button');
  const summary = target.querySelector<HTMLElement>('.target-selection-summary');
  const more = target.querySelector<HTMLElement>('.target-selection-more');
  const measure = target.querySelector<HTMLElement>('.target-selection-measure');
  if (selectionButton !== null && summary !== null && measure !== null) {
    const textWidth = summary.getBoundingClientRect().width + (more?.getBoundingClientRect().width ?? 0);
    targetNeeded += selectionButton.getBoundingClientRect().width - textWidth + measure.getBoundingClientRect().width;
  }
  const headerGap = px(headerStyle.columnGap);
  let fixed = 0;
  let flowCount = 0;
  for (const child of header.children) {
    if (getComputedStyle(child).position === 'absolute') continue;
    flowCount += 1;
    if (child !== name && child !== target) fixed += child.getBoundingClientRect().width;
  }
  const needed = nameNeeded + targetNeeded + fixed + (flowCount - 1) * headerGap;
  return header.clientWidth >= needed - 0.5;
}
