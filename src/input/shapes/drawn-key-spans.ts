import { isThumb, THUMB_ROW, type Key } from './geometry.ts';

/** 親指のキーを描く幅 [u]。キーに幅の指定が無い時に使う。 */
export const THUMB_DRAW_WIDTH = 1.9;

/** キーを図に描く横の範囲。単位は文字キー1個分の幅（u）。 */
export interface DrawnKeySpan {
  /** 左端 */
  readonly left: number;
  readonly width: number;
}

function isThumbKey(key: Key): boolean {
  return key.row === THUMB_ROW || isThumb(key.finger);
}

/** 実寸の幅 [u]。親指のキーで幅の指定が無ければ既定の親指の幅。 */
function actualWidth(key: Key): number {
  return key.width ?? (isThumbKey(key) ? THUMB_DRAW_WIDTH : 1);
}

/**
 * 図に描くキーの横の範囲を返す。
 * `key.x` は文字キー1個分を基準にした左端で、幅の広いキーは中心を保って左右へ広がる。
 * 段の端にある幅の広いキー（Shift・Tab・Backspaceなど）は、図を狭くするため、段の中で隣のキーの外側に詰めて1uで描く。
 * 距離の計算に使う座標は変えず、描く範囲だけを変える。
 * 親指のキー、段の端でない位置の幅の広いキー、幅が1u以下のキーは実寸のまま描く。
 * 段に描くキーが1個しか無ければ、詰める隣のキーが無いので実寸のまま描く。
 */
export function drawnKeySpans(keys: readonly Key[]): ReadonlyMap<string, DrawnKeySpan> {
  const actual = new Map<string, DrawnKeySpan>();
  for (const key of keys) {
    const width = actualWidth(key);
    actual.set(key.id, { left: key.x + 0.5 - width / 2, width });
  }
  const spans = new Map(actual);

  const rows = new Map<number, Key[]>();
  for (const key of keys) {
    if (isThumbKey(key)) continue;
    const row = rows.get(key.row);
    if (row === undefined) rows.set(key.row, [key]);
    else row.push(key);
  }

  for (const row of rows.values()) {
    if (row.length < 2) continue;
    const sorted = [...row].sort((a, b) => a.x - b.x);
    const first = sorted[0]!;
    const second = sorted[1]!;
    const last = sorted[sorted.length - 1]!;
    const beforeLast = sorted[sorted.length - 2]!;
    const firstSpan = actual.get(first.id)!;
    const lastSpan = actual.get(last.id)!;
    // 詰める先は、隣のキーの実寸の範囲
    const secondSpan = actual.get(second.id)!;
    const beforeLastSpan = actual.get(beforeLast.id)!;
    if (firstSpan.width > 1) spans.set(first.id, { left: secondSpan.left - 1, width: 1 });
    if (lastSpan.width > 1) spans.set(last.id, { left: beforeLastSpan.left + beforeLastSpan.width, width: 1 });
  }
  return spans;
}
