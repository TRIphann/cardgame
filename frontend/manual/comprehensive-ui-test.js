// Comprehensive UI smoke test: 3-player game + full game UI inspection.
// Tests: landing, lobby, game page, hand counts, modals, turn tracking.
//
// Run:  cd frontend; node manual/comprehensive-ui-test.js

const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const BACKEND = 'http://localhost:5000';
const FRONTEND = 'http://localhost:5173';
const SCREENS = path.join(__dirname, '..', 'screenshots');
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
  console.log('  ARCANA COMPREHENSIVE UI TEST');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  // ── SETUP: Create game via API ────────────────────────────────────────────
  console.log('\n[1] Creating game via API…');
  const r = await api('POST', '/api/rooms', { hostName: 'Alice' });
  const j1 = await api('POST', '/api/rooms/join', { code: r.code, playerName: 'Bob' });
  const j2 = await api('POST', '/api/rooms/join', { code: r.code, playerName: 'Carol' });
  const bobId = j1.members.find(m => m.name === 'Bob').id;
  const carolId = j2.members.find(m => m.name === 'Carol').id;
  await api('POST', `/api/rooms/${r.id}/ready`, { memberId: bobId, isReady: true });
  await api('POST', `/api/rooms/${r.id}/ready`, { memberId: carolId, isReady: true });
  await pause(300);
  const start = await api('POST', `/api/rooms/${r.id}/start`, { hostId: r.hostId });
  const gs = start.gameState;
  console.log(`  Room ${r.code} | ${Object.keys(gs.handCounts).length} players | turn=${gs.currentTurnMemberId}`);
  console.log(`  Alice hand: ${(start.myHand || []).join(', ')}`);

  // ── LAUNCH BROWSER ────────────────────────────────────────────────────────
  console.log('\n[2] Launching 3 Chromium contexts…');
  const browser = await chromium.launch({ headless: false });
  const [ctxA, ctxB, ctxC] = await Promise.all([
    browser.newContext({ viewport: { width: 1440, height: 900 } }),
    browser.newContext({ viewport: { width: 1440, height: 900 } }),
    browser.newContext({ viewport: { width: 1440, height: 900 } }),
  ]);

  await Promise.all([
    injectSession(ctxA, r.id, r.code, r.hostId, 'Alice', true)(),
    injectSession(ctxB, r.id, r.code, bobId, 'Bob', false)(),
    injectSession(ctxC, r.id, r.code, carolId, 'Carol', false)(),
  ]);

  const [pageA, pageB, pageC] = await Promise.all([
    ctxA.newPage(), ctxB.newPage(), ctxC.newPage()
  ]);
  const pages = [pageA, pageB, pageC];
  const names = ['Alice', 'Bob', 'Carol'];

  // Capture console logs from the first page for debugging
  const debugLogs = [];
  pageA.on('console', msg => {
    const t = msg.type(), txt = msg.text();
    if (t === 'error' || t === 'warning' || txt.includes('[safeSetRoom]') || txt.includes('[SignalR')) {
      debugLogs.push(`[${t}] ${txt}`);
    }
  });

  // ── PHASE 1: LANDING PAGE ────────────────────────────────────────────────
  console.log('\n━━━ PHASE 1: Landing Page ━━━');
  await Promise.all(pages.map(p => p.goto(FRONTEND, { waitUntil: 'networkidle' })));
  await pause(800);
  for (let i = 0; i < 3; i++) {
    await snap(pages[i], `P${i + 1}-landing`);
  }

  // ── PHASE 2: GAME PAGE ────────────────────────────────────────────────────
  console.log('\n━━━ PHASE 2: Game Page ━━━');
  await Promise.all(pages.map(p => p.goto(`${FRONTEND}/game/${r.id}`, { waitUntil: 'networkidle' })));
  await pause(8000); // Wait for SignalR + polling + React render

  // Print debug logs
  if (debugLogs.length > 0) {
    console.log('  [Debug logs]:');
    debugLogs.forEach(l => console.log('   ', l));
  } else {
    console.log('  [No relevant debug logs]');
  }

  for (let i = 0; i < 3; i++) {
    const info = await pages[i].evaluate(() => {
      const seats = Array.from(document.querySelectorAll('.game-seat')).map(s => ({
        name: s.querySelector('.game-seat__name')?.textContent?.trim(),
        handCount: s.querySelector('.game-seat__handcount')?.textContent?.trim() || 'N/A',
      }));
      const handCards = Array.from(document.querySelectorAll('.hand-card')).length;
      const arcLoading = !!document.querySelector('.arc-loading');
      const header = document.querySelector('.game-header')?.textContent?.slice(0, 80);
      const bodyText = document.body.innerText.slice(0, 200).replace(/\n/g, ' ');
      return { seats, handCards, arcLoading, header, bodyText };
    });
    console.log(`  ${names[i]}: arcLoading=${info.arcLoading}, handCards=${info.handCards}`);
    console.log(`    Seats:`, info.seats.map(s => `${s.name}=${s.handCount}`).join(', '));
    console.log(`    Header: ${info.header}`);
    await snap(pages[i], `P${i + 1}-game-loaded`);
  }

  // ── PHASE 3: Drive turns via API ──────────────────────────────────────────
  console.log('\n━━━ PHASE 3: Driving turns ━━━');
  let turnNum = 0;
  let currentTurn = gs.currentTurnMemberId;

  for (let attempt = 0; attempt < 8; attempt++) {
    const snap3 = await api('GET', `/api/rooms/${r.id}/snapshot`);
    currentTurn = snap3.gameState?.currentTurnMemberId;
    if (!currentTurn) break;
    turnNum++;
    const who = currentTurn === r.hostId ? 'Alice' : currentTurn === bobId ? 'Bob' : 'Carol';
    const hc = snap3.gameState?.handCounts || {};
    console.log(`  Turn ${turnNum} (${who}): ${JSON.stringify(hc)}`);

    // Get hand for the current player
    const playerSnap = await api('GET', `/api/rooms/${r.id}/snapshot?memberId=${currentTurn}`);
    const hand = playerSnap.myHand || [];

    // DRAW
    try {
      const draw = await api('POST', `/api/rooms/${r.id}/game/draw-card`, { memberId: currentTurn });
      console.log(`    Drew → "${draw.toast || 'ok'}" pending=${!!(draw.requiresDefuse)}`);
      await pause(1000);

      for (let i = 0; i < 3; i++) {
        const url = pages[i].url();
        if (url.includes('/game/')) {
          const info = await pages[i].evaluate(() => {
            const seats = Array.from(document.querySelectorAll('.game-seat')).map(s => ({
              name: s.querySelector('.game-seat__name')?.textContent?.trim(),
              handCount: s.querySelector('.game-seat__handcount')?.textContent?.trim() || 'N/A',
            }));
            const handCards = Array.from(document.querySelectorAll('.hand-card')).length;
            const modal = document.querySelector('[class*="modal"]')?.textContent?.slice(0, 60) || null;
            return { seats, handCards, modal };
          });
          console.log(`    ${names[i]}: handCards=${info.handCards}, seats=${info.seats.map(s => `${s.name}:${s.handCount}`).join(' ')}${info.modal ? ` [MODAL: ${info.modal}]` : ''}`);
          await snap(pages[i], `turn${turnNum}-${names[i]}`);
        }
      }
    } catch (e) {
      console.log(`    Draw failed: ${e.message.slice(0, 80)}`);
      break;
    }

    // Check if game ended
    const check = await api('GET', `/api/rooms/${r.id}/snapshot`);
    if (check.status !== 'playing') {
      console.log(`  Game ended: ${check.status}`);
      break;
    }
  }

  // ── PHASE 4: Special UI states ────────────────────────────────────────────
  console.log('\n━━━ PHASE 4: UI States ━━━');

  // Try defuse (if any player has defuse)
  const hostSnap = await api('GET', `/api/rooms/${r.id}/snapshot?memberId=${r.hostId}`);
  const defuseCount = (hostSnap.myHand || []).filter(c => c.includes('defuse')).length;
  console.log(`  Alice has ${defuseCount} defuse cards`);

  // Check for pending action
  const pendingSnap = await api('GET', `/api/rooms/${r.id}/snapshot`);
  const pending = pendingSnap.gameState?.pendingAction;
  console.log(`  Pending action: ${pending ? JSON.stringify(pending) : 'none'}`);
  console.log(`  Attack counter: ${pendingSnap.gameState?.attackCounter}`);
  console.log(`  Discard pile: ${pendingSnap.gameState?.discardCount}`);
  console.log(`  Alive: ${JSON.stringify(pendingSnap.gameState?.alive)}`);

  // Take final screenshots
  console.log('\n━━━ PHASE 5: Final Screenshots ━━━');
  for (let i = 0; i < 3; i++) {
    const url = pages[i].url();
    if (url.includes('/game/')) {
      await snap(pages[i], `FINAL-${names[i]}`);
    }
  }

  // ── SUMMARY ───────────────────────────────────────────────────────────────
  const final = await api('GET', `/api/rooms/${r.id}/snapshot`);
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  FINAL GAME STATE');
  console.log(`  Status: ${final.status}`);
  console.log(`  Hands: ${JSON.stringify(final.gameState?.handCounts)}`);
  console.log(`  Turn: ${final.gameState?.currentTurnMemberId}`);
  console.log(`  Discard: ${final.gameState?.discardCount}`);
  console.log(`  Screenshots: ${seq - 1}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  console.log('\n▶ Keeping browser open 60s…');
  await pause(60_000);
  await browser.close();
  console.log('▶ Done. Screenshots in:', SCREENS);
})().catch(err => {
  console.error('\n!! FAILED:', err.message);
  process.exit(1);
});
