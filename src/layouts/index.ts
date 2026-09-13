/**
 * 論理配列。4 行 × 10 列の物理キーに文字を割り当てる。
 * row 0 = 数字段 / 1 = 上段 / 2 = ホーム段 / 3 = 下段
 */
export interface Layout {
  id: string;
  name: string;
  /** 各行 10 文字。位置が物理キーの列に対応する */
  rows: [string, string, string, string];
}

const NUMBER_ROW = '1234567890';

export const LAYOUTS: Layout[] = [
  {
    id: 'qwerty',
    name: 'QWERTY',
    rows: [NUMBER_ROW, 'qwertyuiop', 'asdfghjkl;', 'zxcvbnm,./'],
  },
  {
    id: 'dvorak',
    name: 'Dvorak',
    rows: [NUMBER_ROW, "',.pyfgcrl", 'aoeuidhtns', ';qjkxbmwvz'],
  },
  {
    id: 'colemak',
    name: 'Colemak',
    rows: [NUMBER_ROW, 'qwfpgjluy;', 'arstdhneio', 'zxcvbkm,./'],
  },
  {
    id: 'colemak-dh',
    name: 'Colemak-DH',
    rows: [NUMBER_ROW, 'qwfpbjluy;', 'arstgmneio', 'zxcdvkh,./'],
  },
  {
    id: 'workman',
    name: 'Workman',
    rows: [NUMBER_ROW, 'qdrwbjfup;', 'ashtgyneoi', 'zxmcvkl,./'],
  },
];

export const LAYOUT_BY_ID = new Map(LAYOUTS.map((l) => [l.id, l]));

/** 文字 → [row, col]。未定義の文字は含まれない */
export function buildCharMap(layout: Layout): Map<string, [number, number]> {
  const map = new Map<string, [number, number]>();
  layout.rows.forEach((row, r) => {
    [...row].forEach((ch, c) => {
      if (ch !== ' ') map.set(ch, [r, c]);
    });
  });
  return map;
}
