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

/** 参照先の注記。Workspaceは読み込んでいるので、指している資産がこの端末に無いことを伝える。 */
function missingLine(name: string, kinds: readonly WorkspaceMissingKind[]): string {
  const nouns = kinds.map((kind) => MISSING_NOUNS[kind]).join('、');
  const tail = kinds.includes('text') ? '。既定のテキストで測ります' : '';
  return `「${name}」はこの端末にない${nouns}を使っています${tail}`;
}

/**
 * 結果の文を組む。`dropped`はファイルから読めなかった部分の文（`parseWorkspaceFile`）。
 */
export function workspaceImportResultText(
  entries: readonly WorkspaceImportEntry[],
  dropped: readonly string[],
): WorkspaceImportResultText {
  const added = entries.filter((entry) => entry.outcome.kind !== 'skipped-same').length;
  const head = added > 0
    ? `${added}件のWorkspaceを読み込みました`
    : '読み込んだWorkspaceはありません。同じ中身のものが既にあります';
  const lines: string[] = [];
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
  return { summary: [head, ...dropped].join('。'), lines };
}
