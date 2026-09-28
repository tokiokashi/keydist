import { defineAssetCodec, isRecord, UNSAFE_OBJECT_KEYS, type AssetCodec } from '#input/codec/index.ts';
import { analysisTargetKey, decodeAnalysisTarget, sameAnalysisTarget, type AnalysisTarget } from '#input/setup/index.ts';
import type { AnalyzerSetSelectionState, SetSelectionState } from './analyzer-set-selection.ts';

/**
 * `AnalyzerSetSelectionState`のcodec（#544 §8-3、#578指摘1「選択はSetup idではなく対象
 * （`AnalysisTarget`）を保存する」）。`standalone-analyzer-options-codec.ts`と似た形
 * （外側の形だけを検査し、Analyzer idごとの中身は単純な形なのでそのまま decodeできる）。
 *
 * **Analyzer idの集合は`payload.selections`へ1段ネストする。** `defineAssetCodec`の
 * envelopeは`{ version, ...payload }`という形で、`payload`のキーがそのままトップレベルへ
 * 展開される。Analyzer idを直接トップレベルへ展開すると、"version"という名前の
 * Analyzer idが万一存在した場合にcodec自身の`version`キーと衝突する。`selections`という
 * 1段を挟むことで、Analyzer idの名前空間とcodecの予約語（`version`）の名前空間を分離する。
 *
 * 対象1件ずつのdecodeは`decodeAnalysisTarget`（`input/setup/target-codec.ts`。valibotの
 * `v.variant('kind', […])`を`decodeDroppingInvalid`で包んだもの）に委ねる。壊れた対象1件は
 * 診断付きで捨て、集合全体は捨てない（既存の`sanitize…`と同じ「壊れた要素だけ捨てて
 * 残りを読む」方針）。重複は先に出た方だけ残して1つに畳む（`analyzer-set-selection.ts`の
 * `dedupe`と同じ規則をcodec側でも適用する。書き込み側は常に重複の無い形で書くが、
 * 外部由来（共有リンク・旧バージョンのexport等）のデータは重複を含みうるため）。
 * `baseline`は文字列ではなく対象そのものであり、かつ`targets`（重複除去後）に含まれる
 * 場合だけ残す（不変条件「基準 ∈ 選択」をdecode時点でも保証する。壊れていれば
 * 静かに「基準なし」へ）。
 *
 * - 未知のAnalyzer idは残す（`standalone-analyzer-options-codec.ts`と同じ判断。
 *   Analyzerが一時的に無効化・削除されても選択を静かに失わない）
 */
export const ANALYZER_SET_SELECTION_CODEC: AssetCodec<AnalyzerSetSelectionState> = defineAssetCodec({
  currentVersion: 2,
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
      if (!Array.isArray(raw.targets)) {
        diagnostics.push({ path: `${path}.targets`, message: '配列形式でないため選択を捨てた' });
        continue;
      }
      const seen = new Set<string>();
      const targets: AnalysisTarget[] = [];
      raw.targets.forEach((item, index) => {
        const decoded = decodeAnalysisTarget(item, `${path}.targets[${index}]`, diagnostics);
        if (decoded === undefined) return;
        const key = analysisTargetKey(decoded);
        if (seen.has(key)) {
          diagnostics.push({ path: `${path}.targets[${index}]`, message: `重複した対象「${key}」を1つに畳んだ` });
          return;
        }
        seen.add(key);
        targets.push(decoded);
      });

      const rawBaseline = raw.baseline;
      let baseline: AnalysisTarget | undefined;
      if (rawBaseline === undefined) {
        baseline = undefined;
      } else {
        const decodedBaseline = decodeAnalysisTarget(rawBaseline, `${path}.baseline`, diagnostics);
        if (decodedBaseline === undefined) {
          baseline = undefined;
        } else if (!targets.some((t) => sameAnalysisTarget(t, decodedBaseline))) {
          diagnostics.push({ path: `${path}.baseline`, message: '選択に含まれない対象が基準になっていたため基準なしへ戻した' });
        } else {
          baseline = decodedBaseline;
        }
      }
      result[analyzerId] = { targets, baseline };
    }
    return result;
  },
  encodePayload: (value) => ({
    selections: Object.fromEntries(
      Object.entries(value).map(([analyzerId, selection]) => [
        analyzerId,
        {
          targets: selection.targets.map((target) => ({ ...target })),
          ...(selection.baseline === undefined ? {} : { baseline: { ...selection.baseline } }),
        },
      ]),
    ),
  }),
});
