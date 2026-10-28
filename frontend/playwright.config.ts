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
    // Env-driven so CI can point the suite at vite preview (:4173),
    // staging, or production via BASE_URL. Local default stays :5173.
    baseURL: process.env.BASE_URL || 'http://localhost:5173',
    trace: 'off',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          args: [
            // Headless Chromium throttles requestAnimationFrame when the
            // renderer is considered "backgrounded" (no visible window).
            // The FPS assertion in game-animations.spec.ts then measured
            // ~17fps instead of the real ~60fps and failed intermittently.
            // These flags keep the renderer active so the measurement is
            // meaningful and stable across runs.
            '--disable-background-timer-throttling',
            '--disable-backgrounding-occluded-windows',
            '--disable-renderer-backgrounding',
            '--disable-features=CalculateNativeWinOcclusion',
          ],
        },
      },
    },
  ],
});
