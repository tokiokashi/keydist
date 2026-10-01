import { createContext } from 'react';

/**
 * 小窓・ポップオーバーを出す先。通常は`document.body`（`undefined`）。モーダルの`<dialog>`の中に置いたペインは、
 * body直下へ出すと背後の扱い（inert・top layerの下）になって操作できないので、`<dialog>`の中へ出す。
 */
export const PortalRootContext = createContext<HTMLElement | undefined>(undefined);
