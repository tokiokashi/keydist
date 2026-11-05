import { useNavigate, useSearch } from '@tanstack/react-router';
import { useCallback, useMemo } from 'react';
import { userInputLayouts } from '#input/layouts/user-catalog.ts';
import { ShareControl } from '#hosts/shared/index.ts';
import { InputConverterView } from '#tester/input-converter-view.tsx';
import { useKeydistAssets } from '../standalone/use-keydist-assets.ts';
import { testerShareQuery } from './tester-share.ts';

/**
 * Testerの組み立て。手持ちの自作の配列とローマ字規則を読み、選べる配列としてTesterに渡す。
 * Testerは資産の保存を知らないので、読み込みが終わったかどうかも一緒に渡す。
 * 履歴は使わない（Testerでは資産を書き換えない）。
 *
 * URLの ?layout= で選んだ配列は、読んだ後にURLから外す。選んだ配列は保存されるので、
 * 再読み込みで選択欄の切り替えが巻き戻らず、アドレス欄も今の選択と食い違わない。
 */
export function TesterApp() {
  const { assets, ready } = useKeydistAssets({ history: false });
  const userLayouts = useMemo(() => userInputLayouts(assets.userLayouts, assets.userRomajiRules), [assets.userLayouts, assets.userRomajiRules]);
  const search = useSearch({ from: '/input' });
  const navigate = useNavigate();
  const clearRequestedLayout = useCallback(() => {
    void navigate({ to: '/input', search: {}, replace: true });
  }, [navigate]);
  return (
    <InputConverterView
      userLayouts={userLayouts}
      userLayoutsReady={ready}
      {...(search.layout === undefined ? {} : { requestedLayoutId: search.layout })}
      onRequestedLayoutConsumed={clearRequestedLayout}
      renderShare={(selection) => <ShareControl share={{ query: () => testerShareQuery(selection), description: '選んでいる配列を開くURL' }} />}
    />
  );
}
