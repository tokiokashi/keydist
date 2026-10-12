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

/** 捨てた・直した内容を並べる件数の上限。残りは件数だけ出す。 */
const MAX_LISTED_DETAILS = 3;

export interface AssetNoticeText {
  readonly summary: string;
  /** 捨てた・直した内容。同じ文は1件にまとめ、上限を超えた分は最後に件数でまとめる。 */
  readonly details: readonly string[];
}

export function assetNoticeText(notice: AssetLoadNotice): AssetNoticeText {
  const label = ASSET_NOTICE_LABELS[notice.key];
  switch (notice.kind) {
    case 'repaired': {
      const messages = [...new Set(notice.diagnostics.map((diagnostic) => diagnostic.message))];
      const listed = messages.slice(0, MAX_LISTED_DETAILS);
      const rest = messages.length - listed.length;
      return {
        summary: `${label}の保存データに読めない部分があったため、読める部分だけで開きました。`,
        details: rest > 0 ? [...listed, `ほか${rest}件`] : listed,
      };
    }
    case 'reset':
      return { summary: `${label}の保存データを読めなかったため、初期の状態で開きました。`, details: [] };
    case 'newer-version':
      return {
        summary: `${label}の保存データは新しい版のアプリで保存されたため読めず、初期の状態で開きました。保存データはそのまま残していますが、${label}を編集すると上書きされます。`,
        details: [],
      };
  }
}
