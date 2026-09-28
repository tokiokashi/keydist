/**
 * 比較表単体ページの「対象の集合」（`ComparisonSelectionState`、
 * `#engine/comparison-selection.ts`）の保存先キー（#544 Phase 3）。
 *
 * codec自体（`COMPARISON_SELECTION_CODEC`）は`engine/comparison-selection-codec.ts`に
 * あり、`platform`から直接importできない（`platform`は`input`までしかimportできない。
 * `docs/architecture.md`の依存規則）ため、他の資産キーと同じ形でキーの定数だけを
 * ここに持つ（実際の読み書きの組み立ては`app`が担う。`app/standalone/asset-storage-specs.ts`
 * 参照）。
 *
 * 既存の資産キーと衝突しない名前にする（`test/asset-storage-keys.test.ts`が検査する）。
 */
export const COMPARISON_SELECTION_STORAGE_KEY = 'keydist:comparison-selection';
