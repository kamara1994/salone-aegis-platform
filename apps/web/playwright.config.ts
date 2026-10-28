import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests run against the simulated lab (NEXT_PUBLIC_API_MODE=mock), so they need no back end.
 * Set PW_CHROMIUM_PATH to use a Chromium you already have instead of `npx playwright install chromium`.
 */
const executablePath = process.env.PW_CHROMIUM_PATH;

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 120_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:3100',
    viewport: { width: 1600, height: 950 },
    actionTimeout: 10_000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    ...(executablePath ? { launchOptions: { executablePath, args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'] } } : {}),
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1600, height: 950 } }, testIgnore: /mobile\.spec\.ts/ },
    { name: 'phone', use: { ...devices['Pixel 7'] }, testMatch: /mobile\.spec\.ts/ },
  ],
  webServer: {
    command: 'npm run build && npx next start -p 3100',
    url: 'http://localhost:3100',
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
    env: { NEXT_PUBLIC_API_MODE: 'mock' },
  },
});
