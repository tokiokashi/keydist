import * as v from 'valibot';
import {
  decodeCascadeOverrides,
  encodeCascadeOverrides,
  type ItemSchemaMap,
} from '#input/settings/index.ts';
import { defineAssetCodec, type AssetCodec } from '#input/codec/index.ts';
import {
  PLAYBACK_RATE_HALF_LIFE_SECONDS_MAX,
  PLAYBACK_RATE_HALF_LIFE_SECONDS_MIN,
  PLAYBACK_RATE_WINDOW_MAX,
  PLAYBACK_RATE_WINDOW_MIN,
} from '#interpretation/timing/playback.ts';
import { SETTINGS_ITEMS, type SettingsCascadeOverrides, type SettingsValueMap } from './settings-items.ts';

/**
 * カスケードの上書きのcodec（#544 §8-3）。項目ごとの値schemaは、値の型を二重に
 * 書かないよう `SETTINGS_ITEMS`（settings-items.ts、defaultValue・allowedLevels等の
 * すでにある「登録済みの知識」）に1対1で対応させてここで宣言する。`engine`は
 * `input`をimportしてよい層なので、`input/settings/codec.ts`の仕組み（レベル構造の
 * decode）へこのschema写像を渡すだけで良い（依存の向きはdocs/architecture.md通り）。
 *
 * 各項目のschemaは「値の形が正しいか」だけを見る。実現可能性（`validate`）・
 * 適用可否（`isApplicable`）はcontext（形状・配列）が要るのでcodecの仕事ではなく
 * `resolveCascade`の仕事（#544 §3・resolve.ts）。この境界も二重管理を避けるため。
 */

const triggerRealizationPolicySchema = v.strictObject({
  useHold: v.boolean(),
});

const triggerActivationGroupingSchema = v.picklist(['combined', 'separate']);

const actionRealizationPolicySchema = v.strictObject({
  triggerActivation: v.picklist(['disabled', 'semantic']),
  triggerActivationClassOverrides: v.optional(
    v.partial(v.strictObject({
      'prepress-required': triggerActivationGroupingSchema,
      'order-free': triggerActivationGroupingSchema,
      'postpress-required': triggerActivationGroupingSchema,
    })),
  ),
  triggerActivationOverrides: v.optional(v.array(v.strictObject({
    selector: v.strictObject({
      modifierGroupIds: v.optional(v.array(v.string())),
      triggerKeys: v.optional(v.array(v.string())),
    }),
    grouping: triggerActivationGroupingSchema,
  }))),
});

const chainInterpretationSchema = v.strictObject({
  breakOnSameFinger: v.boolean(),
  breakOnTriggerOnly: v.boolean(),
  breakOnThumbOnly: v.boolean(),
  breakOnOppositeHandSimultaneous: v.boolean(),
});

const arpeggioInterpretationSchema = v.strictObject({
  includeThumb: v.boolean(),
  bridgeSameFinger: v.boolean(),
  includeSingleRedirectTail: v.boolean(),
});

/**
 * windowSize（先読みN）に下限を1つ課す以外、既存実装は範囲を定めていなかった。
 * 0以下・小数は先読みとして意味を持たない（`generateTrace`が候補を選べない）ため、
 * 「事実として一方が正しいもの」（AGENTS.md「設定項目を足すか決める」）として
 * 検査に加える。上限は無い（先読みは大きいほど計算が重くなるだけで、モデル上は
 * 不正にならない）。
 */
const windowSizeSchema = v.pipe(v.number(), v.integer(), v.minValue(1));

/** ローマ字規則idは組み込み・自作の両方がありうる（romajiRuleIdのコメント参照）ので、空文字だけ弾く。 */
const romajiRuleIdSchema = v.pipe(v.string(), v.minLength(1));

export const SETTINGS_ITEM_SCHEMAS = {
  windowSize: windowSizeSchema,
  sfbHomeCost: v.boolean(),
  preferOppositeThumb: v.boolean(),
  triggerRealizationPolicy: triggerRealizationPolicySchema,
  actionRealizationPolicy: actionRealizationPolicySchema,
  chainInterpretation: chainInterpretationSchema,
  arpeggioInterpretation: arpeggioInterpretationSchema,
  playbackRateAverage: v.picklist(['sma', 'ewma']),
  playbackRateWindow: v.pipe(
    v.number(), v.integer(), v.minValue(PLAYBACK_RATE_WINDOW_MIN), v.maxValue(PLAYBACK_RATE_WINDOW_MAX),
  ),
  playbackRateHalfLifeSeconds: v.pipe(
    v.number(), v.minValue(PLAYBACK_RATE_HALF_LIFE_SECONDS_MIN), v.maxValue(PLAYBACK_RATE_HALF_LIFE_SECONDS_MAX),
  ),
  romajiRuleId: romajiRuleIdSchema,
} as const satisfies ItemSchemaMap<SettingsValueMap>;

// SETTINGS_ITEMSと1対1対応していることを型で保証する（片方だけ項目を足すとここが壊れる）。
const _keysMatch: keyof typeof SETTINGS_ITEMS extends keyof typeof SETTINGS_ITEM_SCHEMAS ? true : never = true;
void _keysMatch;

/**
 * カスケード上書きのcodec本体。版番号1（新モデルでの最初の版。#544 §8-3「資産のcodec」の
 * 対象に「旧AppStateからの移行」は含まれない。それはPhase 5で別途、一度だけ行う移行として
 * 実装する。ここでのmigrateチェーンの仕組み自体は`input/codec/index.test.ts`でfakeな
 * v0→v1のstepを使って検証済み）。
 */
export const SETTINGS_CASCADE_OVERRIDES_CODEC: AssetCodec<SettingsCascadeOverrides> = defineAssetCodec({
  currentVersion: 1,
  decodePayload: (payload, diagnostics) =>
    decodeCascadeOverrides(SETTINGS_ITEM_SCHEMAS, payload, 'overrides', diagnostics),
  encodePayload: (value) => encodeCascadeOverrides(value),
});
