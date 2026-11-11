import { TEXT_ASSET_NOUNS } from '#hosts/shared/asset-import-text.ts';
import { CONDITIONS_LABEL, isEmptyConditionLevels } from '#engine/user-assets-conditions.ts';
import {
  userAssetsExtrasOf,
  builtinTextReadingIds,
  userTextsBundleOf,
  type UserAssetImportEntry,
  type UserAssetKind,
  type UserAssetsFileHoldings,
} from '#engine/user-assets-file.ts';

/** 書き出しのファイル名。日付を入れて、ダウンロード先で見分けられるようにする。 */
export function userAssetsFileName(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `keydist-自作の資産-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}.json`;
}

const KIND_LABELS: Readonly<Record<UserAssetKind, string>> = {
  layout: '配列',
  'romaji-rule': 'ローマ字規則',
  'finger-assignment': '指の割り当て',
  'combo-set': 'コンボの組',
  setup: 'Setup',
  preset: 'プリセット',
  workspace: 'Workspace',
  'personal-speed': '個人速度',
  'analyzer-options': '解析設定',
  conditions: CONDITIONS_LABEL,
  ...TEXT_ASSET_NOUNS,
};

/** 読み込みの選択に出す種類の名前。 */
export function assetKindLabel(kind: UserAssetKind): string {
  return KIND_LABELS[kind];
}

/** 書き出した件数の文。0件の種類は出さない。個人速度と解析設定は件数を持たないので、あれば名前だけを並べる。 */
export function exportedText(assets: UserAssetsFileHoldings): string {
  const counts = [
    ['layout', assets.userLayouts.length],
    ['romaji-rule', assets.userRomajiRules.length],
    ['finger-assignment', assets.fingerAssignments.length],
    ['combo-set', assets.comboSets.length],
    ['setup', assets.setupLibrary.setups.length],
    ['text', assets.textLibrary.texts.length],
    ['builtin-text-reading', builtinTextReadingIds(userTextsBundleOf(assets.textLibrary)).length],
    ['preset', assets.presetLibrary.presets.length],
    ['workspace', assets.workspaces.length],
  ] as const;
  const listed = counts.filter(([, count]) => count > 0).map(([kind, count]) => `${KIND_LABELS[kind]}${count}件`);
  if (assets.personalSpeed.calibration !== undefined) listed.push(KIND_LABELS['personal-speed']);
  if (Object.keys(assets.standaloneAnalyzerOptions).length > 0) listed.push(KIND_LABELS['analyzer-options']);
  if (!isEmptyConditionLevels(userAssetsExtrasOf(assets).conditions)) listed.push(KIND_LABELS.conditions);
  return `${listed.join('、')}を書き出しました`;
}

/** 個人速度と解析設定は、名前そのものが種類の名前なので「個人速度「個人速度」」としない。 */
function subject(entry: UserAssetImportEntry): string {
  const label = KIND_LABELS[entry.assetKind];
  return entry.assetKind === 'personal-speed' || entry.assetKind === 'analyzer-options' || entry.assetKind === 'conditions'
    ? label
    : `${label}「${entry.name}」`;
}

/** 読み込みの結果の1行。足した・別名で足した・置き換えた・足さなかったを言い分ける。 */
export function importEntryText(entry: UserAssetImportEntry): string {
  const label = KIND_LABELS[entry.assetKind];
  const { outcome } = entry;
  switch (outcome.kind) {
    case 'added':
      return `${subject(entry)}を足しました`;
    case 'added-renamed':
      if (entry.assetKind === 'setup') return `${label}「${entry.name}」は、手元の別の${label}と重なり中身が違うため、新しい${label}として足しました`;
      return outcome.overlap.with === 'builtin'
        ? `組み込みの${label}「${outcome.overlap.name}」と重なるため、${label}「${outcome.addedName}」として足しました`
        : `${label}「${entry.name}」は、手元の「${outcome.overlap.name}」と重なり中身が違うため、「${outcome.addedName}」として足しました`;
    case 'overwritten':
      return `${subject(entry)}で、手元のものを置き換えました`;
    case 'kept-own':
      return entry.assetKind === 'builtin-text-reading'
        ? `${label}「${entry.name}」は、手元に別の直しがあるため、手元の直しを残しました`
        : `${subject(entry)}は、手元のものと中身が違いますが、読み込まずに手元のものを残しました`;
    case 'skipped-builtin':
      return `組み込みの${label}「${outcome.builtinName}」と重なるため、${label}「${entry.name}」は読み込みませんでした`;
    case 'skipped-same':
      return outcome.existingName === entry.name
        ? `${subject(entry)}は、手元と同じ中身なので足しませんでした`
        : `${subject(entry)}は、手元の「${outcome.existingName}」と同じ中身なので足しませんでした`;
  }
}

/** 読み込みの結果の見出し。足した件数と、置き換えた件数、足さなかった件数（手元と同じ中身のもの、手元のものを残したもの）。 */
export function importSummaryText(entries: readonly UserAssetImportEntry[]): string {
  const count = (...kinds: readonly UserAssetImportEntry['outcome']['kind'][]) => entries.filter((entry) => kinds.includes(entry.outcome.kind)).length;
  const added = count('added', 'added-renamed');
  const overwritten = count('overwritten');
  const same = count('skipped-same');
  const kept = count('kept-own', 'skipped-builtin');
  const done = [...(added > 0 ? [`${added}件を足しました`] : []), ...(overwritten > 0 ? [`${overwritten}件を置き換えました`] : [])];
  const notes = [...(same > 0 ? [`${same}件は手元と同じ中身なので足しませんでした`] : []), ...(kept > 0 ? [`${kept}件は手元のものを残しました`] : [])];
  if (done.length === 0) return kept === 0 ? `手元と同じ中身なので、足したものはありません（${same}件）` : `足したものはありません。${notes.join('。')}`;
  return [...done, ...notes].join('。');
}
