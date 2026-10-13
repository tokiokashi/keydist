import type { KeydistAssets } from '#engine/commands.ts';
import { generateEngineTrace, interpretEngineTrace } from '#engine/pipeline.ts';
import { resolveEngineInput } from '#engine/resolved-input.ts';
import { EMPTY_SETTINGS_OVERRIDES, setSettingsOverride, type SettingsCascadeOverrides } from '#engine/settings-items.ts';
import type { PersonalSpeedSelection } from '#editors/personal-speed/PersonalSpeedEditor.tsx';
import type { SentenceBuildResult } from '#interpretation/timing/sentence-measurement.ts';
import { paneCatalog } from '../standalone/catalog.ts';

type SentenceAssets = Pick<KeydistAssets, 'userLayouts' | 'userRomajiRules' | 'fingerAssignments' | 'setupLibrary'>;

const UNBUILDABLE_TEXT = 'この配列・物理配列・指の割り当ての組では、示す文を打つ打鍵の列を作れません。別の組を選んでください。';

/**
 * 全体の条件に、選んだ物理配列と指の割り当てを重ねた上書き。配列・物理配列・Setupなどのレベルの上書きは
 * 読まない（この画面で選んだ組を、そのまま使うため）。
 */
function selectionOverrides(assets: SentenceAssets, selection: PersonalSpeedSelection): SettingsCascadeOverrides | undefined {
  const { global } = assets.setupLibrary.overrides;
  let overrides: SettingsCascadeOverrides = global === undefined ? EMPTY_SETTINGS_OVERRIDES : { global };
  for (const [item, value] of [
    ['defaultShapeId', selection.shapeId],
    ['fingerAssignmentId', selection.fingerAssignmentId],
  ] as const) {
    const written = setSettingsOverride(overrides, { kind: 'global' }, item, value);
    if (!written.ok) return undefined;
    overrides = written.overrides;
  }
  return overrides;
}

/**
 * 示す文の打鍵の列と構造を作る関数を組み立てる。個人速度の画面（`editors`）はTrace生成と解釈を
 * 直接読めないので、appが再生と同じ経路（条件の解決 → Trace生成 → 構造解析）を包んで注入する。
 * 配列は画面で選んだもの、ローマ字規則・Chain・Arpeggioの数え方などは全体の条件を使う。
 */
export function personalSpeedSentenceBuilder(
  assets: SentenceAssets,
): (selection: PersonalSpeedSelection, text: string) => SentenceBuildResult {
  const catalog = paneCatalog(assets);
  const customFingerAssignments = new Map(assets.fingerAssignments.map((assignment) => [assignment.id, assignment] as const));
  return (selection, text) => {
    const overrides = selectionOverrides(assets, selection);
    if (overrides === undefined) return { ok: false, message: UNBUILDABLE_TEXT };
    try {
      const resolved = resolveEngineInput({
        target: { kind: 'layout', layoutId: selection.layoutId },
        setups: new Map(),
        catalog: catalog.setupCatalog,
        userLayouts: catalog.userLayouts,
        customRomajiRules: catalog.customRomajiRules,
        customFingerAssignments,
        overrides,
        text,
        language: 'ja',
      });
      if (!resolved.ok) return { ok: false, message: UNBUILDABLE_TEXT };
      const traceResult = generateEngineTrace(resolved.input);
      const { trace } = traceResult;
      if (trace.errors.length > 0 || trace.skipped > 0 || trace.strokes.length === 0) {
        return { ok: false, message: 'この配列では、示す文に打てない文字があります。別の配列を選んでください。' };
      }
      return { ok: true, analysis: interpretEngineTrace(traceResult, resolved.input).analysis };
    } catch {
      return { ok: false, message: UNBUILDABLE_TEXT };
    }
  };
}
