import type { Command } from '#input/commands/index.ts';
import { setCascadeOverrideCommand, type KeydistAssets } from '#engine/commands.ts';
import { resolveDefaultShapeId } from '#engine/settings-items.ts';
import { PHYSICAL_SHAPES } from '#input/shapes/geometry.ts';

/**
 * グローバルの「既定の形状」（`defaultShapeId`）を変える最小UI（#578指摘1
 * 「配列を対象にした時の物理形状はカスケードのグローバル項目」）。配列を対象にした
 * ペインすべてに効くグローバルカスケードの書き込みなので、単体ページに1つ置けば足りる
 * （コーディネーター指示: シェルへ正式に置く場所を移すのは次の作業単位。今は磨かない）。
 */
export interface DefaultShapeControlProps {
  readonly overrides: KeydistAssets['setupLibrary']['overrides'];
  readonly dispatch: (command: Command<KeydistAssets>) => void;
}

export function DefaultShapeControl({ overrides, dispatch }: DefaultShapeControlProps) {
  const current = resolveDefaultShapeId(overrides);
  return (
    <label className="standalone-control">
      <span>既定の形状（配列を対象にした時）</span>
      <select
        aria-label="既定の形状"
        value={current}
        onChange={(event) => dispatch(setCascadeOverrideCommand({ kind: 'global' }, 'defaultShapeId', event.currentTarget.value))}
      >
        {Object.values(PHYSICAL_SHAPES).map((shape) => (
          <option key={shape.id} value={shape.id}>{shape.name}</option>
        ))}
      </select>
    </label>
  );
}
