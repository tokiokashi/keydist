import { assignmentWithHomeKeys, buildGeometry, type FingerAssignment, type Geometry } from '#input/shapes/geometry.ts';
import { describeShapeFallback } from '#input/setup/index.ts';
import type { Layout } from '#input/layouts/types.ts';
import type { ExtractionAssets } from '#analyzers/contract.ts';
import { withoutRomajiOnlyCombos, withRomaji } from '#input/layouts/types.ts';
import { physicalKeysUsedByLayout } from '#input/layouts/physical-keys.ts';
import type { UserLayout } from '#input/layouts/user-layouts.ts';
import type { TextLanguage } from '#input/text/language.ts';
import type { ReadingConditions } from '#input/text/reading.ts';
import type { AnalysisTarget, Setup, SetupCatalog, SetupReferenceError } from '#input/setup/index.ts';
import { isBuiltin, ROMAJI_RULES, tableForRule, type UserRomajiRule } from '#input/romaji/rules.ts';
import type { TracePolicy } from '#trace/generate.ts';
import type { ChainInterpretation } from '#interpretation/structure/chain.ts';
import type { ArpeggioInterpretation } from '#interpretation/structure/arpeggio.ts';
import type { PlaybackCalibration } from '#interpretation/timing/calibration.ts';
import { defaultFingerAssignmentId, resolveFingerAssignment } from './finger-assignment.ts';
import { resolveSettings, type ResolvedSettingsCascade, type SettingsCascadeOverrides } from './settings-items.ts';
import { hasConvertibleKatakana, prepareEvaluationText } from '#input/text/evaluation-text.ts';
import { resolveTargetForText } from './target-resolution.ts';

/**
 * 解決済み入力。Setup + Setupの手持ち（上書き含む）+ テキスト + カタログから、
 * Trace生成・解釈に要るものを全部決めた値。中身だけを持ち、Setupのid・ラベル・色は持たない
 * （中身をキーにしたキャッシュのキーからそれらを自然に除外するため。`keys.ts`参照）。
 */
export interface ResolvedInput {
  /**
   * 打つ文章。前処理（漢字を読みに直す段と評価対象の記号の範囲。仕様 §4.6）を通した後の値。ローマ字展開はTrace生成時に行う。
   */
  readonly text: string;
  /** ローマ字入力なら、実効ローマ字規則で組み直した表を持つ最終形。持たなければ配列側のまま。 */
  readonly layout: Layout;
  readonly geometry: Geometry;
  readonly tracePolicy: TracePolicy;
  /** 解釈（Traceの読み方）。全体からWorkspaceまで置ける（配列・Setupのレベルには置かない）。 */
  readonly chainInterpretation: ChainInterpretation;
  readonly arpeggioInterpretation: ArpeggioInterpretation;
  /** 日本語のテキストで、かなと `、` `。` 以外の記号も評価に渡したか。`text` は既にこの値で前処理済み。 */
  readonly keepSymbols: boolean;
  /** `text` を作った読みの変換の条件。数値の出どころとして運ぶ（仕様 §12.3）。直す対象でないテキストはnull。 */
  readonly reading: ReadingConditions | null;
  /**
   * 抽出が読む資産の値。Traceと解釈のキーには入れず、抽出のキーにだけ、各Analyzerが決めた分を入れる
   * （`keys.ts`の`singleExtractionKeyOf`）。
   */
  readonly extractionAssets: ExtractionAssets;
  /** ローマ字入力でなければnull（かな直接・英字直接）。 */
  readonly romajiRuleId: string | null;
  /**
   * カスケードの実効値・出どころ・診断。
   * 表示専用で、キャッシュキーには使わない（`keys.ts`のコメント参照）。
   */
  readonly cascade: ResolvedSettingsCascade;
}

