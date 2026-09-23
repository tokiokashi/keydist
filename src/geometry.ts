/** 指の識別子。L/R + P(小指) R(薬指) M(中指) I(人差し指) T(親指) */
export type Finger =
  | 'LP' | 'LR' | 'LM' | 'LI' | 'LT'
  | 'RT' | 'RI' | 'RM' | 'RR' | 'RP';

/** 親指を除く8本。隣接指間距離（§11.6）はこの範囲で見る */
export type NonThumb = Exclude<Finger, 'LT' | 'RT'>;
export const FINGERS: NonThumb[] = ['LP', 'LR', 'LM', 'LI', 'RI', 'RM', 'RR', 'RP'];

/** 親指を含む全10本 */
export const ALL_FINGERS: Finger[] = ['LP', 'LR', 'LM', 'LI', 'LT', 'RT', 'RI', 'RM', 'RR', 'RP'];

export const isThumb = (finger: Finger) => finger === 'LT' || finger === 'RT';

/** 同じ手の隣接ペア（§11.6） */
export const ADJACENT_PAIRS: [NonThumb, NonThumb][] = [
  ['LP', 'LR'], ['LR', 'LM'], ['LM', 'LI'],
  ['RI', 'RM'], ['RM', 'RR'], ['RR', 'RP'],
];

export interface Point {
  x: number;
  y: number;
}

export interface Key extends Point {
  /** 物理キーの識別子。QWERTY刻印の範囲内なら刻印文字、それ以外は `r{row}c{col}` */
  id: string;
  row: number;
  col: number;
  finger: Finger;
  /** 表示上のキー幅 [u]。通常キーは1。 */
  width?: number;
}

export interface Geometry {
  id: string;
  name: string;
  pitchMm: number;
  /** id → Key */
  keys: Map<string, Key>;
  /** row/col → Key（親指キーは含まない） */
  grid: Key[][];
  /** 各手のホームとなる親指キー（仕様 §3.1） */
  thumbs: Record<'LT' | 'RT', Key>;
  homes: Record<Finger, Point>;
  /** この形状の構築に使った指割り当て（仕様 §4.2準拠。出力に併記するため保持する） */
  assignment: FingerAssignment;
}

/**
 * 物理キーの正式名はQWERTY刻印とする。行列インデックスより読めるうえ、
 * 公開されているかな配列の定義がそのまま写せる。
 */
export const QWERTY_LEGEND = [
  '1234567890-=',
  'qwertyuiop[]',
  "asdfghjkl;'",
  'zxcvbnm,./',
] as const;

/**
 * 物理キーのid。QWERTY刻印の範囲内（既定形状の行・列数以内）ならその文字を使い、
 * 範囲外（形状定義でキー数を増やした場合）は `r{row}c{col}` で生成する。
 */
export const keyId = (row: number, col: number): string => {
  const legend: string | undefined = QWERTY_LEGEND[row];
  if (legend && col < legend.length) return legend[col];
  return `r${row}c${col}`;
};

/** 親指キーのid（既定形状のもの） */
export const THUMB_KEY = { LT: 'thumb-l', RT: 'thumb-r' } as const;

/** 左右Shiftのcanonical physical key id。browser adapterもこのidへ正規化する。 */
export const SHIFT_KEY = { L: 'shift-l', R: 'shift-r' } as const;

/** 旧定義やlocalStorageに残る親指キーidを正式名へ解決する。 */
export const resolveKeyId = (id: string): string => id === 'space' ? THUMB_KEY.RT : id;

/** 各行の列数は刻印の長さで決まる（12 / 12 / 11 / 10）。既定形状のrowWidthsに使う */
const ROW_WIDTH = QWERTY_LEGEND.map((row) => row.length);
const JIS_ROW_WIDTH = [13, 12, 12, 11] as const;

/** 親指キーの行 */
export const THUMB_ROW = 4;

/** ホーム段の行インデックス。0=数字段1=上段2=ホーム段3=下段 */
export const HOME_ROW = 2;

/**
 * 指の割り当て。運指は配列定義の一部であり、評価器が代替の指を探すことはしない
 * （仕様 §4.2）。割り当てを変えると同指連続の数も距離も変わるため、どの割り当てで
 * 測ったかは数値に付随する情報として出力へ併記する（仕様 §12.3）。比較の可否を
 * 決めるのは読み手であってモデルではない。
 */
