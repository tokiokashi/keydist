import type { Command } from '#input/commands/index.ts';
import { setCascadeOverrideCommand, type KeydistAssets } from '#engine/commands.ts';
import { resolveDefaultShapeId } from '#engine/settings-items.ts';
import type { StandalonePaneCatalog } from './resolve-pane-input.ts';

/**
 * グローバルの「既定の形状」（`defaultShapeId`）を変える最小UI（#578指摘1
 * 「配列を対象にした時の物理形状はカスケードのグローバル項目」）。配列を対象にした
 * ペインすべてに効くグローバルカスケードの書き込みなので、単体ページに1つ置けば足りる
 * （コーディネーター指示: シェルへ正式に置く場所を移すのは次の作業単位。今は磨かない）。
 *
 * 選べる形状は`PHYSICAL_SHAPES`（組み込みの3種）を直接listするのではなく、呼び出し側
 * （`hosts/standalone`の各ページ）が持つ`StandalonePaneCatalog.setupCatalog.shapes`から
 * 引く（レビュー指摘6: カタログが自作形状を持つようになった時、このUIだけ組み込み限定に
 * 取り残されないように、既にある「カタログ」を正として使う）。
 */
export interface DefaultShapeControlProps {
  readonly overrides: KeydistAssets['setupLibrary']['overrides'];
  readonly dispatch: (command: Command<KeydistAssets>) => void;
  readonly catalog: StandalonePaneCatalog;
}

export function DefaultShapeControl({ overrides, dispatch, catalog }: DefaultShapeControlProps) {
  const current = resolveDefaultShapeId(overrides);
  const shapes = catalog.setupCatalog.shapes;
  const currentIsKnown = shapes.has(current);
  return (
    <label className="standalone-control">
      <span>既定の形状（配列を対象にした時）</span>
      <select
        aria-label="既定の形状"
        value={current}
        onChange={(event) => dispatch(setCascadeOverrideCommand({ kind: 'global' }, 'defaultShapeId', event.currentTarget.value))}
      >
        {/*
         * 選ばれているidがカタログに無い（削除された・値が壊れている）場合でも、選択の
         * 実際の状態をそのまま見せる（レビュー指摘5）。選び直させる操作は残しつつ、
         * このoptionだけは選べない（選んでも意味の無い値を作らせない）。
         */}
        {currentIsKnown ? null : <option value={current} disabled>（見つからない形状）</option>}
        {[...shapes.values()].map((shape) => (
          <option key={shape.id} value={shape.id}>{shape.name}</option>
        ))}
      </select>
    </label>
  );
}
