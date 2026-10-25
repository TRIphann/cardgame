// 3-player smoke test with UI screenshots at every phase.
// Full flow: landing → lobby → 3 players join → start → game → turns
// Takes screenshots at every step and saves them to frontend/screenshots/.
//
// IMPORTANT: This uses Playwright's own Chromium instance (separate from your
// system Chrome), so your existing tabs are completely untouched.
//
// Run:  cd frontend; node manual/3-player-full-game.js

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
  console.log(`  📷 ${path.basename(file)} (${size}KB)`);
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

// Set sessionStorage in a browser context using addInitScript
function makeSessionInjector(ctx, roomId, roomCode, playerId, playerName, isHost) {
  const session = JSON.stringify({ roomId, roomCode, playerId, playerName, isHost, stage: 'lobby' });
  return () => ctx.addInitScript((s) => { sessionStorage.setItem('arcana.session.v1', s); }, session);
}

(async () => {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  ARCANA 3-PLAYER FULL GAME TEST');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  // ── Setup: create a game with 3 players via API ─────────────────────────
  console.log('\n[SETUP] Creating game via API…');
  const r = await api('POST', '/api/rooms', { hostName: 'Alice' });
  const j1 = await api('POST', '/api/rooms/join', { code: r.code, playerName: 'Bob' });
  const j2 = await api('POST', '/api/rooms/join', { code: r.code, playerName: 'Carol' });
  const bobId = j1.members.find(m => m.name === 'Bob').id;
  const carolId = j2.members.find(m => m.name === 'Carol').id;

  // Ready up non-hosts
  await api('POST', `/api/rooms/${r.id}/ready`, { memberId: bobId, isReady: true });
  await api('POST', `/api/rooms/${r.id}/ready`, { memberId: carolId, isReady: true });
  await pause(300);

  const start = await api('POST', `/api/rooms/${r.id}/start`, { hostId: r.hostId });
  const gs = start.gameState;
  console.log(`  Room: ${r.code}  |  3 players, turn order: ${Object.keys(gs.handCounts).join(' / ')}`);
  console.log(`  Host hand: ${(start.myHand || []).join(', ')}`);

  // ── Launch browser ──────────────────────────────────────────────────────
  console.log('\n[LAUNCH] Opening Playwright Chromium (3 contexts)…');
  const browser = await chromium.launch({ headless: false });

  const ctxA = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const ctxB = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const ctxC = await browser.newContext({ viewport: { width: 1440, height: 900 } });

  // Inject sessionStorage for each player
  await Promise.all([
    makeSessionInjector(ctxA, r.id, r.code, r.hostId, 'Alice', true)(),
    makeSessionInjector(ctxB, r.id, r.code, bobId, 'Bob', false)(),
    makeSessionInjector(ctxC, r.id, r.code, carolId, 'Carol', false)(),
  ]);

  const [pageA, pageB, pageC] = await Promise.all([
    ctxA.newPage(), ctxB.newPage(), ctxC.newPage()
  ]);
  const pages = [pageA, pageB, pageC];
  const names = ['Alice', 'Bob', 'Carol'];

  // ── PHASE 1: Landing page ────────────────────────────────────────────────
  console.log('\n━━━ PHASE 1: Landing page ━━━');
  await Promise.all(pages.map(pg => pg.goto(FRONTEND, { waitUntil: 'networkidle' })));
  await pause(600);
  await snap(pageA, 'P1-landing');
  await snap(pageB, 'P2-landing');
  await snap(pageC, 'P3-landing');

  // ── PHASE 2: Navigate to game page ──────────────────────────────────────
  console.log('\n━━━ PHASE 2: Game page ━━━');
  await Promise.all(pages.map(pg => pg.goto(`${FRONTEND}/game/${r.id}`, { waitUntil: 'networkidle' })));
  await pause(2000);

  // Inspect each page
  for (let i = 0; i < 3; i++) {
    const body = await pages[i].locator('body').innerText();
    const url = pages[i].url();
    const hasGame = url.includes('/game/');
    console.log(`  ${names[i]}: ${hasGame ? '✓ on game page' : '✗ redirected'} | ${body.slice(0, 120).replace(/\n/g, ' ')}`);
  }
  await snap(pageA, 'P1-game-table');
  await snap(pageB, 'P2-game-table');
  await snap(pageC, 'P3-game-table');

  // ── PHASE 3: Drive several turns via API ─────────────────────────────────
  console.log('\n━━━ PHASE 3: Driving turns ━━━');
  let currentTurn = gs.currentTurnMemberId;
  let turnNum = 0;

  for (let attempt = 0; attempt < 12; attempt++) {
    const snap2 = await api('GET', `/api/rooms/${r.id}/snapshot`);
    currentTurn = snap2.gameState?.currentTurnMemberId;
    if (!currentTurn) {
      console.log(`  Turn ${attempt + 1}: game ended or no current turn`);
      break;
    }
    turnNum++;
    const who = currentTurn === r.hostId ? 'Alice' : currentTurn === bobId ? 'Bob' : 'Carol';
    console.log(`  Turn ${turnNum} (${who}):`, JSON.stringify(snap2.gameState?.handCounts));

    // Get the player's hand
    const playerSnap = await api('GET', `/api/rooms/${r.id}/snapshot?memberId=${currentTurn}`);
    const hand = playerSnap.myHand || [];
    console.log(`    Hand (${hand.length}): ${hand.join(', ')}`);

    // DRAW
    let drawResult;
    try {
      drawResult = await api('POST', `/api/rooms/${r.id}/game/draw-card`, { memberId: currentTurn });
      console.log(`    Drew → "${drawResult.toast || 'ok'}" | pending=${!!(drawResult.requiresDefuse || drawResult.requiresTargetPick || drawResult.requiresDiscardPick)}`);
    } catch (e) {
      console.log(`    Draw failed: ${e.message.slice(0, 80)}`);
      drawResult = null;
    }

    await pause(800);

    // Snapshot to see updated hand
    const afterDraw = await api('GET', `/api/rooms/${r.id}/snapshot?memberId=${currentTurn}`);
    const handAfter = afterDraw.myHand || [];
    console.log(`    Hand after draw (${handAfter.length}): ${handAfter.join(', ')}`);

    // PLAY — try to play a non-bomb, non-defuse card if possible
    if (handAfter.length > 0) {
      const cardToPlay = handAfter.find(c =>
        !c.includes('bomb') && !c.includes('explosive') && !c.includes('defuse')
      ) || handAfter[0];

      // Check if we need to skip (it's the next player's turn that needs to draw)
      try {
        const playResult = await api('POST', `/api/rooms/${r.id}/game/play-card`, {
          memberId: currentTurn,
          cardKey: cardToPlay,
          targetMemberId: null,
          comboKind: null,
          discardPickKey: null,
        });
        console.log(`    Played "${cardToPlay}" → "${playResult.toast || 'ok'}" pending=${!!(playResult.requiresTargetPick)}`);
      } catch (e) {
        console.log(`    Play failed: ${e.message.slice(0, 80)}`);
      }
    }

    await pause(1000);

    // Take screenshot of each player
    for (let i = 0; i < 3; i++) {
      const url = pages[i].url();
      if (url.includes('/game/')) {
        await snap(pages[i], `turn${turnNum}-${names[i]}`);
      }
    }

    // Check if game ended
    const finalCheck = await api('GET', `/api/rooms/${r.id}/snapshot`);
    if (finalCheck.status !== 'playing') {
      console.log(`  Game ended: status=${finalCheck.status}`);
      break;
    }
  }

  // ── PHASE 4: Try special actions ─────────────────────────────────────────
  console.log('\n━━━ PHASE 4: Special actions ━━━');

  // Try playing attack card
  const attackSnap = await api('GET', `/api/rooms/${r.id}/snapshot?memberId=${r.hostId}`);
  const attackHand = attackSnap.myHand || [];
  const attackCard = attackHand.find(c => c.includes('attack'));
  if (attackCard) {
    console.log(`  Trying attack card: ${attackCard}`);
    try {
      const r2 = await api('POST', `/api/rooms/${r.id}/game/play-card`, {
        memberId: r.hostId, cardKey: attackCard, targetMemberId: null
      });
      console.log(`  Attack → "${r2.toast || 'ok'}" attackCounter=${r2.room?.gameState?.attackCounter}`);
    } catch (e) { console.log(`  Attack failed: ${e.message.slice(0, 80)}`); }
  }

  await pause(1500);
  await snap(pageA, 'after-attack');

  // Check for pending actions
  const pendingSnap = await api('GET', `/api/rooms/${r.id}/snapshot`);
  console.log(`  Pending action: ${JSON.stringify(pendingSnap.gameState?.pendingAction || 'none')}`);
  console.log(`  Attack counter: ${pendingSnap.gameState?.attackCounter}`);
  console.log(`  Discard: ${pendingSnap.gameState?.discardCount}`);

  // ── PHASE 5: Final state ─────────────────────────────────────────────────
  console.log('\n━━━ PHASE 5: Final state ━━━');
  const final = await api('GET', `/api/rooms/${r.id}/snapshot`);
  console.log(`  Status: ${final.status}`);
  console.log(`  Hands: ${JSON.stringify(final.gameState?.handCounts)}`);
  console.log(`  Current turn: ${final.gameState?.currentTurnMemberId}`);
  console.log(`  Discard pile: ${final.gameState?.discardCount}`);
  console.log(`  Last played: ${final.gameState?.lastPlayedCardKey} by ${final.gameState?.lastPlayedBy}`);
  console.log(`  Alive: ${JSON.stringify(final.gameState?.alive)}`);
  console.log(`  Winner: ${final.gameState?.winnerId || 'none'}`);

  // Screenshots of final state
  for (let i = 0; i < 3; i++) {
    const url = pages[i].url();
    if (url.includes('/game/')) {
      await snap(pages[i], `FINAL-${names[i]}`);
    }
  }

  // ── PHASE 6: Error/edge cases ─────────────────────────────────────────────
  console.log('\n━━━ PHASE 6: Error cases ━━━');

  // Try to draw when not your turn → should be 403
  const notMyTurn = [bobId, carolId].find(id => id !== final.gameState?.currentTurnMemberId) || bobId;
  try {
    await api('POST', `/api/rooms/${r.id}/game/draw-card`, { memberId: notMyTurn });
    console.log('  ✗ Drew out-of-turn: should have been rejected');
  } catch (e) {
    console.log(`  ✓ Drew out-of-turn correctly rejected: ${e.message.slice(0, 60)}`);
  }

  // Try to join full game (all already in) → should be idempotent
  const joinAgain = await api('POST', '/api/rooms/join', { code: r.code, playerName: 'Dave' });
  console.log(`  Join with new name: ${joinAgain.members?.length} members (expected: still 3)`);

  // ── Done ─────────────────────────────────────────────────────────────────
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`  ${seq - 1} screenshots saved to:`);
  console.log(`  ${SCREENS}`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

  console.log('\n▶ Keeping browser open 60s for inspection…');
  await pause(60_000);
  await browser.close();
  console.log('▶ Done.');
})().catch(err => {
  console.error('\n!! TEST FAILED:', err.message);
  process.exit(1);
});
