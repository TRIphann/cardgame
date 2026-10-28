import { expect, Page } from '@playwright/test';

// Shared helpers for specs that need a REAL started game (3 players, cards
// dealt) opened in the browser as the host.

const WEB_URL = process.env.BASE_URL || 'http://localhost:5173';
const API_URL = process.env.ARCANA_API_BASE_URL || 'http://localhost:5000';

async function postJson(path: string, body: unknown) {
  const res = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  // Some endpoints (heartbeat, start) answer with an empty body.
  const text = await res.text();
  return { ok: res.ok, status: res.status, data: text ? JSON.parse(text) : {} };
}

export interface StartedGame {
  id: string;
  code: string;
  hostId: string;
  hostName: string;
}

export async function createStartedGame(hostName: string): Promise<StartedGame> {
  const created = await postJson('/api/rooms', { hostName });
  expect(created.ok, `create room failed: ${created.status}`).toBeTruthy();
  const room = created.data;

  for (const playerName of ['Bob', 'Carol']) {
    const joined = await postJson('/api/rooms/join', { code: room.code, playerName });
    expect(joined.ok, `join ${playerName} failed: ${joined.status}`).toBeTruthy();
  }
  await postJson(`/api/rooms/${room.id}/heartbeat`, { memberId: room.hostId });

  const started = await postJson(`/api/rooms/${room.id}/start`, { hostId: room.hostId });
  expect(started.ok, `start failed: ${started.status}`).toBeTruthy();

  return { id: room.id, code: room.code, hostId: room.hostId, hostName: room.hostName };
}

export async function openGameAsHost(page: Page, game: StartedGame) {
  await page.goto(WEB_URL);
  await page.evaluate((g) => {
    sessionStorage.setItem('arcana.session.v1', JSON.stringify({
      roomId: g.id, playerId: g.hostId, memberId: g.hostId,
      playerName: g.hostName, hostName: g.hostName,
      roomCode: g.code, isHost: true, stage: 'game',
    }));
  }, game);
  await page.goto(`${WEB_URL}/game/${game.id}`);
  await expect(page.locator('.hand-card').first()).toBeVisible({ timeout: 15_000 });
}

// The "Bạn sẽ đi thứ X" intro is a modal overlay that sits on top of the
// whole table. A real player dismisses it with "Sẵn sàng"; do the same so
// later clicks/hovers are not intercepted by the overlay.
export async function dismissTurnIntro(page: Page) {
  const button = page.locator('.turn-intro__btn');
  if (await button.isVisible().catch(() => false)) {
    await button.click();
  }
  await expect(page.locator('.turn-intro-overlay')).toHaveCount(0, { timeout: 5_000 });
}
