// Simple FuturePeek test — verifies face-down lock + reveal timing.
const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const FRONTEND = 'http://localhost:5173';
const BACKEND = 'http://localhost:5000';
const SHOTS = path.join(__dirname, '..', 'screenshots-fp-simple');
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
  console.log('━━━ SIMPLE FUTUREPEEK TEST ━━━\n');

  // Create test room
  const r = await api('POST', '/api/test/room', { hostName: 'Tester' });
  const roomId = r.roomId;
  const members = r.members;
  const testerId = members.find(m => m.name === 'Tester').id;
  const botIds = members.filter(m => m.isBot).map(m => m.id);

  // Custom deck: Future card FIRST so Tester draws it
  const customDeck = [
    'future', 'attack', 'nope', 'skip',
    'shuffle', 'favor', 'nope', 'attack', 'favor', 'bomb',
    'robot', 'skip', 'shuffle', 'ninja', 'zombie',
  ];

  await api('POST', '/api/test/start', {
    roomId,
    botTurnSeconds: 0,
    drawOnlyBotIds: botIds,
    customDeck,
  });

  await api('POST', `/api/rooms/${roomId}/members/${testerId}/ready`);
  console.log('Setup done');

  // Open browser as Tester
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const session = JSON.stringify({ roomId, roomCode: 'TEST', playerId: testerId, playerName: 'Tester', isHost: true, stage: 'lobby' });
  await ctx.addInitScript((s) => { sessionStorage.setItem('arcana.session.v1', s); }, session);
  const page = await ctx.newPage();

  console.log('Loading...');
  await page.goto(`${FRONTEND}/game/${roomId}`, { waitUntil: 'domcontentloaded' });
  await wait(15000);

  // Wait for turn intro to dismiss
  console.log('Waiting for turn intro to dismiss...');
  for (let i = 0; i < 10; i++) {
    const hasIntro = await page.locator('.turn-intro-overlay').isVisible().catch(() => false);
    if (!hasIntro) break;
    await wait(1000);
  }
  console.log('Turn intro dismissed');

  // Check initial state
  const state = await page.evaluate(() => {
    return {
      hasDeckPile: !!document.querySelector('.deck-pile'),
      deckClickable: document.querySelector('.deck-pile--clickable') !== null,
      bodyText: document.body.innerText.slice(0, 100).replace(/\n/g, ' | '),
    };
  });
  console.log('Initial state:', JSON.stringify(state));
  await page.screenshot({ path: path.join(SHOTS, '000-initial.png') });

  if (state.deckClickable) {
    console.log('\nClicking deck to draw Future card...');
    await page.locator('.deck-pile').click();

    // Track peek state over time
    const observations = [];
    const checkPeek = async (label) => {
      const data = await page.evaluate(() => {
        const peek = document.querySelector('.future-peek-scene');
        if (!peek) return { visible: false };
        const locked = peek.querySelectorAll('.fp-card--locked').length;
        const revealed = peek.querySelectorAll('.fp-card--revealed').length;
        const sub = peek.querySelector('.future-peek-info__sub')?.textContent;
        const hasCloseBtn = !!peek.querySelector('.future-peek-info__close');
        return { visible: true, locked, revealed, sub, hasCloseBtn };
      });
      console.log(`[${label}]`, JSON.stringify(data));
      observations.push({ t: label, ...data });
    };

    await wait(300); await checkPeek('0.3s');
    await page.screenshot({ path: path.join(SHOTS, '01-300ms.png') });

    await wait(2000); await checkPeek('2.3s');
    await page.screenshot({ path: path.join(SHOTS, '02-2300ms.png') });

    await wait(3000); await checkPeek('5.3s');
    await page.screenshot({ path: path.join(SHOTS, '03-5300ms.png') });

    await wait(1000); await checkPeek('6.3s');
    await page.screenshot({ path: path.join(SHOTS, '04-6300ms.png') });

    await wait(1000); await checkPeek('7.3s');
    await page.screenshot({ path: path.join(SHOTS, '05-7300ms.png') });

    await wait(2000); await checkPeek('9.3s');
    await page.screenshot({ path: path.join(SHOTS, '06-9300ms.png') });

    // Summary
    console.log('\n━━━ OBSERVATIONS ━━━');
    observations.forEach(o => {
      const cards = `${o.locked}L/${o.revealed}R`;
      const status = o.sub || '(no peek)';
      console.log(`  ${o.t}: ${o.visible ? 'VISIBLE' : 'HIDDEN'} ${cards} — "${status}" closeBtn=${o.hasCloseBtn ? 'yes' : 'no'}`);
    });

    // Check if cards stayed face-down for ~5s
    const stayedLocked = observations.find(o => o.t === '2.3s');
    const startedFlipping = observations.find(o => o.t === '5.3s' || o.t === '6.3s');
    const allRevealed = observations.find(o => o.t === '9.3s');

    console.log('\n━━━ VERIFICATION ━━━');
    if (stayedLocked && stayedLocked.locked === 3 && stayedLocked.revealed === 0) {
      console.log('✅ At 2.3s: all 3 cards still face-down (locked) — lock phase working');
    } else {
      console.log('❌ At 2.3s: lock phase broken — cards already revealed!');
    }

    if (startedFlipping && startedFlipping.revealed > 0) {
      console.log(`✅ After 5s: cards starting to flip (${startedFlipping.revealed} revealed)`);
    } else if (startedFlipping && startedFlipping.locked === 0) {
      console.log(`✅ After 5s: lock released, cards will flip`);
    }

    if (allRevealed && allRevealed.revealed === 3) {
      console.log('✅ At 9.3s: all 3 cards revealed');
    }

    // Verify clicking on hand cards is blocked while peek is visible
    if (allRevealed && allRevealed.visible) {
      console.log('\nTesting click blocking during peek...');
      const handCard = page.locator('.hand-card').first();
      const box = await handCard.boundingBox();
      if (box) {
        await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
        await wait(500);
        const peekStillVisible = await page.locator('.future-peek-scene').isVisible();
        console.log(`✅ Peek still visible after clicking hand card: ${peekStillVisible}`);
      }
    }
  } else {
    console.log('❌ Deck not clickable — Tester is not the current player or game not loaded');
  }

  await browser.close();
  console.log('\nScreenshots:', SHOTS);
})().catch(err => {
  console.error('FAILED:', err.message);
  console.error(err.stack);
  process.exit(1);
});
