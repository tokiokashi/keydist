import {
  defineItem,
  emptyCascadeOverrides,
  resetItem as resetItemGeneric,
  resetLevel as resetLevelGeneric,
  resolveCascade,
  setOverride as setOverrideGeneric,
  type CascadeContext,
  type CascadeLevel,
  type CascadeOverrides,
  type ItemRegistry,
  type RegistryValueMap,
  type ResolvedCascade,
  type WriteResult,
} from '#input/settings/index.ts';
import {
  DEFAULT_ACTION_REALIZATION_POLICY,
  DEFAULT_TRIGGER_REALIZATION_POLICY,
  type ActionRealizationPolicy,
  type TriggerRealizationPolicy,
} from '#input/semantics/index.ts';
import { defaultRomajiRuleId } from '#input/romaji/rules.ts';
import { DEFAULT_CHAIN_INTERPRETATION, type ChainInterpretation } from '#interpretation/structure/chain.ts';
import { DEFAULT_ARPEGGIO_INTERPRETATION, type ArpeggioInterpretation } from '#interpretation/structure/arpeggio.ts';
import {
  DEFAULT_PLAYBACK_RATE_AVERAGE,
  DEFAULT_PLAYBACK_RATE_HALF_LIFE_SECONDS,
  DEFAULT_PLAYBACK_RATE_WINDOW,
  type PlaybackRateAverage,
} from '#interpretation/timing/playback.ts';

/**
 * カスケードの具体的な項目定義（#544 Phase 2「カスケード」）。
 * 仕組み（レベル・SettingItem・解決アルゴリズム）は `#input/settings/`（純粋層で
 * `interpretation` 等をimportできない）にあり、ここではその型（TracePolicy・
 * ChainInterpretation・ローマ字規則id）の実物をimportして具体の項目を登録する。
 * `engine` は `input` / `trace` / `interpretation` をimportしてよい層なのでここに置く
 * （docs/architecture.mdの依存規則）。
 */

const ANY_LEVEL = new Set<CascadeLevel['kind']>(['global', 'shape', 'inputMethod', 'layout', 'setup']);
const GLOBAL_ONLY = new Set<CascadeLevel['kind']>(['global']);
const GLOBAL_LAYOUT_SETUP = new Set<CascadeLevel['kind']>(['global', 'layout', 'setup']);
const INPUT_METHOD_LAYOUT_SETUP = new Set<CascadeLevel['kind']>(['inputMethod', 'layout', 'setup']);

/** 形状のthumbsに指定の手の親指キーがあるか。`preferOppositeThumb`の実現可能性判定に使う。 */
function shapeHasThumb(context: CascadeContext, finger: 'LT' | 'RT'): boolean {
  return context.shape.thumbs.some((thumb) => thumb.finger === finger);
}

