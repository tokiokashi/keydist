import type { Command } from '#input/commands/index.ts';
import { setCascadeOverrideCommand, type KeydistAssets } from '#engine/commands.ts';
import { resolveDefaultShapeId } from '#engine/settings-items.ts';
import { DefaultShapeIcon } from './chrome-faces.tsx';
import './context-bar.css';

/**
 * グローバルの「既定の物理配列」（`defaultShapeId`）を変える（配列を対象にした時の物理配列。
 * docs/architecture.md「用語」のカスケード）。
 *
 * 正の置き場は条件のペイン（docs/architecture.md「条件の編集とURL」）。条件のペインが
 * できるまでは、配列を対象にしたペインすべてに効くグローバルの値なので、ペインではなく
 * 文脈バーに暫定で置く（#639）。
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
      <DefaultShapeIcon />
      <span className="context-chip-key">既定の物理配列</span>
      <select
        aria-label="既定の物理配列"
        value={current}
        onChange={(event) => dispatch(setCascadeOverrideCommand({ kind: 'global' }, 'defaultShapeId', event.currentTarget.value))}
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
