import { stableStringify } from './cache-key.ts';
import { MODEL_VERSION } from './model-version.ts';
import type { TraceRequestInput } from '#analyzers/contract.ts';
import type { AnalysisTarget } from '#input/setup/index.ts';
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
 *
 * 引数を`TraceRequestInput`（`TraceRequester`が差し替えられるフィールドの集合）に絞っている。
 * ここでキーに足すフィールドは`TraceRequestInput`にも足さないとコンパイルが通らないので、
 * 「キーには効くのに依頼側から差し替えられない」ずれが型で止まる。
 */
export function traceKeyOf(input: TraceRequestInput): string {
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

/**
 * 抽出のキー = 解釈のキー + Analyzer id + 抽出に効くoptions（#544 §7）。
 *
 * 「抽出に効くoptions」の判定は`AnalyzerDefinition.extractKeyOf(options)`（`analyzers/contract.ts`）
 * がすでに行っている。見た目だけの項目はそこで返り値から外れているので、ここでは
 * その返り値をそのままキーへ畳み込むだけでよい（同じ判断を2箇所で持たない）。
 *
 * modelVersionを明示的には混ぜない: `interpretationKey`の中の`traceKey`がすでに
 * `MODEL_VERSION`を含む（`traceKeyOf`参照）ので、モデルの版が上がれば`interpretationKey`
 * ごと変わり、この抽出キーも自然に別物になる。
 */
export function analyzerExtractionKeyOf(
  interpretationKey: string,
  definitionId: string,
  extractionRelevantOptions: unknown,
): string {
  return stableStringify({
    interpretationKey,
    definitionId,
    options: extractionRelevantOptions,
  });
}

/**
 * 集合対象の抽出キー = 各メンバーの解釈キー（または失敗の印）の**列** + Analyzer id +
 * 抽出に効くoptions（#544 §7「集合の抽出キー = 各メンバーの解釈キーの列 + Analyzer id +
 * 抽出に効く設定」）。
 *
 * ## 順序を含める判断（PR「決めきれなかった点」ではなく、ここで決めて理由を残す）
 *
 * 集合対象のAnalyzer（比較表）は行の並び順をそのまま画面に出す（#544 §6の集合はページ
 * 自身が持つ「集合・並び順・基準」の一部）。同じ集合でも並び順が変われば表の見た目
 * （行の順序・基準行からの相対位置）が変わるので、**表示に意味がある**。ここでは
 * 「意味があるなら順序込み」という指示書の基準に従い、`members`を渡された順のまま
 * キーに畳み込む（ソートしない）。結果として、同じSetup集合でも並び替えるとキャッシュは
 * 当たらず再計算になるが、対象は多くても数十件のSetup比較なので計算コストは小さい。
 *
 * 各メンバーは `{ target, memberKey }` の組で表す。`memberKey`は解決できたメンバーなら
 * そのメンバーの解釈キー、解決に失敗したメンバーなら失敗の種類（`kind`）を含む印
 * （`AnalyzerSetMemberFailure`の`kind`。`message`はUI文言でしかなく再計算の要否には
 * 関わらないため含めない）にする。`target`（`AnalysisTarget`）を含めるのは、同じ中身の
 * 対象が集合の複数枠に並ぶ場合（同一Setupを重ねて基準比較する等）でも枠ごとに区別するため
 * （`traceKeyOf`がSetupのidをキーから意図的に除くのとは逆に、ここでは「集合の中の
 * どの枠か」を区別する必要がある）。
 */
export function setAnalyzerExtractionKeyOf(
  members: readonly { readonly target: AnalysisTarget; readonly memberKey: unknown }[],
  definitionId: string,
  extractionRelevantOptions: unknown,
): string {
  return stableStringify({
    members,
    definitionId,
    options: extractionRelevantOptions,
  });
}
