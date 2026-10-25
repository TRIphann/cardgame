import { test, expect } from '@playwright/test';

test.describe('Touch Target Detailed Audit', () => {
  test('List all small touch targets with details', async ({ page }) => {
    await page.goto('http://localhost:5173/test');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000); // Wait for animations

    // Tìm tất cả phần tử interactive
    const touchTargets = await page.evaluate(() => {
      const interactiveSelectors = 'button, a, input, select, textarea, [role="button"], [onclick], [tabindex="0"]';
      const elements = Array.from(document.querySelectorAll(interactiveSelectors));

      return elements
        .filter(el => {
          const style = window.getComputedStyle(el);
          return style.display !== 'none' && style.visibility !== 'hidden';
        })
        .map(el => {
          const rect = el.getBoundingClientRect();
          const computed = window.getComputedStyle(el);
          
          return {
            tag: el.tagName.toLowerCase(),
            id: el.id || '',
            classes: el.className || '',
            text: el.textContent?.trim().substring(0, 30) || '',
            width: Math.round(rect.width),
            height: Math.round(rect.height),
            fontSize: computed.fontSize,
            padding: computed.padding,
            isTooSmall: rect.width < 44 || rect.height < 44,
            selector: el.id ? `#${el.id}` : `.${(el.className || '').split(' ')[0]}`
          };
        });
    });

    const small = touchTargets.filter(t => t.isTooSmall);
    
    console.log('\n========== TOUCH TARGETS AUDIT ==========');
    console.log(`Total interactive elements: ${touchTargets.length}`);
    console.log(`Too small (< 44x44): ${small.length}`);
    console.log(`Pass rate: ${Math.round((1 - small.length / touchTargets.length) * 100)}%\n`);

    // Group by class để thấy pattern
    const byClass = small.reduce((acc, t) => {
      const key = t.classes.split(' ')[0] || 'no-class';
      if (!acc[key]) acc[key] = [];
      acc[key].push(t);
      return acc;
    }, {} as Record<string, typeof small>);

    console.log('--- Grouped by class ---');
    Object.entries(byClass).forEach(([cls, items]) => {
      console.log(`\n${cls} (${items.length} elements):`);
      items.slice(0, 2).forEach(item => {
        console.log(`  ${item.width}×${item.height}px | text: "${item.text}"`);
      });
    });

    expect(small.length).toBeLessThan(touchTargets.length * 0.15); // Max 15% fail
  });
});
