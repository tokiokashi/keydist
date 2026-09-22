import { defineConfig, devices } from '@playwright/test';

const baseURL = 'http://127.0.0.1:4174/keydist/';

export default defineConfig({
  testDir: './e2e',
  testMatch: ['legacy-analyzer.spec.ts'],
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI ? 'line' : 'list',
  use: {
    baseURL,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'KEYDIST_BASE_PATH=/keydist/ npx vite preview --config vite.legacy.config.ts --host 127.0.0.1 --port 4174',
    url: `${baseURL}legacy.html`,
    reuseExistingServer: !process.env.CI,
  },
});
