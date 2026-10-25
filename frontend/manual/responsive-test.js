// Responsive UI test: check all pages at mobile/tablet/desktop viewports.
//
// Tests: landing, lobby, game page, test lobby at:
//   - Mobile: 375×667 (iPhone SE)
//   - Tablet: 768×1024 (iPad)
//   - Desktop: 1440×900
//
// Run:  cd frontend; node manual/responsive-test.js

const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const FRONTEND = 'http://localhost:5173';
const BACKEND = 'http://localhost:5000';
const SCREENS = path.join(__dirname, '..', 'screenshots-responsive');
fs.rmSync(SCREENS, { recursive: true, force: true });
fs.mkdirSync(SCREENS, { recursive: true });

const VIEWPORTS = [
  { name: 'mobile', width: 375, height: 667 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1440, height: 900 },
];

let seq = 1;
async function snap(page, label) {
  const idx = String(seq++).padStart(3, '0');
  const file = path.join(SCREENS, `${idx}-${label}.png`);
  await page.screenshot({ path: file });
  const size = (fs.statSync(file).size / 1024).toFixed(1);
  console.log(`  📷 ${idx} ${label} (${size}KB)`);
  return file;
}

async function api(method, url, body) {
  const init = { method, headers: { 'Content-Type': 'application/json' } };
  if (body !== undefined) init.body = JSON.stringify(body);
  const r = await fetch(`${BACKEND}${url}`, init);
  return r.json();
}

function injectSession(ctx, roomId, roomCode, playerId, playerName, isHost) {
  const session = JSON.stringify({ roomId, roomCode, playerId, playerName, isHost, stage: 'lobby' });
  return () => ctx.addInitScript((s) => { sessionStorage.setItem('arcana.session.v1', s); }, session);
}

