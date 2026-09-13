/** 指の識別子。L/R + P(小指) R(薬指) M(中指) I(人差し指) T(親指) */
export type Finger =
  | 'LP' | 'LR' | 'LM' | 'LI' | 'LT'
  | 'RT' | 'RI' | 'RM' | 'RR' | 'RP';

/** 親指を除く 8 本。隣接指間距離（§11.4）はこの範囲で見る */
export type NonThumb = Exclude<Finger, 'LT' | 'RT'>;
export const FINGERS: NonThumb[] = ['LP', 'LR', 'LM', 'LI', 'RI', 'RM', 'RR', 'RP'];

/** 親指を含む全 10 本 */
export const ALL_FINGERS: Finger[] = ['LP', 'LR', 'LM', 'LI', 'LT', 'RT', 'RI', 'RM', 'RR', 'RP'];

export const isThumb = (finger: Finger) => finger === 'LT' || finger === 'RT';

/** 同じ手の隣接ペア（§11.4） */
export const ADJACENT_PAIRS: [NonThumb, NonThumb][] = [
  ['LP', 'LR'], ['LR', 'LM'], ['LM', 'LI'],
  ['RI', 'RM'], ['RM', 'RR'], ['RR', 'RP'],
];

export interface Point {
  x: number;
  y: number;
}

export interface Key extends Point {
  /** 物理キーの識別子。row と col から `r{row}c{col}` で生成する */
  id: string;
  row: number;
  col: number;
  finger: Finger;
}

export interface Geometry {
  id: string;
  name: string;
  pitchMm: number;
  /** id → Key */
  keys: Map<string, Key>;
  /** row/col → Key */
  grid: Key[][];
  /** 親指キー */
  thumbs: Record<'LT' | 'RT', Key>;
  homes: Record<Finger, Point>;
}

/**
 * 物理キーの正式名は QWERTY 刻印とする。行列インデックスより読めるうえ、
 * 公開されているかな配列の定義がそのまま写せる。
 */
export const QWERTY_LEGEND = [
  '1234567890-=',
  'qwertyuiop[]',
  "asdfghjkl;'",
  'zxcvbnm,./',
] as const;

export const keyId = (row: number, col: number) => QWERTY_LEGEND[row][col];

/** 親指キーの id */
export const THUMB_KEY = { LT: 'thumb-l', RT: 'space' } as const;

/**
 * 列に対する既定の指割り当て。
 * 10 列目より右（`-` `=` `[` `]` `'` など）はすべて小指が担当する。
 */
const COLUMN_FINGER: Finger[] = [
  'LP', 'LR', 'LM', 'LI', 'LI', 'RI', 'RI', 'RM', 'RR', 'RP', 'RP', 'RP', 'RP',
];

/** 各行の列数は刻印の長さで決まる（12 / 12 / 11 / 10） */
const ROW_WIDTH = QWERTY_LEGEND.map((row) => row.length);

/** 各指のホーム列（ASDF JKL;）。親指は別途キー上に置く */
const HOME_COLUMN: Record<Exclude<Finger, 'LT' | 'RT'>, number> = {
  LP: 0, LR: 1, LM: 2, LI: 3,
  RI: 6, RM: 7, RR: 8, RP: 9,
};

/** 親指キーの行 */
export const THUMB_ROW = 4;

/**
 * 親指キーの中心列。
 * ANSI のスペースバーは 6.25u 幅で左端が 3.75u（Ctrl+Win+Alt = 1.25u × 3）に来るが、
 * 親指が実際に叩くのはホームポジション直下なので、そこを押下点として置く。
 */
const THUMB_COLUMN: Record<'LT' | 'RT', number> = { LT: 3.5, RT: 5.5 };

/** ホーム段の行インデックス。0=数字段 1=上段 2=ホーム段 3=下段 */
export const HOME_ROW = 2;

export type GeometryKind = 'row-staggered' | 'ortholinear' | 'column-staggered';

/**
 * 段ずれ量 [数字段, 上段, ホーム段, 下段]。
 * ANSI/JIS の修飾キー幅から一意に決まる:
 *   Backquote 1.0u → 1.5u / Tab 1.5u → 2.0u / CapsLock 1.75u → 2.25u / LShift 2.25u → 2.75u
 */
const ROW_STAGGER = [0, 0.5, 0.75, 1.25];

/** column-staggered の列ごとの y オフセット */
const COLUMN_STAGGER = [0.34, 0.12, 0, 0.1, 0.3, 0.3, 0.1, 0, 0.12, 0.34];

/** column-staggered で左右の手の間に空ける量 */
const SPLIT_GAP = 2;

export function buildGeometry(kind: GeometryKind): Geometry {
  const pitchMm = kind === 'column-staggered' ? 18 : 19.05;

  const xOf = (row: number, col: number) => {
    if (kind === 'row-staggered') return col + ROW_STAGGER[row];
    if (kind === 'column-staggered') return col + (col >= 5 ? SPLIT_GAP : 0);
    return col;
  };
  const yOf = (row: number, col: number) =>
    kind === 'column-staggered'
      ? row + COLUMN_STAGGER[Math.min(col, COLUMN_STAGGER.length - 1)]
      : row;

  const grid: Key[][] = [];
  const keys = new Map<string, Key>();
  for (let row = 0; row < 4; row++) {
    const line: Key[] = [];
    for (let col = 0; col < ROW_WIDTH[row]; col++) {
      const key: Key = {
        id: keyId(row, col),
        row,
        col,
        x: xOf(row, col),
        y: yOf(row, col),
        finger: COLUMN_FINGER[col],
      };
      line.push(key);
      keys.set(key.id, key);
    }
    grid.push(line);
  }

  // 親指キー。ホームがキー自身の上にあるため移動距離は常に 0 になり、
  // 打鍵数だけが g のカウントに入る。
  const thumbs = {} as Record<'LT' | 'RT', Key>;
  for (const finger of ['LT', 'RT'] as const) {
    const col = THUMB_COLUMN[finger];
    const key: Key = {
      id: THUMB_KEY[finger],
      row: THUMB_ROW,
      col,
      x: xOf(HOME_ROW, col),
      y: kind === 'column-staggered' ? THUMB_ROW + 0.35 : THUMB_ROW,
      finger,
    };
    thumbs[finger] = key;
    keys.set(key.id, key);
  }

  const homes = {} as Record<Finger, Point>;
  for (const finger of FINGERS) {
    const col = HOME_COLUMN[finger];
    homes[finger] = { x: xOf(HOME_ROW, col), y: yOf(HOME_ROW, col) };
  }
  homes.LT = { x: thumbs.LT.x, y: thumbs.LT.y };
  homes.RT = { x: thumbs.RT.x, y: thumbs.RT.y };

  return { id: kind, name: GEOMETRY_NAMES[kind], pitchMm, keys, grid, thumbs, homes };
}

const GEOMETRY_NAMES: Record<GeometryKind, string> = {
  'row-staggered': '段ずれ（ANSI/JIS 準拠）',
  ortholinear: '格子',
  'column-staggered': '列ずれ（分割想定）',
};

export const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
