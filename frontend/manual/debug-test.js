// Debug what's happening with the game load
const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const FRONTEND = 'http://localhost:5173';
const BACKEND = 'http://localhost:5000';
const SHOTS = path.join(__dirname, '..', 'screenshots-debug');
fs.rmSync(SHOTS, { recursive: true, force: true });
fs.mkdirSync(SHOTS, { recursive: true });

async function api(method, url, body) {
  const init = { method, headers: { 'Content-Type': 'application/json' } };
  if (body !== undefined) init.body = JSON.stringify(body);
  const r = await fetch(`${BACKEND}${url}`, init);
  return r.json();
}
async function wait(ms) { return new Promise((r) => setTimeout(r, ms)); }

(async () => {
  console.log('━━━ DEBUG TEST ━━━\n');

  // Create test room
  const r = await api('POST', '/api/test/room', { hostName: 'Tester' });
  const roomId = r.roomId;
  const members = r.members;
  const testerId = members.find(m => m.name === 'Tester').id;
  const botIds = members.filter(m => m.isBot).map(m => m.id);
  console.log(`Room: ${roomId}`);
  console.log(`Tester: ${testerId}`);

  // Full deck with proper structure
  const fullDeck = [
    'future', 'attack', 'nope', 'skip',
    'shuffle', 'favor', 'nope', 'attack', 'favor',
    'robot', 'skip', 'shuffle', 'ninja', 'zombie',
    'future', 'attack', 'nope', 'skip',
    'shuffle', 'favor', 'nope', 'attack', 'favor',
    'robot', 'skip', 'shuffle', 'ninja', 'zombie',
    'future', 'attack', 'nope', 'skip',
    'shuffle', 'favor', 'nope', 'attack', 'favor',
  ];
  await api('POST', '/api/test/start', {
    roomId,
    botTurnSeconds: 0,
    drawOnlyBotIds: botIds,
    customDeck: fullDeck,
    customHands: {
      [testerId]: ['defuse', 'skip', 'attack', 'favor', 'nope'],
    },
  });

  await api('POST', `/api/rooms/${roomId}/members/${testerId}/ready`);

  // Test the snapshot API directly
  console.log('\nSnapshot test:');
  const snap = await api('GET', `/api/test/room/${roomId}/snapshot`);
  console.log('  status:', snap.status);
  console.log('  gameState.currentTurnMemberId:', snap.gameState?.currentTurnMemberId);
  console.log('  currentTurn === tester:', snap.gameState?.currentTurnMemberId === testerId);
  console.log('  deck length:', snap.deck?.length);

  // Open browser
  const browser = await chromium.launch({ headless: false });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const session = JSON.stringify({ roomId, roomCode: 'TEST', playerId: testerId, playerName: 'Tester', isHost: true, stage: 'lobby' });
  await ctx.addInitScript((s) => { sessionStorage.setItem('arcana.session.v1', s); }, session);
  const page = await ctx.newPage();

  // Capture console logs and network errors
  page.on('console', (msg) => {
    const txt = msg.text();
    if (txt.includes('error') || txt.includes('fail') || txt.includes('Error') || msg.type() === 'error') {
      console.log(`  [CONSOLE ${msg.type()}] ${txt}`);
    }
  });
  page.on('pageerror', (err) => {
    console.log(`  [PAGE ERROR] ${err.message}`);
  });
  page.on('requestfailed', (req) => {
    console.log(`  [REQUEST FAILED] ${req.method()} ${req.url()} - ${req.failure()?.errorText}`);
  });
  page.on('response', (res) => {
    if (res.status() >= 400) {
      console.log(`  [RESPONSE ${res.status()}] ${res.url()}`);
    }
  });

  console.log('\nLoading page...');
  await page.goto(`${FRONTEND}/game/${roomId}`, { waitUntil: 'domcontentloaded' });
  await wait(8000);

  const state = await page.evaluate(() => {
    return {
      url: location.href,
      bodyText: document.body.innerText.slice(0, 200).replace(/\n/g, ' | '),
      hasErrorModal: !!document.querySelector('.arc-loading__error'),
      hasDeckPile: !!document.querySelector('.deck-pile'),
    };
  });
  console.log('After 8s:', JSON.stringify(state, null, 2));

  await page.screenshot({ path: path.join(SHOTS, 'state.png') });

  // Wait longer
  await wait(10000);
  const state2 = await page.evaluate(() => {
    return {
      hasDeckPile: !!document.querySelector('.deck-pile'),
      hasGameTable: !!document.querySelector('.game-table'),
      bodyText: document.body.innerText.slice(0, 200).replace(/\n/g, ' | '),
    };
  });
  console.log('After 18s total:', JSON.stringify(state2, null, 2));
  await page.screenshot({ path: path.join(SHOTS, 'state2.png') });

  await browser.close();
})().catch(err => {
  console.error('FAILED:', err.message);
  console.error(err.stack);
  process.exit(1);
});
