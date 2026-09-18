import {
  DEFAULT_CONDITION_DEFAULTS,
  type UiStateConditionsDefaults,
  type UiStateV1,
} from './ui-state.ts';
import { isCustomGeometryKind, type PresetGeometryKind } from './geometry.ts';
import { sameChainPolicy, type ChainPolicy } from './analysis-chain.ts';
import { sameArpeggioPolicy, type ArpeggioPolicy } from './analysis-arpeggio.ts';
import {
  sameTriggerRealizationPolicy,
  type TriggerRealizationPolicy,
} from './trigger-realization.ts';
import {
  sameHoldStartActionPolicy,
  type HoldStartActionPolicy,
} from './hold-start-action.ts';

export type ConditionKey = keyof UiStateConditionsDefaults;

interface ConditionDescriptor {
  label: string;
  effect: string;
  format: (value: UiStateConditionsDefaults[ConditionKey]) => string;
}

/** 条件を追加した時に説明の追従漏れを型とテストで検出するための一覧。 */
const GEOMETRY_LABEL: Record<PresetGeometryKind | 'custom', string> = {
  'row-staggered': 'ロウスタッガード',
  ortholinear: 'オーソリニア',
  'column-staggered': 'カラムスタッガード',
  custom: 'カスタム形状',
};

function geometryLabel(value: UiStateConditionsDefaults['geometry']): string {
  if (isCustomGeometryKind(value)) return 'カスタム形状';
  return GEOMETRY_LABEL[value];
}

function formatChainPolicy(value: ChainPolicy): string {
  return `同指${value.breakOnSameFinger ? '区切る' : '区切らない'}・`
    + `trigger-only${value.breakOnTriggerOnly ? '区切る' : '区切らない'}・`
    + `逆手同時${value.breakOnOppositeHandSimultaneous ? '区切る' : '区切らない'}`;
}

function formatArpeggioPolicy(value: ArpeggioPolicy): string {
  return `親指${value.includeThumb ? '含む' : '含まない'}・`
    + `同指bridge${value.bridgeSameFinger ? '有効' : '無効'}・`
    + `redirect tail${value.includeSingleRedirectTail ? '有効' : '無効'}`;
}

function formatTriggerRealizationPolicy(value: TriggerRealizationPolicy): string {
  return value.useHold ? 'hold-capable triggerを連続保持する' : '連続保持しない';
}

function formatHoldStartActionPolicy(value: HoldStartActionPolicy): string {
  return value.countAsSeparateStep ? 'hold開始を独立stepとして数える' : 'outputと同じstepで数える';
}

