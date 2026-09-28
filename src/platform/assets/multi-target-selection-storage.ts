/**
 * 個別画面のMultiが共有する「対象の集合」（`MultiTargetSelection`、
 * `#engine/multi-target-selection.ts`）の保存先キー。
 *
 * 他の資産キーと同じ形（codecは`engine`にあり`platform`から直接importできないため、
 * キーの定数だけをここに持つ）。Analyzerごとに持っていた旧キー（`keydist:analyzer-set-selections`）
 * とは別の名前にし、旧データは読まない（#663。互換は守らない）。
 *
 * 既存の資産キーと衝突しない名前にする（`test/asset-storage-keys.test.ts`が検査する）。
 */
export const MULTI_TARGET_SELECTION_STORAGE_KEY = 'keydist:multi-target-selection';
