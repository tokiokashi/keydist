import type { UserAssetImportEntry, UserAssetKind, UserAssetsHoldings } from '#engine/user-assets-file.ts';

/** 書き出しのファイル名。日付を入れて、ダウンロード先で見分けられるようにする。 */
export function userAssetsFileName(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `keydist-自作の資産-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}.json`;
}

const KIND_LABELS: Readonly<Record<UserAssetKind, string>> = {
  layout: '配列',
  'romaji-rule': 'ローマ字規則',
  'finger-assignment': '指の割り当て',
};

/** 書き出した件数の文。0件の種類は出さない。 */
export function exportedText(assets: UserAssetsHoldings): string {
  const parts = [
    ['layout', assets.userLayouts.length],
    ['romaji-rule', assets.userRomajiRules.length],
    ['finger-assignment', assets.fingerAssignments.length],
  ] as const;
  const listed = parts.filter(([, count]) => count > 0).map(([kind, count]) => `${KIND_LABELS[kind]}${count}件`);
  return `${listed.join('、')}を書き出しました`;
}

/** 読み込みの結果の1行。足した・別名で足した・足さなかったを言い分ける。 */
export function importEntryText(entry: UserAssetImportEntry): string {
  const label = KIND_LABELS[entry.assetKind];
  const { outcome } = entry;
  switch (outcome.kind) {
    case 'added':
      return `${label}「${entry.name}」を足しました`;
    case 'added-renamed':
      return outcome.overlap.with === 'builtin'
        ? `組み込みの${label}「${outcome.overlap.name}」と重なるため、${label}「${outcome.addedName}」として足しました`
        : `${label}「${entry.name}」は、手元の「${outcome.overlap.name}」と重なり中身が違うため、「${outcome.addedName}」として足しました`;
    case 'skipped-same':
      return outcome.existingName === entry.name
        ? `${label}「${entry.name}」は、手元と同じ中身なので足しませんでした`
        : `${label}「${entry.name}」は、手元の「${outcome.existingName}」と同じ中身なので足しませんでした`;
  }
}

/** 読み込みの結果の見出し。足した件数と足さなかった件数。 */
export function importSummaryText(entries: readonly UserAssetImportEntry[]): string {
  const skipped = entries.filter((entry) => entry.outcome.kind === 'skipped-same').length;
  const added = entries.length - skipped;
  if (added === 0) return `手元と同じ中身なので、足したものはありません（${skipped}件）`;
  return skipped === 0 ? `${added}件を足しました` : `${added}件を足しました。${skipped}件は手元と同じ中身なので足しませんでした`;
}
