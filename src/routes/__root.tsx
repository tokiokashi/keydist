/// <reference types="vite/client" />
import {
  HeadContent,
  Scripts,
  createRootRoute,
  useRouterState,
} from '@tanstack/react-router';
import { useLayoutEffect, type ReactNode } from 'react';
import { getAppearanceSnapshot } from '#app/theme/appearance.ts';
import { applyTheme, THEME_BOOTSTRAP_SCRIPT } from '#app/theme/theme.ts';
import { AppShell } from '#app/shell/AppShell.tsx';
import { SIDEBAR_BOOTSTRAP_SCRIPT } from '#app/shell/sidebar-preference.ts';
import '#app/shell/route-layout.ts';
import appCss from '#app/app.css?url';

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'keydist' },
      {
        name: 'description',
        content: 'キーボードの配列を、文章を打った時の指の移動距離で調べたり、実際に打って試したりできるツール',
      },
    ],
    links: [{ rel: 'stylesheet', href: appCss }],
  }),
  shellComponent: RootDocument,
});

function AppearanceAuthority() {
  // hydrationが失敗してReactが<html>を作り直すと、bootstrapが付けたdata-themeが消える。
  // paint前に付け直すためuseLayoutEffectで適用する。
  useLayoutEffect(() => {
    // getAppearanceSnapshotがstore初期化（loadAppearancePreferenceによるmigration含む）を担う。
    // 他のtheme控件（AnalyzerThemeControls等）と同じstoreを共有するため、ここでも
    // 個別にstorageを読まずstore経由で取得する。
    applyTheme(getAppearanceSnapshot());
  }, []);
  return null;
}

function RootDocument({ children }: { children: ReactNode }) {
  // pathnameの文字列比較だと、GitHub Pagesが付ける末尾スラッシュ（/analyzer/）で外れ、
  // prerender済みHTMLとの不一致でhydrationが失敗する。matchしたrouteの宣言で判定する。
  const layout = useRouterState({
    select: (state): 'bare' | 'context-bar' | 'plain' => {
      if (state.matches.some((match) => match.staticData.shell === 'none')) return 'bare';
      return state.matches.some((match) => match.staticData.contextBar === true) ? 'context-bar' : 'plain';
    },
  });

  return (
    <html lang="ja" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP_SCRIPT }} />
        <script dangerouslySetInnerHTML={{ __html: SIDEBAR_BOOTSTRAP_SCRIPT }} />
        <HeadContent />
      </head>
      <body>
        <AppearanceAuthority />
        {layout === 'bare' ? (
          <main className="app-shell analyzer-route-shell">{children}</main>
        ) : (
          <AppShell hasContextBar={layout === 'context-bar'}>{children}</AppShell>
        )}
        <Scripts />
      </body>
    </html>
  );
}
