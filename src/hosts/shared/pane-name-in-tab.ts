import { createContext, type ReactNode } from 'react';

/**
 * ペインの名前とⓘを、ホストがペインの外（Workspaceの題の行・見出しの先頭）に出しているか。
 * trueなら、`PaneFrame`は枠の中の名前の行を出さず（読み上げ用の見出しは視覚的に隠して残す）、
 * 見出しを「対象・連動・条件・解析設定・⋯」の1行にする。この面（個別画面・縦積みでない面）は
 * falseのままで、名前を枠の中に出す。
 */
export const PaneNameInTabContext = createContext(false);

/** 見出しの行の先頭にホストが置くもの（Workspaceの「見出し無し」の方式で、つかみ所と小さな名前）。 */
export const PaneHeaderLeadContext = createContext<ReactNode>(null);

/**
 * ⋯のメニューをペインの見出しの外へ出す先（Workspaceの「題の行」の方式で、題の行の右端）。
 * 要素があれば、`PaneFrame`はメニューをそこへ描く。
 */
export const PaneMenuSlotContext = createContext<HTMLElement | null>(null);
