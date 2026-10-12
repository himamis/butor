import { expect, test, type Page } from '@playwright/test';

async function boot(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect.poll(() => page.evaluate(() => window.__butor?.ready)).toBe(true);
  return errors;
}

async function screen(page: Page, p: { x: number; y: number; z: number }) {
  await page.evaluate(() => window.__butor!.settle());
  const s = await page.evaluate((q) => window.__butor!.toScreen(q), p);
  const box = (await page.getByTestId('canvas-host').boundingBox())!;
  return { x: box.x + s.x, y: box.y + s.y };
}

const room = (page: Page) => page.evaluate(() => window.__butor!.design().room);
const state = (page: Page) => page.evaluate(() => window.__butor!.state());

test('room edit: drag a corner (grid snapped, undo restores); a window behind a unit flags it', async ({ page }) => {
  const errors = await boot(page);
  await page.evaluate(() => window.__butor!.fixture('reference'));
  await page.keyboard.press('g');
  await expect(page.getByRole('complementary', { name: 'Room' })).toBeVisible();

  // Drag the far-right corner (4000, 3500) out by ~503 × 0: x lands on the grid, z stays square.
  const before = await room(page);
  const c = before.corners[2]!;
  const from = await screen(page, { x: c.x, y: 0, z: c.z });
  const to = await screen(page, { x: c.x + 503, y: 0, z: c.z + 4 });
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++)
    await page.mouse.move(from.x + ((to.x - from.x) * i) / 8, from.y + ((to.y - from.y) * i) / 8);
  await expect(page.getByRole('status')).toContainText('Walls');
  await page.mouse.up();
  const after = (await room(page)).corners[2]!;
  expect(after.x % 10).toBe(0);
  expect(after.x).toBeGreaterThan(c.x + 400);
  expect(after.z).toBe(c.z);
  expect((await state(page)).undo).toBe(1);
  await page.keyboard.press('ControlOrMeta+z');
  expect((await room(page)).corners[2]).toEqual(c);

  // A window on the back wall (wall 1, z = 0), centred behind the left wardrobe (x 100–1100).
  await page.getByLabel('Wall for new openings and obstacles').selectOption({ label: 'Wall 1' });
  await page.getByRole('button', { name: '+ Window' }).click();
  const win = page.getByRole('group', { name: 'window on wall 1' });
  await win.getByLabel('From corner').fill('100');
  await win.getByLabel('From corner').press('Enter');
  await expect.poll(async () => (await room(page)).openings[0]?.offset).toBe(100);
  const units = await page.evaluate(() =>
    Object.values(window.__butor!.design().entities).filter((e) => e.kind === 'unit'),
  );
  const left = units.reduce((a, b) => (a.position.x < b.position.x ? a : b));
  await expect
    .poll(async () => (await state(page)).checks.filter((k) => k.kind === 'opening').flatMap((k) => k.entities))
    .toContain(left.id);

  // Leaving room edit restores the view and the library.
  await page.keyboard.press('Escape');
  await expect(page.getByRole('complementary', { name: 'Library' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('room shape presets and refusals: an L-shaped room, and a self-intersecting drag is refused', async ({ page }) => {
  const errors = await boot(page);
  await page.getByRole('button', { name: 'Room', exact: true }).click();
  await page.getByLabel('Room shape').selectOption('l-shape');
  await page.getByRole('button', { name: 'Apply shape' }).click();
  await expect.poll(async () => (await room(page)).corners.length).toBe(6);

  // Drag corner 2 (4000, 0) across to the far side: walls would cross, so the drag is refused.
  const r = await room(page);
  const c = r.corners[1]!;
  const from = await screen(page, { x: c.x, y: 0, z: c.z });
  const to = await screen(page, { x: -1500, y: 0, z: 3800 });
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++)
    await page.mouse.move(from.x + ((to.x - from.x) * i) / 8, from.y + ((to.y - from.y) * i) / 8);
  await page.mouse.up();
  expect((await room(page)).corners).toEqual(r.corners);
  await expect(page.getByRole('status')).toBeVisible();
  expect(errors).toEqual([]);
});
