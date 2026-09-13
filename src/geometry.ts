/** 指の識別子。L/R + P(小指) R(薬指) M(中指) I(人差し指) T(親指) */
export type Finger =
  | 'LP' | 'LR' | 'LM' | 'LI'
  | 'RI' | 'RM' | 'RR' | 'RP';

export const FINGERS: Finger[] = ['LP', 'LR', 'LM', 'LI', 'RI', 'RM', 'RR', 'RP'];

/** 同じ手の隣接ペア（§10.3） */
export const ADJACENT_PAIRS: [Finger, Finger][] = [
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
  homes: Record<Finger, Point>;
}

export const keyId = (row: number, col: number) => `r${row}c${col}`;

/** 列 0..9 に対する既定の指割り当て */
const COLUMN_FINGER: Finger[] = ['LP', 'LR', 'LM', 'LI', 'LI', 'RI', 'RI', 'RM', 'RR', 'RP'];

/** 各指のホーム列（ASDF JKL;） */
const HOME_COLUMN: Record<Finger, number> = {
  LP: 0, LR: 1, LM: 2, LI: 3,
  RI: 6, RM: 7, RR: 8, RP: 9,
};

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
    kind === 'column-staggered' ? row + COLUMN_STAGGER[col] : row;

  const grid: Key[][] = [];
  const keys = new Map<string, Key>();
  for (let row = 0; row < 4; row++) {
    const line: Key[] = [];
    for (let col = 0; col < 10; col++) {
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

  const homes = {} as Record<Finger, Point>;
  for (const finger of FINGERS) {
    const col = HOME_COLUMN[finger];
    homes[finger] = { x: xOf(HOME_ROW, col), y: yOf(HOME_ROW, col) };
  }

  return { id: kind, name: GEOMETRY_NAMES[kind], pitchMm, keys, grid, homes };
}

const GEOMETRY_NAMES: Record<GeometryKind, string> = {
  'row-staggered': '段ずれ（ANSI/JIS 準拠）',
  ortholinear: '格子',
  'column-staggered': '列ずれ（分割想定）',
};

export const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
