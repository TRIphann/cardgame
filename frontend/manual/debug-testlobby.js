// Debug test lobby → game page navigation to find why disconnect modal appears
const { chromium } = require('@playwright/test');
const path = require('path');

const FRONTEND = 'http://localhost:5173';

(async () => {
  const browser = await chromium.launch({ headless: false });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  const logs = [];
  page.on('console', msg => {
    const t = msg.type();
    const txt = msg.text();
    logs.push(`[${t}] ${txt}`);
  });
  page.on('pageerror', err => logs.push(`[PAGEERR] ${err.message}`));
  page.on('requestfailed', req => logs.push(`[NET FAIL] ${req.url()} - ${req.failure()?.errorText}`));
  page.on('response', resp => {
    const url = resp.url();
    if (url.includes('localhost:5000')) {
      logs.push(`[HTTP ${resp.status()}] ${resp.request().method()} ${url.replace('http://localhost:5000', '')}`);
    }
  });

  await page.goto(`${FRONTEND}/test`, { waitUntil: 'networkidle' });
  console.log('1. Test lobby loaded. Waiting 3s for room to be created...');
  await new Promise(r => setTimeout(r, 3000));

  // Check sessionStorage
  const session1 = await page.evaluate(() => sessionStorage.getItem('arcana.session.v1'));
  console.log('2. SessionStorage:', session1 ? session1.slice(0, 200) : 'null');


  // Click start button
  const startBtn = page.locator('button:has-text("Bắt đầu Test")').first();
  const exists = await startBtn.count();
  console.log(`3. Start button exists: ${exists}`);
  if (exists > 0) {
    await startBtn.click();
    console.log('4. Clicked start. Waiting 8s for game page to load...');
    await new Promise(r => setTimeout(r, 8000));
  }

  // Check sessionStorage now
  const session2 = await page.evaluate(() => sessionStorage.getItem('arcana.session.v1'));
  console.log('5. SessionStorage after:', session2 ? session2.slice(0, 200) : 'null');

  const url = page.url();
  console.log('6. Final URL:', url);

  // Check the game state
  const state = await page.evaluate(() => {
    try {
      const sessionRaw = sessionStorage.getItem('arcana.session.v1');
      const sessionData = sessionRaw ? JSON.parse(sessionRaw) : {};
      const roomId = sessionData.roomId;
      const testCache = roomId ? sessionStorage.getItem('test_game_init_' + roomId) : null;
      return {
        arcLoading: !!document.querySelector('.arc-loading'),
        hasError: !!document.querySelector('.arc-loading__error'),
        hasGameHeader: !!document.querySelector('.game-header'),
        bodyText: document.body.innerText.slice(0, 200).replace(/\n/g, ' '),
        sessionRoomId: roomId,
        testGameCache: testCache ? testCache.slice(0, 200) : null,
      };
    } catch(e) {
      return { error: e.message };
    }
  });
  console.log('7. State:', JSON.stringify(state, null, 2));

  // Write logs
  const logFile = path.join(__dirname, '..', 'screenshots-testlobby', 'debug-logs.txt');
  require('fs').writeFileSync(logFile, logs.join('\n'), 'utf8');
  console.log('\n8. Logs:', logs.length, 'entries');
  console.log(logs.join('\n'));

  await new Promise(r => setTimeout(r, 30000));
  await browser.close();
})().catch(e => { console.error('FAIL:', e.message); process.exit(1); });
