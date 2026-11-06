/**
 * 点の読み取り（点にポインターを重ねるかフォーカスした時に、その点を強調して値を出す状態）の規則。
 * 読み取りは全ての図で連動し、点をクリックすると1点を留められる。画面に依存しない純粋な関数。
 */

/** 点を押した時に留める対象。同じ点をもう一度押すと留めるのをやめる。 */
export function togglePinned(pinned: string | undefined, clicked: string): string | undefined {
  return pinned === clicked ? undefined : clicked;
}

/**
 * 留めた対象が、まだどこかの図に描かれているか。描かれていなければ留めるのをやめる
 * （対象の選択から外れた時、どの図にも点が無くなった時）。
 */
export function stillPinned(pinned: string | undefined, plottedKeys: ReadonlySet<string>): string | undefined {
  return pinned !== undefined && plottedKeys.has(pinned) ? pinned : undefined;
}

export interface ReadingTargets {
  /** 留めた対象。 */
  readonly pinned: string | undefined;
  /** ポインターを重ねているか、フォーカスしている対象。留めた対象と同じ時は`undefined`にする（読み取りは1点のまま）。 */
  readonly hovered: string | undefined;
}

export function readingTargets(pinned: string | undefined, hovered: string | undefined): ReadingTargets {
  return { pinned, hovered: hovered === pinned ? undefined : hovered };
}
