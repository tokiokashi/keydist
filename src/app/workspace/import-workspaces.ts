import {
  PRESET_FILE_IMPORT_FAILED_MESSAGE,
  PRESET_FILE_MAX_BYTES,
  PRESET_FILE_TOO_LARGE_MESSAGE,
  PRESET_FILE_UNREADABLE_MESSAGE,
  parseWorkspaceFile,
} from '#hosts/shared/preset-file.ts';
import { workspaceImportResultText } from '#hosts/shared/workspace-import-result.ts';
import { importWorkspacesCommand } from '#engine/workspace-import.ts';
import { PRESET_FILE_IO } from '../shell/preset-file-io.ts';
import { getAssetStore } from '../standalone/asset-store.ts';
import { generateWorkspaceId } from './id-generator.ts';
import { setImportedWorkspaces } from './imported-workspaces-notice.ts';

/** 新しいidの元にする値。同じ読み込みの中では変わらず、別の読み込みとは重ならない。 */
function newStamp(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * 書き出しファイルのWorkspaceと、同梱された自作の資産を手元へ足し、結果を知らせる（サイドバーの「ファイルから読み込む」）。
 * どの画面の履歴にも積まない書き込みで、足したWorkspaceは削除から元に戻せる。
 *
 * 足したWorkspaceのうち最初のもののidを返す（呼び出し側がそのWorkspaceを開く）。何も足さなかった・読めなかった時は`undefined`。
 */
export async function importWorkspaceFile(file: Blob): Promise<string | undefined> {
  const read = await PRESET_FILE_IO.readText(file, PRESET_FILE_MAX_BYTES);
  if (read.kind !== 'ok') {
    setImportedWorkspaces({
      summary: read.kind === 'too-large' ? PRESET_FILE_TOO_LARGE_MESSAGE : PRESET_FILE_UNREADABLE_MESSAGE,
      lines: [],
      details: [],
    });
    return undefined;
  }
  const parsed = parseWorkspaceFile(read.text);
  if (!parsed.ok) {
    setImportedWorkspaces({ summary: parsed.message, lines: [], details: parsed.details });
    return undefined;
  }
  const plan = importWorkspacesCommand(parsed.workspaces, parsed.userAssets, generateWorkspaceId, newStamp());
  const outcome = getAssetStore().dispatch(undefined, plan.command);
  // 内訳は書き込みを決めた突き合わせそのものから取る。ファイルを読む間に別のタブが資産を書き換えても食い違わない
  const entries = plan.entries();
  if (entries === undefined || outcome.kind === 'rejected') {
    setImportedWorkspaces({ summary: PRESET_FILE_IMPORT_FAILED_MESSAGE, lines: [], details: [] });
    return undefined;
  }
  const result = workspaceImportResultText(entries, parsed.dropped, plan.assetEntries());
  setImportedWorkspaces({ summary: result.summary, lines: result.lines, details: parsed.details });
  for (const { outcome: added } of entries) {
    if (added.kind !== 'skipped-same') return added.addedId;
  }
  return undefined;
}
