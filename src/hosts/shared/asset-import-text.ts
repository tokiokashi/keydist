import type { UserAssetImportEntry, UserAssetKind } from '#engine/user-assets-file.ts';
import { CONDITIONS_LABEL } from '#engine/user-assets-conditions.ts';

/**
 * 書き出しファイルに同梱された資産の読み込み結果の文（DOMを使わない計算）。Workspaceとプリセットのどちらのファイルにも同梱される。
 */

/** テキストに関する種類の呼び名。「データ・設定の管理」の画面の文も同じ語を使う。 */
export const TEXT_ASSET_NOUNS = { text: 'テキスト', 'builtin-text-reading': '組み込みテキストの読みの直し' } as const;

const ASSET_NOUNS: Readonly<Record<UserAssetKind, string>> = {
  layout: '配列',
  'romaji-rule': 'ローマ字規則',
  'finger-assignment': '指の割当',
  setup: 'Setup',
  preset: 'プリセット',
  workspace: 'Workspace',
  'personal-speed': '個人速度',
  'analyzer-options': '解析設定',
  conditions: CONDITIONS_LABEL,
  ...TEXT_ASSET_NOUNS,
};

/** 足した資産の件数の文。足した資産が無ければ空。同じ中身で足さなかった資産は、参照が手元の資産を指すだけなので数えない。 */
export function addedAssetsText(entries: readonly UserAssetImportEntry[]): readonly string[] {
  const added = entries.filter((entry) => entry.outcome.kind === 'added' || entry.outcome.kind === 'added-renamed').length;
  return added > 0 ? [`同梱の資産${added}件を足しました`] : [];
}

/** 手元の資産と重なり、別の名前で足した資産の理由。 */
export function renamedAssetLines(entries: readonly UserAssetImportEntry[]): readonly string[] {
  return entries.flatMap((entry) =>
    entry.outcome.kind === 'added-renamed'
      ? [`${ASSET_NOUNS[entry.assetKind]}「${entry.name}」は、手元に重なる資産があり中身が違うため、「${entry.outcome.addedName}」として足しました`]
      : [],
  );
}

/** 同梱の資産の項目のうち、読めずに捨てた数の文。 */
export function droppedAssetsText(count: number): readonly string[] {
  return count > 0 ? [`${count}件の同梱の資産の項目は読み込めませんでした`] : [];
}
