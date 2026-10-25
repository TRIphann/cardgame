// Super-simple debug: just navigate to game page and see what React does
const { chromium } = require('@playwright/test');
const path = require('path');

const FRONTEND = 'http://localhost:5173';

(async () => {
  const browser = await chromium.launch({ headless: false });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });

  // Set session for a KNOWN game
  const roomId = 'dc3bf0f66661436394c3dda0ba170cab'; // from previous test
  const session = JSON.stringify({ roomId, roomCode: '4LN7C4', playerId: 'aa47324acd274ce59974f21b2cb348ac', playerName: 'Alice', isHost: true, stage: 'lobby' });
  await ctx.addInitScript((s) => { sessionStorage.setItem('arcana.session.v1', s); }, session);

  const page = await ctx.newPage();
  const logs = [];
  page.on('console', msg => logs.push(`[${msg.type()}] ${msg.text()}`));
  page.on('pageerror', err => logs.push(`[PAGEERR] ${err.message}`));

  // Intercept ALL fetch/XHR requests
  await page.route('**', async route => {
    const req = route.request();
    const url = req.url();
    if (url.includes('/api/') || url.includes('/hubs/') || url.includes('/health')) {
      logs.push(`[INTERCEPTED] ${req.method()} ${url.replace('http://localhost:5173', '')}`);
    }
    await route.continue();
  });

  await page.goto(`${FRONTEND}/game/${roomId}`, { waitUntil: 'domcontentloaded' });
  console.log('Page loaded. Waiting 10s...');
  await new Promise(r => setTimeout(r, 10000));

  // Check state
  const state = await page.evaluate(() => {
    return {
      url: location.href,
      title: document.title,
      hasGamePage: !!document.querySelector('.game-page'),
      hasLoading: !!document.querySelector('.arc-loading'),
      hasGameHeader: !!document.querySelector('.game-header, [class*="game-header"]'),
      loadingText: document.querySelector('.arc-loading span')?.textContent,
      bodySnippet: document.body.innerText.slice(0, 200),
    };
  });
  console.log('\n=== PAGE STATE ===');
  console.log(JSON.stringify(state, null, 2));

  await page.screenshot({ path: path.join(__dirname, '..', 'screenshots', 'DEBUG2-game-state.png'), fullPage: false });

  // Write all logs
  const logFile = path.join(__dirname, '..', 'screenshots', 'console-logs2.txt');
  require('fs').writeFileSync(logFile, logs.join('\n'), 'utf8');
  console.log('\nAll logs:', logs.length, 'entries');
  console.log(logs.join('\n'));

  await new Promise(r => setTimeout(r, 30000));
  await browser.close();
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
