import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CHAIN_POLICY } from '#interpretation/structure/chain.ts';
import { chainPolicyFromLegacyUi } from './chain-ui-settings.ts';

test('旧include設定は意味が対応するChainPolicyへだけ変換する', () => {
  assert.deepEqual(
    chainPolicyFromLegacyUi({
      chainIncludeSameFinger: false,
      chainIncludeLayerKeys: true,
    }),
    DEFAULT_CHAIN_POLICY,
  );
  assert.deepEqual(
    chainPolicyFromLegacyUi({
      chainIncludeSameFinger: true,
      chainIncludeLayerKeys: false,
    }),
    {
      breakOnSameFinger: false,
      breakOnTriggerOnly: true,
      breakOnThumbOnly: true,
      breakOnOppositeHandSimultaneous: false,
    },
  );
});
