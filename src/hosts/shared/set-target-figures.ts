import type { ExtractionRequestState } from '#engine/engine-requests.ts';
import type { ResolvedInputResult } from '#engine/resolved-input.ts';
import { analysisTargetKey, type AnalysisTarget } from '#input/setup/index.ts';
import type { SetTargetFigure } from '#analyzers/pane-parts.tsx';
import { describeEngineRequestError } from './pane-status.ts';

/**
 * 単体の画面でSingleの対象の図の下に並べる対象。Multiの集合から、Singleの対象と同じものを除く。
 * Singleの対象の図は一番上に出ていて、並べる側に重ねて出さないため。順は集合の並びのまま。
 */
export function setTargetsBesideSingle(
  setTargets: readonly AnalysisTarget[],
  single: AnalysisTarget,
): readonly AnalysisTarget[] {
  const singleKey = analysisTargetKey(single);
  return setTargets.filter((target) => analysisTargetKey(target) !== singleKey);
}

/**
 * 対象1つの解決と抽出の状態から、本体へ渡す状態にする。
 * 解決に失敗した対象は抽出の状態に関わらず失敗（理由は解決の失敗）。計算できた時だけ図の材料を持つ。
 */
export function setTargetFigureState<Extracted>(
  resolution: ResolvedInputResult,
  extraction: ExtractionRequestState<Extracted> | undefined,
): SetTargetFigure<Extracted>['state'] {
  if (!resolution.ok) return { status: 'failed', message: describeEngineRequestError({ kind: 'resolution', error: resolution.error }) };
  if (extraction === undefined) return { status: 'computing' };
  switch (extraction.status) {
    case 'ready':
      return {
        status: 'ready',
        layout: resolution.input.layout,
        geometry: resolution.input.geometry,
        extracted: extraction.value.extracted,
      };
    case 'failed':
      return { status: 'failed', message: describeEngineRequestError(extraction.error) };
    // 直前の結果は別の条件の対象のものでありうるので、新しい条件の図には使わない
    case 'stale':
    case 'idle':
    case 'computing':
      return { status: 'computing' };
  }
}
