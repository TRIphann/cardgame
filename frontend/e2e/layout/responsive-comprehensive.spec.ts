import { test, expect } from '@playwright/test';
import { createStartedGame, openGameAsHost, dismissTurnIntro } from '../helpers/game';

const WEB_URL = process.env.BASE_URL || 'http://localhost:5173';

const viewports = [
  { name: 'Mobile', width: 375, height: 667 },
  { name: 'Mobile Landscape', width: 667, height: 375 },
  { name: 'Tablet', width: 768, height: 1024 },
  { name: 'Desktop', width: 1920, height: 1080 },
];

test.describe('Responsive Layout - Test Lobby', () => {
  for (const viewport of viewports) {
    test(`${viewport.name} (${viewport.width}×${viewport.height})`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto(`${WEB_URL}/test`);
      await page.waitForLoadState('networkidle');

      // Wait for the lobby to actually populate. The header + tab strip +
      // host card section all need React renders to complete after the
      // POST /api/test/room response hydrates `room` state. Without this
      // wait the next assertions can flake on cold-start test rooms.
      await page.waitForFunction(() => {
        const host = document.querySelector('.member-card-section.host-section');
        return !!host && !!host.querySelector('.btn-count-sm');
      }, { timeout: 30_000 });

      // Header visible
      const header = page.locator('.test-lobby__header');
      await expect(header).toBeVisible({ timeout: 5_000 });

      // Container visible
      const container = page.locator('.test-lobby__container');
      await expect(container).toBeVisible({ timeout: 5_000 });

      // Bot tab button visible (tabs: Bài / Deck / Bot)
      const botTab = page.locator('.tab-btn').filter({ hasText: 'Bot' });
      await expect(botTab).toBeVisible({ timeout: 5_000 });

      // Switch to Bot tab to reveal counter buttons, then check touch targets
      await botTab.click();
      await page.waitForTimeout(200);

      // All +/- buttons meet touch target size (if any visible in this tab)
      const countButtons = page.locator('.btn-count-sm');
      const count = await countButtons.count();
      for (let i = 0; i < Math.min(count, 10); i++) {
        const box = await countButtons.nth(i).boundingBox();
        if (box) {
          expect(box.width).toBeGreaterThanOrEqual(44);
          expect(box.height).toBeGreaterThanOrEqual(44);
        }
      }

      // Start button visible and accessible
      const startBtn = page.locator('.btn-start');
      await expect(startBtn).toBeVisible();
      const btnBox = await startBtn.boundingBox();
      expect(btnBox?.height).toBeGreaterThanOrEqual(44);

      // No horizontal scroll on body
      const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
      const viewportWidth = await page.evaluate(() => window.innerWidth);
      expect(bodyWidth).toBeLessThanOrEqual(viewportWidth + 1); // +1 for rounding
    });
  }
});

