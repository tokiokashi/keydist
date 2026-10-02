import { minBodyHeightRemOf } from '#analyzers/min-body-height.ts';
import type { BoardPolicy } from '#engine/workspace-board.ts';
import { findWorkspaceAnalyzer, isBlankPane } from './analyzer-registry.ts';

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

/** 板の外周の余白（上下の合計）と、縦に並ぶペインの間。`workspace-dock.css`の`--dv-spacing-padding`と`PANE_GAP`。 */
const BOARD_PADDING_REM = 1.5;
const PANE_GAP_REM = 0.5;

/**
 * 余白のペインの下限。本体を持たないので、見出し（⋯の1行）とその周りの隙間だけ。2段になる見出しも持たないので、
 * タブを隠した表示でも1段分で足りる。余白のペインは空きを埋めるものなので、Analyzerの本体の窓（12rem）は取らない。
 */
function blankFloorRem(hideTabs: boolean): number {
  return PANE_CHROME_REM + (hideTabs ? 0 : TAB_BAR_REM);
}

export function workspaceBoardPolicy(hideTabs: boolean): BoardPolicy {
  return {
    floorRemOfAnalyzer: (analyzerId) => isBlankPane(analyzerId) ? blankFloorRem(hideTabs) : (
      (hideTabs ? PANE_CHROME_REM_TABS_HIDDEN : PANE_CHROME_REM + TAB_BAR_REM) + minBodyHeightRemOf(findWorkspaceAnalyzer(analyzerId) ?? {})
    ),
    paddingRem: BOARD_PADDING_REM,
    gapRem: PANE_GAP_REM,
  };
}
