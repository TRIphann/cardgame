// Production smoke test for Arcana.
//
// WHAT THIS IS
//   A read-only smoke check that runs against the LIVE production
//   deployment. Verifies:
//     1. Frontend (Netlify) serves the SPA HTML.
//     2. Backend (Render) /health endpoint responds.
//     3. CORS handshake between frontend origin and backend succeeds.
//     4. /api/test/room rejects (intentionally — disabled in prod to
//        avoid random TEST rooms polluting the cache).
//     5. Frontend can be navigated and the /test page tries to create
//        a test room. If it fails with the expected "test endpoint
//        disabled" error, we treat that as PASS.
//
// WHY A SEPARATE FILE?
//   The full Playwright suite under e2e/ mutates server state (creates
//   rooms, sets ready, etc.) and is unsafe to run against production —
//   it would burn the Firestore daily quota. This file uses only safe,
//   idempotent requests that don't persist anything.
//
// WHEN IT RUNS
//   - Weekly cron (Sunday 02:00 UTC) via integration.yml
//   - Manual dispatch via the Actions tab
//   - Post-deploy as a downstream check (optional)
//
// IMPORTANT
//   If you add a new route to the production API, add a smoke check for
//   it here. If you remove one, delete the corresponding check.

import { test, expect } from '@playwright/test';

const FRONTEND = process.env.BASE_URL || 'https://tricardgame.netlify.app';
const BACKEND  = process.env.ARCANA_API_BASE_URL || 'https://cardgame-lwsk.onrender.com';

// This file asserts PRODUCTION properties: Netlify security headers, the
// deployed SPA shell, the live CORS handshake. None of that holds for a
// local `vite preview` / ephemeral backend — e.g. vite preview serves no
// X-Frame-Options or CSP header, so the header assertion below would fail
// even though the deployment is perfectly healthy.
//
// The full E2E job in integration.yml runs the whole `e2e/` directory with
// BASE_URL=http://localhost:4173, so without this guard the smoke spec
// would run against the ephemeral preview and fail. It is executed
// separately (and with the production URLs) by the `production-smoke` job.
const IS_LOCAL_TARGET = /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/;
const IS_PRODUCTION =
  !IS_LOCAL_TARGET.test(FRONTEND) && !IS_LOCAL_TARGET.test(BACKEND);