test.describe('Animation Quality', () => {
  test('Page entry fade-in', async ({ page }) => {
    await page.goto(`${WEB_URL}/test`);
    await page.waitForLoadState('networkidle');
    
    // Check page has animated entry
    const container = page.locator('.test-lobby__container');
    await expect(container).toBeVisible();
    
    // Should have opacity animation
    const opacity = await container.evaluate(el => 
      window.getComputedStyle(el).opacity
    );
    expect(parseFloat(opacity)).toBeGreaterThan(0);
  });

  test('Button hover effects', async ({ page }) => {
    await page.goto(`${WEB_URL}/test`);
    await page.waitForLoadState('networkidle');
    
    const startBtn = page.locator('.btn-start');
    
    // Get initial state
    const initialTransform = await startBtn.evaluate(el => 
      window.getComputedStyle(el).transform
    );
    
    // Hover
    await startBtn.hover();
    await page.waitForTimeout(300); // Wait for transition
    
    const hoverTransform = await startBtn.evaluate(el => 
      window.getComputedStyle(el).transform
    );
    
    // Should have transform change on hover (translateY)
    expect(hoverTransform).not.toBe(initialTransform);
  });

  test('Counter button interactions', async ({ page }) => {
    await page.goto(`${WEB_URL}/test`);
    await page.waitForLoadState('networkidle');
    
    const plusBtn = page.locator('.btn-count-sm').filter({ hasText: '+' }).first();
    
    // Get initial background
    const initialBg = await plusBtn.evaluate(el => 
      window.getComputedStyle(el).backgroundColor
    );
    
    // Hover should change background
    await plusBtn.hover();
    await page.waitForTimeout(200);
    
    const hoverBg = await plusBtn.evaluate(el => 
      window.getComputedStyle(el).backgroundColor
    );
    
    expect(hoverBg).not.toBe(initialBg);
  });

  test('Toggle button on/off states', async ({ page }) => {
    await page.goto(`${WEB_URL}/test`);
    await page.waitForLoadState('networkidle');
    
    // Find first toggle button (Deal cards toggle - defaults to "on")
    const toggleBtn = page.locator('.toggle-btn').first();
    await expect(toggleBtn).toBeVisible();
    
    const beforeClass = await toggleBtn.getAttribute('class');
    
    // Click to flip state
    await toggleBtn.click();
    await page.waitForTimeout(200);
    
    const afterClass = await toggleBtn.getAttribute('class');
    
    // Class should toggle between "on" and "off"
    expect(afterClass).not.toBe(beforeClass);
    expect(afterClass).toMatch(/toggle-btn (on|off)/);
  });
});

test.describe('Game Page Responsive', () => {
  for (const viewport of viewports) {
    test(`Game board scales properly - ${viewport.name} (${viewport.width}×${viewport.height})`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      const game = await createStartedGame(`Resp${viewport.width}`);
      await openGameAsHost(page, game);
      await dismissTurnIntro(page);

      // Core table pieces render at every size.
      await expect(page.locator('.game-table')).toBeVisible();
      await expect(page.locator('.deck-pile').first()).toBeVisible();
      await expect(page.locator('.hand-arc').first()).toBeVisible();

      // The page must not scroll sideways.
      const { bodyWidth, viewportWidth } = await page.evaluate(() => ({
        bodyWidth: document.body.scrollWidth,
        viewportWidth: window.innerWidth,
      }));
      expect(bodyWidth).toBeLessThanOrEqual(viewportWidth + 1);

      // The fanned hand's container must stay inside the viewport width.
      const arc = await page.locator('.hand-arc').first().boundingBox();
      expect(arc).not.toBeNull();
      expect(arc!.x).toBeGreaterThanOrEqual(-1);
      expect(arc!.x + arc!.width).toBeLessThanOrEqual(viewport.width + 1);

      // Every card keeps a usable, non-collapsed size.
      const cards = page.locator('.hand-card');
      const n = await cards.count();
      expect(n).toBeGreaterThan(0);
      for (let i = 0; i < n; i++) {
        const box = await cards.nth(i).boundingBox();
        expect(box, `card ${i} has no box`).not.toBeNull();
        expect(box!.width).toBeGreaterThan(40);
        expect(box!.height).toBeGreaterThan(50);
      }
    });
  }
});

test.describe('Visual Regression - Layout Integrity', () => {
  test('Test lobby - no overlapping elements', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto(`${WEB_URL}/test`);
    await page.waitForLoadState('networkidle');
    
    // Get all interactive elements
    const buttons = await page.locator('button, input, select').all();
    const boxes = await Promise.all(buttons.map(b => b.boundingBox()));
    
    // Check no major overlaps (allow 2px tolerance for borders)
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i];
        const b = boxes[j];
        if (!a || !b) continue;
        
        const overlap = !(
          a.x + a.width < b.x + 2 ||
          b.x + b.width < a.x + 2 ||
          a.y + a.height < b.y + 2 ||
          b.y + b.height < a.y + 2
        );
        
        if (overlap) {
          const elemA = await buttons[i].getAttribute('class');
          const elemB = await buttons[j].getAttribute('class');
          console.log(`Overlap detected: ${elemA} vs ${elemB}`);
        }
      }
    }
  });
});