export interface FingerAssignment {
  id: string;
  name: string;
  /** 物理キーid → 指。親指キーは含まない（親指の扱いは仕様 §3.1で固定） */
  keyFinger: Record<string, Finger>;
  /**
   * 各指のホーム位置となるキーid（仕様 §3のH_f）。
   * 座標はここで指した物理キーの実座標から引くため、形状（row-staggered等）ごとに解決される。
   */
  homeKey: Record<NonThumb, string>;
}

/** 配列ごとに既定のホームキーだけを上書きした運指設定を作る。 */
export function assignmentWithHomeKeys(
  assignment: FingerAssignment,
  homeKeys?: Partial<Record<NonThumb, string>>,
): FingerAssignment {
  if (!homeKeys) return assignment;
  const merged = { ...assignment.homeKey };
  for (const finger of FINGERS) {
    const key = homeKeys[finger];
    if (key !== undefined && assignment.keyFinger[key] !== undefined) merged[finger] = key;
  }
  return { ...assignment, homeKey: merged };
}

/**
 * 列を単位に指を割り当てる（既定の割り当てが取る形）。同じ列は全行で同じ指になる。
 * `rowWidths` を渡すと既定（ANSI 12/12/11/10）以外の形状にも割り当てを作れる。
 */
export function columnFingerAssignment(
  id: string,
  name: string,
  columnFinger: Finger[],
  homeColumn: Record<NonThumb, number>,
  rowWidths: number[] = ROW_WIDTH,
): FingerAssignment {
  const keyFinger: Record<string, Finger> = {};
  rowWidths.forEach((width, row) => {
    for (let col = 0; col < width; col++) {
      keyFinger[keyId(row, col)] = columnFinger[col];
    }
  });
  const homeKey = {} as Record<NonThumb, string>;
  for (const finger of FINGERS) {
    homeKey[finger] = keyId(HOME_ROW, homeColumn[finger]);
  }
  return { id, name, keyFinger, homeKey };
}

/**
 * 既定の指割り当て。10列目より右（`-` `=` `[` `]` `'` など）はすべて小指が担当し、
 * ホームはASDF JKL; に置く。この既定を変えると既存の測定値が動くため変更しない。
 */
export const DEFAULT_FINGER_ASSIGNMENT: FingerAssignment = columnFingerAssignment(
  'default',
  '既定（列固定）',
  ['LP', 'LR', 'LM', 'LI', 'LI', 'RI', 'RI', 'RM', 'RR', 'RP', 'RP', 'RP', 'RP'],
  { LP: 0, LR: 1, LM: 2, LI: 3, RI: 6, RM: 7, RR: 8, RP: 9 },
);

export const JIS_FINGER_ASSIGNMENT: FingerAssignment = columnFingerAssignment(
  'jis-default',
  'JIS既定（列固定）',
  ['LP', 'LR', 'LM', 'LI', 'LI', 'RI', 'RI', 'RM', 'RR', 'RP', 'RP', 'RP', 'RP'],
  { LP: 0, LR: 1, LM: 2, LI: 3, RI: 6, RM: 7, RR: 8, RP: 9 },
  [...JIS_ROW_WIDTH],
);

export type PhysicalKeyboardStandard = 'ansi' | 'jis';
export type PhysicalTopology =
  | 'row-staggered'
  | 'ortholinear'
  | 'column-staggered';

export type PresetGeometryKind =
  | 'row-staggered'
  | 'jis-row-staggered'
  | 'ortholinear'
  | 'jis-ortholinear'
  | 'column-staggered'
  | 'jis-column-staggered';
export type CustomGeometryKind = `custom:${string}`;
export type GeometryKind = PresetGeometryKind | 'custom' | CustomGeometryKind;

export const customGeometryKind = (shapeId: string): CustomGeometryKind => `custom:${shapeId}`;

export const isCustomGeometryKind = (value: unknown): value is 'custom' | CustomGeometryKind =>
  value === 'custom' || (typeof value === 'string' && value.startsWith('custom:'));

/** 親指キー1個の定義。物理形状（`PhysicalShape`）が個数・位置を持つ（仕様 §3.1） */
export interface ThumbKeySpec {
  /** 物理キーid */
  id: string;
  finger: 'LT' | 'RT';
  /** ホーム段 (row = HOME_ROW)を基準にした列位置。x座標はここから形状のxOfで求める */
  col: number;
  /** y座標 [u] */
  y: number;
}

