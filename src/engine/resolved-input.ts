import {
  assignmentWithHomeKeys,
  buildGeometry,
  type Geometry,
} from '#input/shapes/geometry.ts';
import type { Layout } from '#input/layouts/types.ts';
import { withRomaji } from '#input/layouts/types.ts';
import type { UserLayout } from '#input/layouts/user-layouts.ts';
import type { TextLanguage } from '#input/text/language.ts';
import {
  resolveSetupForText,
  type Setup,
  type SetupCatalog,
  type SetupReferenceError,
} from '#input/setup/index.ts';
import { tableForRule, type UserRomajiRule } from '#input/romaji/rules.ts';
import type { TracePolicy } from '#trace/generate.ts';
import type { ChainInterpretation } from '#interpretation/structure/chain.ts';
import type { ArpeggioInterpretation } from '#interpretation/structure/arpeggio.ts';
import { resolveFingerAssignment } from './finger-assignment.ts';
import {
  resolveSettings,
  type ResolvedSettingsCascade,
  type SettingsCascadeOverrides,
} from './settings-items.ts';

/**
 * 解決済み入力（#544 §1・§7）。Setup + Setupの手持ち（上書き含む）+ テキスト + カタログから、
 * Trace生成・解釈に要るものを全部決めた値。中身だけを持ち、Setupのid・ラベル・色は持たない
 * （中身をキーにしたキャッシュのキーからそれらを自然に除外するため。`keys.ts`参照）。
 */
export interface ResolvedInput {
  /** 打つ文章。原文のまま（ローマ字展開はTrace生成時に行う）。 */
  readonly text: string;
  /** ローマ字入力なら、実効ローマ字規則で組み直した表を持つ最終形。持たなければ配列側のまま。 */
  readonly layout: Layout;
  readonly geometry: Geometry;
  readonly tracePolicy: TracePolicy;
  /** 解釈（Traceの読み方）。当面グローバルのみ（#544 §2）。 */
  readonly chainInterpretation: ChainInterpretation;
  readonly arpeggioInterpretation: ArpeggioInterpretation;
  /** ローマ字入力でなければnull（かな直接・英字直接）。 */
  readonly romajiRuleId: string | null;
  /**
   * カスケードの実効値・出どころ・診断（#544 §3「実効値の出どころを表示する」）。
   * 表示専用で、キャッシュキーには使わない（`keys.ts`のコメント参照）。
   */
  readonly cascade: ResolvedSettingsCascade;
}

export type ResolvedInputError =
  | { readonly kind: 'reference'; readonly errors: readonly SetupReferenceError[] }
  | { readonly kind: 'incompatible-text'; readonly layout: Layout; readonly language: TextLanguage }
  /** `buildGeometry`が投げた例外を値へ変換したもの（例: 自作形状の行数と指割り当てが噛み合わない）。 */
  | { readonly kind: 'geometry'; readonly message: string };

export type ResolvedInputResult =
  | { readonly ok: true; readonly input: ResolvedInput }
  | { readonly ok: false; readonly error: ResolvedInputError };

export interface ResolveEngineInputOptions {
  readonly setup: Setup;
  readonly catalog: SetupCatalog;
  readonly userLayouts: ReadonlyMap<string, UserLayout>;
  readonly customRomajiRules?: readonly UserRomajiRule[];
  readonly overrides: SettingsCascadeOverrides;
  readonly text: string;
  readonly language: TextLanguage;
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
 * Setup + カスケードの上書き + テキストから、Trace生成・解釈に要る値を全部決める。
 * 失敗は例外にせず値で返す（#544 §8-5）。
 */
export function resolveEngineInput(options: ResolveEngineInputOptions): ResolvedInputResult {
  const textResolution = resolveSetupForText(
    options.setup,
    options.catalog,
    options.userLayouts,
    options.language,
  );
  if (!textResolution.ok) {
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
  const layout = romajiRuleId !== null
    ? withRomaji(baseLayout, tableForRule(romajiRuleId, options.customRomajiRules ? [...options.customRomajiRules] : undefined))
    : baseLayout;

  const assignment = resolveFingerAssignment(cascade.fingerAssignmentId.value);
  let geometry: Geometry;
  try {
    geometry = buildGeometry(textResolution.shape, assignmentWithHomeKeys(assignment, layout.homeKeys));
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    return { ok: false, error: { kind: 'geometry', message } };
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
      text: options.text,
      layout,
      geometry,
      tracePolicy,
      chainInterpretation: cascade.chainInterpretation.value,
      arpeggioInterpretation: cascade.arpeggioInterpretation.value,
      romajiRuleId,
      cascade,
    },
  };
}
