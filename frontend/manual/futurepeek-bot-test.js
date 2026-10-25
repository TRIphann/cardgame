// FuturePeek + BotTimeout UI test — verifies both fixes in a real UI.
//
// Bug 1: FuturePeek doesn't block actions / cards flip too fast.
// Bug 2: Bot turn timer stuck at 0s.

const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const FRONTEND = 'http://localhost:5173';
const BACKEND = 'http://localhost:5000';
const SHOTS = path.join(__dirname, '..', 'screenshots-futurepeek');
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
  console.log('━━━ FUTUREPEEK + BOTTIMEOUT UI TEST ━━━\n');

  // Setup: create test room with a Future card in Tester's hand
  const r = await api('POST', '/api/test/room', { hostName: 'Tester' });
  const roomId = r.roomId;
  const members = r.members;
  const testerId = members.find(m => m.name === 'Tester').id;
  const botIds = members.filter(m => m.isBot).map(m => m.id);
  console.log(`Room: ${roomId}`);

  // Use a deck with a Future card at the right position so Tester draws it
  // Position 0 of the deck means Tester draws it first
  // After Tester draws Future, the 3 cards after are peeked
  const customDeck = [
    'future',    // Tester draws this → triggers FuturePeek
    'attack',    // Peek position 1 (left = Tester's next draw)
    'nope',      // Peek position 2 (next player's draw)
    'skip',      // Peek position 3 (3rd player's draw)
    'shuffle', 'favor', 'nope', 'attack', 'favor', 'bomb',
    'robot', 'skip', 'shuffle', 'ninja', 'zombie',
  ];

  await api('POST', '/api/test/start', {
    roomId,
    botTurnSeconds: 0,
    drawOnlyBotIds: botIds,
    customDeck,
    customHands: {
      [testerId]: ['defuse', 'skip', 'attack', 'favor', 'nope'], // Tester's starting hand
    },
  });
  console.log('Game started with Future card first');

  await api('POST', `/api/rooms/${roomId}/members/${testerId}/ready`);

  // Launch browser as Tester
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const session = JSON.stringify({ roomId, roomCode: 'TEST', playerId: testerId, playerName: 'Tester', isHost: true, stage: 'lobby' });
  await ctx.addInitScript((s) => { sessionStorage.setItem('arcana.session.v1', s); }, session);
  const page = await ctx.newPage();

  console.log('Loading game page...');
  await page.goto(`${FRONTEND}/game/${roomId}`, { waitUntil: 'networkidle' });
  await wait(8000);
  console.log('Game loaded');

  // Wait for the deck to be clickable (my turn)
  const isMyTurn = await page.evaluate(() => !!document.querySelector('.deck-pile--clickable'));
  console.log(`Is my turn: ${isMyTurn}`);

  if (isMyTurn) {
    // Click the deck to draw Future card → should trigger FuturePeek
    await page.locator('.deck-pile').click();
    console.log('Clicked deck (drew Future card)');

    // Wait 500ms - peek should be visible with cards face-down
    await wait(500);
    await page.screenshot({ path: path.join(SHOTS, '001-peek-500ms-face-down.png') });

    // Check: cards should be face-down (all back faces showing)
    const peekState500 = await page.evaluate(() => {
      const peek = document.querySelector('.future-peek-scene');
      if (!peek) return { peekVisible: false };
      const cards = peek.querySelectorAll('.fp-card');
      const locked = peek.querySelectorAll('.fp-card--locked').length;
      const revealed = peek.querySelectorAll('.fp-card--revealed').length;
      return { peekVisible: true, totalCards: cards.length, locked, revealed };
    });
    console.log('Peek at 500ms:', JSON.stringify(peekState500));

    // Wait 3s more (total ~3.5s) - still in mandatory wait
    await wait(3000);
    await page.screenshot({ path: path.join(SHOTS, '002-peek-3500ms-still-locked.png') });
    const peekState3500 = await page.evaluate(() => {
      const peek = document.querySelector('.future-peek-scene');
      if (!peek) return { peekVisible: false };
      const locked = peek.querySelectorAll('.fp-card--locked').length;
      const revealed = peek.querySelectorAll('.fp-card--revealed').length;
      const subText = peek.querySelector('.future-peek-info__sub')?.textContent;
      return { locked, revealed, subText };
    });
    console.log('Peek at 3500ms:', JSON.stringify(peekState3500));

    // Wait until 5.5s total - cards should start flipping
    await wait(2000);
    await page.screenshot({ path: path.join(SHOTS, '003-peek-5500ms-flipping-start.png') });
    const peekState5500 = await page.evaluate(() => {
      const peek = document.querySelector('.future-peek-scene');
      if (!peek) return { peekVisible: false };
      const locked = peek.querySelectorAll('.fp-card--locked').length;
      const revealed = peek.querySelectorAll('.fp-card--revealed').length;
      const subText = peek.querySelector('.future-peek-info__sub')?.textContent;
      return { locked, revealed, subText };
    });
    console.log('Peek at 5500ms:', JSON.stringify(peekState5500));

    // Wait until 7s - first card should be revealed
    await wait(1500);
    await page.screenshot({ path: path.join(SHOTS, '004-peek-7000ms-first-revealed.png') });

    // Wait until 9s - all 3 cards should be revealed
    await wait(2000);
    await page.screenshot({ path: path.join(SHOTS, '005-peek-9000ms-all-revealed.png') });
    const peekState9000 = await page.evaluate(() => {
      const peek = document.querySelector('.future-peek-scene');
      if (!peek) return { peekVisible: false };
      const locked = peek.querySelectorAll('.fp-card--locked').length;
      const revealed = peek.querySelectorAll('.fp-card--revealed').length;
      const subText = peek.querySelector('.future-peek-info__sub')?.textContent;
      const closeBtn = !!peek.querySelector('.future-peek-info__close');
      return { locked, revealed, subText, closeBtnVisible: closeBtn };
    });
    console.log('Peek at 9000ms:', JSON.stringify(peekState9000));

    // Test: try clicking on a card in hand WHILE peek is visible
    const handCardCount = await page.locator('.hand-card').count();
    console.log(`Hand cards: ${handCardCount}`);

    // The hand arc should be BEHIND the peek modal. Try clicking the bottom of a card.
    if (handCardCount > 0) {
      const box = await page.locator('.hand-card').first().boundingBox();
      if (box) {
        // Simulate click during the peek (cards should NOT respond)
        await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
        await wait(500);
        const peekStillVisible = await page.locator('.future-peek-scene').isVisible();
        console.log(`Click on hand card during peek - peek still visible: ${peekStillVisible}`);
      }
    }

    // Close the peek
    const closeBtn = page.locator('.future-peek-info__close');
    if (await closeBtn.isVisible()) {
      await closeBtn.click();
      console.log('Closed peek');
    }
    await wait(1000);
    await page.screenshot({ path: path.join(SHOTS, '006-after-close.png') });
  }

  // Now wait for Tester's turn to run out (60s) and check timer display
  console.log('\nWaiting 65s to test turn timer display...');
  await wait(65000);
  await page.screenshot({ path: path.join(SHOTS, '007-after-65s.png') });

  // The game should have advanced to a bot. Check the current turn indicator.
  const turnState = await page.evaluate(() => {
    const headerTimer = document.querySelector('.game-header__turn-timer');
    const seats = document.querySelectorAll('.game-seat');
    let activeSeat = null;
    seats.forEach(s => {
      if (s.classList.contains('game-seat--active') || s.classList.contains('game-seat--current')) {
        activeSeat = s.querySelector('.game-seat__name')?.textContent;
      }
    });
    return {
      headerTimerText: headerTimer?.textContent?.trim(),
      activeSeat,
      timerUrgent: headerTimer?.classList.contains('game-header__turn-timer--urgent'),
    };
  });
  console.log('After 65s:', JSON.stringify(turnState));

  await browser.close();
  console.log('\n━━━ TEST COMPLETE ━━━');
  console.log(`Screenshots: ${SHOTS}`);
})().catch(err => {
  console.error('FAILED:', err.message);
  console.error(err.stack);
  process.exit(1);
});
