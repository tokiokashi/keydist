import { useId } from 'react';
import type { Command } from '#input/commands/index.ts';
import type { KeydistAssets } from '#engine/commands.ts';
import { resolveGlobalDefaultShapeId, resolveWorkspaceDefaultShapeId } from '#engine/settings-items.ts';
import { defaultShapeChipNotice, defaultShapeCommand, defaultShapeWorkspaceCommand } from './condition-edit.ts';
import './context-bar.css';

/**
 * 全体の「既定の物理配列」（`defaultShapeId`）を変える（配列を対象にした時の物理配列。
 * docs/architecture.md「用語」のカスケード）。
 *
 * 条件のモーダルの全体の行と同じ値を書く、文脈バーの恒久の近道（docs/architecture.md「文脈バー」）。
 * 物理配列は図を見比べる時に一番よく切り替える条件なので、モーダルを開く1手を省くために置く。
 * 書き込みは、モーダルが開く編集先と同じレベルへ書く近道。単体ページは `defaultShapeCommand`（モーダルと同じ
 * `setGlobalCommand`）で全体、Workspaceの文脈バー（`workspaceId`を渡す）は `defaultShapeWorkspaceCommand` で
 * そのWorkspaceのレベル（Workspaceのペインの条件のモーダルがWorkspaceのレベルで開くため）。
 * 配列のレベルの値（上書き）は読まず、書かない。配列だけ変えたい時はモーダルの
 * 「この配列だけ別に」。そのため、この画面に出ている配列（`layoutIds`）に配列のレベルの値があれば、
 * ここで変えてもその配列は変わらない。その理由をチップを操作している間（フォーカス中）だけ添える。
 *
 * 選べる物理配列は、呼び出し側が持つカタログから引く（自作の物理配列が増えた時に、
 * ここだけ組み込みに取り残されないように）。
 */
export interface DefaultShapeChipProps {
  /** カスケードの上書き。Workspaceの文脈バーは、Workspaceの条件を差し込んだもの（`withWorkspaceConditions`）。 */
  readonly overrides: KeydistAssets['setupLibrary']['overrides'];
  /** Workspaceの文脈バーなら、そのWorkspaceのid。渡すとチップはWorkspaceのレベルを読み書きする。 */
  readonly workspaceId?: string;
  readonly dispatch: (command: Command<KeydistAssets>) => void;
  readonly shapes: ReadonlyMap<string, { readonly id: string; readonly name: string }>;
  /** この画面に出ている配列。配列のレベルの値が勝つ配列の理由を出すのに使う。 */
  readonly layoutIds?: readonly string[];
  /** 理由に出す配列の名前（引けなければ「この配列」）。 */
  readonly layouts?: ReadonlyMap<string, { readonly name: string }>;
}

export function DefaultShapeChip({ overrides, workspaceId, dispatch, shapes, layoutIds = [], layouts }: DefaultShapeChipProps) {
  const current = workspaceId === undefined ? resolveGlobalDefaultShapeId(overrides) : resolveWorkspaceDefaultShapeId(overrides);
  const currentIsKnown = shapes.has(current);
  const notice = defaultShapeChipNotice(overrides, layoutIds, layouts);
  const noticeId = useId();
  return (
    <div className="context-chip-group">
      <label className="context-chip context-select-chip" title={workspaceId === undefined ? '既定の物理配列: 配列を対象にした時に使う物理配列' : '既定の物理配列: このWorkspaceで配列を対象にした時に使う物理配列'}>
        {/* バーが狭い時は名前を出さずこのアイコンだけにする。選択は透明にしたselectが受ける（タップで選択肢が開く）。 */}
        <svg className="context-chip-icon" viewBox="0 0 20 14" width="20" height="14" aria-hidden="true">
          {/* キーボード: 枠の中にキーの四角（1段目5個・2段目4個をずらして）と幅広のスペースバー。線でなく四角で描き、☰と読まれないようにする。 */}
          <rect x="0.7" y="0.7" width="18.6" height="12.6" rx="2" fill="none" stroke="currentColor" strokeWidth="1.2" />
          <g fill="currentColor">
            {[0, 1, 2, 3, 4].map((i) => <rect key={`a${i}`} x={2 + i * 3.4} y="3" width="2.2" height="2" rx="0.4" />)}
            {[0, 1, 2, 3].map((i) => <rect key={`b${i}`} x={3.7 + i * 3.4} y="6.2" width="2.2" height="2" rx="0.4" />)}
            <rect x="5.5" y="9.4" width="9" height="2" rx="0.4" />
          </g>
        </svg>
        <span className="context-chip-key">既定の物理配列</span>
        <select
          aria-label="既定の物理配列"
          aria-describedby={notice === undefined ? undefined : noticeId}
          value={current}
          onChange={(event) => dispatch(workspaceId === undefined
            ? defaultShapeCommand(event.currentTarget.value)
            : defaultShapeWorkspaceCommand(workspaceId, event.currentTarget.value, resolveGlobalDefaultShapeId(overrides)))}
        >
          {/* 選ばれているidがカタログに無い時も、実際の状態をそのまま見せる（選び直せるが、このoptionは選べない）。 */}
          {currentIsKnown ? null : <option value={current} disabled>（見つからない物理配列）</option>}
          {[...shapes.values()].map((shape) => (
            <option key={shape.id} value={shape.id}>{shape.name}</option>
          ))}
        </select>
      </label>
      {notice === undefined ? null : (
        <p id={noticeId} className="context-chip-note" data-default-shape-notice="true">{notice}</p>
      )}
    </div>
  );
}
