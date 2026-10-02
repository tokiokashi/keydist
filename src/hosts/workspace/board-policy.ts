import { minBodyHeightRemOf } from '#analyzers/min-body-height.ts';
import type { BoardPolicy } from '#engine/workspace-board.ts';
import { findWorkspaceAnalyzer } from './analyzer-registry.ts';
import { BOARD_PADDING_REM, PANE_GAP_REM } from './board-spacing.ts';

/**
 * 板の高さの計算（`engine/workspace-board.ts`）に渡す、ペインを描く側の値。単位はrem。
 *
 * ペインの下限 = 見出しと余白（ここ） + 本体の下限（Analyzerが宣言。`analyzers/min-body-height.ts`）。
 * 余白の値は`workspace-dock.css`・`pane-frame.css`で実物を測って決めた（`e2e/workspace-board-height.spec.ts`が
 * 下限ちょうどのペインで本体が窓の高さを割らないことを確かめる）。
 *
 * タブが名前を持つ時、ペインの見出しは幅によらず1行（#827）なので、値は1つで済む。
 * 内訳（px）: 上の余白8 + 見出しの1行32 + 見出しと本体の間8 + 下の余白16 + 枠線2 = 66 = 4.125rem。切り上げて4.2。
 * タブを隠した表示（見比べ用）は名前が枠の中に残り、狭いペインで2段になるので、従来どおり2段の高さを取る
 * （広いペインでは1段分だけ余る。余る方に倒す）。
 */
const PANE_CHROME_REM = 4.2;
const PANE_CHROME_REM_TABS_HIDDEN = 9.9;

/** タブの帯。タブを隠す表示（見比べ用）では要らない。 */
const TAB_BAR_REM = 2.6;

export function workspaceBoardPolicy(hideTabs: boolean): BoardPolicy {
  return {
    floorRemOfAnalyzer: (analyzerId) => (
      (hideTabs ? PANE_CHROME_REM_TABS_HIDDEN : PANE_CHROME_REM + TAB_BAR_REM) + minBodyHeightRemOf(findWorkspaceAnalyzer(analyzerId) ?? {})
    ),
    paddingRem: BOARD_PADDING_REM,
    gapRem: PANE_GAP_REM,
  };
}
