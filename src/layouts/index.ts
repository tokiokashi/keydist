/**
 * 論理配列。4 行 × 10 列の物理キーに文字を割り当てる。
 * row 0 = 数字段 / 1 = 上段 / 2 = ホーム段 / 3 = 下段
 */
export interface Layout {
  id: string;
  name: string;
  /** 各行 10 文字。位置が物理キーの列に対応する */
  rows: [string, string, string, string];
  /** 親指キーに割り当てる文字。既定は右親指の空白 */
  thumbs?: { LT?: string; RT?: string };
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

export type CharTarget = { kind: 'grid'; row: number; col: number } | { kind: 'thumb'; side: 'LT' | 'RT' };

/** 文字 → 打鍵先。未定義の文字は含まれない */
export function buildCharMap(layout: Layout): Map<string, CharTarget> {
  const map = new Map<string, CharTarget>();
  layout.rows.forEach((row, r) => {
    [...row].forEach((ch, c) => {
      if (ch !== ' ') map.set(ch, { kind: 'grid', row: r, col: c });
    });
  });
  const thumbs = layout.thumbs ?? { RT: ' ' };
  for (const side of ['LT', 'RT'] as const) {
    const ch = thumbs[side];
    if (ch) map.set(ch, { kind: 'thumb', side });
  }
  return map;
}
