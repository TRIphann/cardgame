// Manual smoke test: 3-player real game flow.
//
// What this does (run via `node manual/3-player-game.js`):
//   1. Launches 3 isolated Chromium contexts (each in their own incognito
//      window) — completely separate from any Chrome instance the user is
//      already running, so their open tabs are untouched.
//   2. Each context loads the Landing page, types a player name, and either
//      creates a room (Player A) or joins via code (Players B and C).
//   3. Captures the invite code + member IDs from network responses.
//   4. Starts the game from the host's browser.
//   5. Drives the game via the production REST API: player whose turn it is
//      draws a card, plays cards, etc. We snapshot every step so we don't
//      need a live SignalR connection (which is flaky in headless mode).
//   6. After every meaningful state change, takes a full-viewport screenshot
//      and saves it to frontend/screenshots/ so the user can open them in a file
//      explorer and review the UI visually.
//
// Run:   cd test; node manual/3-player-game.js
// See:   D:\gmae\frontend\screenshots\ for the captured PNGs.

const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const BACKEND = 'http://localhost:5000';
const FRONTEND = 'http://localhost:5173';
const SCREENS = path.join(__dirname, '..', 'screenshots');
fs.rmSync(SCREENS, { recursive: true, force: true });
fs.mkdirSync(SCREENS, { recursive: true });

let stepCounter = 1;
async function snap(page, label) {
  const idx = String(stepCounter++).padStart(2, '0');
  const file = path.join(SCREENS, `${idx}-${label}.png`);
  await page.screenshot({ path: file, fullPage: false });
  console.log(`  [shot] ${path.basename(file)}`);
}

const pause = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(method, url, body) {
  const init = { method, headers: { 'Content-Type': 'application/json' } };
  if (body !== undefined) init.body = JSON.stringify(body);
  const r = await fetch(`${BACKEND}${url}`, init);
  const txt = await r.text();
  let json = null;
  try { json = txt ? JSON.parse(txt) : null; } catch (_) { /* non-json */ }
  if (!r.ok) {
    throw new Error(`${method} ${url} → ${r.status} ${txt.slice(0, 120)}`);
  }
  return json;
}

async function waitForLobby(page) {
  await page.waitForURL(/\/lobby/, { timeout: 15000 });
  await page.waitForSelector('.lobby-page, .lobby-root, [data-test="lobby"]', { timeout: 10000 }).catch(() => {});
  await pause(800);
}

