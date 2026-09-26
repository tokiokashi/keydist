import {
  DEFAULT_ACTION_REALIZATION_POLICY,
  DEFAULT_TRIGGER_REALIZATION_POLICY,
  type ActionRealizationPolicy,
  type TriggerRealizationPolicy,
} from '#input/semantics/index.ts';
import type { CascadeLevelKind } from './levels.ts';
import type { CascadeContext } from './context.ts';

/**
 * `interpretation/structure/chain.ts` の `ChainInterpretation` と同じ形の値。
 * `input` は `interpretation` をimportできない（依存の向きが逆。docs/architecture.md）ため、
 * カスケードが保持する分だけこの型として複製する。フィールドを変えたら両方直す。
 */
export interface ChainInterpretationValue {
  readonly breakOnSameFinger: boolean;
  readonly breakOnTriggerOnly: boolean;
  readonly breakOnThumbOnly: boolean;
  readonly breakOnOppositeHandSimultaneous: boolean;
}

/** `interpretation/structure/arpeggio.ts` の `ArpeggioInterpretation` と同じ形の値。理由は上と同じ。 */
export interface ArpeggioInterpretationValue {
  readonly includeThumb: boolean;
  readonly bridgeSameFinger: boolean;
  readonly includeSingleRedirectTail: boolean;
}

/** `interpretation/timing/playback.ts` の速度平均の方式と同じ値。理由は上と同じ。 */
export type PlaybackRateAverageValue = 'sma' | 'ewma';

const CHAIN_INTERPRETATION_DEFAULT: ChainInterpretationValue = {
  breakOnSameFinger: true,
  breakOnTriggerOnly: false,
  breakOnThumbOnly: true,
  breakOnOppositeHandSimultaneous: false,
};

const ARPEGGIO_INTERPRETATION_DEFAULT: ArpeggioInterpretationValue = {
  includeThumb: false,
  bridgeSameFinger: false,
  includeSingleRedirectTail: false,
};

/** 現行アプリの既定値と一致させる（`interpretation/timing/playback.ts` のDEFAULT_PLAYBACK_RATE_*）。 */
const PLAYBACK_RATE_AVERAGE_DEFAULT: PlaybackRateAverageValue = 'sma';
const PLAYBACK_RATE_WINDOW_DEFAULT = 10;
const PLAYBACK_RATE_HALF_LIFE_SECONDS_DEFAULT = 1;

/** 項目の値を検証した結果。妥当ならok、そうでなければ実現可能な値へのfallbackを添える。 */
export type ValidateResult<T> =
  | { readonly ok: true }
  | { readonly ok: false; readonly fallback: T; readonly reason: string };

/**
 * カスケードの1項目の定義（VS Codeの設定項目の `scope` に相当）。
 *
 * - `allowedLevels` に無いレベルへの書き込みは拒否し（`write.ts`）、
 *   そこに残っている古い値は解決時に無視して診断を出す（`resolve.ts`）
 * - `validate` は「形状で実現できるか」を判定する。実現できなければ`fallback`を使い警告を出す
 * - `isApplicable` は「その配列にこの機能があるか」を判定する。無ければ値は解決するが
 *   「効かない」ことを診断で示す（適用できるかとフィールド妥当性は別の軸なので分けている）
 */
export interface SettingItem<T> {
  readonly id: string;
  readonly allowedLevels: ReadonlySet<CascadeLevelKind>;
  readonly defaultValue: T;
  readonly validate?: (value: T, context: CascadeContext) => ValidateResult<T>;
  readonly isApplicable?: (context: CascadeContext) => boolean;
}

function defineItem<T>(item: SettingItem<T>): SettingItem<T> {
  return item;
}

const ANY_LEVEL: ReadonlySet<CascadeLevelKind> =
  new Set(['global', 'shape', 'inputMethod', 'layout', 'setup']);
const GLOBAL_ONLY: ReadonlySet<CascadeLevelKind> = new Set(['global']);
const LAYOUT_AND_SETUP: ReadonlySet<CascadeLevelKind> = new Set(['layout', 'setup']);
const GLOBAL_LAYOUT_SETUP: ReadonlySet<CascadeLevelKind> = new Set(['global', 'layout', 'setup']);

