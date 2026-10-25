import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  // Generous default so cold test-room creation (DELETE + POST + snapshot
  // round-trip) has time to complete. The local backend is normally fast,
  // but Render cold-start or a slow CI runner can stretch the first test
  // well beyond 30s.
  timeout: 90_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 1,  // retry once on flake — the /test lobby DELETE-then-POST race is known to be timing-sensitive
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'off',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
