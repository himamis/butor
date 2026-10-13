import { expect, test } from '@playwright/test';

/** Budgets from docs/v2/07 and 10, on the 100-unit fixture. A budget fails when exceeded by more than 10 %. */
const BUDGET = { calls: 80, rebuildMs: 2, snapMs: 1 };
const over = (b: number) => b * 1.1;

test('100 units: draw calls, idle frames, one-entity rebuild, snapping query', async ({ page }) => {
  await page.goto('/new');
  await expect.poll(() => page.evaluate(() => window.__butor?.ready === true)).toBe(true);
  await page.evaluate(() => window.__butor!.fixture('hundred-units'));
  await page.evaluate(() => window.__butor!.settle());
  const { calls } = await page.evaluate(() => window.__butor!.stats());
  await page.waitForTimeout(500);
  const before = (await page.evaluate(() => window.__butor!.stats())).frames;
  await page.waitForTimeout(1500);
  const idle = (await page.evaluate(() => window.__butor!.stats())).frames - before;
  const perf = await page.evaluate(() => window.__butor!.perf());
  console.log(
    `budgets: calls ${calls}, idle frames ${idle}, rebuild ${perf.rebuildMs.toFixed(3)} ms, snap ${perf.snapMs.toFixed(4)} ms`,
  );
  expect(calls).toBeLessThanOrEqual(over(BUDGET.calls));
  expect(idle).toBe(0);
  expect(perf.rebuildMs).toBeLessThanOrEqual(over(BUDGET.rebuildMs));
  expect(perf.snapMs).toBeLessThanOrEqual(over(BUDGET.snapMs));
});
