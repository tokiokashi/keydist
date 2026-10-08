import { defineAssetCodec, isRecord, UNSAFE_OBJECT_KEYS, type AssetCodec } from '#input/codec/index.ts';
import type { StandaloneAnalyzerOptionsState } from './standalone-analyzer-options.ts';

/**
 * `StandaloneAnalyzerOptionsState`のcodec。
 *
 * 中身（Analyzer id → その設定）の深いdecodeはここではしない。各Analyzerの
 * `definition.decodeOptions`（`analyzers/contract.ts`）は`analyzers/<name>/`にあり、
 * `engine`はAnalyzerの契約（unitの無い`analyzers/contract.ts`）だけしかimportできず
 * 個別のAnalyzerへは届かない（依存の規則、`test/architecture-layers.test.ts`）。
 * 深いdecode（診断付き）は読み出し側（`hosts/standalone`。既に対象Analyzerの
 * definitionをimportしている）が`definition.decodeOptions(raw, diagnostics)`を
 * 呼んで行う（中身の各Analyzerの設定は、そのAnalyzerのdecodeOptionsで
 * 診断付きに読む）。
 *
 * ここでやるのは資産の**外側の形**の検査だけ:
 * - 資産全体がobjectでなければ空へ戻す
 * - 各キー（Analyzer id）が`UNSAFE_OBJECT_KEYS`（`__proto__`等）なら、その1件だけ
 *   診断付きで捨てる（Analyzer idは共有リンク・旧バージョンのexport等、外部由来の
 *   任意文字列でありうる境界なので、ここでは`overrides.ts`と違って警戒する）
 * - 各値がobjectでなければ（Optionsは常にobject形の契約なので）、その1件だけ
 *   診断付きで捨てる
 *
 * **未知のAnalyzer id（今のアプリのレジストリに無いid）はここでは判定しない。**
 * このcodec自身がAnalyzerのレジストリを知らない（engineから個別Analyzerへは
 * 依存できないため）ので、「未知かどうか」を判断する材料が無い。値はそのまま残す
 * （未知のAnalyzer idの設定は捨てずに**残す**。Analyzerが一時的に無効化・削除された場合でも設定を静かに失わない方を
 * 優先した。コストは「二度と読まれない断片がstorageに残り続けるかもしれない」ことだけで、
 * 明示的な削除操作（将来のSetup/Analyzer管理UI等）を足せば掃除できる）。
 */
export const STANDALONE_ANALYZER_OPTIONS_CODEC: AssetCodec<StandaloneAnalyzerOptionsState> = defineAssetCodec({
  currentVersion: 1,
  decodePayload: (payload, diagnostics) => {
    if (!isRecord(payload)) return undefined;
    const result: Record<string, unknown> = {};
    for (const [analyzerId, raw] of Object.entries(payload)) {
      if (UNSAFE_OBJECT_KEYS.has(analyzerId)) {
        diagnostics.push({
          path: `payload.${analyzerId}`,
          message: `予約された名前「${analyzerId}」のため、この設定を丸ごと捨てました`,
        });
        continue;
      }
      if (!isRecord(raw)) {
        diagnostics.push({ path: `payload.${analyzerId}`, message: 'object形式でないため設定を捨てました' });
        continue;
      }
      // `analyzerId`はここまでで`UNSAFE_OBJECT_KEYS`を通過済み（予約名ではない）ので、
      // 素のbracket代入で安全（`[[Set]]`が`Object.prototype`の例外的setterを踏まない）。
      result[analyzerId] = raw;
    }
    return result;
  },
  encodePayload: (value) => ({ ...value }),
});
