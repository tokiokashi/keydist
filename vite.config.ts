import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import viteReact from '@vitejs/plugin-react';
import { nitro } from 'nitro/vite';
import { readFileSync, realpathSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';

const base = process.env.KEYDIST_BASE_PATH ?? '/';

// サイドバーの版表示に使う。版番号の正は package.json の version（CONTRIBUTING.md「公開」）。
const packageVersion = (JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }).version;

function legacyAnalyzerRedirect(): Plugin {
  const prefix = base === '/' ? '' : base.replace(/\/$/, '');
  return {
    name: 'keydist-legacy-analyzer-redirect',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const [pathname, query] = (req.url ?? '').split('?', 2);
        if (pathname !== `${prefix}/legacy.html`) {
          next();
          return;
        }
        res.statusCode = 302;
        res.setHeader(
          'Location',
          `${prefix}/analyzer${query ? `?${query}` : ''}`,
        );
        res.end();
      });
    },
  };
}

// e2eの `globalSetup` が、ポートの先で動いているdev serverが自分のworktreeのものかを確かめるために使う。
// `/@fs` の200/403は包含関係（祖先のserverも200を返す）しか見られないので、serverのルートそのものを返す。
// `apply: 'serve'` なので、ビルドとpreviewには入らない。
function e2eRootProbe(): Plugin {
  return {
    name: 'keydist-e2e-root-probe',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__e2e-root', (req, res, next) => {
        if (req.method !== 'GET') {
          next();
          return;
        }
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.end(realpathSync(server.config.root));
      });
    },
  };
}

export default defineConfig({
  base,
  define: {
    __KEYDIST_VERSION__: JSON.stringify(packageVersion),
  },
  server: {
    warmup: {
      clientFiles: [
        './src/legacy/analyzer-page.tsx',
        './src/legacy/main.ts',
        './src/legacy/analyzer-react-shell.tsx',
      ],
    },
  },
  plugins: [
    legacyAnalyzerRedirect(),
    e2eRootProbe(),
    tanstackStart({
      srcDirectory: 'src',
      // 保存したWorkspaceのURL（/workspace/<id>）はidがビルド時に分からず、URLごとのHTMLを作れない。
      // ブラウザで描く枠として `/workspace/_` だけをビルドし、静的配信の404.htmlへ複製する
      // （scripts/write-workspace-fallback.ts）
      pages: [{ path: '/workspace/_' }],
      prerender: {
        enabled: true,
        autoStaticPathsDiscovery: true,
        crawlLinks: false,
        failOnError: true,
      },
    }),
    viteReact(),
    nitro(),
  ],
  build: { target: 'es2022' },
});
