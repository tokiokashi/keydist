/**
 * 単一対象Analyzer全般（Bigram Flow等）が汎用で持つ「今選んでいる対象」
 * （`AnalyzerTargetSelectionState`、`#engine/analyzer-target-selection.ts`）の保存先キー。
 * `analyzer-set-selections-storage.ts`と同じ形（codecは`engine`にあり`platform`から
 * 直接importできないため、キーの定数だけをここに持つ）。
 *
 * 既存の資産キーと衝突しない名前にする（`test/asset-storage-keys.test.ts`が検査する）。
 */
export const ANALYZER_TARGET_SELECTIONS_STORAGE_KEY = 'keydist:analyzer-target-selections';