(async () => {
  console.log('▶ Launching Chromium with 3 isolated contexts...');
  // headless: false shows the 3 windows so the user can watch; defaults to
  // the bundled Chromium which is its own process and NEVER touches the
  // user's system Chrome or its open tabs.
  const browser = await chromium.launch({ headless: false });

  const ctxA = await browser.newContext({ viewport: { width: 1366, height: 820 } });
  const ctxB = await browser.newContext({ viewport: { width: 1366, height: 820 } });
  const ctxC = await browser.newContext({ viewport: { width: 1366, height: 820 } });
  const [pageA, pageB, pageC] = await Promise.all([
    ctxA.newPage(),
    ctxB.newPage(),
    ctxC.newPage(),
  ]);

  // ─── Phase 1: Landing page snapshot ─────────────────────────────────────
  console.log('\n=== PHASE 1: Landing page ===');
  await Promise.all([
    pageA.goto(`${FRONTEND}/`, { waitUntil: 'networkidle' }),
    pageB.goto(`${FRONTEND}/`, { waitUntil: 'networkidle' }),
    pageC.goto(`${FRONTEND}/`, { waitUntil: 'networkidle' }),
  ]);
  await pause(1200);
  await snap(pageA, 'landing-fresh-A');
  await snap(pageB, 'landing-fresh-B');
  await snap(pageC, 'landing-fresh-C');

  // ─── Phase 2: Host creates room ─────────────────────────────────────────
  console.log('\n=== PHASE 2: Host creates room ===');
  await pageA.fill('#player-name', 'Alice (Host)');
  await pause(400);
  await snap(pageA, 'landing-filled-A');

  // Capture the room code from the API response
  const respAPromise = pageA.waitForResponse(
    (r) => r.url().endsWith('/api/rooms') && r.request().method() === 'POST',
    { timeout: 15000 },
  );
  await pageA.click('#create-button');
  const respA = await respAPromise;
  const room = await respA.json();

  await waitForLobby(pageA);
  await snap(pageA, 'lobby-host-just-created');

  const roomId = room.id;
  const code = room.code;
  const hostId = room.hostId;
  console.log(`  • Room ${code} (id=${roomId}), host=${hostId}`);

  // ─── Phase 3: Players B and C join ─────────────────────────────────────
  console.log('\n=== PHASE 3: Players B and C join ===');
  for (const [page, name, tag] of [
    [pageB, 'Bob', 'B'],
    [pageC, 'Carol', 'C'],
  ]) {
    await page.fill('#player-name', name);
    await pause(400);
    await snap(page, `landing-filled-${tag}`);

    // First click → reveals code input
    await page.click('#join-button');
    await pause(500);
    await page.fill('#room-code', code);
    await pause(300);
    await snap(page, `landing-code-entered-${tag}`);

    const joinResp = page.waitForResponse(
      (r) => r.url().endsWith('/api/rooms/join') && r.request().method() === 'POST',
      { timeout: 15000 },
    );
    await page.click('#join-button');
    await joinResp;
    await waitForLobby(page);
    await snap(page, `lobby-after-join-${tag}`);
  }

  // Snapshot the room state so we know both new members
  const allMembers = (await api('GET', `/api/rooms/${roomId}/snapshot`)).members;
  const otherIds = allMembers.filter((m) => m.id !== hostId).map((m) => ({ id: m.id, name: m.name }));
  console.log('  • Lobby members:', allMembers.map((m) => `${m.name}${m.isHost ? ' (host)' : ''}`).join(', '));

  // ─── Phase 4: All 3 see each other on Lobby ────────────────────────────
  console.log('\n=== PHASE 4: Lobby with 3 members ===');
  await pause(1200);
  await snap(pageA, 'lobby-3-players-A');
  await snap(pageB, 'lobby-3-players-B');
  await snap(pageC, 'lobby-3-players-C');

  // ─── Phase 5: Toggle ready for B and C ─────────────────────────────────
  console.log('\n=== PHASE 5: Ready up B and C ===');
  const bMemberId = otherIds.find((m) => m.name === 'Bob').id;
  const cMemberId = otherIds.find((m) => m.name === 'Carol').id;
  await api('POST', `/api/rooms/${roomId}/ready`, { memberId: bMemberId, isReady: true });
  await api('POST', `/api/rooms/${roomId}/ready`, { memberId: cMemberId, isReady: true });
  await pause(1200);
  await snap(pageA, 'lobby-all-ready-A');
  await snap(pageB, 'lobby-all-ready-B');
  await snap(pageC, 'lobby-all-ready-C');

  // ─── Phase 6: Host starts the game ─────────────────────────────────────
  console.log('\n=== PHASE 6: Host starts game ===');
  const startResp = pageA.waitForResponse(
    (r) => r.url().includes('/start') && r.request().method() === 'POST',
    { timeout: 15000 },
  );
  await pageA.click('.start-button');
  await startResp;
  // Host gets auto-navigated to /game by the React listener after the API
  // responds with status=playing. Wait for that URL change.
  await pageA.waitForURL(/\/game\//, { timeout: 15000 }).catch(() => {});
  await pause(1500);
  await snap(pageA, 'game-just-started-A');

  // Manually take B and C to the game page
  await Promise.all([
    pageB.goto(`${FRONTEND}/game/${roomId}`, { waitUntil: 'networkidle' }),
    pageC.goto(`${FRONTEND}/game/${roomId}`, { waitUntil: 'networkidle' }),
  ]);
  await pause(2500);

  // ─── Phase 7: Game page on all 3 ───────────────────────────────────────
  console.log('\n=== PHASE 7: Game page ===');
  await snap(pageA, 'game-table-A');
  await snap(pageB, 'game-table-B');
  await snap(pageC, 'game-table-C');

  // Pull current snapshot
  const playing = (await api('GET', `/api/rooms/${roomId}/snapshot`)).gameState;
  const handSize = (n) => playing?.handCounts?.[n] ?? 0;
  console.log(`  • hands: A=${handSize(hostId)} B=${handSize(bMemberId)} C=${handSize(cMemberId)}`);
  console.log(`  • turn: ${playing?.currentTurnMemberId}`);

  // ─── Phase 8: Play a few turns ──────────────────────────────────────────
  console.log('\n=== PHASE 8: Drive some turns via API ===');
  // Snapshot for current turn order
  async function currentTurnId() {
    const s = await api('GET', `/api/rooms/${roomId}/snapshot`);
    return s.gameState?.currentTurnMemberId;
  }

  for (let turn = 1; turn <= 6; turn++) {
    const tid = await currentTurnId();
    if (!tid) {
      console.log(`  • turn ${turn}: no current turn (game ended or pending action)`);
      break;
    }
    const who = tid === hostId ? 'Alice' : tid === bMemberId ? 'Bob' : 'Carol';
    console.log(`  • turn ${turn}: ${who} (${tid}) to move`);

    try {
      const draw = await api('POST', `/api/rooms/${roomId}/game/draw-card`, { memberId: tid });
      console.log(`    → drew; toast="${draw.toast ?? ''}", pending=${!!draw.requiresDefuse || !!draw.requiresTargetPick || !!draw.requiresDiscardPick}`);
    } catch (err) {
      console.log(`    → draw failed: ${err.message.slice(0, 100)}`);
    }

    // Let the snapshot propagate to all 3 tabs
    await pause(1500);

    if (tid === hostId) await snap(pageA, `game-turn-${turn}-after-draw-A`);
    if (tid === bMemberId) await snap(pageB, `game-turn-${turn}-after-draw-B`);
    if (tid === cMemberId) await snap(pageC, `game-turn-${turn}-after-draw-C`);
  }

  // Final state
  console.log('\n=== FINAL STATE ===');
  const finalSnap = await api('GET', `/api/rooms/${roomId}/snapshot`);
  const fc = finalSnap.gameState;
  console.log(`  • status=${finalSnap.status} discard=${fc?.discardCount} hands={${Object.entries(fc?.handCounts || {}).map(([k, v]) => `${k.slice(0, 4)}=${v}`).join(', ')}}`);
  console.log(`  • turn=${fc?.currentTurnMemberId}`);

  // Wait for the user to see the windows, then close our browser.
  console.log('\n▶ Keeping browser open for 30s so the user can see the 3 tabs...');
  await pause(30_000);
  await browser.close();
  console.log('\n▶ Screenshots saved to:', SCREENS);
})().catch((err) => {
  console.error('!! Test failed:', err);
  process.exit(1);
});
