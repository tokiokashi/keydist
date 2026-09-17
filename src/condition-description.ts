import {
  DEFAULT_CONDITION_DEFAULTS,
  type UiStateConditionsDefaults,
  type UiStateV1,
} from './ui-state.ts';

export type ConditionKey = keyof UiStateConditionsDefaults;

interface ConditionDescriptor {
  label: string;
  effect: string;
  format: (value: UiStateConditionsDefaults[ConditionKey]) => string;
}

/** 条件を追加した時に説明の追従漏れを型とテストで検出するための一覧。 */
const GEOMETRY_LABEL: Record<UiStateConditionsDefaults['geometry'], string> = {
  'row-staggered': 'ロウスタッガード',
  ortholinear: 'オーソリニア',
  'column-staggered': 'カラムスタッガード',
};

export const CONDITION_DESCRIPTORS = {
  geometry: {
    label: '物理形状',
    effect: 'ピッチ・段ずれ・列オフセットを決める物理形状です。形状を変えると距離の絶対値が変わります。',
    format: (value) => GEOMETRY_LABEL[value as UiStateConditionsDefaults['geometry']],
  },
  windowSize: {
    label: '窓幅 N',
    effect: '同じ指を残すかホームへ戻すかを比べる先読みの打鍵数です。値が大きいほど、離れた連続打鍵でも指を残す候補を比較します。',
    format: (value) => `${value} ステップ`,
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

export type PlaybackConditionKey = 'stepsPerSecond' | 'speedMultiplier' | 'sameFingerDelay' | 'useCalibration';
type PlaybackConditionValues = Pick<UiStateV1['ui']['playback'], PlaybackConditionKey>;

interface PlaybackConditionDescriptor {
  label: string;
  effect: string;
  format: (value: PlaybackConditionValues[PlaybackConditionKey]) => string;
}

/** 打鍵再生時間モデルの仕様にある条件。表示・保存側のUI状態から生成する。 */
export const PLAYBACK_CONDITION_DESCRIPTORS = {
  stepsPerSecond: {
    label: '基準速度',
    effect: '個人速度を使わない時の、再生の基準となるステップ毎秒です。値が大きいほど打鍵間隔が短くなります。',
    format: (value) => `${value} ステップ/秒`,
  },
  speedMultiplier: {
    label: '再生倍率',
    effect: '基準速度や個人速度へ最後に掛ける倍率です。1より大きいと速く、1より小さいと遅くなります。',
    format: (value) => `${value} 倍`,
  },
  sameFingerDelay: {
    label: '指の移動速度を考慮',
    effect: 'オンにすると、同じ指の連続打鍵に指の移動速度が反映されます。個人速度が無い場合は距離に比例した簡易換算で代用します。オフだと同指連続かどうかに関わらず通常速度で進みます。',
    format: (value) => value ? '有効' : '無効',
  },
  useCalibration: {
    label: '個人速度',
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
    differsFromDefault: value !== defaults[key],
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
