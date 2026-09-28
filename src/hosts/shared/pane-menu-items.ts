import type { PaneMenuItem } from './PaneHeaderParts.tsx';

/**
 * ⋯の「解析設定を初期値に戻す」（docs/architecture.md「ペイン」）。戻す先はAnalyzerの既定値
 * （`defaultOptions`）で、個別画面でもWorkspaceでも同じ。URLで開いた時の値やWorkspaceに
 * 保存した値へは戻さない（保存した値へ戻す操作が要るかは #637）。
 * 「既定へ」と書かないのは、条件（カスケードの既定値）まで戻ると読まれないようにするため。
 */
export function resetOptionsMenuItem(reset: () => void): PaneMenuItem {
  return {
    id: 'reset-options',
    label: '解析設定を初期値に戻す',
    description: '対象と条件は変わらない',
    onSelect: reset,
  };
}
