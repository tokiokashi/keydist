import { analysisTargetKey, sameAnalysisTarget, type AnalysisTarget } from '#input/setup/index.ts';

/**
 * 個別画面のMulti（集合を見るAnalyzer。比較表・N感度等）が共有する「対象の集合」
 * （`docs/architecture.md`「個別画面どうしで共有する対象」。#663）。Analyzerごとには持たず、
 * Multiの全Analyzerで1つを読み書きする。1つの集合を選んでいろいろな解析を見るため、
 * Analyzerを移るたびに選び直させない。
 *
 * 対象そのものはSetup idではなく`AnalysisTarget`（#578指摘1「対象を配列かSetupにする」）で
 * 持つ。集合の各枠が配列でもSetupでも同じ列にそのまま並べられる。
 *
 * `baseline`（比較表の「基準にする対象」）も集合の値としてここに含める（#663のオーナー決定）。
 * N感度は基準を使わないが、集合を共有するので、比較表で選んだ基準はN感度を経ても残る。
 * N感度で基準の対象を外した時だけ、不変条件（基準 ∈ 選択）により基準も外れる。
 */
export interface MultiTargetSelection {
  readonly targets: readonly AnalysisTarget[];
  readonly baseline: AnalysisTarget | undefined;
  /**
   * 各対象に配った色の番号（`targets`と同じ長さで、同じ位置の対象の番号。値は
   * 0以上`COLOR_SLOT_COUNT`未満の整数で、対象が`COLOR_SLOT_COUNT`件までなら互いに異なる。
   * それを超える時だけ重なる。新しく配る時は、使っている対象が最も少ない番号を選ぶ。
   * 12件を超えている間は、外した後に番号ごとの件数が偏ることがある）。
   * 色そのもの（番号→色）は表示側が`ui/theme`のパレットで引く。
   *
   * 色は対象ごとに固定せず、同じ画面に並べている集合の中で配る（#601）。見分けられる
   * カテゴリ色は10〜12色が上限で、組み込み配列の数より少ないため、対象ごとに固定すると
   * 必ずどこかで重なる。同じ画面に並ぶのは数個なので、集合の中で配れば重ならない。
   *
   * 番号は並べた順から毎回数え直さず、ここに持つ。並べた順から数えると、1つ外すと
   * 後ろの対象の色が全部ずれ、線を追えなくなるため。配り方は`withMultiTargets`。
   */
  readonly colorSlots: readonly number[];
}

export function initialMultiTargetSelection(): MultiTargetSelection {
  return { targets: [], baseline: undefined, colorSlots: [] };
}

function sameTargets(a: readonly AnalysisTarget[], b: readonly AnalysisTarget[]): boolean {
  return a.length === b.length && a.every((target, index) => sameAnalysisTarget(target, b[index]!));
}

/** 順序を保ったまま重複を1つに畳む。 */
function dedupe(targets: readonly AnalysisTarget[]): readonly AnalysisTarget[] {
  const seen = new Set<string>();
  const result: AnalysisTarget[] = [];
  for (const target of targets) {
    const key = analysisTargetKey(target);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(target);
  }
  return result;
}

/**
 * 色の番号の数。表示側のパレット（`ui/theme/target-colors.ts`の`TARGET_PALETTE_SIZE`）と
 * 同じ値でなければならない（engineはuiをimportできないので、ここに持って表示側のテストで
 * 一致を検査する）。
 */
export const COLOR_SLOT_COUNT = 12;

