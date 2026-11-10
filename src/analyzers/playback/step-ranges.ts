import type { Stroke } from '#trace/generate.ts';

/**
 * 打鍵再生の図（シークバーと速度の図）に一度に出す範囲。テキストの範囲（`input/text/display-ranges.ts`）を、
 * 再生位置（ここまで進んだステップの数）の区間に直したもの。範囲は表示だけの区切りで、再生の時間も数値も変えない。
 */
export interface PlaybackRanges {
  /**
   * 範囲の境目の再生位置。先頭は0、最後はステップの総数で、`i`番目の範囲は`[bounds[i], bounds[i + 1]]`。
   * 隣り合う範囲は境目の再生位置を共有する。ステップを1つも含まない範囲は作らない。
   */
  readonly bounds: readonly number[];
  /** 範囲ごとの、テキスト上の文字位置の区間（先頭が0、`end`は含まない）。ステップを含まない範囲は隣の範囲に含める */
  readonly chars: readonly { readonly start: number; readonly end: number }[];
}

/**
 * テキストの範囲の境目（文字位置）から、再生位置の範囲を求める。
 * 文字位置`b`に対応する境目は、`kanaStart`が`b`以上である最初のステップの位置にする。
 */
export function playbackRangesOf(strokes: readonly Pick<Stroke, 'kanaStart'>[], charBounds: readonly number[]): PlaybackRanges {
  const total = strokes.length;
  const lastChar = charBounds.at(-1) ?? 0;
  if (total === 0) return { bounds: [0, 0], chars: [{ start: 0, end: lastChar }] };

  const steps: number[] = [0];
  let at = 0;
  for (const charBound of charBounds.slice(1, -1)) {
    while (at < total && strokes[at]!.kanaStart < charBound) at++;
    steps.push(at);
  }
  steps.push(total);

  const bounds = [0];
  const chars: { start: number; end: number }[] = [];
  let charStart = 0;
  for (let index = 1; index < steps.length; index++) {
    const step = steps[index]!;
    if (step <= bounds[bounds.length - 1]!) continue;
    bounds.push(step);
    chars.push({ start: charStart, end: charBounds[index]! });
    charStart = charBounds[index]!;
  }
  // 最後の範囲がステップを持たなかった時は、その文字までを手前の範囲に含める
  chars[chars.length - 1] = { start: chars[chars.length - 1]!.start, end: lastChar };
  return { bounds, chars };
}

/** 範囲の数。 */
export function playbackRangeCount(ranges: PlaybackRanges): number {
  return ranges.bounds.length - 1;
}

/** 再生位置`cursor`を含む範囲の番号（先頭が0）。境目の位置は後ろの範囲に数え、最後の位置だけは最後の範囲に数える。 */
export function playbackRangeAt(ranges: PlaybackRanges, cursor: number): number {
  let index = playbackRangeCount(ranges) - 1;
  while (index > 0 && ranges.bounds[index]! > cursor) index--;
  return index;
}

/**
 * 図に出す範囲の番号。選んでいた範囲（`chosen`）が`cursor`を境目も含めて含む間は、選んでいた範囲のままにする。
 * 再生位置が境目に来ただけで範囲が切り替わると、シークバーを範囲の端まで動かした時に図が替わるため。
 * 含まなくなったら、`cursor`を含む範囲に替える。
 */
export function playbackShownRange(ranges: PlaybackRanges, chosen: number, cursor: number): number {
  const count = playbackRangeCount(ranges);
  const index = Math.min(Math.max(0, chosen), count - 1);
  return ranges.bounds[index]! <= cursor && cursor <= ranges.bounds[index + 1]! ? index : playbackRangeAt(ranges, cursor);
}
