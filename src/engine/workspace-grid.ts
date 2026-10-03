/**
 * Workspaceのペインの並び（格子）。
 *
 * ペインごとに位置（x・y）と大きさ（w・h）を持つ。単位は格子の升目で、画面の画素ではない
 * （画面の幅が変わっても同じ升目で並べ直せるように）。1つのペインの大きさを変えても、他のペインの
 * 大きさは変わらない（兄弟の比で大きさが決まる分割の木と違う点）。
 *
 * 載せるライブラリ（react-grid-layout）の保存形式とは独立に持つ。ライブラリの`{i,x,y,w,h}`は
 * `i`を`id`と呼ぶ以外は同じ形で、変換は載せる側（`hosts/workspace/`）が行う。
 *
 * 不変条件（`normalizeGrid`が保証する）:
 * - 資産に載っているペインは、どれもちょうど1つの枠を持つ。載っていないペインの枠は持たない
 * - 枠は整数で、列の範囲（0 <= x, x + w <= GRID_COLS）に収まり、y >= 0、w >= 1、h >= 1
 * - 枠どうしは重ならない
 * - 「空いた所に詰める」設定（`compact`）の時だけ、上に空きが無い（縦に詰めてある）。ペインを閉じたら下のペインが上がる。
 *   詰めない設定（既定）では、縮めた・閉じた所は空いたまま残し、衝突した時に下へ押すだけにする
 */
/**
 * 列数。12列では荒く、ペインの幅を細かく選べない（Analyzerによって欲しい幅が割れる）ので24列にする。
 * 既定の幅は面の半分（GRID_COLS / 2）で、列数を前提にした値はここから導く。
 */
export const GRID_COLS = 24;

