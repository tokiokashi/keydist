import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import viteReact from '@vitejs/plugin-react';
import { nitro } from 'nitro/vite';
import { defineConfig } from 'vite';

const base = process.env.KEYDIST_BASE_PATH
  ?? (process.env.GITHUB_ACTIONS ? '/keydist/' : '/');

export default defineConfig({
  base,
  plugins: [
    tanstackStart({
      srcDirectory: 'src',
      prerender: {
        enabled: true,
        autoStaticPathsDiscovery: true,
        crawlLinks: true,
        failOnError: true,
      },
    }),
    viteReact(),
    nitro(),
  ],
  build: { target: 'es2022' },
});