export const CONDITION_DESCRIPTORS = {
  chain: {
    label: 'Chain境界条件',
    effect: 'Raw hand runをAnalysis Chainへ分割する条件です。同指・trigger-only・逆手同時入力を独立に扱います。親指onlyの既定は未決のため、この設定では決めません。',
    format: (value) => formatChainPolicy(value as ChainPolicy),
  },
  arpeggioPolicy: {
    label: 'Arpeggio構造Policy',
    effect: 'LongRoll / TwoRollからArpeggioSpanを派生する条件です。親指core、同指bridge、末尾1回のredirect吸収だけを扱います。',
    format: (value) => formatArpeggioPolicy(value as ArpeggioPolicy),
  },
  triggerRealization: {
    label: 'Trigger保持Policy',
    effect: 'hold-capable triggerを実際の連続保持としてrealizeするかを決めます。single triggerやcomposition capabilityの推測には使いません。',
    format: (value) => formatTriggerRealizationPolicy(value as TriggerRealizationPolicy),
  },
  holdStartAction: {
    label: 'Hold開始action',
    effect: 'realize済みのheld-trigger/startがoutputと同じStrokeにある時、その開始を追加の独立stepとして数えるかを決めます。prefix等の既存trigger-only Strokeは追加計上しません。',
    format: (value) => formatHoldStartActionPolicy(value as HoldStartActionPolicy),
  },
  geometry: {
    label: '物理形状',
    effect: 'ピッチ・段ずれ・列オフセットを決める物理形状です。形状を変えると距離の絶対値が変わります。',
    format: (value) => geometryLabel(value as UiStateConditionsDefaults['geometry']),
  },
  windowSize: {
    label: '窓幅 N',
    effect: '同じ指を残すかホームへ戻すかを比べる先読みの打鍵数です。値が大きいほど、離れた連続打鍵でも指を残す候補を比較します。',
    format: (value) => `${value} ステップ`,
  },
  playbackRateAverage: {
    label: '速度の平均方式',
    effect: 'SMAは直近Stroke数、EWMAは確定Timingの経過時間で減衰する時間ベースの指数移動平均です。TimingやCalibration自体は変更しません。',
    format: (value) => value === 'ewma' ? 'EWMA' : 'SMA',
  },
  playbackRateWindow: {
    label: 'SMA窓幅',
    effect: 'SMAで、直近いくつの完了Strokeを集計するかです。全配列で同じ値を使います。',
    format: (value) => `直近 ${value} 打鍵`,
  },
  playbackRateHalfLifeSeconds: {
    label: 'EWMA半減期',
    effect: 'EWMAで過去の速度寄与が半分になる経過時間です。Stroke数ではなく確定Timing上の秒数で減衰します。',
    format: (value) => `${value} 秒`,
  },
  sfbHomeCost: {
    label: '同指連続のホームコスト',
    effect: '同じ指でホームキーを打つ移動を距離へ加算するかどうかです。オフならホームキー上の移動は0として扱います。',
    format: (value) => value ? '加算する' : '加算しない',
  },
  preferOppositeThumb: {
    label: '逆側の親指を優先',
    effect: '親指シフトを使う配列で、出力キーと反対側の親指を優先するかどうかです。',
    format: (value) => value ? '有効' : '無効',
  },
} satisfies Record<ConditionKey, ConditionDescriptor>;

export type PlaybackConditionKey = 'stepsPerSecond' | 'speedMultiplier' | 'sameFingerDelay' | 'allFingerMovementDelay' | 'useCalibration';
type PlaybackConditionValues = Pick<UiStateV1['ui']['playback'], PlaybackConditionKey>;

interface PlaybackConditionDescriptor {
  label: string;
  effect: string;
  format: (value: PlaybackConditionValues[PlaybackConditionKey]) => string;
}

/** 打鍵再生時間モデルの仕様にある条件。表示・保存側のUI状態から生成する。 */
export const PLAYBACK_CONDITION_DESCRIPTORS = {
  stepsPerSecond: {
    label: '標準速度',
    effect: '個人速度を適用しない時の、再生の標準となるステップ毎秒です。値が大きいほど打鍵間隔が短くなります。',
    format: (value) => `${value} ステップ/秒`,
  },
  speedMultiplier: {
    label: '再生倍率',
    effect: '標準速度や個人速度へ最後に掛ける倍率です。1より大きいと速く、1より小さいと遅くなります。',
    format: (value) => `${value} 倍`,
  },
  sameFingerDelay: {
    label: '指の移動速度を考慮',
    effect: 'オンにすると、同じ指の連続打鍵に指の移動速度が反映されます。個人速度が無い場合は距離に比例した簡易換算で代用します。オフだと同指連続かどうかに関わらず通常速度で進みます。',
    format: (value) => value ? '有効' : '無効',
  },
  allFingerMovementDelay: {
    label: '全指の移動時間で律速',
    effect: 'オンにすると、次のPressへ必要な指がbase Timingまでに到達できない場合だけ、そのStrokeを必要量だけ遅らせます。構造ラベルによる補正は行いません。',
    format: (value) => value ? '有効' : '無効',
  },
  useCalibration: {
    label: '個人速度を適用',
    effect: '測定した通常速度・同手別指速度・指移動速度を再生へ使うかどうかです。保存値がない場合は利用できません。',
    format: (value) => value ? '有効' : '無効',
  },
} satisfies Record<PlaybackConditionKey, PlaybackConditionDescriptor>;

