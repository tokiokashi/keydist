/**
 * 個別画面のSingleが共有する「今選んでいる対象」（`SingleTargetSelection`、
 * `#engine/single-target-selection.ts`）の保存先キー。
 * `multi-target-selection-storage.ts`と同じ形。Analyzerごとに持っていた旧キー
 * （`keydist:analyzer-target-selections`）とは別の名前にし、旧データは読まない（#663）。
 *
 * 既存の資産キーと衝突しない名前にする（`test/asset-storage-keys.test.ts`が検査する）。
 */
export const SINGLE_TARGET_SELECTION_STORAGE_KEY = 'keydist:single-target-selection';
