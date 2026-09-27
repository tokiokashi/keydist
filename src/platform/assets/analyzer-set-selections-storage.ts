/**
 * 集合対象Analyzerの単体ページが汎用で持つ「対象の集合」（`AnalyzerSetSelectionState`、
 * `#engine/analyzer-set-selection.ts`）の保存先キー（#544 Phase 3「N感度」）。
 *
 * `comparison-selection-storage.ts`と同じ形（codecは`engine`にあり`platform`から直接
 * importできないため、キーの定数だけをここに持つ）。
 *
 * 既存の資産キーと衝突しない名前にする（`test/asset-storage-keys.test.ts`が検査する）。
 */
export const ANALYZER_SET_SELECTIONS_STORAGE_KEY = 'keydist:analyzer-set-selections';