const CONDITION_KEYS = Object.keys(DEFAULT_CONDITION_DEFAULTS) as ConditionKey[];
const PLAYBACK_CONDITION_KEYS = Object.keys(PLAYBACK_CONDITION_DESCRIPTORS) as PlaybackConditionKey[];

export interface ConditionDescriptionItem {
  key: ConditionKey;
  label: string;
  value: string;
  defaultValue: string;
  differsFromDefault: boolean;
  effect: string;
}

export interface ConditionDescriptionOverride {
  layoutId: string;
  layoutName: string;
  conditions: ConditionDescriptionItem[];
}

export interface ConditionDescriptionResult {
  conditions: ConditionDescriptionItem[];
  overrides: ConditionDescriptionOverride[];
}

export interface PlaybackConditionDescriptionItem {
  key: PlaybackConditionKey;
  label: string;
  value: string;
  defaultValue: string;
  differsFromDefault: boolean;
  effect: string;
}

export interface PlaybackConditionDescriptionInput {
  defaults: PlaybackConditionValues;
  current: PlaybackConditionValues;
}

export interface ConditionDescriptionInput {
  /** 説明の基準となるアプリ全体の既定値。 */
  defaults: UiStateConditionsDefaults;
  /** 現在のアプリ全体の設定値。 */
  current: UiStateConditionsDefaults;
  /** 配列ごとの差分。値がある項目だけ説明へ含める。 */
  perLayout: Readonly<Record<string, Partial<UiStateConditionsDefaults>>>;
  layoutNames?: Readonly<Record<string, string>>;
}

function sameConditionValue(
  key: ConditionKey,
  left: UiStateConditionsDefaults[ConditionKey],
  right: UiStateConditionsDefaults[ConditionKey],
): boolean {
  if (key === 'chain') return sameChainPolicy(left as ChainPolicy, right as ChainPolicy);
  if (key === 'arpeggioPolicy') {
    return sameArpeggioPolicy(left as ArpeggioPolicy, right as ArpeggioPolicy);
  }
  if (key === 'triggerRealization') {
    return sameTriggerRealizationPolicy(
      left as TriggerRealizationPolicy,
      right as TriggerRealizationPolicy,
    );
  }
  if (key === 'holdStartAction') {
    return sameHoldStartActionPolicy(left as HoldStartActionPolicy, right as HoldStartActionPolicy);
  }
  return left === right;
}

function describeItem(
  key: ConditionKey,
  value: UiStateConditionsDefaults[ConditionKey],
  defaults: UiStateConditionsDefaults,
): ConditionDescriptionItem {
  const descriptor = CONDITION_DESCRIPTORS[key];
  return {
    key,
    label: descriptor.label,
    value: descriptor.format(value),
    defaultValue: descriptor.format(defaults[key]),
    differsFromDefault: !sameConditionValue(key, value, defaults[key]),
    effect: descriptor.effect,
  };
}

export function describeConditions(input: ConditionDescriptionInput): ConditionDescriptionResult {
  const conditions = CONDITION_KEYS.map((key) => describeItem(key, input.current[key], input.defaults));
  const overrides = Object.entries(input.perLayout).flatMap(([layoutId, values]) => {
    const items = CONDITION_KEYS
      .filter((key) => values[key] !== undefined)
      .map((key) => describeItem(key, values[key] as UiStateConditionsDefaults[typeof key], input.defaults));
    return items.length === 0
      ? []
      : [{
        layoutId,
        layoutName: input.layoutNames?.[layoutId] ?? layoutId,
        conditions: items,
      }];
  });
  return { conditions, overrides };
}

export function describePlaybackConditions(
  input: PlaybackConditionDescriptionInput,
): PlaybackConditionDescriptionItem[] {
  return PLAYBACK_CONDITION_KEYS.map((key) => {
    const descriptor = PLAYBACK_CONDITION_DESCRIPTORS[key];
    const value = input.current[key];
    const defaultValue = input.defaults[key];
    return {
      key,
      label: descriptor.label,
      value: descriptor.format(value),
      defaultValue: descriptor.format(defaultValue),
      differsFromDefault: value !== defaultValue,
      effect: descriptor.effect,
    };
  });
}
