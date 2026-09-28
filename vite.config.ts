import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import viteReact from '@vitejs/plugin-react';
import { nitro } from 'nitro/vite';
import { defineConfig, type Plugin } from 'vite';

const base = process.env.KEYDIST_BASE_PATH ?? '/';

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

export default defineConfig({
  base,
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
    tanstackStart({
      srcDirectory: 'src',
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