/** grid外に置く一般physical key。運指はFingerAssignment側で別に持つ。 */
export interface ExtraPhysicalKeySpec {
  /** canonical physical key id（例: tab / escape） */
  id: string;
  /** grid互換consumer向けの論理row/col。実座標はx/yを正とする。 */
  row: number;
  col: number;
  /** 物理座標 [u] */
  x: number;
  y: number;
  /** 表示上のキー幅 [u]。省略時1。 */
  width?: number;
}

/**
 * 物理形状の定義（仕様 §3）。ピッチ・各段のキー数・段ずれ量・列オフセット・
 * 親指キーの数と位置をまとめて持つ。既定の3形状（`PHYSICAL_SHAPES`）を変えると
 * 既存の測定値が動くため変更しない。
 */
export interface PhysicalShape {
  id: string;
  name: string;
  /** 1uあたりの実距離 [mm] */
  pitchMm: number;
  /** 各段のキー数。段の数はこの配列の長さで決まる */
  rowWidths: number[];
  /** 段ごとのxオフセット [u]（row-staggeredの段ずれ量）。省略時は全段0 */
  rowStagger?: number[];
  /**
   * 列ごとのyオフセット [u]（column-staggered用）。省略時は全列0（段番号がそのままy）。
   * colがこの配列の長さを超える場合は最後の値を使う
   */
  columnStagger?: number[];
  /** この列（col）以降に `splitGap` をxに加える（分割キーボード用）。省略時は分割なし */
  splitAt?: number;
  /** 左右の手の間に空ける量 [u]（`splitAt` とセットで使う） */
  splitGap?: number;
  /** grid外の一般physical key。指はここへ埋め込まずFingerAssignmentで指定する。 */
  extraKeys?: ExtraPhysicalKeySpec[];
  /** 親指キーの定義。各手に1個以上必要 */
  thumbs: ThumbKeySpec[];
  /**
   * 親指キーが手ごとに複数ある場合、ホームとなるキーidを明示する（仕様 §3.1）。
   * 1個しかない手は省略してよい（その1個が自動でホームになる）
   */
  thumbHome?: Partial<Record<'LT' | 'RT', string>>;
}

/**
 * 段ずれ量 [数字段, 上段, ホーム段, 下段]。
 * ANSI/JISの修飾キー幅から一意に決まる:
 *   Backquote 1.0u → 1.5u / Tab 1.5u → 2.0u / CapsLock 1.75u → 2.25u / LShift 2.25u → 2.75u
 */
const ROW_STAGGER = [0, 0.5, 0.75, 1.25];

/** column-staggeredの列ごとのyオフセット */
const COLUMN_STAGGER = [0.34, 0.12, 0, 0.1, 0.3, 0.3, 0.1, 0, 0.12, 0.34];

/** column-staggeredで左右の手の間に空ける量 */
const SPLIT_GAP = 2;

/** column-staggeredが分割を始める列 */
const SPLIT_AT = 5;

const DEFAULT_THUMBS: ThumbKeySpec[] = [
  { id: THUMB_KEY.LT, finger: 'LT', col: 3.5, y: THUMB_ROW },
  { id: THUMB_KEY.RT, finger: 'RT', col: 5.5, y: THUMB_ROW },
];

/**
 * 既定の3形状。数値（ピッチ・段ずれ・列オフセット）はこれまでの固定実装と同じにしてあり、
 * ここを変えると既存の測定値が動くため変更しない。
 */
