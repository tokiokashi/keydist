import { LAYOUT_BY_ID } from '#input/layouts/index.ts';
import { buildUserCatalog } from '#input/layouts/user-catalog.ts';
import { PHYSICAL_SHAPES, type PhysicalShape } from '#input/shapes/geometry.ts';
import type { KeydistAssets } from '#engine/commands.ts';
import type { PaneCatalog } from '#hosts/shared/resolve-pane-input.ts';

const BUILTIN_SHAPES: ReadonlyMap<string, PhysicalShape> = new Map(
  Object.values(PHYSICAL_SHAPES).map((shape) => [shape.id, shape] as const),
);

/**
 * ペイン（個別画面・Workspace）が`resolveEngineInput`へ渡すカタログの組み立て。
 *
 * 配列とローマ字規則は、組み込みに資産の自作を足す。自作の指の割り当ては、渡された時だけ解決と条件の選択肢に使う。物理配列は組み込みだけ
 * （自作の物理配列は扱わない）。個人速度の保存値も持つ（再生の時間を決める抽出の入力になる）。
 * 手持ちが変わった時だけ作り直せるよう、呼び出し側は読む資産を依存にして`useMemo`で包む。
 */
export function paneCatalog(
  assets: Pick<KeydistAssets, 'userLayouts' | 'userRomajiRules'> & Partial<Pick<KeydistAssets, 'personalSpeed' | 'fingerAssignments'>>,
): PaneCatalog {
  const user = buildUserCatalog(assets.userLayouts, assets.userRomajiRules);
  return {
    setupCatalog: {
      layouts: new Map([...LAYOUT_BY_ID, ...user.layouts]),
      shapes: BUILTIN_SHAPES,
      romajiRules: new Map(user.romajiRules.map((rule) => [rule.id, rule] as const)),
    },
    userLayouts: user.userLayouts,
    customRomajiRules: user.romajiRules,
    ...(assets.fingerAssignments === undefined
      ? {}
      : { customFingerAssignments: new Map(assets.fingerAssignments.map((assignment) => [assignment.id, assignment] as const)) }),
    ...(assets.personalSpeed?.calibration === undefined ? {} : { personalSpeed: assets.personalSpeed.calibration }),
  };
}
