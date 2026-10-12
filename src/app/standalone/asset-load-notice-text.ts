import type { KeydistAssets } from '#engine/commands.ts';
import { PERSONAL_SPEED_LABEL } from '#editors/personal-speed/label.ts';
import type { AssetLoadNotice } from './asset-syncs.ts';

/**
 * 知らせに出す資産の名前。`KeydistAssets`のキーが増えた時にここへ足し忘れると型検査で落ちる。
 * 利用者が見ている名前（用語集の語・画面の名前）に揃える。
 */
const ASSET_NOTICE_LABELS: { readonly [K in keyof KeydistAssets]: string } = {
  setupLibrary: 'Setup',
  fingerAssignments: '自作の指の割り当て',
  textLibrary: 'テキスト',
  standaloneTextSelection: 'テキストの選択',
  standaloneAnalyzerOptions: '解析設定',
  multiTargetSelection: '複数の対象の選択',
  singleTargetSelection: '対象の選択',
  workspaces: 'Workspace',
  presetLibrary: 'プリセット',
  userLayouts: '自作の配列',
  userRomajiRules: '自作のローマ字規則',
  personalSpeed: PERSONAL_SPEED_LABEL,
};

/**
 * 資産1つぶんの知らせの文。codecの診断の文は内部の語（項目のid・対象のid・検証ライブラリの文）を含むので、
 * 画面には流さず、資産の名前と何が起きたか、捨てた・直した件数だけを出す。
 */
export function assetNoticeText(notice: AssetLoadNotice): string {
  const label = ASSET_NOTICE_LABELS[notice.key];
  switch (notice.kind) {
    case 'repaired':
      return `${label}: 読めない部分が${notice.diagnostics.length}件あったため、読める部分だけで開きました。`;
    case 'reset':
      return `${label}: 保存データを読めなかったため、初期の状態で開きました。`;
    case 'newer-version':
      return `${label}: 新しい版のアプリで保存されたデータのため読めず、初期の状態で開きました。保存データはそのまま残していますが、編集すると上書きされます。`;
  }
}
