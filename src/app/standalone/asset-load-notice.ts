import type { KeydistAssets } from '#engine/commands.ts';
import type { AssetLoadNotice } from './asset-syncs.ts';

/**
 * 資産を読んだ時に捨てた・直した・読めなかった値の知らせの記憶（`AssetLoadNotices`が画面に出す）。
 * 知らせるのは、そのタブで最初に読み込んだ時だけ。直した形はstorageへ書き戻すので、
 * 次に開いた時や別の画面を開いた時には同じ知らせは出ない。
 *
 * 新しい版が書いた値は書き戻さず残すので、読み込むたびに同じ知らせの材料が届く。
 * 閉じた後に画面を移るたび出し直さないよう、そのタブで知らせた資産を覚えておく。
 */
let current: readonly AssetLoadNotice[] = [];
const reportedNewerVersion = new Set<keyof KeydistAssets>();
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

export function subscribeAssetLoadNotices(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getAssetLoadNoticesSnapshot(): readonly AssetLoadNotice[] {
  return current;
}

/** 読み込みで出た知らせを足す。同じ資産の知らせが既に出ている時と、知らせ済みの新しい版の値は足さない。 */
export function reportAssetLoadNotices(notices: readonly AssetLoadNotice[]): void {
  const added = notices.filter((notice) => {
    if (current.some((existing) => existing.key === notice.key)) return false;
    if (notice.kind !== 'newer-version') return true;
    if (reportedNewerVersion.has(notice.key)) return false;
    reportedNewerVersion.add(notice.key);
    return true;
  });
  if (added.length === 0) return;
  current = [...current, ...added];
  emit();
}

export function dismissAssetLoadNotices(): void {
  current = [];
  emit();
}

let initialLoadClaimed = false;

/**
 * そのタブで最初の読み込みかどうか。最初の1回だけ`true`を返す。
 * 捨てた・直した値の知らせと書き戻しはその1回に限る。画面を移るたびに書き戻すと、
 * 開いたままの古いタブが、新しい版のアプリが書いた項目を未知の項目として消してしまう。
 */
export function claimInitialAssetLoad(): boolean {
  if (initialLoadClaimed) return false;
  initialLoadClaimed = true;
  return true;
}

/** テスト用。タブを開き直した状態に戻す。 */
export function resetAssetLoadNoticesForTest(): void {
  current = [];
  reportedNewerVersion.clear();
  initialLoadClaimed = false;
  emit();
}
