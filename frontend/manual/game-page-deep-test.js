// Focused game-page UI test: captures the game table from all 3 perspectives
// and also tries a few game actions to trigger special UI states.
//
// Run:  cd test; node manual/game-page-deep-test.js
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
  const idx = String(seq++).padStart(2, '0');
  const file = path.join(SCREENS, `${idx}-${label}.png`);
  await page.screenshot({ path: file, fullPage: false });
  console.log(`  [shot] ${path.basename(file)}`);
  return file;
}

const pause = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(method, url, body) {
  const init = { method, headers: { 'Content-Type': 'application/json' } };
  if (body !== undefined) init.body = JSON.stringify(body);
  const r = await fetch(`${BACKEND}${url}`, init);
  const txt = await r.text();
  if (!r.ok) throw new Error(`${method} ${url} → ${r.status}`);
  try { return JSON.parse(txt); } catch { return { raw: txt }; }
}

(async () => {
  console.log('▶ Creating a fresh game for UI inspection...');

  // Setup: create room + 2 joins + start
  const r = await api('POST', '/api/rooms', { hostName: 'Inspector' });
  const j1 = await api('POST', '/api/rooms/join', { code: r.code, playerName: 'Player2' });
  const j2 = await api('POST', '/api/rooms/join', { code: r.code, playerName: 'Player3' });
  const p2Id = j1.members.find(m => m.name === 'Player2').id;
  const p3Id = j2.members.find(m => m.name === 'Player3').id;
  await api('POST', `/api/rooms/${r.id}/ready`, { memberId: p2Id, isReady: true });
  await api('POST', `/api/rooms/${r.id}/ready`, { memberId: p3Id, isReady: true });
  const start = await api('POST', `/api/rooms/${r.id}/start`, { hostId: r.hostId });
  const gs = start.gameState;
  console.log(`  • Game started: ${gs.handCounts[r.hostId]} cards each, turn=${gs.currentTurnMemberId}`);

  // Drive 3 full turns so there are pending-action cards
  for (let i = 0; i < 3; i++) {
    const tid = (await api('GET', `/api/rooms/${r.id}/snapshot`)).gameState.currentTurnMemberId;
    await api('POST', `/api/rooms/${r.id}/game/draw-card`, { memberId: tid });
    await pause(500);
  }

  // Get the host's hand to try playing some cards
  const hostRoom = await api('GET', `/api/rooms/${r.id}/snapshot?memberId=${r.hostId}`);
  const hand = hostRoom.myHand || [];
  console.log(`  • Host hand: ${hand.join(', ')}`);

  const browser = await chromium.launch({ headless: false });

    // Open 3 tabs for the 3 players
  const ctx1 = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const ctx2 = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const ctx3 = await browser.newContext({ viewport: { width: 1440, height: 900 } });

  const [p1, p2, p3] = await Promise.all([
    ctx1.newPage(), ctx2.newPage(), ctx3.newPage()
  ]);

  // Player 1: host (Inspector), Player 2, Player 3
  const memberIds = [r.hostId, p2Id, p3Id];
  const names = ['Inspector (Host)', 'Player 2', 'Player 3'];
  const pages = [p1, p2, p3];

  // Use addInitScript on each context to set sessionStorage before the first
  // navigation. This runs synchronously before any page JS executes.
  const injectors = [
    [ctx1, r.id, r.code, r.hostId, r.hostName, true],
    [ctx2, r.id, r.code, p2Id, 'Player2', false],
    [ctx3, r.id, r.code, p3Id, 'Player3', false],
  ];
  for (const [ctx, roomId, roomCode, playerId, playerName, isHost] of injectors) {
    const session = JSON.stringify({ roomId, roomCode, playerId, playerName, isHost, stage: 'lobby' });
    // Use a function so we can pass `session` as an argument
    await ctx.addInitScript((s) => {
      sessionStorage.setItem('arcana.session.v1', s);
    }, session);
  }

  // Navigate all 3 to the game page (init script fires first)
  await Promise.all(pages.map((pg) =>
    pg.goto(`${FRONTEND}/game/${r.id}`, { waitUntil: 'networkidle' })
  ));

  // Read back sessionStorage to confirm it was set
  for (let i = 0; i < 3; i++) {
    const stored = await pages[i].evaluate(() => sessionStorage.getItem('arcana.session.v1'));
    console.log(`  Page ${i+1} sessionStorage: ${stored ? JSON.parse(stored).playerName : 'NULL'}`);
  }
  await pause(3000);

  // Wait for React to hydrate
  await pause(4000);

  // Check what's on each page
  for (let i = 0; i < 3; i++) {
    const pg = pages[i];
    // Check for common UI states
    const url = pg.url();
    const title = await pg.title();
    
    // Check for various UI elements
    const hasGameArea = await pg.locator('.game-page, [class*="game"]').count();
    const hasArcLoading = await pg.locator('.arc-loading, [class*="loading"]').count();
    const hasModal = await pg.locator('[class*="modal"], [role="dialog"]').count();
    const hasError = await pg.locator('[class*="error"], [class*="Error"]').count();
    const hasDisconnected = await pg.locator('text="mất kết nối", text="disconnect", text="reconnecting"').count();

    console.log(`\n  Page ${i+1} (${names[i]}):`);
    console.log(`    URL: ${url}`);
    console.log(`    Title: ${title}`);
    console.log(`    Game area elements: ${hasGameArea}`);
    console.log(`    Loading overlay: ${hasArcLoading}`);
    console.log(`    Modals: ${hasModal}`);
    console.log(`    Errors: ${hasError}`);
    console.log(`    Disconnected text: ${hasDisconnected}`);

    // Get body text snippet
    const bodyText = await pg.locator('body').innerText().catch(() => '');
    console.log(`    Body text (first 200): ${bodyText.slice(0, 200).replace(/\n/g, ' ')}`);

    await snap(pg, `game-ui-p${i+1}-${names[i].replace(/[^a-zA-Z]/g, '')}`);
  }

  // Try a few game actions and capture resulting UI
  console.log('\n=== Testing game actions ===');

  // 1. Try playing a regular (non-special) card from host's hand
  const regularCards = hand.filter(c => !c.match(/^(skip|defuse|attack|see_the_future|shuffle|nope|favor|shuffle_future)/));
  if (regularCards.length > 0) {
    console.log(`\n  Trying to play regular card: ${regularCards[0]}`);
    try {
      const result = await api('POST', `/api/rooms/${r.id}/game/play-card`, {
        memberId: r.hostId,
        cardKey: regularCards[0],
        targetMemberId: null,
        comboKind: null
      });
      console.log(`  → Result: toast="${result.toast || 'none'}" pending=${!!result.requiresTargetPick || !!result.requiresDefuse || !!result.requiresDiscardPick}`);
      if (result.requiresTargetPick) {
        console.log(`  → Targets: ${JSON.stringify(result.favorCandidates || result.room?.members?.map(m => m.name))}`);
      }
    } catch(e) { console.log(`  → Error: ${e.message}`); }
  } else {
    console.log('  Host has no regular cards to play');
  }

  await pause(2000);

  // Snapshot all 3 pages again after action
  for (let i = 0; i < 3; i++) {
    const pg = pages[i];
    const bodyText = await pg.locator('body').innerText().catch(() => '');
    console.log(`\n  Page ${i+1} after action - body: ${bodyText.slice(0, 150).replace(/\n/g, ' ')}`);
    await snap(pg, `game-ui-p${i+1}-after-action`);
  }

  // Try playing a skip card
  const skipCard = hand.find(c => c === 'skip');
  if (skipCard) {
    console.log(`\n  Trying to play skip card: ${skipCard}`);
    const result = await api('POST', `/api/rooms/${r.id}/game/play-card`, {
      memberId: r.hostId,
      cardKey: skipCard,
      targetMemberId: null,
      comboKind: null
    });
    console.log(`  → Result: toast="${result.toast || 'none'}"`);
    await pause(2000);
    await snap(p1, 'game-after-skip');
  }

  // Final snapshot
  const finalSnap = await api('GET', `/api/rooms/${r.id}/snapshot`);
  console.log('\n=== Final game state ===');
  console.log(`  Status: ${finalSnap.status}`);
  console.log(`  Hand counts: ${JSON.stringify(finalSnap.gameState?.handCounts)}`);
  console.log(`  Current turn: ${finalSnap.gameState?.currentTurnMemberId}`);
  console.log(`  Discard pile: ${finalSnap.gameState?.discardCount}`);
  console.log(`  Last played: ${finalSnap.gameState?.lastPlayedCardKey} by ${finalSnap.gameState?.lastPlayedBy}`);

  console.log('\n▶ Keeping browser open for 30s...');
  await pause(30_000);
  await browser.close();
  console.log('\n▶ Screenshots:', fs.readdirSync(SCREENS).length, 'files in', SCREENS);
})().catch(err => {
  console.error('!! FAILED:', err);
  process.exit(1);
});
