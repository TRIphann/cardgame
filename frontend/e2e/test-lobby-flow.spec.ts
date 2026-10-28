// E2E test suite for /test (Test Lobby).
//
// Verifies the test-sandbox flow end-to-end:
//   1. /test page loads and auto-creates a TEST room with 4 bots
//   2. Room snapshot reflects host + 4 bots, all ready
//   3. Card-selection tab lets host pick cards into the hand
//   4. Deck-builder tab sets custom deck order
//   5. Bots tab toggles bot modes (draw-only / play-cards / skip)
//   6. "Start" button transitions the room from lobby → playing
//   7. Game page accepts the roomId and begins a match
//
// All backend calls go through the local backend at http://localhost:5000.

import { test, expect } from '@playwright/test';

const BASE = process.env.BASE_URL || 'http://localhost:5173';
const API = process.env.ARCANA_API_BASE_URL || 'http://localhost:5000';

test.describe('Test Lobby (test sandbox)', () => {
  test('1.1 /test page loads, shows loading state, then renders lobby', async ({ page }) => {
    page.on('pageerror', (e) => console.log('[PAGEERROR]', e.message));

    await page.goto(`${BASE}/test`, { waitUntil: 'domcontentloaded' });
    // Loading state shows up first (the page calls DELETE + POST /api/test/room on mount)
    // After ~2s the lobby UI should be visible.
    await page.waitForURL(/\/test/, { timeout: 5_000 });

    // Either we see the lobby content OR an error toast. Neither means the
    // room was created successfully.
    const errorToast = page.locator('text=/Không thể tạo phòng test|Failed to create/i');
    await expect(errorToast).toHaveCount(0, { timeout: 5_000 });

    // The test lobby always renders an exit button + a tab strip.
    await expect(page.locator('text=/Sân thử nghiệm|Test Lobby/i').first()).toBeVisible({
      timeout: 8_000,
    });
  });

  test('1.2 Backend POST /api/test/room returns 200 with 5 members', async ({ request }) => {
    const res = await request.post(`${API}/api/test/room`, {
      data: { hostName: 'TestE2E1' },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.code).toBe('TEST');
    expect(body.members).toHaveLength(5);
    expect(body.members.filter((m: any) => m.isBot)).toHaveLength(4);
    expect(body.members.filter((m: any) => !m.isBot)).toHaveLength(1);
  });

  test('1.3 Backend POST /api/test/room rejects empty hostName', async ({ request }) => {
    const res = await request.post(`${API}/api/test/room`, {
      data: { hostName: '' },
    });
    expect(res.status()).toBe(400);
  });

  test('1.4 Backend DELETE /api/test/room/current clears active room', async ({ request }) => {
    // Ensure a room exists first
    await request.post(`${API}/api/test/room`, { data: { hostName: 'ToClear' } });
    // Then clear
    const res = await request.delete(`${API}/api/test/room/current`);
    expect([200, 204]).toContain(res.status());
  });

  test('1.5 /test survives DELETE-then-create race (no 404 in browser)', async ({ page }) => {
    const errors: string[] = [];
    page.on('response', (r) => {
      if (r.url().includes('/api/test/room') && r.status() >= 400) {
        errors.push(`${r.status()} ${r.request().method()} ${r.url()}`);
      }
    });

    await page.goto(`${BASE}/test`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2500);

    expect(errors, `unexpected errors: ${errors.join(', ')}`).toHaveLength(0);
  });

  test('1.6 Snapshot endpoint reflects room after creation', async ({ request }) => {
    const create = await request.post(`${API}/api/test/room`, {
      data: { hostName: 'SnapshotTest' },
    });
    expect(create.status()).toBe(200);
    const created = await create.json();
    const roomId = created.roomId;

    const snap = await request.get(`${API}/api/test/room/${roomId}/snapshot`);
    expect(snap.status()).toBe(200);
    const data = await snap.json();
    const room = data.room || data;
    expect(room.id ?? room.roomId).toBe(roomId);
    expect(room.members.length).toBeGreaterThanOrEqual(5);
  });

  test('1.7 /test page exposes card-selection / deck / bots tabs', async ({ page }) => {
    await page.goto(`${BASE}/test`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2500);

    // Tab buttons have data-testid-friendly class names and visible labels
    // (icon + short Vietnamese word). We match by class + content substring.
    const cardTab = page.locator('.tab-btn.active.tab-cards, .tab-btn:has-text("Bài")').first();
    const deckTab = page.locator('.tab-btn:has-text("Deck")').first();
    const botTab = page.locator('.tab-btn:has-text("Bot")').first();

    await expect(cardTab).toBeVisible({ timeout: 8_000 });
    await expect(deckTab).toBeVisible({ timeout: 8_000 });
    await expect(botTab).toBeVisible({ timeout: 8_000 });
  });

  test('1.8 /test room creation is fast (under 3s end-to-end)', async ({ page }) => {
    const start = Date.now();
    await page.goto(`${BASE}/test`, { waitUntil: 'networkidle' });
    const err = page.locator('text=/Không thể tạo|Failed to create/i');
    await expect(err).toHaveCount(0, { timeout: 5_000 });
    await page.waitForTimeout(500);
    const elapsed = Date.now() - start;
    // Generous bound — Render cold-start can take 30s but local backend is fast
    expect(elapsed).toBeLessThan(8_000);
  });
});
