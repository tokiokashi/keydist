/**
 * 単体ページの「Analyzerごとの最後に使った解析設定」（`StandaloneAnalyzerOptionsState`、
 * `#engine/standalone-analyzer-options.ts`）の保存先キー（#544指示書「解析設定は資産として
 * 個人で保持する」）。
 *
 * codec自体（`STANDALONE_ANALYZER_OPTIONS_CODEC`）は`engine/standalone-analyzer-options-codec.ts`
 * にあり、`platform`から直接importできない（`platform`は`input`までしかimportできない。
 * `docs/architecture.md`の依存規則）ため、`setup-library-storage.ts`と同じ形で
 * キーの定数だけをここに持つ（実際の読み書きの組み立ては`app`が担う。
 * `app/standalone/asset-storage-specs.ts`参照）。
 *
 * 既存の資産キー（geometry-shapes / romaji-rules / layouts / setup-library /
 * finger-assignments / standalone-text）と衝突しない名前にする
 * （`test/asset-storage-keys.test.ts`が検査する）。
 */
export const STANDALONE_ANALYZER_OPTIONS_STORAGE_KEY = 'keydist:standalone-analyzer-options';
