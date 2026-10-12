import { defineConfig, devices } from '@playwright/test';

/**
 * E2E runs against the production server built with test hooks (docs/v2/10-quality.md).
 * Two origins: localhost (secure context) and butor.test (plain http, NOT a secure context, like a LAN address)
 * so APIs that only exist in secure contexts are caught.
 */
const PORT = 4173;
const webgl = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const chrome = process.env.CI ? {} : { channel: 'chrome' as const };

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: { trace: 'retain-on-failure', viewport: { width: 1400, height: 850 } },
  webServer: {
    command: `npm run build:test && PORT=${PORT} npm start`,
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
  projects: [
    {
      name: 'localhost',
      use: {
        ...devices['Desktop Chrome'],
        ...chrome,
        baseURL: `http://localhost:${PORT}`,
        launchOptions: { args: webgl },
      },
    },
    {
      name: 'lan-http',
      use: {
        ...devices['Desktop Chrome'],
        ...chrome,
        baseURL: `http://butor.test:${PORT}`,
        launchOptions: { args: [...webgl, '--host-resolver-rules=MAP butor.test 127.0.0.1'] },
      },
    },
  ],
});
