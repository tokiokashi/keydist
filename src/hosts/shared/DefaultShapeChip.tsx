import type { Command } from '#input/commands/index.ts';
import type { KeydistAssets } from '#engine/commands.ts';
import { resolveDefaultShapeId } from '#engine/settings-items.ts';
import { defaultShapeCommand } from './condition-edit.ts';
import './context-bar.css';

/**
 * グローバルの「既定の物理配列」（`defaultShapeId`）を変える（配列を対象にした時の物理配列。
 * docs/architecture.md「用語」のカスケード）。
 *
 * 条件のモーダルの全体の行と同じ値を書く、文脈バーの恒久の近道（docs/architecture.md「文脈バー」）。
 * 物理配列は図を見比べる時に一番よく切り替える条件なので、モーダルを開く1手を省くために置く。
 * 書き込みは `defaultShapeCommand`（モーダルと同じ `setGlobalCommand`）で、2か所で値は食い違わない。
 *
 * 選べる物理配列は、呼び出し側が持つカタログから引く（自作の物理配列が増えた時に、
 * ここだけ組み込みに取り残されないように）。
 */
export interface DefaultShapeChipProps {
  readonly overrides: KeydistAssets['setupLibrary']['overrides'];
  readonly dispatch: (command: Command<KeydistAssets>) => void;
  readonly shapes: ReadonlyMap<string, { readonly id: string; readonly name: string }>;
}

export function DefaultShapeChip({ overrides, dispatch, shapes }: DefaultShapeChipProps) {
  const current = resolveDefaultShapeId(overrides);
  const currentIsKnown = shapes.has(current);
  return (
    <label className="context-chip context-select-chip" title="既定の物理配列: 配列を対象にした時に使う物理配列">
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
        value={current}
        onChange={(event) => dispatch(defaultShapeCommand(event.currentTarget.value))}
      >
        {/* 選ばれているidがカタログに無い時も、実際の状態をそのまま見せる（選び直せるが、このoptionは選べない）。 */}
        {currentIsKnown ? null : <option value={current} disabled>（見つからない物理配列）</option>}
        {[...shapes.values()].map((shape) => (
          <option key={shape.id} value={shape.id}>{shape.name}</option>
        ))}
      </select>
    </label>
  );
}
