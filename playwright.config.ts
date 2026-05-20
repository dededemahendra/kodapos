import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  // `pnpm dev` covers the default smoke test. Auth E2E (gated by
  // RUN_AUTH_E2E) needs `pnpm convex:dev` running separately, or use
  // `pnpm dev:all` instead of starting Playwright's webServer.
  webServer: {
    command: process.env.RUN_AUTH_E2E ? 'pnpm dev:all' : 'pnpm dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