const pause = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  RESPONSIVE UI TEST');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  // Setup: create a 3-player game
  const r = await api('POST', '/api/rooms', { hostName: 'Alice' });
  const j1 = await api('POST', '/api/rooms/join', { code: r.code, playerName: 'Bob' });
  const j2 = await api('POST', '/api/rooms/join', { code: r.code, playerName: 'Carol' });
  const bobId = j1.members.find(m => m.name === 'Bob').id;
  const carolId = j2.members.find(m => m.name === 'Carol').id;
  await api('POST', `/api/rooms/${r.id}/ready`, { memberId: bobId, isReady: true });
  await api('POST', `/api/rooms/${r.id}/ready`, { memberId: carolId, isReady: true });
  await api('POST', `/api/rooms/${r.id}/start`, { hostId: r.hostId });
  console.log(`  Room ${r.code} created and game started`);

  const browser = await chromium.launch({ headless: false });

  for (const vp of VIEWPORTS) {
    console.log(`\n━━━ ${vp.name.toUpperCase()} ${vp.width}×${vp.height} ━━━`);
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });

    // ── LANDING PAGE ────────────────────────────────────────────────────────
    console.log(`  Landing page…`);
    const page = await ctx.newPage();
    await page.goto(FRONTEND, { waitUntil: 'networkidle' });
    await pause(1000);

    // Check for horizontal overflow
    const overflow = await page.evaluate(() => {
      return {
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
        hasOverflow: document.documentElement.scrollWidth > window.innerWidth,
        bodyOverflow: document.body.style.overflow,
      };
    });
    console.log(`  Overflow: scrollWidth=${overflow.scrollWidth} innerWidth=${overflow.innerWidth} hasOverflow=${overflow.hasOverflow}`);

    await snap(page, `${vp.name}-landing`);

  // ── LOBBY PAGE ─────────────────────────────────────────────────────────
    // Note: must test BEFORE game starts, otherwise lobby redirects to /game
    console.log(`  Lobby page (pre-game)…`);
    // Create a NEW room just for lobby testing
    const lobbyRoom = await api('POST', '/api/rooms', { hostName: 'Alice' });
    await api('POST', '/api/rooms/join', { code: lobbyRoom.code, playerName: 'Bob' });
    const lobbySession = JSON.stringify({ roomId: lobbyRoom.id, roomCode: lobbyRoom.code, playerId: lobbyRoom.hostId, playerName: 'Alice', isHost: true, stage: 'lobby' });
    const lobbyCtx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    await lobbyCtx.addInitScript((s) => { sessionStorage.setItem('arcana.session.v1', s); }, lobbySession);
    const lobbyPage = await lobbyCtx.newPage();
    await lobbyPage.goto(`${FRONTEND}/lobby`, { waitUntil: 'networkidle' });
    await pause(4000);

    const lobbyLayout = await lobbyPage.evaluate(() => {
      const seats = document.querySelectorAll('.seat');
      const seatsLeft = document.querySelector('.seats-left');
      const seatsRight = document.querySelector('.seats-right');
      const startBtn = document.querySelector('.start-button');
      const deckArea = document.querySelector('.deck-area');
      const isOnLobby = !location.pathname.includes('/game');
      return {
        seatCount: seats.length,
        seatsLeftExists: !!seatsLeft,
        seatsRightExists: !!seatsRight,
        startBtnVisible: !!startBtn,
        deckVisible: !!deckArea,
        redirectedToGame: location.pathname.includes('/game'),
        bodyText: document.body.innerText.slice(0, 100).replace(/\n/g, '|'),
      };
    });
    console.log(`  Layout: seats=${lobbyLayout.seatCount} left=${lobbyLayout.seatsLeftExists} right=${lobbyLayout.seatsRightExists} startBtn=${lobbyLayout.startBtnVisible} deck=${lobbyLayout.deckVisible} redirected=${lobbyLayout.redirectedToGame}`);
    await snap(lobbyPage, `${vp.name}-lobby`);
    await lobbyPage.close();
    await lobbyCtx.close();

    // ── GAME PAGE ───────────────────────────────────────────────────────────
    console.log(`  Game page…`);
    // Use fresh context for game page
    const gameCtx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    const gameSession = JSON.stringify({ roomId: r.id, roomCode: r.code, playerId: r.hostId, playerName: 'Alice', isHost: true, stage: 'lobby' });
    await gameCtx.addInitScript((s) => { sessionStorage.setItem('arcana.session.v1', s); }, gameSession);
    const gamePage = await gameCtx.newPage();

    // Capture URL before and after navigation
    await gamePage.goto(`${FRONTEND}/game/${r.id}`, { waitUntil: 'networkidle' });
    // Wait longer for lazy-loaded GamePage + API fetch
    await pause(12000);
    const currentUrl = gamePage.url();
    const gameLoaded = await gamePage.evaluate(() => !!document.querySelector('.game-header, .arc-loading, .arc-loading__error'));

    console.log(`  URL: ${currentUrl}`);
    console.log(`  Game UI present: ${gameLoaded}`);

    const gameLayout = await gamePage.evaluate(() => {
      const header = document.querySelector('.game-header');
      const seats = document.querySelectorAll('.game-seat');
      const handArc = document.querySelector('.hand-arc, .hand-arc--empty');
      const deckPile = document.querySelector('.deck-pile');
      const actionBtn = document.querySelector('.game-action-btn');
      const arcLoading = document.querySelector('.arc-loading');
      const main = document.querySelector('.game-page');
      const gameTable = document.querySelector('.game-table');
      return {
        headerVisible: !!header,
        seatCount: seats.length,
        handArcVisible: !!handArc,
        deckPileVisible: !!deckPile,
        actionBtnVisible: !!actionBtn,
        arcLoading: !!arcLoading,
        gameTableVisible: !!gameTable,
        mainBounds: main ? JSON.stringify(main.getBoundingClientRect()) : null,
        bodyText: document.body.innerText.slice(0, 150).replace(/\n/g, '|'),
      };
    });
    console.log(`  Layout: header=${gameLayout.headerVisible} seats=${gameLayout.seatCount} handArc=${gameLayout.handArcVisible} deck=${gameLayout.deckPileVisible} btn=${gameLayout.actionBtnVisible} loading=${gameLayout.arcLoading} table=${gameLayout.gameTableVisible}`);
    if (vp.name === 'mobile') {
      console.log(`  Main bounds: ${gameLayout.mainBounds}`);
      console.log(`  Body: ${gameLayout.bodyText}`);
    }

    await snap(gamePage, `${vp.name}-game`);
    await gamePage.close();
    await gameCtx.close();

    // ── TEST LOBBY ─────────────────────────────────────────────────────────
    console.log(`  Test lobby…`);
    const testCtx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    const testPage = await testCtx.newPage();
    await testPage.goto(`${FRONTEND}/test`, { waitUntil: 'networkidle' });
    await pause(4000);

    const testLobbyLayout = await testPage.evaluate(() => {
      const tabs = document.querySelectorAll('.tab-btn');
      const startBtn = document.querySelector('.start-btn');
      const lobbyPanel = document.querySelector('.test-lobby-panel');
      return {
        tabsCount: tabs.length,
        startBtnVisible: !!startBtn,
        startBtnText: startBtn ? startBtn.textContent.trim() : null,
        lobbyPanelVisible: !!lobbyPanel,
        bodyText: document.body.innerText.slice(0, 100).replace(/\n/g, '|'),
      };
    });
    console.log(`  Layout: tabs=${testLobbyLayout.tabsCount} startBtn=${testLobbyLayout.startBtnVisible} startText=${testLobbyLayout.startBtnText} panel=${testLobbyLayout.lobbyPanelVisible}`);

    await snap(testPage, `${vp.name}-testlobby`);
    await testPage.close();
    await testCtx.close();
  }

  // ── SUMMARY ─────────────────────────────────────────────────────────────
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  ${seq - 1} screenshots in ${SCREENS}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  await browser.close();
  console.log('▶ Done.');
})().catch(err => {
  console.error('\n!! FAILED:', err.message);
  console.error(err.stack);
  process.exit(1);
});
