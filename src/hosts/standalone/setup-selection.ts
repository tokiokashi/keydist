import type { Setup } from '#input/setup/index.ts';

/**
 * 単体ページが対象Setupを1つ選ぶ（#544 §6「単体ページはAnalyzer 1つ×対象。対象はSetup 1つ」）。
 *
 * 手持ち（`SetupLibrary.setups`）が空の時に使う「簡単な初期値」（指示書）。組み込み配列の
 * 中から特定の1つを選ぶ根拠は無いが、QWERTYは英語直接入力・ローマ字入力のどちらでも使え、
 * `row-staggered`は物理形状の既定（`input/setup/initial.ts`の`INITIAL_SETUP_SHAPE_ID`と
 * 同じ）なので、最初に触れるSetupとして無難という判断でこの組を選んだ。
 */
export const DEFAULT_STANDALONE_SETUP_SPEC = { layoutId: 'qwerty', shapeId: 'row-staggered' } as const;

/**
 * 手持ちから対象Setupのidを1つ選ぶ。`preferredId`（前回選んでいたid）が手持ちに
 * まだ存在すればそれを優先し、無ければ先頭を選ぶ。手持ちが空なら`undefined`
 * （呼び出し側が`DEFAULT_STANDALONE_SETUP_SPEC`でSetupを新規作成してから選び直す）。
 */
export function selectInitialSetupId(
  setups: readonly Setup[],
  preferredId?: string,
): string | undefined {
  if (preferredId !== undefined && setups.some((setup) => setup.id === preferredId)) return preferredId;
  return setups[0]?.id;
}
