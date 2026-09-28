import {
  defineItem,
  emptyCascadeOverrides,
  readOverride,
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
import { defaultFingerAssignmentId } from './finger-assignment.ts';
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

/**
 * 「既定の形状」の既定値。3形状（`PHYSICAL_SHAPES`）のうち最初から選ばれている既定
 * （`src/input/shapes/geometry.ts`の`row-staggered`）に合わせる。実体はimportせず、
 * idの文字列だけを持つ（`initial.ts`が持っていた同名の定数の後継。#578指摘1）。
 */
export const DEFAULT_SHAPE_ID = 'row-staggered';

const ANY_LEVEL = new Set<CascadeLevel['kind']>(['global', 'shape', 'inputMethod', 'layout', 'setup']);
const GLOBAL_ONLY = new Set<CascadeLevel['kind']>(['global']);
const GLOBAL_LAYOUT_SETUP = new Set<CascadeLevel['kind']>(['global', 'layout', 'setup']);
const INPUT_METHOD_LAYOUT_SETUP = new Set<CascadeLevel['kind']>(['inputMethod', 'layout', 'setup']);
const GLOBAL_SHAPE_LAYOUT_SETUP = new Set<CascadeLevel['kind']>(['global', 'shape', 'layout', 'setup']);

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
   *
   * `isApplicable` は `context.inputMethod === 'romaji'` だけで判定する（`layout.romajiTable`
   * の有無は見ない）。mode（en/ja）を廃止したことで、`qwerty` 等の組み込み配列は英語を
   * そのまま打つ（打ち方 direct）用にも、ローマ字経由で日本語を打つ（打ち方 romaji）用にも
   * 同じ `Layout` オブジェクトが使われるようになった（`LAYOUTS` と `LAYOUTS_JA` は
   * 同じidの配列を共有しており、`LAYOUT_BY_ID` は後者＝ `romajiTable` 付きの実体を残す。
   * #544レビュー: 「一つのLayoutが打ち方によって適用可否が変わる」）。そのため
   * `layout.romajiTable !== undefined` を見ると、実際には direct/kana-direct で使われている
   * 場面でも「ローマ字規則が効く」と誤って報告してしまう。打ち方そのもの（`inputMethod`）で
   * 判定すれば、同じ配列でもどちらの打ち方で使われているかに正しく従う。
   */
  romajiRuleId: defineItem<string>({
    id: 'romajiRuleId',
    allowedLevels: INPUT_METHOD_LAYOUT_SETUP,
    defaultValue: (context) => defaultRomajiRuleId(context.layoutId),
    isApplicable: (context) => context.inputMethod === 'romaji',
  }),
  /**
   * 指割り当てid（`#engine/finger-assignment.ts` 参照）。SetupCatalogの形状は
   * `PhysicalShape` までしか持たず、指割り当てはその型に無い独立の軸なので、
   * カスケードの項目として持つ。`row-staggered` の形状のまま `jis-default` へ差し替える等、
   * 形状を変えずに運指だけ比べる分岐が既存fixtureに実在するため、shape/layout/setupの
   * どのレベルでも上書きを許す（`allowedLevels`はwindowSize等と同じ「先回りして足さない」
   * 判断で、今のところ要望が無いinputMethodレベルは持たない）。
   */
  fingerAssignmentId: defineItem<string>({
    id: 'fingerAssignmentId',
    allowedLevels: GLOBAL_SHAPE_LAYOUT_SETUP,
    defaultValue: (context) => defaultFingerAssignmentId(context.shape),
  }),
  /**
   * 既定の形状（#578指摘1の決定「対象を配列かSetupにする」）。**配列を対象にした時の
   * 物理形状**を決めるグローバル専用の項目。カスケードの他の項目と違い、この値自体は
   * `CascadeContext`（既に形状が決まっている前提の型）を組み立てる**前**に読む必要がある
   * （`target-resolution.ts`参照）ため、`resolveCascade`は経由しない。項目としては
   * `resolveCascade`の他の項目と同じ形（`SettingItem`）で持ち、書き込みは既存の
   * `setSettingsOverride`をそのまま使えるようにする（読み出しだけ専用の
   * `resolveDefaultShapeId`を使う）。
   *
   * `allowedLevels`はglobalのみ（#578決定「scope: global only — 他のレベルは今は許可しない」。
   * 「先回りして足さない」の判断と同じ）。
   *
   * `isApplicable`: Setup対象はSetup自身の`shapeId`で物理形状が決まるので、この項目は
   * 効かない（レビュー指摘6）。判定は`context.targetKind`で行い、`setupId`の有無は見ない
   * （idがまだ無いSetupのプレビューもSetup対象で、既定の形状は効かないため）。
   *
   * `validate`: 未知・削除された形状idが指されていた場合、`target-resolution.ts`が
   * 実際に使う形状を`DEFAULT_SHAPE_ID`へ前もってfallbackさせた上で`context.shapeId`へ
   * 積む（配列対象の解決自体を失敗させない。レビュー指摘6「fall back to DEFAULT_SHAPE_ID
   * with a diagnostic … instead of failing every layout target」）。ここでの`validate`は
   * 「生の上書き値」と「実際にその後使われた形状（`context.shapeId`）」を突き合わせるだけで、
   * 食い違っていれば診断を1件積んで`context.shapeId`へ読み替える。`preferOppositeThumb`と
   * 同じ「実現できない値をfallbackで戻す」役割を、fallback先の決定だけ呼び出し側
   * （`target-resolution.ts`。catalogを持っているのはそちら）に任せる形。
   */
  defaultShapeId: defineItem<string>({
    id: 'defaultShapeId',
    allowedLevels: GLOBAL_ONLY,
    defaultValue: DEFAULT_SHAPE_ID,
    isApplicable: (context) => context.targetKind === 'layout',
    validate: (value, context) => {
      // Setup対象ではこの項目自体が無関係（isApplicable=false）なので、Setup自身の
      // shapeIdと値が食い違っていても検証しない（毎回誤ってfallback診断が出る事故を避ける）。
      if (context.targetKind !== 'layout') return { ok: true };
      return value === context.shapeId
        ? { ok: true }
        : {
          ok: false,
          fallback: context.shapeId,
          reason: `物理形状「${value}」が見つからないため、既定の形状（${context.shapeId}）へ戻した`,
        };
    },
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

/**
 * 「既定の形状」を単独で読む。`resolveSettings`（`resolveCascade`）を経由しない理由は
 * `SETTINGS_ITEMS.defaultShapeId`のコメント参照: 配列を対象にした時の物理形状そのものを
 * 決める値なので、`CascadeContext`（形状が既に決まっている前提）を組み立てる前に必要になる。
 * globalのみが許可レベルで`defaultValue`もcontext非依存の固定値なので、
 * `overrides.global`を直接読むだけで解決できる（`resolveCascade`と同じ「弱い順に重ねる」を
 * 省略しても結果は一致する）。
 */
export function resolveDefaultShapeId(overrides: SettingsCascadeOverrides): string {
  return readOverride(overrides, { kind: 'global' }, 'defaultShapeId') ?? DEFAULT_SHAPE_ID;
}

export function resetSettingsLevel(
  overrides: SettingsCascadeOverrides,
  level: CascadeLevel,
): SettingsCascadeOverrides {
  return resetLevelGeneric(overrides, level);
}
