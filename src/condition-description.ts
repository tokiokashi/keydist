import {
  DEFAULT_CONDITION_DEFAULTS,
  type UiStateConditionsDefaults,
} from './ui-state.ts';

export type ConditionKey = keyof UiStateConditionsDefaults;

interface ConditionDescriptor {
  label: string;
  effect: string;
  format(value: UiStateConditionsDefaults[ConditionKey]): string;
}

/** 条件を追加した時に説明の追従漏れを型とテストで検出するための一覧。 */
export const CONDITION_DESCRIPTORS = {
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

const CONDITION_KEYS = Object.keys(DEFAULT_CONDITION_DEFAULTS) as ConditionKey[];

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
