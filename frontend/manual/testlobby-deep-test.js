// TestLobby interaction test — focus on UI components and transitions.
//
// What this test does:
//   1. Opens /test directly (test lobby is self-contained).
//   2. Captures: room creation, bot joins, card picker modal, deck editor,
//      bot config (mode switcher, +/-), tab transitions.
//   3. Starts a test game → captures game-with-bots UI: bot turn pulses,
//      auto-draw animation, bomb reveal, defuse modal pop-in.
//
// Run:  cd frontend; node manual/testlobby-deep-test.js

const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const FRONTEND = 'http://localhost:5173';
const SCREENS = path.join(__dirname, '..', 'screenshots-testlobby');
fs.rmSync(SCREENS, { recursive: true, force: true });
fs.mkdirSync(SCREENS, { recursive: true });

let seq = 1;
async function snap(page, label) {
  const idx = String(seq++).padStart(3, '0');
  const file = path.join(SCREENS, `${idx}-${label}.png`);
  await page.screenshot({ path: file });
  const size = (fs.statSync(file).size / 1024).toFixed(1);
  console.log(`  📷 ${idx} ${label} (${size}KB)`);
  return file;
}

async function snapFrames(page, baseLabel, count = 5, intervalMs = 120) {
  for (let i = 0; i < count; i++) {
    const idx = String(seq++).padStart(3, '0');
    const file = path.join(SCREENS, `${idx}-${baseLabel}-${i + 1}.png`);
    await page.screenshot({ path: file });
    await new Promise(r => setTimeout(r, intervalMs));
  }
  console.log(`  📷 captured ${count} frames for ${baseLabel}`);
}

