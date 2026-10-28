import { test, expect } from '@playwright/test';
import { createStartedGame, openGameAsHost, dismissTurnIntro } from './helpers/game';

// Helper: create a room via API (faster than driving the landing form for setup)
async function createRoom(apiUrl: string, hostName: string) {
  const res = await fetch(`${apiUrl}/api/rooms`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hostName }),
  });
  if (!res.ok) throw new Error(`createRoom failed: ${res.status}`);
  return res.json();
}

async function joinRoom(apiUrl: string, code: string, playerName: string) {
  const res = await fetch(`${apiUrl}/api/rooms/join`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, playerName }),
  });
  if (!res.ok) throw new Error(`joinRoom failed: ${res.status}`);
  return res.json();
}

async function heartbeat(apiUrl: string, roomId: string, memberId: string) {
  await fetch(`${apiUrl}/api/rooms/${roomId}/heartbeat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ memberId }),
  });
}

async function setReady(apiUrl: string, roomId: string, memberId: string, isReady: boolean) {
  await fetch(`${apiUrl}/api/rooms/${roomId}/ready`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ memberId, isReady }),
  });
}

const API_URL = process.env.ARCANA_API_BASE_URL || 'http://localhost:5000';
const WEB_URL = process.env.BASE_URL || 'http://localhost:5173';

// ─────────────────────────────────────────────────────────────────────
//  Test 1: Landing page → Create room → Lobby page (normal flow)
// ─────────────────────────────────────────────────────────────────────
test.describe('Normal game flow - landing + lobby', () => {
  test('1.1 Landing form: create room navigates to /lobby', async ({ page }) => {
    await page.goto(WEB_URL);
    await page.waitForLoadState('networkidle');

    // Fill in player name
    await page.fill('#player-name', 'Alice');
    // Click Create
    await page.click('#create-button');

    // Should navigate to /lobby
    await page.waitForURL(/\/lobby/, { timeout: 10_000 });
    expect(page.url()).toContain('/lobby');
  });

  test('1.2 Lobby page: shows invite code, seats, start button (host)', async ({ page }) => {
    // Set up a 3-player room so the start button becomes enabled.
    const room = await createRoom(API_URL, 'Bob');
    const join2 = await joinRoom(API_URL, room.code, 'Player2');
    const join3 = await joinRoom(API_URL, room.code, 'Player3');
    await heartbeat(API_URL, room.id, room.hostId);
    // Mark all members ready (host + joiners). The LobbyPage shows the
    // start button only when all OTHER players are ready.
    await setReady(API_URL, room.id, room.hostId, true);
    await setReady(API_URL, room.id, join2.members.find((m: any) => m.name === 'Player2').id, true);
    await setReady(API_URL, room.id, join3.members.find((m: any) => m.name === 'Player3').id, true);
    await heartbeat(API_URL, room.id, room.hostId);

    await page.goto(WEB_URL);
    await page.evaluate((r) => {
      sessionStorage.setItem('arcana.session.v1', JSON.stringify({
        roomId: r.id,
        playerId: r.hostId,
        memberId: r.hostId,
        playerName: r.hostName,
        hostName: r.hostName,
        roomCode: r.code,
        isHost: true,
        stage: 'lobby',
      }));
    }, room);

    await page.goto(`${WEB_URL}/lobby`);
    await page.waitForLoadState('networkidle');

    // The lobby polls the snapshot endpoint — give the React tree one full
    // tick to render the invite code + seats + start button.
    await page.waitForFunction(() => {
      const code = document.getElementById('invite-code');
      const seats = document.querySelector('.seats');
      return !!code && !!seats;
    }, { timeout: 10_000 });

    // The lobby should render the invite code container
    await expect(page.locator('#invite-code')).toBeVisible({ timeout: 5_000 });
    // The seats section is the main stage
    await expect(page.locator('.seats').first()).toBeVisible();
    // Start button is visible for the host (3+ players + all ready)
    await expect(page.locator('.start-button')).toBeVisible({ timeout: 10_000 });
    // Footer shows player count
    await expect(page.locator('.player-count')).toBeVisible();
  });

  test('1.3 Lobby code reveal: clicking the eye shows/hides the code', async ({ page }) => {
    const room = await createRoom(API_URL, 'Charlie');
    await page.goto(WEB_URL);
    await page.evaluate((r) => {
      sessionStorage.setItem('arcana.session.v1', JSON.stringify({
        roomId: r.id,
        playerId: r.hostId,
        memberId: r.hostId,
        playerName: r.hostName,
        hostName: r.hostName,
        roomCode: r.code,
        isHost: true,
        stage: 'lobby',
      }));
    }, room);
    await page.goto(`${WEB_URL}/lobby`);
    await page.waitForLoadState('networkidle');

    const code = room.code;
    // The code element exists but its visible state depends on the eye toggle.
    const codeEl = page.locator('#invite-code');
    await expect(codeEl).toBeVisible();
    // Click the visibility toggle
    await page.locator('.code-visibility').click();
    // After clicking, the REAL code must be revealed (this used to stay
    // masked forever when the session patch was clobbered).
    await expect(codeEl).toHaveText(code, { timeout: 10_000 });
  });
});

// ─────────────────────────────────────────────────────────────────────
//  Test 2: Multi-window — host + 2 joiners see the same room
// ─────────────────────────────────────────────────────────────────────
test.describe('Normal game flow - multiplayer UI', () => {
  test('2.1 Host creates + 2 joiners: all 3 see the lobby', async ({ browser }) => {
    // Set up the room via API
    const room = await createRoom(API_URL, 'Host1');
    const join2 = await joinRoom(API_URL, room.code, 'Player2');
    const join3 = await joinRoom(API_URL, room.code, 'Player3');
    await heartbeat(API_URL, room.id, room.hostId);
    // Mark everyone ready so the host's start button becomes enabled.
    await setReady(API_URL, room.id, room.hostId, true);
    await setReady(API_URL, room.id, join2.members.find((m: any) => m.name === 'Player2').id, true);
    await setReady(API_URL, room.id, join3.members.find((m: any) => m.name === 'Player3').id, true);
    await heartbeat(API_URL, room.id, room.hostId);

    const ctx1 = await browser.newContext();
    const ctx2 = await browser.newContext();
    const ctx3 = await browser.newContext();
    const hostPage = await ctx1.newPage();
    const p2Page = await ctx2.newPage();
    const p3Page = await ctx3.newPage();

    try {
      // Seed each tab's session and navigate to /lobby
      await hostPage.goto(WEB_URL);
      await hostPage.evaluate((r) => {
        sessionStorage.setItem('arcana.session.v1', JSON.stringify({
          roomId: r.id, playerId: r.hostId, memberId: r.hostId, playerName: r.hostName, hostName: r.hostName, roomCode: r.code, isHost: true, stage: 'lobby',
        }));
      }, room);
      await hostPage.goto(`${WEB_URL}/lobby`);
      await hostPage.waitForLoadState('networkidle');

      // After joiners have a memberId, seed their sessions.
      const snap = await (await fetch(`${API_URL}/api/rooms/${room.id}/snapshot`)).json();
      const member2 = snap.members.find((m: any) => m.name === 'Player2');
      const member3 = snap.members.find((m: any) => m.name === 'Player3');

      await p2Page.goto(WEB_URL);
      await p2Page.evaluate(({ r, m }) => {
        sessionStorage.setItem('arcana.session.v1', JSON.stringify({
          roomId: r.id, playerId: m.id, memberId: m.id, playerName: m.name, hostName: r.hostName, roomCode: r.code, isHost: false, stage: 'lobby',
        }));
      }, { r: room, m: member2 });
      await p2Page.goto(`${WEB_URL}/lobby`);
      await p2Page.waitForLoadState('networkidle');

      await p3Page.goto(WEB_URL);
      await p3Page.evaluate(({ r, m }) => {
        sessionStorage.setItem('arcana.session.v1', JSON.stringify({
          roomId: r.id, playerId: m.id, memberId: m.id, playerName: m.name, hostName: r.hostName, roomCode: r.code, isHost: false, stage: 'lobby',
        }));
      }, { r: room, m: member3 });
      await p3Page.goto(`${WEB_URL}/lobby`);
      await p3Page.waitForLoadState('networkidle');

      // Each lobby tab should show the invite code + start button (host only).
      await expect(hostPage.locator('#invite-code')).toBeVisible({ timeout: 5_000 });
      await expect(p2Page.locator('#invite-code')).toBeVisible({ timeout: 5_000 });
      await expect(p3Page.locator('#invite-code')).toBeVisible({ timeout: 5_000 });

      // The host sees the start button; non-hosts do not.
      await expect(hostPage.locator('.start-button')).toBeVisible({ timeout: 8_000 });
      // The two joiners may or may not see the start button depending on
      // role-based rendering; just confirm the lobby rendered.
      await expect(p2Page.locator('.lobby-page')).toBeVisible();
      await expect(p3Page.locator('.lobby-page')).toBeVisible();
    } finally {
      await ctx1.close();
      await ctx2.close();
      await ctx3.close();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────
//  Test 3: Game page renders correctly when navigated to
// ─────────────────────────────────────────────────────────────────────
test.describe('Normal game flow - game page', () => {
  // The game page fetches its snapshot over plain HTTP on mount (see the
  // "Direct snapshot fetch" effect in GamePage.jsx), so it renders fine in
  // CI without a SignalR hub. These tests used to be skipped on the wrong
  // assumption that it could not.
  test('3.1 Game page: deck, hand, opponents render', async ({ page }) => {
    const game = await createStartedGame('GameHost');
    await openGameAsHost(page, game);

    await expect(page).toHaveURL(/\/game\//);
    await expect(page.locator('.deck-pile').first()).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('.hand-arc').first()).toBeVisible({ timeout: 5_000 });
    // 3 players, 5 cards each is dealt to the host in a normal game.
    expect(await page.locator('.hand-card').count()).toBeGreaterThanOrEqual(1);
    // Two opponents (Bob, Carol) are seated around the table.
    await expect(page.locator('.game-seat')).toHaveCount(2, { timeout: 5_000 });
  });

  test('3.2 Game page: hand cards have hover effect', async ({ page }) => {
    const game = await createStartedGame('HoverHost');
    await openGameAsHost(page, game);
    // The "Bạn sẽ đi thứ X" overlay covers the table until dismissed, and
    // would intercept the hover exactly like it blocks a real player.
    await dismissTurnIntro(page);

    const firstCard = page.locator('.hand-card').first();
    await expect(firstCard).toBeVisible();
    // Let the mount fan-in animation settle so we compare steady states.
    await expect(firstCard).not.toHaveClass(/hand-card--hovered/);
    const before = await firstCard.evaluate((el) => window.getComputedStyle(el).transform);

    await firstCard.hover();
    await expect(firstCard).toHaveClass(/hand-card--hovered/, { timeout: 3_000 });
    await expect
      .poll(() => firstCard.evaluate((el) => window.getComputedStyle(el).transform), { timeout: 3_000 })
      .not.toEqual(before);
  });
});

// ─────────────────────────────────────────────────────────────────────
//  Test 4: Landing page validation
// ─────────────────────────────────────────────────────────────────────
test.describe('Normal game flow - landing validation', () => {
  test('4.1 Empty name: cannot create or join', async ({ page }) => {
    await page.goto(WEB_URL);
    await page.waitForLoadState('networkidle');

    // Try to submit with empty name
    await page.click('#create-button').catch(() => {});
    // Should NOT navigate to /lobby
    await page.waitForTimeout(500);
    expect(page.url()).not.toContain('/lobby');
  });

  test('4.2 Join flow: click join, enter code, submit navigates to /lobby', async ({ page }) => {
    const room = await createRoom(API_URL, 'JoinHost');
    await page.goto(WEB_URL);
    await page.waitForLoadState('networkidle');

    await page.fill('#player-name', 'NewPlayer');
    // Click join button (first time: reveals room-code input)
    await page.click('#join-button');
    await page.waitForSelector('#room-code', { timeout: 5_000 });
    await page.fill('#room-code', room.code);
    // Click join again to submit
    await page.click('#join-button');

    // Should navigate to lobby
    await page.waitForURL(/\/lobby/, { timeout: 10_000 });
    expect(page.url()).toContain('/lobby');
  });

  test('4.3 Test Lobby link: dev-only button navigates to /test, hidden in production', async ({ page }) => {
    await page.goto(WEB_URL);
    await page.waitForLoadState('networkidle');

    // The Test Lobby button is gated on import.meta.env.DEV on purpose (a prod
    // build once exposed it and confused players). Detect the build type: the
    // dev server serves /@vite/client as JS, `vite preview` answers it with
    // the SPA HTML fallback.
    let isDevServer = false;
    try {
      const res = await fetch(`${WEB_URL}/@vite/client`);
      isDevServer = (res.headers.get('content-type') || '').includes('javascript');
    } catch {
      isDevServer = false;
    }

    const button = page.locator('.test-lobby-button');
    if (!isDevServer) {
      // Production bundle: the button must not exist at all.
      await expect(button).toHaveCount(0);
      return;
    }

    await button.click();
    await page.waitForURL(/\/test/, { timeout: 5_000 });
    expect(page.url()).toContain('/test');
  });
});
