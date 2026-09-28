/**
 * 集合対象Analyzer全般（比較表・N感度等）が汎用で持つ「対象の集合」
 * （`AnalyzerSetSelectionState`、`#engine/analyzer-set-selection.ts`）の保存先キー。
 *
 * 他の資産キーと同じ形（codecは`engine`にあり`platform`から直接importできないため、
 * キーの定数だけをここに持つ）。
 *
 * 既存の資産キーと衝突しない名前にする（`test/asset-storage-keys.test.ts`が検査する）。
 */
export const ANALYZER_SET_SELECTIONS_STORAGE_KEY = 'keydist:analyzer-set-selections';
