import { readFile } from 'node:fs/promises';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import viteReact from '@vitejs/plugin-react';
import { nitro } from 'nitro/vite';
import { defineConfig, type Plugin, type ViteDevServer } from 'vite';

const base = process.env.KEYDIST_BASE_PATH ?? '/';

function legacyAnalyzerDevEntry(): Plugin {
  return {
    name: 'keydist-legacy-analyzer-dev-entry',
    enforce: 'pre' as const,
    configureServer(server: ViteDevServer) {{
      server.middlewares.use(async (req, res, next) => {
        const url = req.url?.split('?')[0];
        if (url !== '/legacy.html') {
          next();
          return;
        }
        try {
          const source = await readFile(new URL('./legacy.html', import.meta.url), 'utf8');
          const html = await server.transformIndexHtml(req.url ?? '/legacy.html', source);
          res.statusCode = 200;
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          res.end(html);
        } catch (error) {
          next(error);
        }
      });
    },
  };
}

export default defineConfig({
  base,
  plugins: [
    legacyAnalyzerDevEntry(),
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