export const SETTINGS_ITEMS = {
  /**
   * 先読みN。旧`ConditionDefaults`はグローバルとlayoutの2段しか持たなかった。
   * shape/inputMethodレベルは今のところ要望が無いので足さない
   * （AGENTS.md「設定項目を足すか決める」の3つ目: 先回りして足さない）。
   */
  windowSize: defineItem<number>({
    id: 'windowSize',
    allowedLevels: GLOBAL_LAYOUT_SETUP,
    defaultValue: 3,
  }),
  /** 同指連続でホームキーへ戻る距離を計上するか。windowSizeと同じ理由でglobal/layout/setupのみ。 */
  sfbHomeCost: defineItem<boolean>({
    id: 'sfbHomeCost',
    allowedLevels: GLOBAL_LAYOUT_SETUP,
    defaultValue: true,
  }),
  /**
   * 親指シフトを出力キーと反対側の親指へ振り替えるか（#544 §3の例示どおり「どのレベルでも可」）。
   * 反対側の親指キーが形状に無ければ実現できないので `validate` で判定する。
   */
  preferOppositeThumb: defineItem<boolean>({
    id: 'preferOppositeThumb',
    allowedLevels: ANY_LEVEL,
    defaultValue: false,
    isApplicable: (context) =>
      context.layout.thumbShiftKeys !== undefined && context.layout.thumbShiftKeys.length > 0,
    validate: (value, context) => {
      if (!value) return { ok: true };
      // 「振り替え先」は出力キー側の反対の手なので、判定には両方の親指キーの有無を見る。
      // 片方でも無ければ振り替えは実現できない。
      const realizable = shapeHasThumb(context, 'LT') && shapeHasThumb(context, 'RT');
      return realizable
        ? { ok: true }
        : { ok: false, fallback: false, reason: '形状に左右いずれかの親指キーが無く、反対側への振り替えを実現できない' };
    },
  }),
  /**
   * hold-capable triggerの連続保持化。layoutのFace定義（trigger persistence）に依存する
   * 挙動なので、形状・打ち方をまたいで共有する意味が薄い。global（既定）とlayout/setupのみ許す。
   */
  triggerRealizationPolicy: defineItem<TriggerRealizationPolicy>({
    id: 'triggerRealizationPolicy',
    allowedLevels: GLOBAL_LAYOUT_SETUP,
    defaultValue: { ...DEFAULT_TRIGGER_REALIZATION_POLICY },
  }),
  /**
   * trigger activationのgrouping。overrides はlayout固有のtrigger group（modifierGroupIds等）を
   * 直接指すので、layout/setup以外では中身が意味を持たない。globalは「既定disabled」を置ける
   * ので許す（値そのものはlayoutを選ばない）。
   *
   * 単位はオブジェクト全体（フィールド単位にしない）。旧実装の
   * `resolveConditions`（src/engine/condition-resolution.ts）が
   * `{ ...defaults, ...override }` とトップレベルのキーだけをスプレッドして決めており、
   * `actionRealization` はキー自体が1つの値として丸ごと置き換わっていた。カスケードの
   * 項目粒度をそれに合わせることで、解決の意味を変えない。
   */
  actionRealizationPolicy: defineItem<ActionRealizationPolicy>({
    id: 'actionRealizationPolicy',
    allowedLevels: GLOBAL_LAYOUT_SETUP,
    defaultValue: { ...DEFAULT_ACTION_REALIZATION_POLICY },
  }),
  /**
   * 解釈（Traceの読み方）。#544 §2の判断どおり当面グローバルのみ:
   * 比較で並ぶSetup間でchainの数え方が違うと比較の意味が無くなるため。
   */
  chainInterpretation: defineItem<ChainInterpretation>({
    id: 'chainInterpretation',
    allowedLevels: GLOBAL_ONLY,
    defaultValue: { ...DEFAULT_CHAIN_INTERPRETATION },
  }),
  arpeggioInterpretation: defineItem<ArpeggioInterpretation>({
    id: 'arpeggioInterpretation',
    allowedLevels: GLOBAL_ONLY,
    defaultValue: { ...DEFAULT_ARPEGGIO_INTERPRETATION },
  }),
  /** 速度平均の方式。#544 §3の例示どおりグローバルのみ。 */
  playbackRateAverage: defineItem<PlaybackRateAverage>({
    id: 'playbackRateAverage',
    allowedLevels: GLOBAL_ONLY,
    defaultValue: DEFAULT_PLAYBACK_RATE_AVERAGE,
  }),
  /** SMAの直近Stroke数。方式と同じ理由でグローバルのみ。 */
  playbackRateWindow: defineItem<number>({
    id: 'playbackRateWindow',
    allowedLevels: GLOBAL_ONLY,
    defaultValue: DEFAULT_PLAYBACK_RATE_WINDOW,
  }),
  /** EWMAの半減時間 [秒]。方式と同じ理由でグローバルのみ。 */
  playbackRateHalfLifeSeconds: defineItem<number>({
    id: 'playbackRateHalfLifeSeconds',
    allowedLevels: GLOBAL_ONLY,
    defaultValue: DEFAULT_PLAYBACK_RATE_HALF_LIFE_SECONDS,
  }),
  /**
   * ローマ字規則id。既定値は配列ごとに違う（`defaultRomajiRuleId` は大西配列だけ`oonishi`、
   * それ以外は`kunrei`を返す）ので、`defaultValue` をcontextの関数にしている。
   * `undefined`を既定にしてしまうと「上書きが無い＝どの規則で焼き込んだ配列由来のテーブルか
   * 分からない」状態が生じ、#561のレビューで指摘された「見かけ上の一致」の問題を再現する
   * （テーブルの実体とidの対応が取れない）。
   *
   * 打ち方（ローマ字入力）レベルでの上書きを想定して inputMethod/layout/setup を許可し、
   * globalは持たない（ローマ字を使わない打ち方には意味が無い値のため）。
   * かな直接配列・英字配列（ローマ字表を持たない）では `isApplicable` がfalseになる。
   */
  romajiRuleId: defineItem<string>({
    id: 'romajiRuleId',
    allowedLevels: INPUT_METHOD_LAYOUT_SETUP,
    defaultValue: (context) => defaultRomajiRuleId(context.layoutId),
    isApplicable: (context) => context.layout.romajiTable !== undefined,
  }),
} as const satisfies ItemRegistry;

export type SettingsItemId = keyof typeof SETTINGS_ITEMS;
export type SettingsValueMap = RegistryValueMap<typeof SETTINGS_ITEMS>;
export type SettingsCascadeOverrides = CascadeOverrides<SettingsValueMap>;
export type ResolvedSettingsCascade = ResolvedCascade<SettingsValueMap>;

export const EMPTY_SETTINGS_OVERRIDES: SettingsCascadeOverrides = emptyCascadeOverrides();

/** `resolveCascade` をこのリポジトリの項目レジストリへ束縛した便利関数。 */
export function resolveSettings(
  overrides: SettingsCascadeOverrides,
  context: CascadeContext,
): ResolvedSettingsCascade {
  return resolveCascade(SETTINGS_ITEMS, overrides, context);
}

/** `setOverride` をこのリポジトリの項目レジストリへ束縛した便利関数。 */
export function setSettingsOverride<K extends SettingsItemId>(
  overrides: SettingsCascadeOverrides,
  level: CascadeLevel,
  itemId: K,
  value: SettingsValueMap[K],
): WriteResult<SettingsValueMap> {
  return setOverrideGeneric(SETTINGS_ITEMS, overrides, level, itemId, value);
}

export function resetSettingsItem(
  overrides: SettingsCascadeOverrides,
  level: CascadeLevel,
  itemId: SettingsItemId,
): SettingsCascadeOverrides {
  return resetItemGeneric(overrides, level, itemId);
}

export function resetSettingsLevel(
  overrides: SettingsCascadeOverrides,
  level: CascadeLevel,
): SettingsCascadeOverrides {
  return resetLevelGeneric(overrides, level);
}