export type ResolvedInputError =
  | { readonly kind: 'reference'; readonly errors: readonly SetupReferenceError[] }
  | { readonly kind: 'incompatible-text'; readonly layout: Layout; readonly language: TextLanguage }
  /** `buildGeometry`が投げた例外を値へ変換したもの（例: 自作物理配列の行数と指割り当てが噛み合わない）。 */
  | { readonly kind: 'geometry'; readonly message: string }
  /**
   * 配列が打鍵に使うキーを、物理配列が全部は持たない（例: JISかな配列をJISのキーが無い物理配列で測る）。
   * 黙って差し替えず、計算をしない。
   */
  | { readonly kind: 'keys-missing'; readonly layout: Layout }
  /**
   * 対象そのものの実体が手持ちから消えている（`setup-missing`を一般化）。Setup対象ならそのidが`SetupLibrary.setups`に
   * 無い、配列対象ならそのidが`SetupCatalog.layouts`に無い、のどちらか。`reference`
   * （対象自体は見つかるが、参照先の配列・物理配列が無い）とは別のケース:
   * `resolveTargetForText`（`target-resolution.ts`）がこのモジュールを呼ぶ前に判定して返す。
   */
  | { readonly kind: 'target-missing'; readonly target: AnalysisTarget };

export type ResolvedInputResult = { readonly ok: true; readonly input: ResolvedInput } | { readonly ok: false; readonly error: ResolvedInputError };

export interface ResolveEngineInputOptions {
  readonly target: AnalysisTarget;
  /** Setup対象の解決に要る手持ち（`SetupLibrary.setups`をidで引けるようにしたもの）。 */
  readonly setups: ReadonlyMap<string, Setup>;
  readonly catalog: SetupCatalog;
  readonly userLayouts: ReadonlyMap<string, UserLayout>;
  readonly customRomajiRules?: readonly UserRomajiRule[] | undefined;
  /**
   * 自作の指割り当ての手持ち（`input/shapes/user-finger-assignments.ts`）。id →実体。
   * `customRomajiRules`と同じ理由（SetupCatalogのような固定カタログを持たず、
   * 呼び出し側がその時点の手持ちを都度渡す）で省略可能にし、既定は空。
   */
  readonly customFingerAssignments?: ReadonlyMap<string, FingerAssignment> | undefined;
  readonly overrides: SettingsCascadeOverrides;
  /**
   * 個人速度の画面の保存値（資産`personalSpeed`）。条件のカスケードの外にある値なので、ここで受ける。
   * 無ければ個人速度の保存値は無い。読むAnalyzerが適用する設定の時だけ、抽出のキーに入る。
   */
  readonly personalSpeed?: PlaybackCalibration | undefined;
  /**
   * 打つ文章。漢字を読みに直す段（仕様 §4.6の1段目）を通した後の値を渡す。直す対象でないテキストは原文のまま。
   * 辞書の読み込みを待つ段は計算部より前に置くので、計算部は読みに直した後のテキストを同期で受け取る。
   */
  readonly text: string;
  readonly language: TextLanguage;
  /**
   * `text` を作った読みの変換の条件。漢字を読みに直した、または辞書を読み込めず直さずに評価した時に渡す。
   * 読みに直す対象でない（漢字を含まない・英語の）テキストは渡さない。
   */
  readonly reading?: ReadingConditions | null | undefined;
  /**
   * 前処理を通さず、`text` をそのまま評価に渡す。画面に出した文を利用者がそのまま打つ場面（個人速度の示す文）が使う。
   */
  readonly verbatimText?: boolean;
}

/**
 * Layoutからromaji表を外す。組み込みのJA向け実体（`LAYOUT_BY_ID`が保持する方）は
 * 英字配列でもromajiTableが静的に焼き込まれていることがある（`#input/layouts/kind.ts`の
 * コメント参照: 「同じidの配列がLAYOUTSとLAYOUTS_JAの両方に存在し、LAYOUT_BY_IDは
 * 後勝ちでJA側の実体を保持する」）。打ち方がromajiでない場合にその静的な値をそのまま
 * 使うと、SetupCatalogがどちらの実体を持つかでTraceが変わってしまう。
 * romajiRuleIdの適用可否（=打ち方）だけを一次情報として扱い、Layoutの静的な状態には
 * 頼らない（settings-items.tsのromajiRuleIdコメントと同じ判断）。
 */
