/// <reference types="vite/client" />
import {
  HeadContent,
  Link,
  Scripts,
  createRootRoute,
} from '@tanstack/react-router';
import type { ReactNode } from 'react';
import appCss from '../app.css?url';

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'keydist' },
      {
        name: 'description',
        content: 'キーボード配列の分析と実入力を試す keydist',
      },
    ],
    links: [{ rel: 'stylesheet', href: appCss }],
  }),
  shellComponent: RootDocument,
});

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="ja">
      <head>
        <HeadContent />
      </head>
      <body>
        <header className="app-header">
          <Link className="brand" to="/">keydist</Link>
          <nav aria-label="主要ナビゲーション">
            <Link to="/analyzer" activeProps={{ 'aria-current': 'page' }}>
              Analyzer
            </Link>
            <Link to="/input" activeProps={{ 'aria-current': 'page' }}>
              Tester
            </Link>
            <Link to="/flow" activeProps={{ 'aria-current': 'page' }}>
              Flow
            </Link>
          </nav>
        </header>
        <main className="app-shell">{children}</main>
        <Scripts />
      </body>
    </html>
  );
}