export const PHYSICAL_SHAPES: Record<PresetGeometryKind, PhysicalShape> = {
  'row-staggered': {
    id: 'row-staggered',
    name: 'ロウスタッガード（ANSI）',
    pitchMm: 19.05,
    rowWidths: ROW_WIDTH,
    rowStagger: ROW_STAGGER,
    thumbs: DEFAULT_THUMBS,
  },
  'jis-row-staggered': {
    id: 'jis-row-staggered',
    name: 'ロウスタッガード（JIS 109）',
    pitchMm: 19.05,
    rowWidths: [...JIS_ROW_WIDTH],
    rowStagger: ROW_STAGGER,
    thumbs: DEFAULT_THUMBS,
  },
  ortholinear: {
    id: 'ortholinear',
    name: 'オーソ（ANSI）',
    pitchMm: 19.05,
    rowWidths: ROW_WIDTH,
    thumbs: DEFAULT_THUMBS,
  },
  'jis-ortholinear': {
    id: 'jis-ortholinear',
    name: 'オーソ（JIS 109）',
    pitchMm: 19.05,
    rowWidths: [...JIS_ROW_WIDTH],
    thumbs: DEFAULT_THUMBS,
  },
  'column-staggered': {
    id: 'column-staggered',
    name: 'カラム（ANSI・分割想定）',
    pitchMm: 18,
    rowWidths: ROW_WIDTH,
    columnStagger: COLUMN_STAGGER,
    splitAt: SPLIT_AT,
    splitGap: SPLIT_GAP,
    thumbs: [
      { id: THUMB_KEY.LT, finger: 'LT', col: 3.5, y: THUMB_ROW + 0.35 },
      { id: THUMB_KEY.RT, finger: 'RT', col: 5.5, y: THUMB_ROW + 0.35 },
    ],
  },
  'jis-column-staggered': {
    id: 'jis-column-staggered',
    name: 'カラム（JIS 109・分割想定）',
    pitchMm: 18,
    rowWidths: [...JIS_ROW_WIDTH],
    columnStagger: COLUMN_STAGGER,
    splitAt: SPLIT_AT,
    splitGap: SPLIT_GAP,
    thumbs: [
      { id: THUMB_KEY.LT, finger: 'LT', col: 3.5, y: THUMB_ROW + 0.35 },
      { id: THUMB_KEY.RT, finger: 'RT', col: 5.5, y: THUMB_ROW + 0.35 },
    ],
  },
};

export const isPresetGeometryKind = (value: unknown): value is PresetGeometryKind =>
  value === 'row-staggered'
  || value === 'jis-row-staggered'
  || value === 'ortholinear'
  || value === 'jis-ortholinear'
  || value === 'column-staggered'
  || value === 'jis-column-staggered';

export const presetGeometryStandard = (
  kind: PresetGeometryKind,
): PhysicalKeyboardStandard => kind.startsWith('jis-') ? 'jis' : 'ansi';

export const presetGeometryTopology = (
  kind: PresetGeometryKind,
): PhysicalTopology => {
  if (kind.endsWith('column-staggered')) return 'column-staggered';
  if (kind.endsWith('ortholinear')) return 'ortholinear';
  return 'row-staggered';
};

export const presetGeometryKind = (
  standard: PhysicalKeyboardStandard,
  topology: PhysicalTopology,
): PresetGeometryKind => standard === 'jis'
  ? topology === 'row-staggered'
    ? 'jis-row-staggered'
    : `jis-${topology}`
  : topology;

