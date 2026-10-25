// Motion & UI effects test: lobby + testLobby + game animations.
//
// What this test does:
//   1. Lobby flow (3 players): captures avatar selection pulse, member join
//      fade-in, ready state transitions, start button enable animation, code
//      copy ripple, deck wiggle, panel-in entry effect.
//   2. TestLobby flow: captures tab switch slide, card picker modal pop-in,
//      bot selector transitions, auto-deal animations.
//   3. Game motion: captures HandArc fan-in stagger, draw animation overlay,
//      action card reveal flip, defuse modal entrance, seat turn pulse.
//
// Run:  cd frontend; node manual/motion-effects-test.js

const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const BACKEND = 'http://localhost:5000';
const FRONTEND = 'http://localhost:5173';
const SCREENS = path.join(__dirname, '..', 'screenshots-motion');
fs.rmSync(SCREENS, { recursive: true, force: true });
fs.mkdirSync(SCREENS, { recursive: true });

let seq = 1;
async function snap(page, label) {
  const idx = String(seq++).padStart(3, '0');
  const file = path.join(SCREENS, `${idx}-${label}.png`);
  await page.screenshot({ path: file, fullPage: false });
  const size = (fs.statSync(file).size / 1024).toFixed(1);
  console.log(`  📷 ${idx} ${label} (${size}KB)`);
  return file;
}

// Capture a sequence of frames during an animation transition
async function snapFrames(page, baseLabel, count = 5, intervalMs = 100) {
  const files = [];
  for (let i = 0; i < count; i++) {
    const idx = String(seq++).padStart(3, '0');
    const file = path.join(SCREENS, `${idx}-${baseLabel}-${i + 1}.png`);
    await page.screenshot({ path: file });
    files.push(file);
    await new Promise(r => setTimeout(r, intervalMs));
  }
  console.log(`  📷 captured ${count} frames for ${baseLabel}`);
  return files;
}

const pause = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(method, url, body) {
  const init = { method, headers: { 'Content-Type': 'application/json' } };
  if (body !== undefined) init.body = JSON.stringify(body);
  const r = await fetch(`${BACKEND}${url}`, init);
  const txt = await r.text();
  if (!r.ok) throw new Error(`${method} ${url} → ${r.status}: ${txt.slice(0, 200)}`);
  try { return JSON.parse(txt); } catch { return { raw: txt }; }
}

function injectSession(ctx, roomId, roomCode, playerId, playerName, isHost) {
  const session = JSON.stringify({ roomId, roomCode, playerId, playerName, isHost, stage: 'lobby' });
  return () => ctx.addInitScript((s) => { sessionStorage.setItem('arcana.session.v1', s); }, session);
}

