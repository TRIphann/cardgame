import { test, expect, Page } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────
//  Regression: lobby must never stay stuck on "••••••" with a disabled
//  copy button (prod incident 28/10).
//
//  Root causes covered here:
//    (a) the failure rollback routed through the landing onNavigate handler,
//        which navigates to /lobby unconditionally → dead /lobby, no way out;
//    (b) concurrent PENDING session writes could clobber the REAL session
//        patch → session kept the placeholder roomId forever.
//
//  Fix: the session patch queue (config/env.js) serialises every write, and
//  the rollback uses the router directly (hooks/useOptimisticRoom.js).
// ─────────────────────────────────────────────────────────────────────

const WEB_URL = process.env.BASE_URL || 'http://localhost:5173';
const API_URL = process.env.ARCANA_API_BASE_URL || 'http://localhost:5000';

// `import('/src/...')` only resolves on the Vite DEV server. CI serves the
// production bundle (`vite preview`), where /src/* falls back to index.html
// and the dynamic import fails. The dev server exposes /@vite/client as JS;
// the preview server answers it with the SPA HTML fallback.
async function isViteDevServer(): Promise<boolean> {
  try {
    const res = await fetch(`${WEB_URL}/@vite/client`);
    return (res.headers.get('content-type') || '').includes('javascript');
  } catch {
    return false;
  }
}

// Exactly what config/env.js `emitSessionChange` does after it writes the
// session: persist to sessionStorage, then fire the in-tab `arcana:session`
// event the React SessionProvider listens to. Works on any build.
async function emitSessionPatch(page: Page, patch: Record<string, unknown>) {
  await page.evaluate((p) => {
    const key = 'arcana.session.v1';
    const current = JSON.parse(sessionStorage.getItem(key) || '{}');
    const next = { ...current, ...p };
    sessionStorage.setItem(key, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent('arcana:session', { detail: next }));
  }, patch);
}

async function seedSession(page: Page, session: Record<string, unknown>) {
  await page.goto(WEB_URL);
  await page.evaluate((s) => {
    sessionStorage.setItem('arcana.session.v1', JSON.stringify(s));
  }, session);
}

test.describe('Lobby code reveal — session queue regression', () => {
  test('1.1 Eye toggle reveals a real 6-char room code', async ({ page }) => {
    const res = await fetch(`${API_URL}/api/rooms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hostName: 'QueueHost' }),
    });
    expect(res.ok).toBeTruthy();
    const room = await res.json();

    await seedSession(page, {
      roomId: room.id,
      playerId: room.hostId,
      memberId: room.hostId,
      playerName: room.hostName,
      hostName: room.hostName,
      roomCode: room.code,
      isHost: true,
      stage: 'lobby',
    });
    await page.goto(`${WEB_URL}/lobby`);
    await page.waitForLoadState('networkidle');

    // The eye starts closed → masked.
    const codeEl = page.locator('#invite-code');
    await expect(codeEl).toBeVisible({ timeout: 10_000 });
    await expect(codeEl).toHaveText('••••••');

    // Open the eye → the REAL code appears (this is what was broken).
    await page.locator('.code-visibility').click();
    await expect(codeEl).toHaveText(room.code, { timeout: 10_000 });

    // Copy button must be enabled once a real code is present.
    await expect(page.locator('.copy-button')).toBeEnabled({ timeout: 10_000 });
  });

  test('1.2 A PENDING session shows the warming-up state, not a fake code', async ({ page }) => {
    // Simulate the optimistic in-flight state (cold start not yet resolved).
    await seedSession(page, {
      roomId: 'PENDING-1700000000000',
      playerId: 'PENDING-me',
      memberId: 'PENDING-me',
      playerName: 'ColdStart',
      hostName: 'ColdStart',
      roomCode: '',
      isHost: true,
      stage: 'lobby',
    });
    await page.goto(`${WEB_URL}/lobby`);
    await page.waitForLoadState('networkidle');

    // The lobby must announce the pending state…
    await expect(page.locator('.lobby-header h1')).toContainText('Đang khởi tạo phòng', {
      timeout: 10_000,
    });

    // …and must NEVER render a bogus code while waiting.
    const codeEl = page.locator('#invite-code');
    await expect(codeEl).toHaveText('••••••');
    // The copy button stays disabled while there is no real code.
    await expect(page.locator('.copy-button')).toBeDisabled();
  });

  test('1.3 Session patch queue: last write wins in arrival order', async ({ page }) => {
    // Needs the raw ES module, which only the dev server serves. The same
    // ordering guarantee is covered in src/__tests__/env.test.js (vitest).
    test.skip(!(await isViteDevServer()), 'requires Vite dev server (module import from /src)');
    await page.goto(WEB_URL);

    // Queue three patches in the same tick — exactly what a double-click
    // produces. The last one (the REAL room) must be the one that sticks.
    const result = await page.evaluate(async () => {
      const mod = await import('/src/config/env.js');
      mod.saveSession({ roomId: 'PENDING-1', roomCode: '', stage: 'lobby' });
      mod.queueSessionPatch({ roomId: 'PENDING-2', roomCode: '' });
      mod.queueSessionPatch({ roomId: 'PENDING-3', roomCode: '' });
      mod.queueSessionPatch({ roomId: 'real-id', roomCode: 'ABC123' });
      await new Promise((r) => setTimeout(r, 50));
      return JSON.parse(sessionStorage.getItem('arcana.session.v1') || 'null');
    });

    expect(result?.roomId).toBe('real-id');
    expect(result?.roomCode).toBe('ABC123');
  });
});

test.describe('Lobby pending → real session handover', () => {
  test('2.1 Patching a pending session with the real room wakes the lobby up', async ({ page }) => {
    const res = await fetch(`${API_URL}/api/rooms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hostName: 'WakeHost' }),
    });
    expect(res.ok).toBeTruthy();
    const room = await res.json();

    // Start in the pending state, exactly like the optimistic cold-start.
    await seedSession(page, {
      roomId: 'PENDING-1700000000001',
      playerId: 'PENDING-me',
      memberId: 'PENDING-me',
      playerName: 'WakeHost',
      hostName: 'WakeHost',
      roomCode: '',
      isHost: true,
      stage: 'lobby',
    });
    await page.goto(`${WEB_URL}/lobby`);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('.lobby-header h1')).toContainText('Đang khởi tạo phòng', {
      timeout: 10_000,
    });

    // The real room arrives → the queued patch lands → the lobby leaves the
    // pending state and renders the real code.
    await emitSessionPatch(page, {
      roomId: room.id,
      roomCode: room.code,
      playerId: room.hostId,
      memberId: room.hostId,
      playerName: room.hostName,
      isHost: true,
      stage: 'lobby',
    });

    // The lobby must now show the real code once the eye is opened.
    await page.locator('.code-visibility').click();
    await expect(page.locator('#invite-code')).toHaveText(room.code, { timeout: 15_000 });
  });
});
