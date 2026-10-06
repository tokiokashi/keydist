import { analysisTargetKey, sameAnalysisTarget, type AnalysisTarget } from '#input/setup/index.ts';

/**
 * 個別画面のMulti（集合を見るAnalyzer。比較表・N感度等）が共有する「対象の集合」
 * （`docs/architecture.md`「個別画面どうしで共有する対象」）。Analyzerごとには持たず、
 * Multiの全Analyzerで1つを読み書きする。1つの集合を選んでいろいろな解析を見るため、
 * Analyzerを移るたびに選び直させない。
 *
 * 対象そのものはSetup idではなく`AnalysisTarget`で
 * 持つ。集合の各枠が配列でもSetupでも同じ列にそのまま並べられる。
 *
 * `baseline`（比較表の「基準にする対象」）も集合の値としてここに含める。
 * N感度は基準を使わないが、集合を共有するので、比較表で選んだ基準はN感度を経ても残る。
 * `baseline`は「記録された基準」で、集合に含まれる時だけ効く（効く基準は`effectiveMultiBaseline`）。
 * 基準の対象を集合から外しても記録は消さず、効く基準が「なし」になるだけ。同じ対象を
 * 付け直せば基準が戻る（N感度で対象を出し入れしても、比較表の基準を失わないため）。
 * 不変条件は「効く基準 ∈ 選択」で、読む側は`baseline`を直接読まず`effectiveMultiBaseline`を通す。
 */
export interface TargetSet {
  readonly targets: readonly AnalysisTarget[];
  readonly baseline: AnalysisTarget | undefined;
}

/**
 * 個別画面のMultiが持つ集合。`TargetSet`に、その集合の中で配った色の番号を足したもの。
 * 個別画面はペインが1枚なので、ペインの集合＝画面の集合で、色の番号を集合に持たせる。
 * Workspaceは画面に複数のペインが並ぶので、色の番号は集合ではなくWorkspaceが持つ
 * （`workspace.ts`の`Workspace.colorSlots`）。
 */
export interface MultiTargetSelection extends TargetSet {
  /**
   * 各対象に配った色の番号（`targets`と同じ長さで、同じ位置の対象の番号。値は
   * 0以上`COLOR_SLOT_COUNT`未満の整数で、対象が`COLOR_SLOT_COUNT`件までなら互いに異なる。
   * それを超える時だけ重なる。新しく配る時は、使っている対象が最も少ない番号を選ぶ。
   * 12件を超えている間は、外した後に番号ごとの件数が偏ることがある）。
   * 色そのもの（番号→色）は表示側が`ui/theme`のパレットで引く。
   *
   * 色は対象ごとに固定せず、同じ画面に並べている集合の中で配る。見分けられる
   * カテゴリ色は10〜12色が上限で、組み込み配列の数より少ないため、対象ごとに固定すると
   * 必ずどこかで重なる。同じ画面に並ぶのは数個なので、集合の中で配れば重ならない。
   *
   * 番号は並べた順から毎回数え直さず、ここに持つ。並べた順から数えると、1つ外すと
   * 後ろの対象の色が全部ずれ、線を追えなくなるため。配り方は`withMultiTargets`。
   */
  readonly colorSlots: readonly number[];
}

export function initialTargetSet(): TargetSet {
  return { targets: [], baseline: undefined };
}

export function initialMultiTargetSelection(): MultiTargetSelection {
  return { targets: [], baseline: undefined, colorSlots: [] };
}

export function sameTargets(a: readonly AnalysisTarget[], b: readonly AnalysisTarget[]): boolean {
  return a.length === b.length && a.every((target, index) => sameAnalysisTarget(target, b[index]!));
}

/** 順序を保ったまま重複を1つに畳む。 */
export function dedupeTargets(targets: readonly AnalysisTarget[]): readonly AnalysisTarget[] {
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
 * 小さい方）を列の先頭から順に配る。外した対象の番号は空くので、次に加えた対象がそれを使う。
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
 * 対象のkey → 色の番号。色を引く側（表示）が、個別画面の集合でもWorkspaceでも同じ形で受け取るための形
 * （Workspaceが持つ`WorkspaceColorSlots`と同じ）。
 */
export type ColorSlotsByKey = Readonly<Record<string, number>>;

export function multiColorSlots(selection: MultiTargetSelection): ColorSlotsByKey {
  return Object.fromEntries(colorSlotsByKey(selection));
}

/**
 * 効く基準。記録された基準が集合に含まれる時だけその対象を返し、含まれなければ`undefined`
 * （基準なし）。表示側（比較表・対象の選択の「基準にする対象」）は必ずこれを読む。
 */
export function effectiveMultiBaseline(selection: TargetSet): AnalysisTarget | undefined {
  const { baseline } = selection;
  if (baseline === undefined) return undefined;
  return selection.targets.some((t) => sameAnalysisTarget(t, baseline)) ? baseline : undefined;
}

/**
 * 選択をまとめて書き換える（追加・削除のどちらもこの1本を通す。`targets`は加えた順で、
 * 表示の並びはホストが一覧の順に並べ直す）。色の番号もここで配る（`assignColorSlots`）。
 *
 * 基準の記録（`baseline`）は集合の変更で触らない。外した対象は効く基準から外れるだけで、
 * 付け直せば戻る（`effectiveMultiBaseline`）。
 */
export function withMultiTargets(
  current: MultiTargetSelection,
  targets: readonly AnalysisTarget[],
): MultiTargetSelection {
  const deduped = dedupeTargets(targets);
  if (sameTargets(current.targets, deduped)) return current;
  // 残った対象は色を持ち越す。並び替えでも色は対象に付いて動く（色は並べた位置ではなく、
  // 加えた順で配ったもの）。
  return { targets: deduped, baseline: current.baseline, colorSlots: assignColorSlots(deduped, colorSlotsByKey(current)) };
}

/**
 * 色を持たない集合（Workspaceの組・固定のペインが持つ集合）の対象を差し替える。
 * 基準の扱いは`withMultiTargets`と同じ（記録は触らない）。色はWorkspaceが配る。
 */
export function withTargetSetTargets(current: TargetSet, targets: readonly AnalysisTarget[]): TargetSet {
  const deduped = dedupeTargets(targets);
  if (sameTargets(current.targets, deduped)) return current;
  return { targets: deduped, baseline: current.baseline };
}

/**
 * 基準を差し替える（記録も上書きする）。`undefined`は「基準なし」で、記録も消す。
 * 選択に含まれない対象を基準にしようとした場合は無視する（no-op。選べるのは集合の中だけ）。
 */
export function withMultiBaseline<T extends TargetSet>(
  current: T,
  baseline: AnalysisTarget | undefined,
): T {
  if (current.baseline === baseline) return current;
  if (current.baseline !== undefined && baseline !== undefined && sameAnalysisTarget(current.baseline, baseline)) {
    return current;
  }
  if (baseline !== undefined && !current.targets.some((t) => sameAnalysisTarget(t, baseline))) return current;
  return { ...current, baseline };
}
