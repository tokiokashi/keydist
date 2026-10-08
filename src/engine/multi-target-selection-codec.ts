import { defineAssetCodec, isRecord, type AssetCodec, type CodecDiagnostic } from '#input/codec/index.ts';
import { analysisTargetKey, decodeAnalysisTarget, type AnalysisTarget } from '#input/setup/index.ts';
import { assignColorSlots, type MultiTargetSelection, type TargetSet } from './multi-target-selection.ts';

/**
 * `MultiTargetSelection`のcodec。payloadは`{ targets, colorSlots, baseline? }`。
 *
 * 版1はAnalyzerごとに持っていた旧資産（`keydist:analyzer-set-selections`）とは別のキーに
 * 置く新しい資産の版で、旧資産からの移行は持たない（互換は守らない。AGENTS.md）。
 *
 * 対象1件ずつのdecodeは`decodeAnalysisTarget`（`input/setup/target-codec.ts`）に委ねる。
 * 壊れた対象1件は診断付きで捨て、集合全体は捨てない（「壊れた要素だけ捨てて残りを読む」方針）。
 * 重複は先に出た方だけ残して1つに畳む（`multi-target-selection.ts`の`dedupeTargets`と同じ規則。
 * 書き込み側は常に重複の無い形で書くが、手で書き換えたstorage等は重複を含みうるため）。
 * `baseline`は記録された基準で、`targets`に含まれなくてもそのまま残す（外している間も
 * 記録は保ち、付け直すと戻る。効く基準は`effectiveMultiBaseline`）。
 *
 * Workspaceの組・固定のペインの集合は色の番号を持たないので、`decodeTargetSet` / `encodeTargetSet`（色を除いた形）を使う。
 *
 * `colorSlots`（色の番号）は`targets`と同じ位置の値を読む。無い・壊れている・重複した番号は
 * 診断を出さずに配り直す（`assignColorSlots`）。ただし`colorSlots`自体が配列でない時は
 * 全対象の色が変わるので診断を1件出す（`undefined`は書かれていないだけなので出さない）。色は表示だけの値で、壊れていても利用者が
 * 取れるアクションが無いため（`input/codec/index.ts`先頭コメントの「診断を要らない場合」）。
 */
interface DecodedSet {
  readonly set: TargetSet;
  /** payloadが持っていた`colorSlots`の、対象のkey → 番号（個別画面のMultiだけが読む）。 */
  readonly knownSlots: ReadonlyMap<string, number>;
}

function decodeSetParts(payload: unknown, path: string, diagnostics: CodecDiagnostic[], readSlots: boolean): DecodedSet | undefined {
  if (!isRecord(payload)) {
    diagnostics.push({ path, message: 'object形式でないため選択を捨てました' });
    return undefined;
  }
  const rawTargets: readonly unknown[] = Array.isArray(payload.targets) ? payload.targets : [];
  if (payload.targets !== undefined && !Array.isArray(payload.targets)) {
    diagnostics.push({ path: `${path}.targets`, message: '配列形式でないため選択を捨てました' });
  }
  const seen = new Set<string>();
  const targets: AnalysisTarget[] = [];
  const rawSlots: readonly unknown[] = readSlots && Array.isArray(payload.colorSlots) ? payload.colorSlots : [];
  // 値があるのに配列でないのは、番号の一覧ごと壊れている（要素1つの不備とは違い、全対象の色が振り直される）
  if (readSlots && payload.colorSlots !== undefined && !Array.isArray(payload.colorSlots)) {
    diagnostics.push({ path: `${path}.colorSlots`, message: '配列形式でないため色の番号を配り直しました' });
  }
  const knownSlots = new Map<string, number>();
  rawTargets.forEach((item, index) => {
    const decoded = decodeAnalysisTarget(item, `${path}.targets[${index}]`, diagnostics);
    if (decoded === undefined) return;
    const key = analysisTargetKey(decoded);
    if (seen.has(key)) {
      diagnostics.push({ path: `${path}.targets[${index}]`, message: `重複した対象「${key}」を1つに畳みました` });
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
  return { set: { targets, baseline }, knownSlots };
}

export function decodeMultiTargetSelection(
  payload: unknown,
  path: string,
  diagnostics: CodecDiagnostic[],
): MultiTargetSelection | undefined {
  const decoded = decodeSetParts(payload, path, diagnostics, true);
  if (decoded === undefined) return undefined;
  const { targets, baseline } = decoded.set;
  return { targets, baseline, colorSlots: assignColorSlots(targets, decoded.knownSlots) };
}

/** 色の番号を持たない集合（Workspaceの組・固定のペインの集合）を読む。色はWorkspaceが持つ。 */
export function decodeTargetSet(payload: unknown, path: string, diagnostics: CodecDiagnostic[]): TargetSet | undefined {
  return decodeSetParts(payload, path, diagnostics, false)?.set;
}

export function encodeMultiTargetSelection(value: MultiTargetSelection): Record<string, unknown> {
  return {
    targets: value.targets.map((target) => ({ ...target })),
    colorSlots: [...value.colorSlots],
    ...(value.baseline === undefined ? {} : { baseline: { ...value.baseline } }),
  };
}

export function encodeTargetSet(value: TargetSet): Record<string, unknown> {
  return {
    targets: value.targets.map((target) => ({ ...target })),
    ...(value.baseline === undefined ? {} : { baseline: { ...value.baseline } }),
  };
}

export const MULTI_TARGET_SELECTION_CODEC: AssetCodec<MultiTargetSelection> = defineAssetCodec({
  currentVersion: 1,
  decodePayload: (payload, diagnostics) => decodeMultiTargetSelection(payload, 'payload', diagnostics),
  encodePayload: encodeMultiTargetSelection,
});