export interface GridItem {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface GridSize {
  readonly w: number;
  readonly h: number;
}

/** ペインが1つも無い時は枠も無い。 */
export type WorkspaceGrid = readonly GridItem[];

/** 大きさを知らないペイン（保存データにだけあって枠が無い等）に使う大きさ。 */
export const FALLBACK_GRID_SIZE: GridSize = { w: GRID_COLS / 2, h: 12 };

function overlaps(a: GridItem, b: GridItem): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

function collidesWithAny(item: GridItem, others: readonly GridItem[]): boolean {
  return others.some((other) => other.id !== item.id && overlaps(item, other));
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}

/** 上から下、同じ高さなら左から右の順。画面の読み順で、縦積み（スマホ幅）の並びにも使う。 */
function inReadingOrder(grid: WorkspaceGrid): GridItem[] {
  return [...grid].sort((a, b) => a.y - b.y || a.x - b.x);
}

/**
 * 上に空きがあれば詰める（縦の詰め）。読み順に1つずつ、他の枠にぶつかるまで上へ動かす。
 * 動いた分だけが変わり、位置・大きさが同じなら同じ内容を返す（参照は新しい配列）。
 */
export function compactGrid(grid: WorkspaceGrid): WorkspaceGrid {
  const placed: GridItem[] = [];
  for (const item of inReadingOrder(grid)) {
    let y = item.y;
    while (y > 0 && !collidesWithAny({ ...item, y: y - 1 }, placed)) y -= 1;
    placed.push(y === item.y ? item : { ...item, y });
  }
  // 並びは元の配列の順を保つ（保存の差分・比較を安定させる）
  const byId = new Map(placed.map((item) => [item.id, item] as const));
  return grid.map((item) => byId.get(item.id)!);
}

/** 重なりを解く。重なった枠は、読み順で先に置いた枠の下へ押し下げる（壊れた保存データ・外から来た値の用心）。 */
function resolveOverlaps(grid: WorkspaceGrid): WorkspaceGrid {
  const placed: GridItem[] = [];
  for (const item of inReadingOrder(grid)) {
    let next = item;
    while (collidesWithAny(next, placed)) next = { ...next, y: next.y + 1 };
    placed.push(next);
  }
  const byId = new Map(placed.map((item) => [item.id, item] as const));
  return grid.map((item) => byId.get(item.id)!);
}

/**
 * 空いている最初の場所（上から、同じ高さなら左から）。`fromY`より上は探さない。
 * 縦は際限が無いので、必ず見つかる。
 */
function firstFreeSlot(grid: WorkspaceGrid, size: GridSize, fromY: number): { readonly x: number; readonly y: number } {
  const bottom = grid.reduce((max, item) => Math.max(max, item.y + item.h), 0);
  for (let y = fromY; y <= bottom; y += 1) {
    for (let x = 0; x + size.w <= GRID_COLS; x += 1) {
      if (!collidesWithAny({ id: '', x, y, ...size }, grid)) return { x, y };
    }
  }
  return { x: 0, y: bottom };
}

function clampSize(size: GridSize): GridSize {
  return { w: clampInt(size.w, 1, GRID_COLS, FALLBACK_GRID_SIZE.w), h: clampInt(size.h, 1, 1000, FALLBACK_GRID_SIZE.h) };
}

/**
 * 不変条件を満たす形へ直す。外から来た値（保存データ）と、編集の途中でできた形の両方に使う。
 * `paneIds`は資産に載っているペイン。枠が無いペインは、`sizeOf`の大きさで空いている最初の場所へ足す
 * （ペインを失わないため）。
 */
export function normalizeGrid(
  grid: WorkspaceGrid | undefined,
  paneIds: readonly string[],
  compact: boolean,
  sizeOf: (paneId: string) => GridSize = () => FALLBACK_GRID_SIZE,
): WorkspaceGrid {
  const known = new Set(paneIds);
  const seen = new Set<string>();
  const items: GridItem[] = [];
  for (const raw of grid ?? []) {
    // 未知のペインと、2回目以降の出現（同じペインを2か所に置かない）は捨てる
    if (!known.has(raw.id) || seen.has(raw.id)) continue;
    seen.add(raw.id);
    const w = clampInt(raw.w, 1, GRID_COLS, FALLBACK_GRID_SIZE.w);
    items.push({
      id: raw.id,
      w,
      h: clampInt(raw.h, 1, 1000, FALLBACK_GRID_SIZE.h),
      x: clampInt(raw.x, 0, GRID_COLS - w, 0),
      y: clampInt(raw.y, 0, 100000, 0),
    });
  }
  let result: WorkspaceGrid = resolveOverlaps(items);
  for (const id of paneIds) {
    if (seen.has(id)) continue;
    seen.add(id);
    const size = clampSize(sizeOf(id));
    result = [...result, { id, ...firstFreeSlot(result, size, 0), ...size }];
  }
  return compact ? compactGrid(result) : result;
}

/** 詰める設定の時だけ詰める。詰めない設定では、並びをそのまま返す。 */
function compactIf(compact: boolean, grid: WorkspaceGrid): WorkspaceGrid {
  return compact ? compactGrid(grid) : grid;
}

/** ペインを足した枠。空いている最初の場所に`size`で置く。詰めない設定なら、他の枠は動かさない。 */
export function gridWithPane(grid: WorkspaceGrid, paneId: string, size: GridSize, compact: boolean): WorkspaceGrid {
  if (grid.some((item) => item.id === paneId)) return grid;
  const fitted = clampSize(size);
  return compactIf(compact, [...grid, { id: paneId, ...firstFreeSlot(grid, fitted, 0), ...fitted }]);
}

/**
 * `referencePaneId`のペインと同じ大きさの枠を、その隣に置く（複製）。右隣が空いていれば右隣、
 * 空いていなければ真下、真下も塞がっていれば、元の枠より下の空いている最初の場所。
 * 元のペインが見つからなければ、`fallbackSize`で空いている最初の場所に置く。
 */
export function gridWithPaneNextTo(
  grid: WorkspaceGrid,
  referencePaneId: string,
  paneId: string,
  compact: boolean,
  fallbackSize: GridSize = FALLBACK_GRID_SIZE,
): WorkspaceGrid {
  if (grid.some((item) => item.id === paneId)) return grid;
  const source = grid.find((item) => item.id === referencePaneId);
  if (source === undefined) return gridWithPane(grid, paneId, fallbackSize, compact);
  const size: GridSize = { w: source.w, h: source.h };
  const right: GridItem = { id: paneId, x: source.x + source.w, y: source.y, ...size };
  const below: GridItem = { id: paneId, x: source.x, y: source.y + source.h, ...size };
  let placed: GridItem;
  if (right.x + right.w <= GRID_COLS && !collidesWithAny(right, grid)) placed = right;
  else if (!collidesWithAny(below, grid)) placed = below;
  else placed = { id: paneId, ...firstFreeSlot(grid, size, source.y + source.h), ...size };
  return compactIf(compact, [...grid, placed]);
}

/**
 * ペインを取り除いた枠。他のペインの大きさは変わらない。詰める設定なら下のペインが上へ詰まり、
 * 詰めない設定なら閉じた所は空いたまま残る。
 */
export function gridWithoutPane(grid: WorkspaceGrid, paneId: string, compact: boolean): WorkspaceGrid {
  if (!grid.some((item) => item.id === paneId)) return grid;
  return compactIf(compact, grid.filter((item) => item.id !== paneId));
}

/** ペインのidを画面の読み順（上→下・左→右）で返す。縦積みの並びにも使う。 */
export function gridPaneIds(grid: WorkspaceGrid): readonly string[] {
  return inReadingOrder(grid).map((item) => item.id);
}

/** 枠の同一性（位置と大きさ。配列の順は見ない）。 */
export function sameGrid(a: WorkspaceGrid, b: WorkspaceGrid): boolean {
  if (a.length !== b.length) return false;
  const byId = new Map(b.map((item) => [item.id, item] as const));
  return a.every((item) => {
    const other = byId.get(item.id);
    return other !== undefined && other.x === item.x && other.y === item.y && other.w === item.w && other.h === item.h;
  });
}