/**
 * 対象の列に色の番号を配る。`known`（対象のkey → 既に持っている番号）にある対象は
 * その番号をそのまま使い、無い対象には、範囲内で使っている対象が最も少ない番号（同数なら
 * 小さい方）を列の先頭から順に配る。外した対象の番号は空くので、次に加えた対象がそれを使う
 * （#601「1つ消しても他の色は動かさない。空いた色は次に追加したものが使う」）。
 *
 * 持ち越す番号は、1つの番号を使う対象が`ceil(対象数 / COLOR_SLOT_COUNT)`に達するまでに限る。
 * `COLOR_SLOT_COUNT`件を超えて並べた時にできた重なりを、減らした後まで残さないため
 * （13件から12件以下へ減らすと、重なっていた後の方を空いた番号へ配り直す）。範囲外・整数でない
 * 番号も持っていないものとして配り直す（codecが外部由来のデータを読む時のため）。
 */
export function assignColorSlots(
  targets: readonly AnalysisTarget[],
  known: ReadonlyMap<string, number>,
): readonly number[] {
  const counts = new Array<number>(COLOR_SLOT_COUNT).fill(0);
  const cap = Math.max(1, Math.ceil(targets.length / COLOR_SLOT_COUNT));
  const slots: (number | undefined)[] = targets.map((target) => {
    const slot = known.get(analysisTargetKey(target));
    if (slot === undefined || !Number.isInteger(slot) || slot < 0 || slot >= COLOR_SLOT_COUNT) return undefined;
    if (counts[slot]! >= cap) return undefined;
    counts[slot]! += 1;
    return slot;
  });
  return slots.map((slot) => {
    if (slot !== undefined) return slot;
    let least = 0;
    for (let i = 1; i < COLOR_SLOT_COUNT; i++) if (counts[i]! < counts[least]!) least = i;
    counts[least]! += 1;
    return least;
  });
}

function colorSlotsByKey(selection: MultiTargetSelection): Map<string, number> {
  return new Map(selection.targets.map((target, index) => [analysisTargetKey(target), selection.colorSlots[index]!] as const));
}

/**
 * 選択をまとめて書き換える（追加・削除のどちらもこの1本を通す。`targets`は加えた順で、
 * 表示の並びはホストが一覧の順に並べ直す）。色の番号もここで配る（`assignColorSlots`）。
 *
 * **不変条件（基準 ∈ 選択）をここで1箇所に持つ**（レビュー指摘: 基準に選んでいた対象が
 * 選択から外れたら、基準も同時に外す。以前の比較表専用実装は「資産側では外さず、
 * 表示側（`definition.tsx`）が『基準なし』として扱う」形にしていたが、資産の値そのものが
 * 不変条件を満たさない状態を許すと、資産を読む側が毎回「基準が選択に含まれているか」を
 * 確認し直す必要が生じる。書き込みの時点で不変条件を保証しておけば、読む側は`baseline`を
 * そのまま信用してよい）。
 */
export function withMultiTargets(
  current: MultiTargetSelection,
  targets: readonly AnalysisTarget[],
): MultiTargetSelection {
  const deduped = dedupe(targets);
  if (sameTargets(current.targets, deduped)) return current;
  const baseline = current.baseline !== undefined && deduped.some((t) => sameAnalysisTarget(t, current.baseline!))
    ? current.baseline
    : undefined;
  // 残った対象は色を持ち越す。並び替えでも色は対象に付いて動く（色は並べた位置ではなく、
  // 加えた順で配ったもの）。
  return { targets: deduped, baseline, colorSlots: assignColorSlots(deduped, colorSlotsByKey(current)) };
}

/**
 * 基準を差し替える。`undefined`は「基準なし」。不変条件（基準 ∈ 選択）を守るため、
 * 選択に含まれない対象を基準にしようとした場合は無視する（no-op。
 * `withMultiTargets`のコメント参照）。
 */
export function withMultiBaseline(
  current: MultiTargetSelection,
  baseline: AnalysisTarget | undefined,
): MultiTargetSelection {
  if (current.baseline === baseline) return current;
  if (current.baseline !== undefined && baseline !== undefined && sameAnalysisTarget(current.baseline, baseline)) {
    return current;
  }
  if (baseline !== undefined && !current.targets.some((t) => sameAnalysisTarget(t, baseline))) return current;
  return { ...current, baseline };
}
