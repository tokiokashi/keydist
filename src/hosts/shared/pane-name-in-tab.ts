import { createContext } from 'react';

/**
 * ペインの名前とⓘを、ホストがペインの外（Workspaceのタブ）に出しているか。
 * trueなら、`PaneFrame`は枠の中の名前の行を出さず（読み上げ用の見出しは視覚的に隠して残す）、
 * 見出しを「対象・連動・条件・解析設定・⋯」の1行にする。タブの無い面（個別画面・縦積み・タブを隠した表示）は
 * falseのままで、名前を枠の中に出す。
 */
export const PaneNameInTabContext = createContext(false);
