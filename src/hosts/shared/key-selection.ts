/**
 * 図のキーを選んだ状態（純粋な状態遷移）。
 *
 * 選ぶ単位は物理キーで、選択は「同じ対象」ごとに1つ持つ。対象は、解決した後の配列と物理配列の組
 * （`keySelectionTargetOf`）で決まる。同じ対象を映すペインどうしは同じ選択を読み、違う対象のペインには
 * 届かない。テキスト・指の割当・解析設定が違っても、配列と物理配列が同じなら同じ対象で、出る値だけがペインごとに違う。
 *
 * キーの詳細の小窓は、クリックしたペインだけが開く。小窓は選択に付いて動き、選択が外れると全部閉じる。
 * 保存しない見た目だけの状態なので、資産・URL・Undoの履歴には入れない。
 */

export interface KeySelectionState {
  /** 対象 → 選んだ物理キー */
  readonly selected: ReadonlyMap<string, string>;
  /** 小窓を開いているペイン → そのペインが小窓で見ている対象 */
  readonly windows: ReadonlyMap<string, string>;
}

export const EMPTY_KEY_SELECTION: KeySelectionState = { selected: new Map(), windows: new Map() };

/** 配列と物理配列のidから、選択を共有する対象のキーを作る。 */
export function keySelectionTargetOf(layoutId: string, geometryId: string): string {
  return JSON.stringify([layoutId, geometryId]);
}

/**
 * ペイン `pane` が見ている対象 `target` のキー `keyId` を押した時の遷移。
 * 選択済みのキーを、小窓が開いているペインでもう1度押すと選択を外す。選択済みでも小窓が開いていないペインで押すと、
 * 選択は変えずにそのペインの小窓を開く。
 */
export function pressKey(state: KeySelectionState, pane: string, target: string, keyId: string): KeySelectionState {
  if (state.selected.get(target) === keyId && state.windows.get(pane) === target) return clearSelection(state, target);
  return {
    selected: new Map(state.selected).set(target, keyId),
    windows: new Map(state.windows).set(pane, target),
  };
}

/** 対象の選択を外し、その対象を見ている小窓を全部閉じる。 */
export function clearSelection(state: KeySelectionState, target: string): KeySelectionState {
  if (!state.selected.has(target) && ![...state.windows.values()].includes(target)) return state;
  const selected = new Map(state.selected);
  selected.delete(target);
  return { selected, windows: new Map([...state.windows].filter(([, value]) => value !== target)) };
}

/** 選択は残したまま、`keepPane` 以外のペインの小窓を閉じる（ペインを拡大表示した時）。 */
export function closeWindowsExcept(state: KeySelectionState, keepPane: string): KeySelectionState {
  if ([...state.windows.keys()].every((pane) => pane === keepPane)) return state;
  return { selected: state.selected, windows: new Map([...state.windows].filter(([pane]) => pane === keepPane)) };
}

/** ペインが無くなった時に、そのペインの小窓の記録を消す。選択は残す。 */
export function dropPane(state: KeySelectionState, pane: string): KeySelectionState {
  if (!state.windows.has(pane)) return state;
  const windows = new Map(state.windows);
  windows.delete(pane);
  return { selected: state.selected, windows };
}

/** 対象の選んだキー。無ければ `undefined`。 */
export function selectedKeyOf(state: KeySelectionState, target: string): string | undefined {
  return state.selected.get(target);
}

/** ペインの小窓に出すキー。小窓が閉じている、または別の対象を見ていた記録なら `undefined`。 */
export function windowKeyOf(state: KeySelectionState, pane: string, target: string): string | undefined {
  return state.windows.get(pane) === target ? state.selected.get(target) : undefined;
}
