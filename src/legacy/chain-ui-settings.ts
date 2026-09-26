import {
  DEFAULT_CHAIN_POLICY,
  type ChainPolicy,
} from '#interpretation/structure/chain.ts';

export interface LegacyChainUiSettings {
  chainIncludeSameFinger: boolean;
  chainIncludeLayerKeys: boolean;
}

/**
 * #227 の移行期間用adapter。
 *
 * 旧include...設定から意味が一意に対応する2項目だけをChainPolicyへ写す。
 * 親指only等、旧設定から意味を一意に復元できない条件は推測しない。
 */
export function chainPolicyFromLegacyUi(
  legacy: LegacyChainUiSettings,
  base: ChainPolicy = DEFAULT_CHAIN_POLICY,
): ChainPolicy {
  return {
    ...base,
    breakOnSameFinger: !legacy.chainIncludeSameFinger,
    breakOnTriggerOnly: !legacy.chainIncludeLayerKeys,
  };
}

/** 旧UIへ表示するための逆変換。Policyのうち旧UIが表現できる項目だけを返す。 */
export function legacyUiFromChainPolicy(policy: ChainPolicy): LegacyChainUiSettings {
  return {
    chainIncludeSameFinger: !policy.breakOnSameFinger,
    chainIncludeLayerKeys: !policy.breakOnTriggerOnly,
  };
}
