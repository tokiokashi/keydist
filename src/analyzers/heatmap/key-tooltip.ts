import { physicalKeyDisplayLabel } from '#input/shapes/key-labels.ts';
import type { PhysicalKeyboardStandard } from '#input/shapes/geometry.ts';

/**
 * ヒートマップのキーのツールチップの文字列。内部のキーidは出さず、物理キーの名前で出す。
 *
 * 刻印が物理キーの名前と違う時だけ刻印を先に出し、物理キーの名前をカッコで添える。
 * 刻印が無い時や、大文字と小文字の違いを除いて物理キーの名前と同じ時は、物理キーの名前だけにする
 * （物理キーの名前は文字キーを大文字にするので、刻印の `q` と名前の `Q` は同じとみなす）。
 * `a / b` のように複数の刻印を結合したものは、全部が物理キーの名前と同じ時だけ同じとみなす。
 */
export function keyTooltipText(
  keyId: string,
  legend: string | undefined,
  count: number,
  standard?: PhysicalKeyboardStandard,
): string {
  const name = physicalKeyDisplayLabel(keyId, standard);
  const text = legend?.trim() ?? '';
  const sameAsName = text === ''
    || text.split(' / ').every((part) => part.trim().toLowerCase() === name.toLowerCase());
  return sameAsName ? `${name}: ${count}打` : `${text}（${name}）: ${count}打`;
}
