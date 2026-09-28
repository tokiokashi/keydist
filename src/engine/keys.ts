import { stableStringify } from './cache-key.ts';
import { MODEL_VERSION } from './model-version.ts';
import type { ResolvedInput } from './resolved-input.ts';

/**
 * Traceを決める中身だけを持つキー（#544 §7）。
 *
 * 含めるもの: テキスト・Layout（romaji表を含む最終形）・Geometry（指割り当てを含む）・
 * TracePolicy。Setupのid・ラベル・色、カスケードの出どころ・診断は含めない
 * （`ResolvedInput.cascade`はキーの計算に使わない）。
 * modelVersionも含める。Trace生成のロジックが変われば別キーになり、旧キャッシュへは
 * 当たらなくなる。
 *
 * LayoutとGeometryをまるごと含めるのは、自作配列・自作形状・自作ローマ字規則の編集を
 * キーへ自動で反映するため。idだけをキーにすると、同じidのまま中身を編集した時に
 * 古いTraceを返してしまう。Layoutは`canonicalInputs`やUI専用の`legends`等も持つが、
 * 「Trace生成に使うフィールドだけを選ぶ」よりも「解決済みの入力をまるごとキーにする」方が、
 * 生成側が参照するフィールドを増やした時にキーの更新を忘れる事故を防げる
 * （代わりに、数値に影響しないフィールドの編集でも再計算が走ることがある。#544 §7が
 * 「大きくしなくてよい」と明言している規模のキャッシュなので、この向きを採る）。
 */
export function traceKeyOf(input: ResolvedInput): string {
  return stableStringify({
    modelVersion: MODEL_VERSION,
    text: input.text,
    layout: input.layout,
    geometry: input.geometry,
    tracePolicy: input.tracePolicy,
  });
}

/**
 * 解釈のキー = Traceのキー + 解釈の値（#544 §7）。
 * chain/arpeggio解釈は当面グローバルのみ（#544 §2）だが、将来レベルが広がっても
 * このキーの形は変わらない。
 *
 * 個人速度（`playbackRate*`）はまだこのキーに含めない。時間モデルをengineへ繋ぐのは
 * Phase 3（#544 §7「解釈: Traceのキー + 解釈の値（時間スケジュールは個人速度も）」）で、
 * 今のinterpretationは構造 + 共通指標だけを扱い時間モデルを持たないため対象外。
 * 足す時はこの関数の引数に個人速度を増やす。
 */
export function interpretationKeyOf(input: ResolvedInput, traceKey: string): string {
  return stableStringify({
    traceKey,
    chainInterpretation: input.chainInterpretation,
    arpeggioInterpretation: input.arpeggioInterpretation,
  });
}