function withoutRomaji(layout: Layout): Layout {
  const { romajiTable: _romajiTable, ...rest } = layout;
  return rest;
}

/**
 * 配列（ローマ字のテーブルを含む）の見出しのうち、片仮名を含むものの最長のコードポイント数。
 * 片仮名を書き換えずに残す見出しの判定（仕様 §4.6の2段目）が、原文から切り出す長さの上限に使う。
 */
function maxKatakanaHeadingLength(layout: Layout): number {
  let max = 0;
  const headings = layout.romajiTable ? [...layout.canonicalInputs.keys(), ...layout.romajiTable.keys()] : layout.canonicalInputs.keys();
  for (const heading of headings) {
    if (hasConvertibleKatakana(heading)) max = Math.max(max, [...heading].length);
  }
  return max;
}

/**
 * Setup + カスケードの上書き + テキストから、Trace生成・解釈に要る値を全部決める。
 * 失敗は例外にせず値で返す。
 */
export function resolveEngineInput(options: ResolveEngineInputOptions): ResolvedInputResult {
  const textResolution = resolveTargetForText(options.target, options.setups, options.catalog, options.userLayouts, options.overrides, options.language);
  if (!textResolution.ok) {
    if (textResolution.kind === 'target-missing') {
      return { ok: false, error: { kind: 'target-missing', target: textResolution.target } };
    }
    return textResolution.kind === 'reference'
      ? { ok: false, error: { kind: 'reference', errors: textResolution.errors } }
      : {
          ok: false,
          error: { kind: 'incompatible-text', layout: textResolution.layout, language: textResolution.language },
        };
  }

  const cascade = resolveSettings(options.overrides, textResolution.context);

  const romajiItem = cascade.romajiRuleId;
  const romajiRuleId = romajiItem.applicable ? romajiItem.value : null;
  const baseLayout = withoutRomaji(textResolution.layout);
  // ローマ字を経ない打ち方では、romajiOnlyのコンボ（仕様 §4.3）を外した配列を渡す。
  // Trace生成も同じ規則で外すが、ResolvedInput.layoutは表示側も読むので、ここで揃えておく。
  const layout =
    romajiRuleId !== null
      ? withRomaji(baseLayout, tableForRule(romajiRuleId, options.customRomajiRules ? [...options.customRomajiRules] : undefined))
      : withoutRomajiOnlyCombos(baseLayout);

  // 未知のidが渡ってきた時のfallback先は「その物理配列の既定」（defaultFingerAssignmentId）に揃える。
  // 上書きが無い時の既定値（settings-items.tsのdefaultValue）と同じ規則にすることで、
  // 「壊れた上書きを消したら何が起きるか」が「最初から上書きが無かった状態」と一致する。
  const fallbackAssignment = resolveFingerAssignment(defaultFingerAssignmentId(textResolution.shape)).assignment;
  const { assignment, diagnostic: assignmentDiagnostic } = resolveFingerAssignment(
    cascade.fingerAssignmentId.value,
    options.customFingerAssignments,
    fallbackAssignment,
  );
  // カスケードの実効値・診断へ合流させる（resolve.tsの`invalid-fallback`と同じ形）。
  // customFingerAssignmentsはcontext非依存の別カタログなので、resolveCascade自体には
  // 組み込めない（validateはCascadeContextしか見られない）。ここで後から合成する。
  // どのレベルの値でも、ローマ字規則が解決できない時は、表は既定（訓令式）で打つ。値は変えず、診断だけを足す。
  const romajiDiagnostic =
    romajiRuleId !== null && !isBuiltin(romajiRuleId) && !(options.customRomajiRules ?? []).some((rule) => rule.id === romajiRuleId)
      ? {
          kind: 'invalid-fallback' as const,
          message: `選んでいたローマ字規則が見つからないため、既定の「${ROMAJI_RULES.kunrei.name}」で測りました`,
        }
      : undefined;
  // JISの物理配列が要る配列の既定の物理配列は、値を入力にして物理配列を導くので、`validate`は食い違いを見ない。
  // 値が手持ちに無い物理配列を指す時の診断は、手持ち（catalog）を持つここで、他の配列と同じ文で足す。
  const shapeValue = cascade.defaultShapeId.value;
  const shapeDiagnostic =
    textResolution.context.targetKind === 'layout' && layout.requiresJisShape === true && !options.catalog.shapes.has(shapeValue)
      ? {
          kind: 'invalid-fallback' as const,
          message: describeShapeFallback(textResolution.shape.name),
        }
      : undefined;
  const resolvedCascade =
    assignmentDiagnostic === undefined && romajiDiagnostic === undefined && shapeDiagnostic === undefined
      ? cascade
      : {
          ...cascade,
          ...(shapeDiagnostic === undefined
            ? {}
            : {
                defaultShapeId: {
                  ...cascade.defaultShapeId,
                  diagnostics: [...cascade.defaultShapeId.diagnostics, shapeDiagnostic],
                },
              }),
          ...(assignmentDiagnostic === undefined
            ? {}
            : {
                fingerAssignmentId: {
                  ...cascade.fingerAssignmentId,
                  value: assignment.id,
                  diagnostics: [...cascade.fingerAssignmentId.diagnostics, assignmentDiagnostic],
                },
              }),
          ...(romajiDiagnostic === undefined
            ? {}
            : {
                romajiRuleId: {
                  ...cascade.romajiRuleId,
                  diagnostics: [...cascade.romajiRuleId.diagnostics, romajiDiagnostic],
                },
              }),
        };

  let geometry: Geometry;
  try {
    geometry = buildGeometry(textResolution.shape, assignmentWithHomeKeys(assignment, layout.homeKeys));
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    return { ok: false, error: { kind: 'geometry', message } };
  }

  // 配列が使うキーを物理配列が持たなければ、打てない文字が出るので計算をしない。
  const geometryKeys = geometry.keys;
  for (const key of physicalKeysUsedByLayout(layout)) {
    if (!geometryKeys.has(key)) return { ok: false, error: { kind: 'keys-missing', layout } };
  }

  const tracePolicy: TracePolicy = {
    windowSize: cascade.windowSize.value,
    sfbHomeCost: cascade.sfbHomeCost.value,
    preferOppositeThumb: cascade.preferOppositeThumb.value,
    triggerRealizationPolicy: cascade.triggerRealizationPolicy.value,
    actionRealizationPolicy: cascade.actionRealizationPolicy.value,
  };

  return {
    ok: true,
    input: {
      text:
        options.verbatimText === true
          ? options.text
          : prepareEvaluationText(options.text, {
              language: options.language,
              keepSymbols: cascade.keepSymbols.value,
              layoutHasChar: (char) => layout.canonicalInputs.has(char),
              layoutHasHeading: (heading) => layout.canonicalInputs.has(heading) || (layout.romajiTable?.has(heading) ?? false),
              maxKatakanaHeadingLength: maxKatakanaHeadingLength(layout),
            }),
      layout,
      geometry,
      tracePolicy,
      chainInterpretation: cascade.chainInterpretation.value,
      arpeggioInterpretation: cascade.arpeggioInterpretation.value,
      keepSymbols: cascade.keepSymbols.value,
      reading: options.verbatimText === true ? null : (options.reading ?? null),
      extractionAssets: { personalSpeed: options.personalSpeed, textLanguage: options.language },
      romajiRuleId,
      cascade: resolvedCascade,
    },
  };
}