const pause = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  TEST LOBBY DEEP INTERACTION TEST');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const browser = await chromium.launch({ headless: false });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  // ── 1. Test lobby entry ─────────────────────────────────────────────────
  console.log('\n[1] Loading /test directly…');
  await page.goto(`${FRONTEND}/test`, { waitUntil: 'networkidle' });

  console.log('  Capturing test lobby entry transition…');
  await snapFrames(page, 'T1-entry', 8, 200);

  await pause(2000);
  await snap(page, 'T1-loaded');

  // ── 2. Players panel — wait for bots to appear ──────────────────────────
  console.log('\n[2] Waiting for bots to join…');
  await pause(1500);
  await snap(page, 'T2-bots-joined');

  // ── 3. Card tab — adjust host hand ──────────────────────────────────────
  console.log('\n[3] Card tab — modify Alice hand…');
  // Click "+" on some cards
  const cardButtons = await page.locator('[class*="card-pill"] button, .card-pill .plus, button[aria-label*="+"]').all();
  console.log(`  Found ${cardButtons.length} +/- buttons`);

  if (cardButtons.length > 0) {
    // Click first + button
    await cardButtons[0].click().catch(() => {});
    await pause(400);
    await snapFrames(page, 'T3-card-plus', 5, 100);
  }

  // Try to open card picker by clicking on a slot
  console.log('  Trying to open card picker modal…');
  const cardSlots = await page.locator('[class*="hand-slot"], [class*="slot-btn"], button.card-slot, .alice-slot').all();
  console.log(`  Found ${cardSlots.length} card slots`);

  // Find the Add card button or "+" button at the bottom of the card panel
  const addBtn = page.locator('button:has-text("Thêm bài")').first();
  if (await addBtn.count() > 0) {
    await addBtn.click();
    await pause(500);
    await snapFrames(page, 'T3-card-picker-open', 6, 80);
    await snap(page, 'T3-card-picker-open-final');

    // Try to select a card from picker
    const pickerCards = await page.locator('.card-picker button, .picker-card, [class*="picker"] button').all();
    console.log(`  Found ${pickerCards.length} picker cards`);
    if (pickerCards.length > 0) {
      await pickerCards[0].click().catch(() => {});
      await pause(500);
      await snapFrames(page, 'T3-picker-select', 5, 120);
      await snap(page, 'T3-picker-after-select');
    }

    // Close picker
    await page.keyboard.press('Escape').catch(() => {});
    await page.locator('.modal-overlay, [class*="overlay"]').click({ position: { x: 10, y: 10 } }).catch(() => {});
    await pause(500);
  }

  // ── 4. Switch to Deck tab ────────────────────────────────────────────────
  console.log('\n[4] Switching to Deck tab…');
  const deckTab = page.locator('button:has-text("Deck")').first();
  await deckTab.click().catch(() => {});
  await pause(700);
  await snapFrames(page, 'T4-deck-tab-transition', 5, 100);
  await snap(page, 'T4-deck-tab-loaded');

  // Try clicking a deck slot to add a card
  const deckSlots = await page.locator('[class*="deck-slot"], .deck-grid button').all();
  console.log(`  Found ${deckSlots.length} deck slots`);
  if (deckSlots.length > 0) {
    await deckSlots[0].click();
    await pause(500);
    await snapFrames(page, 'T4-deck-slot-pick', 5, 120);

    // Try to select a card from the picker that appears
    const deckPickerCards = await page.locator('.card-picker button, [class*="picker"] button').all();
    if (deckPickerCards.length > 0) {
      await deckPickerCards[0].click().catch(() => {});
      await pause(400);
      await snap(page, 'T4-deck-slot-filled');
    }
  }

  // ── 5. Switch to Bot tab ─────────────────────────────────────────────────
  console.log('\n[5] Switching to Bot tab…');
  const botTab = page.locator('button:has-text("Bot")').first();
  await botTab.click().catch(() => {});
  await pause(700);
  await snapFrames(page, 'T5-bot-tab-transition', 5, 100);
  await snap(page, 'T5-bot-tab-loaded');

  // Try clicking bot mode switcher
  const modeButtons = await page.locator('.bot-mode-btn, button:has-text("Rút"), button:has-text("Chơi"), button:has-text("Bỏ")').all();
  console.log(`  Found ${modeButtons.length} bot mode buttons`);
  if (modeButtons.length >= 2) {
    await modeButtons[1].click().catch(() => {});
    await pause(500);
    await snapFrames(page, 'T5-bot-mode-switch', 5, 120);
  }

  // ── 6. Test settings toggles ─────────────────────────────────────────────
  console.log('\n[6] Test settings toggles…');
  // Toggle "Tắt BotService"
  const botServiceToggle = page.locator('button:has-text("OFF"), button:has-text("ON")').first();
  if (await botServiceToggle.count() > 0) {
    await botServiceToggle.click().catch(() => {});
    await pause(500);
    await snapFrames(page, 'T6-toggle-botservice', 5, 100);
  }

  // ── 7. Switch back to Cards tab ─────────────────────────────────────────
  console.log('\n[7] Back to Cards tab…');
  const cardsTab = page.locator('button:has-text("Bài")').first();
  await cardsTab.click().catch(() => {});
  await pause(500);
  await snap(page, 'T7-back-to-cards');

  // ── 8. Start the test game ──────────────────────────────────────────────
  console.log('\n[8] Starting test game…');
  // Look for the test lobby start button ("🚀 Bắt đầu Test")
  const startBtn = page.locator('button:has-text("Bắt đầu Test")').first();
  if (await startBtn.count() > 0) {
    await snapFrames(page, 'T8-pre-start', 3, 100);
    await startBtn.click().catch(() => {});
    await pause(2500);
    await snapFrames(page, 'T8-game-transition', 8, 200);
  }

  // Wait for game to load
  await page.waitForURL(/\/game\//, { timeout: 15000 }).catch(() => {});
  await pause(3500);
  await snap(page, 'T8-game-page-loaded');

  // ── 9. Game with bots ────────────────────────────────────────────────────
  console.log('\n[9] Capturing game with bots…');
  // Watch bots draw cards (auto-play)
  for (let i = 0; i < 4; i++) {
    await pause(2000);
    await snap(page, `T9-game-after-${i + 1}sec`);
  }

  // Try clicking on a card in hand to see hover effect
  const handCards = await page.locator('.hand-card').all();
  console.log(`  Found ${handCards.length} hand cards`);
  if (handCards.length > 0) {
    await handCards[0].hover();
    await pause(300);
    await snapFrames(page, 'T9-card-hover', 4, 100);

    // Click the card
    await handCards[0].click().catch(() => {});
    await pause(800);
    await snapFrames(page, 'T9-card-clicked', 5, 120);
    await snap(page, 'T9-card-action-modal');
  }

  // ── 10. Final state ──────────────────────────────────────────────────────
  console.log('\n[10] Final state…');
  await pause(2000);
  await snap(page, 'T10-final');

  // ── SUMMARY ──────────────────────────────────────────────────────────────
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  ${seq - 1} screenshots in ${SCREENS}`);
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
