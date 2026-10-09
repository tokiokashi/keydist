import { createContext, useCallback, useContext, useEffect, useId, useMemo, useState } from 'react';
import {
  clearSelection,
  closeWindowsExcept,
  dropPane,
  EMPTY_KEY_SELECTION,
  pressKey,
  selectedKeyOf,
  windowKeyOf,
  type KeySelectionState,
} from './key-selection.ts';

/**
 * 図のキーを選んだ状態の持ち主（`key-selection.ts` の状態遷移をReactの状態に結ぶ）。
 * Workspaceは画面に1つ置き、同じ対象を映すペインどうしで選択を連動させる。個別画面は置かず、
 * ペインが自分で1つ持つ。どちらも保存しない。
 */
export interface KeySelectionStore {
  readonly state: KeySelectionState;
  readonly press: (pane: string, target: string, keyId: string) => void;
  readonly clear: (target: string) => void;
  readonly closeWindowsExcept: (pane: string) => void;
  readonly dropPane: (pane: string) => void;
}

export function useKeySelectionStore(): KeySelectionStore {
  const [state, setState] = useState<KeySelectionState>(EMPTY_KEY_SELECTION);
  const actions = useMemo(() => ({
    press: (pane: string, target: string, keyId: string) => setState((current) => pressKey(current, pane, target, keyId)),
    clear: (target: string) => setState((current) => clearSelection(current, target)),
    closeWindowsExcept: (pane: string) => setState((current) => closeWindowsExcept(current, pane)),
    dropPane: (pane: string) => setState((current) => dropPane(current, pane)),
  }), []);
  return useMemo(() => ({ state, ...actions }), [state, actions]);
}

/** Workspaceが置く。無ければ（個別画面）、ペインが自分の持ち主を使う。 */
export const KeySelectionContext = createContext<KeySelectionStore | undefined>(undefined);

export interface PaneKeySelection {
  /** 対象で選んでいるキー。ペインの図が強調する */
  readonly selectedKeyId: string | undefined;
  /** このペインの小窓に出すキー。小窓が閉じていれば `undefined` */
  readonly windowKeyId: string | undefined;
  /** 小窓を寄せる基準（小窓を開いた時に押したキーの要素） */
  readonly anchor: Element | null;
  /** 図のキーを押した */
  readonly press: (keyId: string, anchor: Element) => void;
  /** 選択を外す（同じ対象の小窓も閉じる） */
  readonly clear: () => void;
}

/**
 * ペイン1枚から見たキーの選択。`paneKey` は小窓の持ち主を見分ける印（Workspaceはペインのid、省略は
 * このペイン自身）、`target` は選択を共有する対象（`keySelectionTargetOf`）で、解決できていない間は `undefined`。
 */
export function usePaneKeySelection(paneKey: string | undefined, target: string | undefined): PaneKeySelection {
  const local = useKeySelectionStore();
  const store = useContext(KeySelectionContext) ?? local;
  const ownKey = useId();
  const pane = paneKey ?? ownKey;
  const [anchor, setAnchor] = useState<Element | null>(null);

  const { dropPane: drop } = store;
  useEffect(() => () => drop(pane), [drop, pane]);

  const selectedKeyId = target === undefined ? undefined : selectedKeyOf(store.state, target);
  const windowKeyId = target === undefined ? undefined : windowKeyOf(store.state, pane, target);
  const { press: storePress, clear: storeClear } = store;
  const press = useCallback((keyId: string, element: Element) => {
    if (target === undefined) return;
    // 小窓の位置は開く時だけ決める。開いたまま別のキーを押しても、動かした位置を保つ
    if (windowKeyId === undefined) setAnchor(element);
    storePress(pane, target, keyId);
  }, [target, windowKeyId, storePress, pane]);
  const clear = useCallback(() => {
    if (target !== undefined) storeClear(target);
  }, [target, storeClear]);
  return { selectedKeyId, windowKeyId, anchor, press, clear };
}