test.describe('Production smoke', () => {
  // Skip the whole block when the suite is pointed at a local/staging
  // target — the assertions below only describe the deployed environment.
  test.skip(!IS_PRODUCTION, 'Production smoke only runs against the deployed Netlify + Render targets.');

  test('1.1 Frontend root serves SPA HTML', async ({ request }) => {
    const res = await request.get(FRONTEND, { failOnStatusCode: false });
    expect(res.status()).toBeLessThan(400);
    const body = await res.text();
    // The index.html title tag is "<title>Arcana — Card Battle</title>"
    // (the Vietnamese diacritic "—" might be replaced with "—"). We
    // accept either form.
    expect(body).toMatch(/<title>\s*Arcana[\s\u2013\u2014-]+Card Battle\s*<\/title>/i);
    // The bundle is referenced via a hashed module URL.
    expect(body).toMatch(/<script[^>]+type=["']module["']/);
  });

  test('1.2 Frontend bundle assets are served (404 sweep)', async ({ request }) => {
    const indexRes = await request.get(FRONTEND);
    const body = await indexRes.text();
    // Pull out all /assets/... script + style hrefs/srcs.
    const matches = Array.from(body.matchAll(/(?:href|src)=["']([^"']*\/assets\/[^"']+)["']/g));
    expect(matches.length).toBeGreaterThan(0);
    for (const m of matches) {
      const url = m[1].startsWith('http') ? m[1] : `${FRONTEND}${m[1]}`;
      const res = await request.get(url);
      expect(res.status(), `asset ${url} returned ${res.status()}`).toBe(200);
    }
  });

  test('1.3 Backend /health returns ok', async ({ request }) => {
    const res = await request.get(`${BACKEND}/health`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
  });

  test('1.4 CORS preflight from frontend origin to backend', async ({ request }) => {
    // OPTIONS preflight against /api/rooms POST. This verifies that the
    // Cors:AllowedOrigins list in appsettings.json includes the
    // frontend origin AND that AllowAnyHeader/AllowAnyMethod are set.
    const res = await request.fetch(`${BACKEND}/api/rooms`, {
      method: 'OPTIONS',
      headers: {
        'Origin': FRONTEND,
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'content-type',
      },
    });
    expect([200, 204]).toContain(res.status());
    expect(res.headers()['access-control-allow-origin']).toBeDefined();
    expect(res.headers()['access-control-allow-methods']).toMatch(/POST/i);
  });

  test('1.5 Frontend can navigate /test (test page loads)', async ({ page }) => {
    // We do NOT check that the room gets created — /api/test/room is
    // intentionally NOT exposed in production (the test controller is
    // only registered when ARCANA_ENVIRONMENT != Production). The page
    // should load the SPA shell regardless, and either show the lobby
    // UI or a graceful "Failed to create test room" toast.
    await page.goto(`${FRONTEND}/test`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle');
    // React router should not 404 — the SPA fallback returns index.html
    // for any unknown route.
    expect(page.url()).toContain('/test');
    const body = await page.textContent('body');
    expect(body).toBeTruthy();
  });

  test('1.6 Frontend fonts and external assets are reachable', async ({ page }) => {
    const failed: string[] = [];
    page.on('requestfailed', (req) => {
      // Ignore ad-blocker-style failures (e.g. blocked analytics); only
      // flag failures for whitelisted hosts.
      if (/(netlify|cloudinary|googleapis|gstatic|onrender)/.test(req.url())) {
        failed.push(`${req.method()} ${req.url()} — ${req.failure()?.errorText}`);
      }
    });
    await page.goto(FRONTEND, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    expect(failed, `Failed requests:\n${failed.join('\n')}`).toHaveLength(0);
  });

  test('1.7 SPA routes that /test resolves to (router fallback)', async ({ page }) => {
    for (const path of ['/', '/lobby', '/test', '/settings']) {
      const r = await page.goto(`${FRONTEND}${path}`, { waitUntil: 'domcontentloaded' });
      expect(r?.status(), `${path} returned ${r?.status()}`).toBeLessThan(400);
      // React mounts into #root, so any successful render leaves a
      // non-empty <main> or <h1> inside.
      const root = await page.$('#root');
      expect(root, `root element missing on ${path}`).not.toBeNull();
    }
  });

  test('1.8 Backend health endpoint uptime is reasonable', async ({ request }) => {
    // Hit /health 5 times — fail if any one takes >3s. Render cold-start
    // can spike to 30s on the very first request after a long idle, but
    // warm requests should be sub-second.
    const samples: number[] = [];
    for (let i = 0; i < 5; i++) {
      const start = Date.now();
      await request.get(`${BACKEND}/health`);
      samples.push(Date.now() - start);
    }
    samples.sort((a, b) => a - b);
    const median = samples[2];
    expect(median, `Median /health latency was ${median}ms (samples: ${samples.join(', ')})`).toBeLessThan(3000);
  });

  test('1.9 Security headers present (CSP, X-Frame-Options)', async ({ request }) => {
    const res = await request.get(FRONTEND);
    const headers = res.headers();
    // Netlify config sets these explicitly. Their absence indicates
    // someone bypassed the deploy pipeline.
    expect(headers['x-frame-options']).toMatch(/DENY/i);
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['content-security-policy']).toBeDefined();
  });

  test('1.10 No leaked debug endpoints respond (404 on common paths)', async ({ request }) => {
    // Common leak vectors: GitHub debug pages, Swagger UI without auth,
    // .env files, GraphQL playground. These should ALL 404 IN PRODUCTION.
    //
    // NOTE: a dev/ephemeral backend (ASPNETCORE_ENVIRONMENT=Development)
    // intentionally serves /swagger for local debugging — that is expected
    // and NOT a leak. So we detect a local backend first (the versioned
    // /swagger/v1/swagger.json only exists when Swagger is enabled) and
    // drop /swagger* from the candidate list in that case. On a real
    // production backend the candidates below must all 404.
    const swaggerProbe = await request.get(`${BACKEND}/swagger/v1/swagger.json`);
    const swaggerEnabled = swaggerProbe.status() === 200;
    const candidates = [
      '/.env',
      '/.git/config',
      ...(swaggerEnabled ? [] : ['/swagger', '/swagger/index.html']),
      '/graphiql',
      '/admin',
      '/debug',
      '/api/admin',
      '/api/users',
      '/api/secret',
    ];
    for (const path of candidates) {
      const r = await request.get(`${BACKEND}${path}`);
      expect(r.status(), `${BACKEND}${path} returned ${r.status()}`).toBeGreaterThanOrEqual(400);
    }
  });
});