export function buildGeometry(
  shape: PhysicalShape | PresetGeometryKind,
  assignment: FingerAssignment = DEFAULT_FINGER_ASSIGNMENT,
): Geometry {
  const s = typeof shape === 'string' ? PHYSICAL_SHAPES[shape] : shape;
  const rowStagger = s.rowStagger ?? [];
  const columnStagger = s.columnStagger;
  const splitAt = s.splitAt ?? Infinity;
  const splitGap = s.splitGap ?? 0;

  const xOf = (row: number, col: number) =>
    col + (rowStagger[row] ?? 0) + (col >= splitAt ? splitGap : 0);
  const yOf = (row: number, col: number) =>
    row + (columnStagger ? columnStagger[Math.min(col, columnStagger.length - 1)] : 0);

  const grid: Key[][] = [];
  const keys = new Map<string, Key>();
  s.rowWidths.forEach((width, row) => {
    const line: Key[] = [];
    for (let col = 0; col < width; col++) {
      const id = keyId(row, col);
      const finger = assignment.keyFinger[id];
      if (!finger) throw new Error(`指割り当て「${assignment.id}」にキー ${id} が無い`);
      const key: Key = { id, row, col, x: xOf(row, col), y: yOf(row, col), finger };
      line.push(key);
      keys.set(key.id, key);
    }
    grid.push(line);
  });

  // Tab / Esc等のgrid外physical key。shapeは座標、assignmentは運指だけを所有する。
  for (const spec of s.extraKeys ?? []) {
    const canonicalId = resolveKeyId(spec.id);
    if (canonicalId !== spec.id) {
      throw new Error(
        `形状「${s.id}」の追加キー ${spec.id} はcanonical physical key idではない（${canonicalId}）`,
      );
    }
    if (
      keys.has(canonicalId)
      || canonicalId === SHIFT_KEY.L
      || canonicalId === SHIFT_KEY.R
      || s.thumbs.some((thumb) => resolveKeyId(thumb.id) === canonicalId)
    ) {
      throw new Error(`形状「${s.id}」の追加キー ${spec.id} が既存キーと重複している`);
    }
    const finger = assignment.keyFinger[canonicalId];
    if (!finger) throw new Error(`指割り当て「${assignment.id}」にキー ${spec.id} が無い`);
    if (isThumb(finger)) {
      throw new Error(`追加キー ${spec.id} に親指 ${finger} は割り当てられない`);
    }
    keys.set(canonicalId, {
      id: canonicalId,
      row: spec.row,
      col: spec.col,
      x: spec.x,
      y: spec.y,
      finger,
      ...(spec.width === undefined ? {} : { width: spec.width }),
    });
  }

  // Shiftは既存PhysicalShape永続化schemaを増やさず、bottom rowの実座標から派生する。
  // ANSI/JISの標準幅を前提に、左2.25u・右2.75u Shiftの中心を隣接キー中心から求める。
  // custom shapeでもbottom rowの位置へ追随し、標準Shiftを使わない特殊形状は別semanticで扱う。
  const bottomRow = grid[3] ?? grid.at(-1);
  const firstBottomKey = bottomRow?.[0];
  const lastBottomKey = bottomRow?.at(-1);
  if (firstBottomKey !== undefined && lastBottomKey !== undefined) {
    keys.set(SHIFT_KEY.L, {
      id: SHIFT_KEY.L,
      row: firstBottomKey.row,
      col: -1,
      x: firstBottomKey.x - 1.625,
      y: firstBottomKey.y,
      finger: 'LP',
      width: 2.25,
    });
    keys.set(SHIFT_KEY.R, {
      id: SHIFT_KEY.R,
      row: lastBottomKey.row,
      col: lastBottomKey.col + 1,
      x: lastBottomKey.x + 1.875,
      y: lastBottomKey.y,
      finger: 'RP',
      width: 2.75,
    });
  }

  // 親指キー。1個しか無い手はホーム＝そのキー自身になるため移動距離は常に0（仕様 §3.1）。
  // 複数ある手は他の指と同じホーム復帰規則（§7〜§9）に従う
  const thumbsByFinger: Record<'LT' | 'RT', Key[]> = { LT: [], RT: [] };
  for (const spec of s.thumbs) {
    const key: Key = {
      id: spec.id,
      row: THUMB_ROW,
      col: spec.col,
      x: xOf(HOME_ROW, spec.col),
      y: spec.y,
      finger: spec.finger,
    };
    keys.set(key.id, key);
    thumbsByFinger[spec.finger].push(key);
  }

  const thumbs = {} as Record<'LT' | 'RT', Key>;
  for (const finger of ['LT', 'RT'] as const) {
    const candidates = thumbsByFinger[finger];
    if (candidates.length === 0) {
      throw new Error(`形状「${s.id}」に ${finger} の親指キーが無い`);
    }
    const homeId = s.thumbHome?.[finger];
    const home = homeId
      ? candidates.find((k) => k.id === homeId)
      : candidates.length === 1
        ? candidates[0]
        : undefined;
    if (!home) {
      throw new Error(`形状「${s.id}」の ${finger} は親指キーが複数あるためthumbHomeで明示する`);
    }
    thumbs[finger] = home;
  }

  // ホーム位置は指割り当てが指すキーの実座標から引く（仕様 §3。形状ごとに解決される）
  const homes = {} as Record<Finger, Point>;
  for (const finger of FINGERS) {
    const homeKeyId = assignment.homeKey[finger];
    const homeKey = keys.get(homeKeyId);
    if (!homeKey) {
      throw new Error(`指割り当て「${assignment.id}」の指 ${finger} のホームキー ${homeKeyId} が無い`);
    }
    homes[finger] = { x: homeKey.x, y: homeKey.y };
  }
  homes.LT = { x: thumbs.LT.x, y: thumbs.LT.y };
  homes.RT = { x: thumbs.RT.x, y: thumbs.RT.y };

  return { id: s.id, name: s.name, pitchMm: s.pitchMm, keys, grid, thumbs, homes, assignment };
}

export const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
