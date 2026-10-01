import { createContext } from 'react';

/** 【試作 #827 案B】ペインの操作の置き先（Dockviewのタブの帯の右端）。undefinedなら枠の中に置く。 */
export const PaneHeaderSlotContext = createContext<HTMLElement | null | undefined>(undefined);
