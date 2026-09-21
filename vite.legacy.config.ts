import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const root = fileURLToPath(new URL('.', import.meta.url));
const base = process.env.KEYDIST_BASE_PATH
  ?? (process.env.GITHUB_ACTIONS ? '/keydist/' : '/');

export default defineConfig({
  base,
  build: {
    target: 'es2022',
    outDir: '.output/public',
    emptyOutDir: false,
    rollupOptions: {
      input: resolve(root, 'legacy.html'),
    },
  },
});