/** 形状のthumbsに指定の手の親指キーがあるか。`preferOppositeThumb`の実現可能性判定に使う。 */
function shapeHasThumb(context: CascadeContext, finger: 'LT' | 'RT'): boolean {
  return context.shape.thumbs.some((thumb) => thumb.finger === finger);
}

export const SETTINGS_ITEMS = {
  /**
   * 先読みN。全TracePolicyの中で最も汎用的な数値なので、どのレベルでも上書きできる
   * （配列ごとに曖昧さが違うのでlayout/setupで、実験用にshape/inputMethodでも変えたい想定）。
   */
  windowSize: defineItem<number>({
    id: 'windowSize',
    allowedLevels: ANY_LEVEL,
    defaultValue: 3,
  }),
  /**
   * 同指連続でホームキーへ戻る距離を計上するか。モデルの分岐そのものなので
   * windowSizeと同じ理由でどのレベルでも上書きできる。
   */
  sfbHomeCost: defineItem<boolean>({
    id: 'sfbHomeCost',
    allowedLevels: ANY_LEVEL,
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
  chainInterpretation: defineItem<ChainInterpretationValue>({
    id: 'chainInterpretation',
    allowedLevels: GLOBAL_ONLY,
    defaultValue: { ...CHAIN_INTERPRETATION_DEFAULT },
  }),
  arpeggioInterpretation: defineItem<ArpeggioInterpretationValue>({
    id: 'arpeggioInterpretation',
    allowedLevels: GLOBAL_ONLY,
    defaultValue: { ...ARPEGGIO_INTERPRETATION_DEFAULT },
  }),
  /** 速度平均の方式。#544 §3の例示どおりグローバルのみ。 */
  playbackRateAverage: defineItem<PlaybackRateAverageValue>({
    id: 'playbackRateAverage',
    allowedLevels: GLOBAL_ONLY,
    defaultValue: PLAYBACK_RATE_AVERAGE_DEFAULT,
  }),
  /** SMAの直近Stroke数。方式と同じ理由でグローバルのみ。 */
  playbackRateWindow: defineItem<number>({
    id: 'playbackRateWindow',
    allowedLevels: GLOBAL_ONLY,
    defaultValue: PLAYBACK_RATE_WINDOW_DEFAULT,
  }),
  /** EWMAの半減時間 [秒]。方式と同じ理由でグローバルのみ。 */
  playbackRateHalfLifeSeconds: defineItem<number>({
    id: 'playbackRateHalfLifeSeconds',
    allowedLevels: GLOBAL_ONLY,
    defaultValue: PLAYBACK_RATE_HALF_LIFE_SECONDS_DEFAULT,
  }),
  /**
   * ローマ字規則id。`undefined` は「上書きなし」を表し、配列自身が持つ既定のローマ字表
   * （大西配列の`oonishi`等。src/input/layouts/index.tsで構築時に焼き込み済み）をそのまま使う。
   * 配列ごとに既定が違う（かな直接配列は既定が無い＝undefinedのまま）ため、単一のグローバル
   * 既定値は存在しない。旧実装（`LayoutConditionOverrides.romajiRule`）もlayoutごとの上書き
   * だけを持ち、グローバル既定は無かったのでlayout/setupのみ許す。
   */
  romajiRuleId: defineItem<string | undefined>({
    id: 'romajiRuleId',
    allowedLevels: LAYOUT_AND_SETUP,
    defaultValue: undefined,
    // かな直接配列・英字配列はそもそもローマ字表を持たない（romajiTableが未設定）ので、
    // この項目を上書きしても効かない。
    isApplicable: (context) => context.layout.romajiTable !== undefined,
  }),
} as const;

export type SettingsItemId = keyof typeof SETTINGS_ITEMS;

type ItemValueOf<K extends SettingsItemId> =
  (typeof SETTINGS_ITEMS)[K] extends SettingItem<infer T> ? T : never;

export type ItemValueMap = { [K in SettingsItemId]: ItemValueOf<K> };

export const SETTINGS_ITEM_IDS: readonly SettingsItemId[] =
  Object.keys(SETTINGS_ITEMS) as SettingsItemId[];
