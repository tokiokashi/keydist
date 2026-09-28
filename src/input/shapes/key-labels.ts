import type { PhysicalKeyboardStandard } from './geometry.ts';

// 物理キーidは内部の識別子（QWERTY刻印・thumb-l・r0c12等）なので、画面にはここで決めた表示名を出す。
// JIS形状ではQWERTY（ANSI）刻印と刻印が違うキーがあり、idのまま出すと別のキーと同じ文字になる
// （JISのr2c11に「]」を出すと、ANSI刻印で「]」を持つr1c11と区別できない）。
// そのため規格ごとに刻印を引き直す。シフト側の記号・半角/全角等を含む刻印一式は別の単位で扱う。

const NAMED_KEYS: Readonly<Record<string, string>> = {
  'thumb-l': '左親指',
  'thumb-r': '右親指',
  'shift-l': '左Shift',
  'shift-r': '右Shift',
  tab: 'Tab',
  escape: 'Esc',
  'caps-lock': 'Caps Lock',
  backquote: '`',
  backslash: '\\',
};

/** JIS形状で、QWERTY（ANSI）刻印のidと刻印が異なるキー。 */
const JIS_ENGRAVINGS: Readonly<Record<string, string>> = {
  '=': '^',
  '[': '@',
  ']': '[',
  "'": ':',
  r0c12: '¥',
  r2c11: ']',
  r3c10: '\\',
};

const GRID_KEY_ID = /^r(\d+)c(\d+)$/;

/**
 * 物理キーの刻印を返す。文字キーは刻印どおり小文字のまま返す（盤面の補助刻印用）。
 * `standard` が分からない時（配列だけから表示を作る時）は、`r{row}c{col}` のキーを
 * JISの刻印で読む。組み込みの形状でQWERTY刻印の外にキーを持つのはJIS形状だけのため。
 */
export function physicalKeyEngraving(
  key: string,
  standard?: PhysicalKeyboardStandard,
): string {
  const named = NAMED_KEYS[key];
  if (named !== undefined) return named;

  const jis = JIS_ENGRAVINGS[key];
  if (jis !== undefined) {
    const isGridExtra = GRID_KEY_ID.test(key);
    if (standard === 'jis' || (standard === undefined && isGridExtra)) return jis;
  }

  const grid = GRID_KEY_ID.exec(key);
  if (grid !== null) {
    // 自作形状で増やしたキー。刻印を持たないので位置で呼ぶ
    return `${Number(grid[1]) + 1}段目${Number(grid[2]) + 1}列`;
  }
  return key;
}

/** 物理キーの表示名。文字キーは大文字にする（キーキャップの刻印に合わせる）。 */
export function physicalKeyDisplayLabel(
  key: string,
  standard?: PhysicalKeyboardStandard,
): string {
  const engraving = physicalKeyEngraving(key, standard);
  return engraving.length === 1 ? engraving.toUpperCase() : engraving;
}
