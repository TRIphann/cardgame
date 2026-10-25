// Debug game page state: captures browser console logs to understand
// what safeSetRoom receives and why hand counts show 0.
//
// Run:  cd frontend; node manual/debug-game-page.js

const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const BACKEND = 'http://localhost:5000';
const FRONTEND = 'http://localhost:5173';

async function api(method, url, body) {
  const init = { method, headers: { 'Content-Type': 'application/json' } };
  if (body !== undefined) init.body = JSON.stringify(body);
  const r = await fetch(`${BACKEND}${url}`, init);
  return r.json();
}

(async () => {
  console.log('Setting up game...');
  const r = await api('POST', '/api/rooms', { hostName: 'Alice' });
  const j1 = await api('POST', '/api/rooms/join', { code: r.code, playerName: 'Bob' });
  const j2 = await api('POST', '/api/rooms/join', { code: r.code, playerName: 'Carol' });
  const bobId = j1.members.find(m => m.name === 'Bob').id;
  const carolId = j2.members.find(m => m.name === 'Carol').id;
  await api('POST', `/api/rooms/${r.id}/ready`, { memberId: bobId, isReady: true });
  await api('POST', `/api/rooms/${r.id}/ready`, { memberId: carolId, isReady: true });
  const start = await api('POST', `/api/rooms/${r.id}/start`, { hostId: r.hostId });
  console.log('Game started. Room:', r.code, 'hostId:', r.hostId);

  // Draw a few cards so we have more state
  for (let i = 0; i < 3; i++) {
    const snap = await api('GET', `/api/rooms/${r.id}/snapshot?memberId=${r.hostId}`);
    const turnId = snap.gameState.currentTurnMemberId;
    try {
      await api('POST', `/api/rooms/${r.id}/game/draw-card`, { memberId: turnId });
    } catch(e) {}
    await new Promise(r => setTimeout(r, 300));
  }

  const browser = await chromium.launch({ headless: false });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });

  const session = JSON.stringify({ roomId: r.id, roomCode: r.code, playerId: r.hostId, playerName: r.hostName, isHost: true, stage: 'lobby' });
  await ctx.addInitScript((s) => { sessionStorage.setItem('arcana.session.v1', s); }, session);

  const page = await ctx.newPage();
  const logs = [];

  // Capture ALL console output from the browser
  page.on('console', msg => {
    logs.push(`[${msg.type().toUpperCase()}] ${msg.text()}`);
  });
  page.on('pageerror', err => logs.push(`[PAGEERROR] ${err.message}`));
  page.on('requestfailed', req => logs.push(`[NET FAIL] ${req.url()}`));
  page.on('response', resp => {
    const url = resp.url();
    if (url.includes('localhost:5000') && (url.includes('/api/') || url.includes('/health'))) {
      logs.push(`[HTTP ${resp.status()}] ${url.replace('http://localhost:5000', '')}`);
    }
  });

  await page.goto(`${FRONTEND}/game/${r.id}`, { waitUntil: 'networkidle' });
  // Wait for React to hydrate + polling to fire at least once
  await new Promise(r => setTimeout(r, 8000));

  // Check page state
  const url = page.url();
  console.log('URL:', url);
  console.log('On game page:', url.includes('/game/'));

  // Get the actual DOM state
  const state = await page.evaluate(() => {
    // Try to read sessionStorage
    const session = JSON.parse(sessionStorage.getItem('arcana.session.v1') || '{}');
    // Check if game elements exist
    const hasGameArea = document.querySelector('.game-page') !== null;
    const hasHeader = document.querySelector('.game-header') !== null;
    const seats = Array.from(document.querySelectorAll('.game-seat')).map(s => ({
      name: s.querySelector('.game-seat__name')?.textContent,
      handCount: s.querySelector('.game-seat__card-count, [class*="card-count"]')?.textContent,
      handCountEl: s.querySelector('[class*="card-count"]')?.outerHTML,
    }));
    const handCards = Array.from(document.querySelectorAll('.hand-card')).length;
    const handImages = Array.from(document.querySelectorAll('.hand-card img')).map(img => ({
      src: img.src.substring(0, 60),
      loaded: img.complete && img.naturalWidth > 0,
    }));
    const arcLoading = document.querySelector('.arc-loading') !== null;
    const modal = document.querySelector('[class*="modal"]') !== null;

    return { session, hasGameArea, hasHeader, seats, handCards, handImages, arcLoading, modal };
  });

  console.log('\n=== DOM STATE ===');
  console.log('URL:', url);
  console.log('Session playerId:', state.session.playerId);
  console.log('Has game area:', state.hasGameArea);
  console.log('Has header:', state.hasHeader);
  console.log('Arc loading:', state.arcLoading);
  console.log('Modal:', state.modal);
  console.log('Hand cards count:', state.handCards);
  console.log('Seat info:');
  state.seats.forEach(s => console.log(`  ${s.name}: "${s.handCount}" | ${s.handCountEl}`));
  console.log('Hand card images:');
  state.handImages.forEach((img, i) => console.log(`  [${i}] ${img.src} (loaded: ${img.loaded})`));

  // Take a screenshot
  await page.screenshot({ path: path.join(__dirname, '..', 'screenshots', 'DEBUG-game-state.png'), fullPage: false });
  console.log('\nScreenshot saved.');

  // Write logs
  const logFile = path.join(__dirname, '..', 'screenshots', 'console-logs.txt');
  fs.writeFileSync(logFile, logs.join('\n'), 'utf8');
  console.log('\nConsole logs saved to:', logFile);
  console.log('\nKey logs:');
  logs.filter(l => l.includes('safeSetRoom') || l.includes('SignalR') || l.includes('normalize')).forEach(l => console.log(' ', l));

  await new Promise(r => setTimeout(r, 5_000));
  await browser.close();
})().catch(err => {
  console.error('FAILED:', err.message);
  process.exit(1);
});
