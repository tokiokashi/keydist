import type { UserAssetImportEntry, UserAssetKind } from '#engine/user-assets-file.ts';
import type { WorkspaceImportEntry, WorkspaceMissingKind } from '#engine/workspace-import.ts';

/**
 * Workspaceの読み込みの結果の文（DOMを使わない計算）。画面は`summary`を見出しに、`lines`を一覧に出す。
 * 追加できなかった・足さなかったものも、理由を一覧に出す。
 */
export interface WorkspaceImportResultText {
  readonly summary: string;
  readonly lines: readonly string[];
}

const MISSING_NOUNS: Readonly<Record<WorkspaceMissingKind, string>> = {
  layout: '配列',
  setup: 'Setup',
  'finger-assignment': '指の割当',
  'romaji-rule': 'ローマ字規則',
  shape: '物理配列',
  text: '自作のテキスト',
};

const ASSET_NOUNS: Readonly<Record<UserAssetKind, string>> = {
  layout: '配列',
  'romaji-rule': 'ローマ字規則',
  'finger-assignment': '指の割当',
  setup: 'Setup',
};

/** 参照先の注記。Workspaceは読み込んでいるので、指している資産がこの端末に無いことを伝える。 */
function missingLine(name: string, kinds: readonly WorkspaceMissingKind[]): string {
  const nouns = kinds.map((kind) => MISSING_NOUNS[kind]).join('、');
  const tail = kinds.includes('text') ? '。既定のテキストで測ります' : '';
  return `「${name}」はこの端末にない${nouns}を使っています${tail}`;
}

/**
 * 結果の文を組む。`dropped`はファイルから読めなかった部分の文（`parseWorkspaceFile`）。
 * `assetEntries`はファイルに同梱された資産の突き合わせの結果。足した資産の件数を見出しに加え、
 * 重なって別の名前で足したものは一覧に理由を出す。同じ中身で足さなかった資産は、Workspaceがその手元の資産を指すだけなので出さない。
 */
export function workspaceImportResultText(
  entries: readonly WorkspaceImportEntry[],
  dropped: readonly string[],
  assetEntries: readonly UserAssetImportEntry[] = [],
): WorkspaceImportResultText {
  const added = entries.filter((entry) => entry.outcome.kind !== 'skipped-same').length;
  const addedAssets = assetEntries.filter((entry) => entry.outcome.kind !== 'skipped-same').length;
  const head = added > 0 ? `${added}件のWorkspaceを読み込みました` : '読み込んだWorkspaceはありません。同じ中身のものが既にあります';
  const assetHead = addedAssets > 0 ? [`同梱の資産${addedAssets}件を足しました`] : [];
  const lines: string[] = [];
  for (const entry of assetEntries) {
    if (entry.outcome.kind !== 'added-renamed') continue;
    lines.push(
      `${ASSET_NOUNS[entry.assetKind]}「${entry.name}」は、手元に重なる資産があり中身が違うため、「${entry.outcome.addedName}」として足しました`,
    );
  }
  for (const entry of entries) {
    const { outcome } = entry;
    if (outcome.kind === 'skipped-same') {
      lines.push(`「${entry.name}」は同じ中身のものが既にあるため、追加しませんでした`);
      continue;
    }
    const shownName = outcome.kind === 'added-renamed' ? outcome.addedName : entry.name;
    if (outcome.kind === 'added-renamed') {
      lines.push(`「${shownName}」は、同じWorkspaceで中身の違うものが既にあるため、別の名前で追加しました`);
    }
    if (entry.missing.length > 0) lines.push(missingLine(shownName, entry.missing));
  }
  return { summary: [head, ...assetHead, ...dropped].join('。'), lines };
}
