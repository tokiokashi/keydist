import { defineAssetCodec, isRecord, UNSAFE_OBJECT_KEYS, type AssetCodec } from '#input/codec/index.ts';
import type { AnalyzerSetSelectionState, SetSelectionState } from './analyzer-set-selection.ts';

/**
 * `AnalyzerSetSelectionState`のcodec（#544 §8-3）。`standalone-analyzer-options-codec.ts`と
 * 似た形（外側の形だけを検査し、Analyzer idごとの中身は単純な形なのでそのまま
 * decodeできる。個別Analyzerへ依存する深いdecodeが要らない分、あちらより単純）。
 *
 * **Analyzer idの集合は`payload.selections`へ1段ネストする。** `defineAssetCodec`の
 * envelopeは`{ version, ...payload }`という形で、`payload`のキーがそのままトップレベルへ
 * 展開される。Analyzer idを直接トップレベルへ展開すると、"version"という名前の
 * Analyzer idが万一存在した場合にcodec自身の`version`キーと衝突する（レビュー指摘の
 * codecの穴）。`selections`という1段を挟むことで、Analyzer idの名前空間とcodecの
 * 予約語（`version`）の名前空間を分離する。
 *
 * - `payload.selections`がobjectでなければ空へ戻す
 * - 各キー（Analyzer id）が`UNSAFE_OBJECT_KEYS`なら、その1件だけ診断付きで捨てる
 * - 各値の`setupIds`が配列でなければその1件だけ捨てる。配列の要素は文字列だけを残し、
 *   **重複は先に出た方だけ残して1つに畳む**（レビュー指摘の穴。`analyzer-set-selection.ts`の
 *   `dedupe`と同じ規則をcodec側でも適用する。書き込み側は常に重複の無い形で書くが、
 *   外部由来（共有リンク・旧バージョンのexport等）のデータは重複を含みうるため）
 * - `baselineSetupId`は文字列であり、かつ`setupIds`（重複除去後）に含まれる場合だけ残す
 *   （不変条件「基準 ∈ 選択」をdecode時点でも保証する。壊れていれば静かに「基準なし」へ）
 * - 未知のAnalyzer idは残す（`standalone-analyzer-options-codec.ts`と同じ判断。
 *   Analyzerが一時的に無効化・削除されても選択を静かに失わない）
 */
export const ANALYZER_SET_SELECTION_CODEC: AssetCodec<AnalyzerSetSelectionState> = defineAssetCodec({
  currentVersion: 1,
  decodePayload: (payload, diagnostics) => {
    if (!isRecord(payload)) return undefined;
    const rawSelections = payload.selections;
    if (rawSelections === undefined) return {};
    if (!isRecord(rawSelections)) {
      diagnostics.push({ path: 'payload.selections', message: 'object形式でないため選択を全て捨てた' });
      return {};
    }
    const result: Record<string, SetSelectionState> = {};
    for (const [analyzerId, raw] of Object.entries(rawSelections)) {
      const path = `payload.selections.${analyzerId}`;
      if (UNSAFE_OBJECT_KEYS.has(analyzerId)) {
        diagnostics.push({ path, message: `予約された名前「${analyzerId}」のため、この選択を丸ごと捨てた` });
        continue;
      }
      if (!isRecord(raw)) {
        diagnostics.push({ path, message: 'object形式でないため選択を捨てた' });
        continue;
      }
      if (!Array.isArray(raw.setupIds)) {
        diagnostics.push({ path: `${path}.setupIds`, message: '配列形式でないため選択を捨てた' });
        continue;
      }
      const seen = new Set<string>();
      const setupIds: string[] = [];
      for (const item of raw.setupIds) {
        if (typeof item !== 'string') {
          diagnostics.push({ path: `${path}.setupIds[]`, message: `文字列でない要素「${String(item)}」を捨てた` });
          continue;
        }
        if (seen.has(item)) {
          diagnostics.push({ path: `${path}.setupIds[]`, message: `重複したSetup id「${item}」を1つに畳んだ` });
          continue;
        }
        seen.add(item);
        setupIds.push(item);
      }
      const rawBaseline = raw.baselineSetupId;
      let baselineSetupId: string | undefined;
      if (rawBaseline === undefined) {
        baselineSetupId = undefined;
      } else if (typeof rawBaseline !== 'string') {
        diagnostics.push({ path: `${path}.baselineSetupId`, message: '文字列でないため基準なしへ戻した' });
      } else if (!setupIds.includes(rawBaseline)) {
        diagnostics.push({ path: `${path}.baselineSetupId`, message: '選択に含まれないSetupが基準になっていたため基準なしへ戻した' });
      } else {
        baselineSetupId = rawBaseline;
      }
      result[analyzerId] = { setupIds, baselineSetupId };
    }
    return result;
  },
  encodePayload: (value) => ({
    selections: Object.fromEntries(
      Object.entries(value).map(([analyzerId, selection]) => [
        analyzerId,
        {
          setupIds: [...selection.setupIds],
          ...(selection.baselineSetupId === undefined ? {} : { baselineSetupId: selection.baselineSetupId }),
        },
      ]),
    ),
  }),
});