(async () => {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  ARCANA MOTION & UI EFFECTS TEST');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  // ── SECTION A: LOBBY ANIMATIONS (3 players) ─────────────────────────────
  console.log('\n━━━ SECTION A: Lobby with 3 players ━━━');

  const r = await api('POST', '/api/rooms', { hostName: 'Alice' });
  console.log(`  • Created room ${r.code} (id=${r.id})`);
  await pause(500);

  const browser = await chromium.launch({ headless: false });
  const [ctxA, ctxB, ctxC] = await Promise.all([
    browser.newContext({ viewport: { width: 1440, height: 900 } }),
    browser.newContext({ viewport: { width: 1440, height: 900 } }),
    browser.newContext({ viewport: { width: 1440, height: 900 } }),
  ]);

  // ── A.1: Landing → fill name → create ─────────────────────────────────
  const pageA = await ctxA.newPage();
  await pageA.goto(FRONTEND, { waitUntil: 'networkidle' });
  await pause(800);
  await snap(pageA, 'A1-landing-fresh');

  // Capture panel-in animation
  console.log('  Capturing panel-in entry…');
  await snapFrames(pageA, 'A1-landing-panel-in', 6, 150);

  // Fill name (capture input transition)
  await pageA.fill('#player-name', 'Alice');
  await pause(400);
  await snap(pageA, 'A1-landing-name-typed');

  // Click create and capture transition
  const respA = pageA.waitForResponse((r) => r.url().endsWith('/api/rooms') && r.request().method() === 'POST');
  await pageA.click('#create-button');
  const roomData = await respA;
  const room = await roomData.json();

  // Capture lobby entry transition (loading → lobby)
  console.log('  Capturing lobby entry transition…');
  await snapFrames(pageA, 'A1-lobby-entry', 8, 120);

  await pageA.waitForURL(/\/lobby/, { timeout: 10000 });
  await pause(1500);
  await snap(pageA, 'A1-lobby-just-created');

  // Capture the deck animation (deckWiggle1,2,3)
  console.log('  Capturing deck wiggle animation…');
  await snapFrames(pageA, 'A1-deck-wiggle', 8, 150);

  // ── A.2: Player B and C join ───────────────────────────────────────────
  console.log('  • Players B and C joining…');
  const pageB = await ctxB.newPage();
  await pageB.goto(FRONTEND, { waitUntil: 'networkidle' });
  await pause(600);
  await pageB.fill('#player-name', 'Bob');
  await pause(300);
  await pageB.click('#join-button');
  await pause(400);
  await snap(pageB, 'A2-join-code-revealed');
  await pageB.fill('#room-code', room.code);
  await pause(300);
  const respB = pageB.waitForResponse((r) => r.url().endsWith('/api/rooms/join'));
  await pageB.click('#join-button');
  await respB;
  await pageB.waitForURL(/\/lobby/, { timeout: 10000 });

  // Capture seat fade-in
  console.log('  Capturing seat B fade-in…');
  await snapFrames(pageB, 'A2-seat-B-fade-in', 6, 100);

  await pause(800);
  await snap(pageA, 'A2-host-sees-B-joined');
  await snap(pageB, 'A2-B-in-lobby');

  const pageC = await ctxC.newPage();
  await pageC.goto(FRONTEND, { waitUntil: 'networkidle' });
  await pause(600);
  await pageC.fill('#player-name', 'Carol');
  await pause(300);
  await pageC.click('#join-button');
  await pause(400);
  await pageC.fill('#room-code', room.code);
  await pause(300);
  const respC = pageC.waitForResponse((r) => r.url().endsWith('/api/rooms/join'));
  await pageC.click('#join-button');
  await respC;
  await pageC.waitForURL(/\/lobby/, { timeout: 10000 });
  await pause(800);
  await snap(pageA, 'A2-host-sees-C-joined');
  await snap(pageB, 'A2-B-sees-C-joined');
  await snap(pageC, 'A2-C-in-lobby');

  // Get member IDs
  const allMembers = (await api('GET', `/api/rooms/${room.id}/snapshot`)).members;
  const aliceId = allMembers.find(m => m.name === 'Alice').id;
  const bobId = allMembers.find(m => m.name === 'Bob').id;
  const carolId = allMembers.find(m => m.name === 'Carol').id;

  // ── A.3: Avatar selection transitions ─────────────────────────────────
  console.log('  Capturing avatar selection transitions…');
  await pageA.locator('.avatar-slot, [class*="avatar"]').first().click().catch(() => {});
  await pause(400);
  await snapFrames(pageA, 'A3-avatar-select-A', 5, 100);

  await pageB.locator('.avatar-slot, [class*="avatar"]').first().click().catch(() => {});
  await pause(400);
  await snapFrames(pageB, 'A3-avatar-select-B', 5, 100);

  // ── A.4: Ready toggle animation ────────────────────────────────────────
  console.log('  Capturing ready-state transitions…');
  await api('POST', `/api/rooms/${room.id}/ready`, { memberId: bobId, isReady: true });
  await pause(1500);
  await snapFrames(pageA, 'A4-B-ready', 5, 150);
  await snap(pageB, 'A4-B-ready-final');

  await api('POST', `/api/rooms/${room.id}/ready`, { memberId: carolId, isReady: true });
  await pause(1500);
  await snapFrames(pageA, 'A4-all-ready', 5, 150);
  await snap(pageA, 'A4-start-button-enabled');

  // ── A.5: Code copy ripple ───────────────────────────────────────────────
  console.log('  Capturing code copy ripple…');
  const copyBtn = pageA.locator('.copy-button, [class*="copy"]').first();
  if (await copyBtn.count() > 0) {
    await copyBtn.click().catch(() => {});
    await snapFrames(pageA, 'A5-copy-ripple', 6, 80);
  }

  // ── A.6: Start game transition (loading → game) ────────────────────────
  console.log('  Capturing start-game transition…');
  // Click start, then wait for URL change
  await pageA.click('.start-button');
  await pageA.waitForURL(/\/game\//, { timeout: 15000 });
  console.log('  Navigated to game page');
  await snapFrames(pageA, 'A6-start-game-transition', 8, 120);

  // Navigate B and C to game page
  await Promise.all([
    pageB.goto(`${FRONTEND}/game/${room.id}`, { waitUntil: 'networkidle' }),
    pageC.goto(`${FRONTEND}/game/${room.id}`, { waitUntil: 'networkidle' }),
  ]);
  await pause(4000);

  // ── SECTION B: GAME MOTION (3 players in game) ─────────────────────────
  console.log('\n━━━ SECTION B: Game motion ━━━');

  // Capture hand arc fan-in on fresh load of pageB
  console.log('  Capturing hand arc fan-in stagger…');
  const fanInCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const fanInSession = JSON.stringify({ roomId: room.id, roomCode: room.code, playerId: bobId, playerName: 'Bob', isHost: false, stage: 'lobby' });
  await fanInCtx.addInitScript((s) => { sessionStorage.setItem('arcana.session.v1', s); }, fanInSession);
  const fanInPage = await fanInCtx.newPage();
  await fanInPage.goto(`${FRONTEND}/game/${room.id}`, { waitUntil: 'networkidle' });
  await snapFrames(fanInPage, 'B1-hand-arc-fanin', 10, 150);
  await fanInPage.close();
  await fanInCtx.close();

  await pause(2000);
  await snap(pageA, 'B1-game-loaded-A');
  await snap(pageB, 'B1-game-loaded-B');
  await snap(pageC, 'B1-game-loaded-C');

  // Capture seat turn pulse when player becomes current
  console.log('  Capturing seat turn pulse…');
  // Find current player and capture their seat pulsing
  const snap2 = await api('GET', `/api/rooms/${room.id}/snapshot`);
  const currentTurn = snap2.gameState?.currentTurnMemberId;
  console.log(`  • Current turn: ${currentTurn}`);
  await snapFrames(pageA, 'B2-current-turn-pulse', 6, 200);

  // Draw a card (capture draw animation)
  console.log('  Capturing draw animation…');
  // Trigger via API directly (page doesn't have "Rút bài" button visible yet)
  await api('POST', `/api/rooms/${room.id}/game/draw-card`, { memberId: currentTurn });
  // The SignalR broadcast will trigger the animation in the browser
  await pause(800);
  await snapFrames(pageA, 'B2-draw-animation', 10, 100);

  await pause(2000);
  await snap(pageA, 'B2-after-draw-A');
  await snap(pageB, 'B2-after-draw-B');
  await snap(pageC, 'B2-after-draw-C');

  // ── B.3: Future peek modal ─────────────────────────────────────────────
  console.log('  Capturing future peek modal entrance…');
  // Look for modal element on each page
  const modalCheck = await pageA.evaluate(() => {
    return {
      hasModal: !!document.querySelector('[class*="future-peek"], [class*="modal"]'),
      modalClass: document.querySelector('[class*="future-peek"]')?.className || document.querySelector('[class*="modal"]')?.className,
    };
  });
  console.log('  Modal check:', modalCheck);

  // ── SECTION C: TEST LOBBY ──────────────────────────────────────────────
  console.log('\n━━━ SECTION C: Test Lobby ━━━');

  // Navigate to test lobby
  const testPage = await ctxA.newPage();
  await testPage.goto(`${FRONTEND}/test`, { waitUntil: 'networkidle' });
  await pause(2000);

  // Capture test lobby entry
  console.log('  Capturing test lobby entry…');
  await snapFrames(testPage, 'C1-test-lobby-entry', 6, 200);

  await pause(1500);
  await snap(testPage, 'C1-test-lobby-loaded');

  // Capture tab switch (cards → deck → bots)
  console.log('  Capturing tab switches…');
  const tabs = await testPage.locator('[role="tab"], .tab-button, [class*="tab"]').all();
  console.log(`  • Found ${tabs.length} tab elements`);

  if (tabs.length >= 2) {
    await tabs[1].click().catch(() => {});
    await pause(500);
    await snapFrames(testPage, 'C2-tab-switch-deck', 5, 120);
    await snap(testPage, 'C2-deck-tab');

    if (tabs.length >= 3) {
      await tabs[2].click().catch(() => {});
      await pause(500);
      await snapFrames(testPage, 'C2-tab-switch-bots', 5, 120);
      await snap(testPage, 'C2-bots-tab');
    }
  }

  // Capture card picker modal
  console.log('  Capturing card picker modal…');
  const cardSlots = await testPage.locator('[class*="card-slot"], [class*="hand-slot"]').all();
  if (cardSlots.length > 0) {
    await cardSlots[0].click().catch(() => {});
    await pause(500);
    await snapFrames(testPage, 'C3-card-picker-popin', 6, 80);
    await snap(testPage, 'C3-card-picker-modal');
    // Close it
    await testPage.keyboard.press('Escape').catch(() => {});
    await pause(400);
  }

  // ── SECTION D: SUMMARY ─────────────────────────────────────────────────
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  ${seq - 1} screenshots saved to:`);
  console.log(`  ${SCREENS}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  console.log('\n▶ Keeping browser open 60s…');
  await pause(60_000);
  await browser.close();
  console.log('▶ Done.');
})().catch(err => {
  console.error('\n!! FAILED:', err.message);
  console.error(err.stack);
  process.exit(1);
});
