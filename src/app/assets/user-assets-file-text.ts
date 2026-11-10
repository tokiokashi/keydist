import { TEXT_ASSET_NOUNS } from '#hosts/shared/asset-import-text.ts';
import type { UserAssetImportEntry, UserAssetKind, UserAssetsFileHoldings } from '#engine/user-assets-file.ts';

/** 書き出しのファイル名。日付を入れて、ダウンロード先で見分けられるようにする。 */
export function userAssetsFileName(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `keydist-自作の資産-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}.json`;
}

const KIND_LABELS: Readonly<Record<UserAssetKind, string>> = {
  layout: '配列',
  'romaji-rule': 'ローマ字規則',
  'finger-assignment': '指の割り当て',
  setup: 'Setup',
  ...TEXT_ASSET_NOUNS,
};

/** 書き出した件数の文。0件の種類は出さない。 */
export function exportedText(assets: UserAssetsFileHoldings): string {
  const parts = [
    ['layout', assets.userLayouts.length],
    ['romaji-rule', assets.userRomajiRules.length],
    ['finger-assignment', assets.fingerAssignments.length],
    ['setup', assets.setupLibrary.setups.length],
    ['text', assets.textLibrary.texts.length],
    ['builtin-text-reading', Object.keys(assets.textLibrary.builtinReadingCorrections ?? {}).length],
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
      if (entry.assetKind === 'setup') return `${label}「${entry.name}」は、手元の別の${label}と重なり中身が違うため、新しい${label}として足しました`;
      return outcome.overlap.with === 'builtin'
        ? `組み込みの${label}「${outcome.overlap.name}」と重なるため、${label}「${outcome.addedName}」として足しました`
        : `${label}「${entry.name}」は、手元の「${outcome.overlap.name}」と重なり中身が違うため、「${outcome.addedName}」として足しました`;
    case 'kept-own':
      return `${label}「${entry.name}」は、手元に別の直しがあるため、手元の直しを残しました`;
    case 'skipped-same':
      return outcome.existingName === entry.name
        ? `${label}「${entry.name}」は、手元と同じ中身なので足しませんでした`
        : `${label}「${entry.name}」は、手元の「${outcome.existingName}」と同じ中身なので足しませんでした`;
  }
}

/** 読み込みの結果の見出し。足した件数と、足さなかった件数（手元と同じ中身のもの、手元の直しを残したもの）。 */
export function importSummaryText(entries: readonly UserAssetImportEntry[]): string {
  const same = entries.filter((entry) => entry.outcome.kind === 'skipped-same').length;
  const kept = entries.filter((entry) => entry.outcome.kind === 'kept-own').length;
  const added = entries.length - same - kept;
  const notes = [
    ...(same > 0 ? [`${same}件は手元と同じ中身なので足しませんでした`] : []),
    ...(kept > 0 ? [`${kept}件は手元に別の直しがあるので足しませんでした`] : []),
  ];
  if (added === 0 && kept === 0) return `手元と同じ中身なので、足したものはありません（${same}件）`;
  if (added === 0) return `足したものはありません。${notes.join('。')}`;
  return notes.length === 0 ? `${added}件を足しました` : `${added}件を足しました。${notes.join('。')}`;
}
