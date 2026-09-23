import { defineConfig, devices } from '@playwright/test';

const baseURL = 'http://127.0.0.1:4173';

export default defineConfig({
  testDir: './e2e',
  testIgnore: ['legacy-analyzer.spec.ts'],
  fullyParallel: true,
  workers: process.env.CI ? 4 : undefined,
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
  webServer: [
    {
      command: 'npm run dev -- --host 127.0.0.1 --port 4173',
      url: baseURL,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'npx vite --config vite.legacy.config.ts --host 127.0.0.1 --port 4175',
      url: 'http://127.0.0.1:4175/legacy.html',
      reuseExistingServer: !process.env.CI,
    },
  ],
});
