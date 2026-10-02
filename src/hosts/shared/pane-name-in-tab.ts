import { createContext, type ReactNode } from 'react';

/**
 * ペインの名前とⓘを、ホストが見出しの外（Workspaceのペインの見出しの先頭）に出しているか。
 * trueなら、`PaneFrame`は枠の中の名前の行を出さず（読み上げ用の見出しは視覚的に隠して残す）、
 * 見出しを「対象・連動・条件・解析設定・⋯」の1行にする。この面（個別画面・縦積みでない面）は
 * falseのままで、名前を枠の中に出す。
 */
export const PaneNameInTabContext = createContext(false);

/** 見出しの先頭にホストが置くもの（Workspaceのペインのつかみ所・名前・ⓘ）。 */
export const PaneHeaderLeadContext = createContext<ReactNode>(null);
