import { useEffect, useState } from 'react';

/**
 * 【試作】Workspaceのペインを1画面に収める案（#808）を、URLの`?fit=a|b|c`で切り替えるための入口。
 * 値は`<html data-fit>`に置き、CSSと本体の両方が読む。案が決まったらこのファイルごと消す。
 */
export type FitMode = 'a' | 'b' | 'c';

export function useFitMode(): FitMode | null {
  const [mode, setMode] = useState<FitMode | null>(null);
  useEffect(() => {
    const value = document.documentElement.dataset.fit;
    setMode(value === 'a' || value === 'b' || value === 'c' ? value : null);
  }, []);
  return mode;
}
