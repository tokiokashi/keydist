import { defineConfig, devices } from '@playwright/test';

const baseURL = 'http://127.0.0.1:4173';
const isCI = Boolean(process.env.CI);

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  workers: isCI ? 4 : undefined,
  reporter: isCI ? 'line' : 'list',
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
    command: isCI
      ? 'npm run build && npm run preview -- --host 127.0.0.1 --port 4173 --strictPort --outDir .output/public'
      : 'npm run dev -- --host 127.0.0.1 --port 4173 --strictPort',
    url: baseURL,
    reuseExistingServer: !isCI,
    timeout: isCI ? 120_000 : 60_000,
  },
});
