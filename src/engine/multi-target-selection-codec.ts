import { defineAssetCodec, isRecord, type AssetCodec } from '#input/codec/index.ts';
import { analysisTargetKey, decodeAnalysisTarget, type AnalysisTarget } from '#input/setup/index.ts';
import { assignColorSlots, type MultiTargetSelection } from './multi-target-selection.ts';

/**
 * `MultiTargetSelection`のcodec（#663）。payloadは`{ targets, colorSlots, baseline? }`。
 *
 * 版1はAnalyzerごとに持っていた旧資産（`keydist:analyzer-set-selections`）とは別のキーに
 * 置く新しい資産の版で、旧資産からの移行は持たない（互換は守らない。AGENTS.md）。
 *
 * 対象1件ずつのdecodeは`decodeAnalysisTarget`（`input/setup/target-codec.ts`）に委ねる。
 * 壊れた対象1件は診断付きで捨て、集合全体は捨てない（「壊れた要素だけ捨てて残りを読む」方針）。
 * 重複は先に出た方だけ残して1つに畳む（`multi-target-selection.ts`の`dedupe`と同じ規則。
 * 書き込み側は常に重複の無い形で書くが、手で書き換えたstorage等は重複を含みうるため）。
 * `baseline`は記録された基準で、`targets`に含まれなくてもそのまま残す（外している間も
 * 記録は保ち、付け直すと戻る。#678。効く基準は`effectiveMultiBaseline`）。
 *
 * `colorSlots`（色の番号）は`targets`と同じ位置の値を読む。無い・壊れている・重複した番号は
 * 診断を出さずに配り直す（`assignColorSlots`）。色は表示だけの値で、壊れていても利用者が
 * 取れるアクションが無いため（`input/codec/index.ts`先頭コメントの「診断を要らない場合」）。
 */
export const MULTI_TARGET_SELECTION_CODEC: AssetCodec<MultiTargetSelection> = defineAssetCodec({
  currentVersion: 1,
  decodePayload: (payload, diagnostics) => {
    if (!isRecord(payload)) return undefined;
    const path = 'payload';
    const rawTargets: readonly unknown[] = Array.isArray(payload.targets) ? payload.targets : [];
    if (payload.targets !== undefined && !Array.isArray(payload.targets)) {
      diagnostics.push({ path: `${path}.targets`, message: '配列形式でないため選択を捨てた' });
    }
    const seen = new Set<string>();
    const targets: AnalysisTarget[] = [];
    const rawSlots: readonly unknown[] = Array.isArray(payload.colorSlots) ? payload.colorSlots : [];
    const knownSlots = new Map<string, number>();
    rawTargets.forEach((item, index) => {
      const decoded = decodeAnalysisTarget(item, `${path}.targets[${index}]`, diagnostics);
      if (decoded === undefined) return;
      const key = analysisTargetKey(decoded);
      if (seen.has(key)) {
        diagnostics.push({ path: `${path}.targets[${index}]`, message: `重複した対象「${key}」を1つに畳んだ` });
        return;
      }
      seen.add(key);
      targets.push(decoded);
      const slot = rawSlots[index];
      if (typeof slot === 'number') knownSlots.set(key, slot);
    });

    let baseline: AnalysisTarget | undefined;
    if (payload.baseline !== undefined) {
      const decodedBaseline = decodeAnalysisTarget(payload.baseline, `${path}.baseline`, diagnostics);
      if (decodedBaseline !== undefined) {
        baseline = decodedBaseline;
      }
    }
    return { targets, baseline, colorSlots: assignColorSlots(targets, knownSlots) };
  },
  encodePayload: (value) => ({
    targets: value.targets.map((target) => ({ ...target })),
    colorSlots: [...value.colorSlots],
    ...(value.baseline === undefined ? {} : { baseline: { ...value.baseline } }),
  }),
});
