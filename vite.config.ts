import { defineConfig } from 'vite';

export default defineConfig({
  // GitHub Pages は https://tokiokashi.github.io/keydist/ に配信される
  base: '/keydist/',
  build: { target: 'es2022' },
});
