import type { KeydistAssets } from '#engine/commands.ts';
import { generateEngineTrace, interpretEngineTrace } from '#engine/pipeline.ts';
import { resolveEngineInput, type ResolvedInput } from '#engine/resolved-input.ts';
import { hasRomajiOnlyCombos } from '#input/layouts/types.ts';
import { romajiSpellingUnits } from '#input/romaji/spelling-variants.ts';
import { EMPTY_SETTINGS_OVERRIDES, setSettingsOverride, type SettingsCascadeOverrides } from '#engine/settings-items.ts';
import type { PersonalSpeedSelection } from '#editors/personal-speed/PersonalSpeedEditor.tsx';
import type { SentenceBuildResult, SentenceSpellingSource } from '#interpretation/timing/sentence-measurement.ts';
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

/** 打てる打鍵の列か。配列定義の不備・打てない文字・空の列は打てない。 */
function playableTrace(trace: { readonly errors: readonly string[]; readonly skipped: number; readonly strokes: readonly unknown[] }): boolean {
  return trace.errors.length === 0 && trace.skipped === 0 && trace.strokes.length > 0;
}

/**
 * ローマ字の配列で受け付ける綴りの候補と、打った綴りから打鍵の列を作る関数。
 * ローマ字規則は書き換えず、かなの区切りと綴りの列を、再生と同じ経路のTrace生成へ直接渡す。
 * ローマ字だけで成立するコンボを持つ配列と、表を使えない規則（2文字以上のかなをまとめる見出しを持つ規則）では作らない。
 */
function spellingSourceOf(input: ResolvedInput): SentenceSpellingSource | undefined {
  const table = input.layout.romajiTable;
  if (table === undefined || hasRomajiOnlyCombos(input.layout)) return undefined;
  const units = romajiSpellingUnits(input.text, table);
  if (units === undefined) return undefined;
  const chunksOf = (spellings: readonly string[]) => units.map((unit, index) => ({ kana: unit.kana, roman: spellings[index], fromTable: table.has(unit.kana) }));
  return {
    units,
    strokes(spellings) {
      try {
        const { trace } = generateEngineTrace(input, chunksOf(spellings));
        return playableTrace(trace) ? trace.strokes : undefined;
      } catch {
        return undefined;
      }
    },
    analyze(spellings) {
      try {
        const traceResult = generateEngineTrace(input, chunksOf(spellings));
        return playableTrace(traceResult.trace) ? interpretEngineTrace(traceResult, input).analysis : undefined;
      } catch {
        return undefined;
      }
    },
  };
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
        verbatimText: true,
      });
      if (!resolved.ok) return { ok: false, message: UNBUILDABLE_TEXT };
      const traceResult = generateEngineTrace(resolved.input);
      const { trace } = traceResult;
      if (!playableTrace(trace)) {
        return { ok: false, message: 'この配列では、示す文に打てない文字があります。別の配列を選んでください。' };
      }
      const spelling = spellingSourceOf(resolved.input);
      return {
        ok: true,
        analysis: interpretEngineTrace(traceResult, resolved.input).analysis,
        ...(spelling === undefined ? {} : { spelling }),
      };
    } catch {
      return { ok: false, message: UNBUILDABLE_TEXT };
    }
  };
}
