import { minBodyHeightRemOf } from '#analyzers/min-body-height.ts';
import type { BoardPolicy } from '#engine/workspace-board.ts';
import { findWorkspaceAnalyzer } from './analyzer-registry.ts';

/**
 * 板の高さの計算（`engine/workspace-board.ts`）に渡す、ペインを描く側の値。単位はrem。
 *
 * ペインの下限 = 見出しと余白（ここ） + 本体の下限（Analyzerが宣言。`analyzers/min-body-height.ts`）。
 * 余白の値は`workspace-dock.css`・`pane-frame.css`で実物を測って決めた（`e2e/workspace-board-height.spec.ts`が
 * 下限ちょうどのペインで本体が窓の高さを割らないことを確かめる）。見出しは狭いペインで2段になるので、
 * 2段の時の高さを取る（広いペインでは1段分だけ余る。余る方に倒す）。
 */
const PANE_CHROME_REM = 9.9;

/** タブの帯。タブを隠す表示（見比べ用）では要らない。 */
const TAB_BAR_REM = 2.6;

/** 板の外周の余白（上下の合計）と、縦に並ぶペインの間。`workspace-dock.css`の`--dv-spacing-padding`と`PANE_GAP`。 */
const BOARD_PADDING_REM = 1.5;
const PANE_GAP_REM = 0.5;

export function workspaceBoardPolicy(hideTabs: boolean): BoardPolicy {
  return {
    floorRemOfAnalyzer: (analyzerId) => (
      PANE_CHROME_REM + (hideTabs ? 0 : TAB_BAR_REM) + minBodyHeightRemOf(findWorkspaceAnalyzer(analyzerId) ?? {})
    ),
    paddingRem: BOARD_PADDING_REM,
    gapRem: PANE_GAP_REM,
  };
}
