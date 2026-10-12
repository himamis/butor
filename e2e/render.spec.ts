import { expect, test, type Page } from '@playwright/test';

async function boot(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/new');
  await expect.poll(() => page.evaluate(() => window.__butor?.ready)).toBe(true);
  return errors;
}

const settle = (page: Page) => page.evaluate(() => window.__butor!.settle());

test('the reference design renders without errors', async ({ page }) => {
  const errors = await boot(page);
  await page.evaluate(() => window.__butor!.fixture('reference'));
  await settle(page);
  expect(await page.evaluate(() => window.__butor!.stats().calls)).toBeGreaterThan(5);
  expect(errors).toEqual([]);
});

test('budget: 100 units ≤ 80 draw calls, and nothing renders while idle', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => window.__butor!.fixture('hundred-units'));
  await settle(page);
  const calls = await page.evaluate(() => window.__butor!.stats().calls);
  expect(calls).toBeLessThanOrEqual(80);
  await page.waitForTimeout(500);
  const before = await page.evaluate(() => window.__butor!.stats().frames);
  await page.waitForTimeout(2000);
  const after = await page.evaluate(() => window.__butor!.stats().frames);
  expect(after - before, 'idle frames in 2 s').toBe(0);
});

test('picking returns the part, its entity and the face normal', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => window.__butor!.fixture('reference'));
  await page.evaluate(() => window.__butor!.view({ mode: 'front' }));
  await settle(page);
  // the left wardrobe stands at x = 600 (1000 wide, 600 deep, against the back wall)
  const p = await page.evaluate(() => window.__butor!.toScreen({ x: 600, y: 1500, z: 620 }));
  const box = (await page.getByTestId('canvas-host').boundingBox())!;
  const hit = (await page.evaluate(([x, y]) => window.__butor!.pick(x!, y!), [box.x + p.x, box.y + p.y])) as {
    kind: string;
    entityId: string;
    normal: { z: number };
  };
  expect(hit.kind).toBe('part');
  expect(hit.entityId).toBeTruthy();
  expect(hit.normal.z).toBeGreaterThan(0.9); // a front faces the viewer
});

test('views, open and explode all render', async ({ page }) => {
  const errors = await boot(page);
  await page.evaluate(() => window.__butor!.fixture('reference'));
  for (const mode of ['3d', 'front', 'top', 'side', 'elevation'] as const) {
    await page.evaluate((m) => window.__butor!.view({ mode: m }), mode);
    await settle(page);
  }
  await page.getByRole('button', { name: 'Open all' }).click();
  await page.getByRole('button', { name: 'Explode' }).click();
  await settle(page);
  await page.getByRole('button', { name: 'Close all' }).click();
  expect(errors).toEqual([]);
});

test.describe('visual baselines', () => {
  test.skip(!process.env.VISUAL, 'set VISUAL=1 to compare screenshots (baselines are per platform)');
  for (const [name, view] of [
    ['3d', { mode: '3d' }],
    ['front', { mode: 'front' }],
    ['top', { mode: 'top' }],
    ['open', { mode: '3d', open: 'all' }],
    ['exploded', { mode: '3d', exploded: true }],
  ] as const) {
    test(name, async ({ page }, info) => {
      test.skip(info.project.name !== 'localhost', 'one origin is enough for pixels');
      await boot(page);
      await page.evaluate(() => window.__butor!.fixture('reference'));
      await page.evaluate((v) => {
        const { open, ...rest } = v as { open?: string };
        window.__butor!.view(rest as never);
        if (open) document.querySelector<HTMLButtonElement>('button[title^="Open or close"]')!.click();
      }, view);
      await page.waitForTimeout(100);
      await settle(page);
      await expect(page.getByTestId('canvas-host')).toHaveScreenshot(`${name}.png`, { maxDiffPixelRatio: 0.01 });
    });
  }
});
