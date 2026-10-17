import { useMemo } from 'react';
import { userInputLayouts } from '#input/layouts/user-catalog.ts';
import { InputConverterView } from '#tester/input-converter-view.tsx';
import { useKeydistAssets } from '../standalone/use-keydist-assets.ts';

/**
 * Testerの組み立て。手持ちの自作の配列とローマ字規則を読み、選べる配列としてTesterに渡す。
 * Testerは資産の保存を知らないので、読み込みが終わったかどうかも一緒に渡す。
 * 履歴は使わない（Testerでは資産を書き換えない）。
 */
export function TesterApp() {
  const { assets, ready } = useKeydistAssets({ history: false });
  const userLayouts = useMemo(
    () => userInputLayouts(assets.userLayouts, assets.userRomajiRules),
    [assets.userLayouts, assets.userRomajiRules],
  );
  return <InputConverterView userLayouts={userLayouts} userLayoutsReady={ready} />;
}
