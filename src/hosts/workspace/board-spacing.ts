/**
 * 板の外周の余白（上下の合計）と、縦に並ぶペインの間。単位はrem。
 * `workspace-dock.css`の`--dv-spacing-padding`（片側0.5rem）と`WorkspaceDock.tsx`の`PANE_GAP`（6px）の写し。
 * 値を変える時はその2つと一緒に直す。依存を持たないファイルにしてあるのは、e2eが同じ値を読むため
 * （e2eに値を直書きすると、ここを変えた時に取り残される）。
 */
export const BOARD_PADDING_REM = 1;
export const PANE_GAP_REM = 0.375;
