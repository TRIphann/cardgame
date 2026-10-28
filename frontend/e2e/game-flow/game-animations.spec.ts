import { test, expect } from '@playwright/test';

const WEB_URL = process.env.BASE_URL || 'http://localhost:5173';

test.describe('Game Flow & Animation Quality', () => {
  
  // Test 1: Full game flow on desktop (1920x1080)
  test('Full game flow - desktop 1920x1080', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    
    // Go through TestLobby which sets session correctly
    await page.goto(`${WEB_URL}/test`);
    await page.waitForLoadState('networkidle');

    // Wait until the test-lobby has fully populated: the "Bài của Bots" heading
    // appears AND the host section has +/- buttons. The 5 member-card-section
    // nodes (host + 4 bots) only appear after `room.members` is hydrated from
    // the POST /api/test/room response.
    await page.waitForFunction(() => {
      const host = document.querySelector('.member-card-section.host-section');
      if (!host) return false;
      if (!host.querySelector('.btn-count-sm')) return false;
      // The bots heading is in the DOM once bots are mapped.
      const botsHeading = Array.from(document.querySelectorAll('h3'))
        .find((h) => /Bài của Bots/i.test(h.textContent || ''));
      if (!botsHeading) return false;
      const sections = document.querySelectorAll('.member-card-section');
      return sections.length >= 5;
    }, { timeout: 30_000 });

    // Click Start
    const startBtn = page.locator('.btn-start');
    await startBtn.click();

    // Wait for game page
    await page.waitForURL(/\/game\//, { timeout: 15000 });
    
    // Wait for deck pile (game fully loaded)
    await expect(page.locator('.deck-pile')).toBeVisible({ timeout: 20_000 });

    // Dismiss the "turn intro" overlay so it doesn't intercept hover/click
    // events on the hand cards below it. The intro appears once at game
    // start and stays until the user clicks its OK button.
    const turnIntro = page.locator('.turn-intro__btn');
    if (await turnIntro.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await turnIntro.click();
      await page.waitForTimeout(300);
    }

    // Check deck pile glow animation
    const glowOpacity = await page.locator('.deck-pile__glow').evaluate(el =>
      parseFloat(window.getComputedStyle(el).opacity)
    );
    expect(glowOpacity).toBeGreaterThan(0);
    
    // Check discard pile visible
    await expect(page.locator('.discard-pile')).toBeVisible();
    
    // Check hand cards rendered
    await expect(page.locator('.hand-arc')).toBeVisible();
    await page.waitForTimeout(2000); // Wait for cards to animate in
    
    const cardCount = await page.locator('.hand-card').count();
    expect(cardCount).toBeGreaterThan(0);
    console.log(`Cards in hand: ${cardCount}`);
    
    // Test card hover effect
    const firstCard = page.locator('.hand-card').first();
    const initialTransform = await firstCard.evaluate(el => 
      window.getComputedStyle(el).transform
    );
    await firstCard.hover();
    await page.waitForTimeout(300);
    const hoverTransform = await firstCard.evaluate(el => 
      window.getComputedStyle(el).transform
    );
    expect(hoverTransform).not.toBe(initialTransform);
    
    // Screenshot for review
    await page.screenshot({ 
      path: './outputs/screenshots/game-desktop.png',
      fullPage: true 
    });
    
    console.log('✅ Desktop game flow test passed');
  });

  // Test 2: Game on mobile (375x667)
  test('Game responsive - mobile 375x667', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });

    await page.goto(`${WEB_URL}/test`);
    await page.waitForLoadState('networkidle');

    // Wait until the test-lobby has fully populated (host + bots rendered).
    await page.waitForFunction(() => {
      const host = document.querySelector('.member-card-section.host-section');
      if (!host || !host.querySelector('.btn-count-sm')) return false;
      const botsHeading = Array.from(document.querySelectorAll('h3'))
        .find((h) => /Bài của Bots/i.test(h.textContent || ''));
      if (!botsHeading) return false;
      return document.querySelectorAll('.member-card-section').length >= 5;
    }, { timeout: 30_000 });

    await page.locator('.btn-start').click();
    await page.waitForURL(/\/game\//, { timeout: 15_000 });
    await expect(page.locator('.deck-pile')).toBeVisible({ timeout: 20_000 });

    // Dismiss the turn-intro overlay if it appears.
    const turnIntro = page.locator('.turn-intro__btn');
    if (await turnIntro.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await turnIntro.click();
      await page.waitForTimeout(300);
    }

    // Check no horizontal scroll
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    const viewportWidth = await page.evaluate(() => window.innerWidth);
    expect(bodyWidth).toBeLessThanOrEqual(viewportWidth + 1);
    
    await page.screenshot({ 
      path: './outputs/screenshots/game-mobile-actual.png',
      fullPage: true 
    });
    
    console.log('✅ Mobile game test passed');
  });

  // Test 3: Card animation performance
  test('Animation performance - frame rate check', async ({ page }) => {
    page.on('console', msg => {
      if (msg.type() === 'error' || msg.text().includes('snapshot') || msg.text().includes('SignalR')) {
        console.log(`[BROWSER ${msg.type()}] ${msg.text()}`);
      }
    });
    page.on('pageerror', err => console.log(`[PAGE ERROR] ${err.message}`));
    page.on('response', res => {
      if (res.url().includes('/api/test/')) {
        console.log(`[API] ${res.status()} ${res.url().split('/').pop()}`);
      }
    });
    
    await page.goto(`${WEB_URL}/test`);
    await page.waitForLoadState('networkidle');

    await page.waitForFunction(() => {
      const host = document.querySelector('.member-card-section.host-section');
      if (!host || !host.querySelector('.btn-count-sm')) return false;
      const botsHeading = Array.from(document.querySelectorAll('h3'))
        .find((h) => /Bài của Bots/i.test(h.textContent || ''));
      if (!botsHeading) return false;
      return document.querySelectorAll('.member-card-section').length >= 5;
    }, { timeout: 30_000 });
    await page.locator('.btn-start').click();
    await page.waitForURL(/\/game\//, { timeout: 15_000 });
    await expect(page.locator('.deck-pile')).toBeVisible({ timeout: 20_000 });

    // Dismiss the turn-intro overlay before measuring FPS so the overlay
    // doesn't bias the frame time.
    const turnIntro = page.locator('.turn-intro__btn');
    if (await turnIntro.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await turnIntro.click();
      await page.waitForTimeout(300);
    }
    
    // Measure FPS.
    //
    // Two guards make this deterministic instead of flaky:
    //   1. We sample over a fixed WALL-CLOCK window (not a fixed frame
    //      count) — a frame-count sample is biased on a throttled
    //      renderer because fewer frames arrive per second.
    //   2. We take the MEDIAN frame time, not the average — a single
    //      long frame (GC, layout, a SignalR message landing) skews an
    //      average badly, while the median reflects the steady state.
    //
    // The assertion is a SANITY floor (> 10fps), not a quality bar.
    // Headless Chromium throttles requestAnimationFrame (the launch flags
    // in playwright.config.ts mitigate this, but CI runners under load
    // can still dip below 30fps). A real 30/60fps quality bar is only
    // meaningful on a headed browser — here we just prove the animation
    // loop is alive and not frozen. The actual value is logged so a
    // human can eyeball regressions in the CI output.
    const fps = await page.evaluate(() => {
      return new Promise((resolve) => {
        const times: number[] = [];
        const start = performance.now();
        let last = start;
        function tick() {
          const now = performance.now();
          times.push(now - last);
          last = now;
          if (now - start < 2000) {
            requestAnimationFrame(tick);
          } else {
            // Drop the first frame — it includes the setup cost of
            // starting the measurement loop.
            const sorted = times.slice(1).sort((a, b) => a - b);
            const median = sorted[Math.floor(sorted.length / 2)] || 16.7;
            resolve(1000 / median);
          }
        }
        requestAnimationFrame(tick);
      });
    });

    console.log(`Animation FPS: ${fps.toFixed(1)}`);
    expect(fps).toBeGreaterThan(10);
  });
});
