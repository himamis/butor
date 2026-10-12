import { expect, test, type Page } from '@playwright/test';

type V = { x: number; y: number; z: number };
interface UnitLike {
  id: string;
  kind: string;
  position: { x: number; z: number };
  rotation: number;
  size: { w: number; h: number; d: number };
  columns: { items: { template: { id: string } }[] }[];
}

async function boot(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect.poll(() => page.evaluate(() => window.__butor?.ready)).toBe(true);
  return errors;
}

const units = (page: Page) =>
  page.evaluate(() => Object.values(window.__butor!.design().entities).filter((e) => e.kind === 'unit')) as Promise<
    UnitLike[]
  >;
const state = (page: Page) => page.evaluate(() => window.__butor!.state());

/** Page coordinates of a world point. */
async function screen(page: Page, p: V) {
  await page.evaluate(() => window.__butor!.settle());
  const s = await page.evaluate((q) => window.__butor!.toScreen(q), p);
  const box = (await page.getByTestId('canvas-host').boundingBox())!;
  return { x: box.x + s.x, y: box.y + s.y };
}

async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++)
    await page.mouse.move(from.x + ((to.x - from.x) * i) / 8, from.y + ((to.y - from.y) * i) / 8);
  await page.mouse.up();
}

async function dropCard(page: Page, card: string, at: V) {
  const p = await screen(page, at);
  const box = (await page.getByTestId('canvas-host').boundingBox())!;
  await page.getByTestId(`card-${card}`).dragTo(page.getByTestId('canvas-host'), {
    targetPosition: { x: p.x - box.x, y: p.y - box.y },
  });
}

test('place a preset, resize it with a handle (the opposite face stays), one undo step', async ({ page }) => {
  const errors = await boot(page);
  await dropCard(page, 'preset.wardrobe-hinged', { x: 2000, y: 0, z: 1750 });
  await expect.poll(async () => (await units(page)).length).toBe(1);
  const [u] = await units(page);
  expect((await state(page)).selection).toEqual([u!.id]);
  expect((await state(page)).undo).toBe(1);
  expect(u!.rotation).toBe(0);

  const left = u!.position.x - u!.size.w / 2;
  const y = u!.size.h / 2;
  const from = await screen(page, { x: u!.position.x + u!.size.w / 2 + 60, y, z: u!.position.z });
  const to = await screen(page, { x: u!.position.x + u!.size.w / 2 + 360, y, z: u!.position.z });
  expect(
    await page.evaluate(([x, y]) => (window.__butor!.pick(x!, y!) as { kind: string }).kind, [from.x, from.y]),
  ).toBe('handle');
  await drag(page, from, to);

  const [r] = await units(page);
  expect(r!.size.w).toBeGreaterThan(1200);
  expect(r!.size.w).toBeLessThan(1400);
  expect(r!.position.x - r!.size.w / 2).toBeCloseTo(left, 0);
  expect((await state(page)).undo).toBe(2);

  await page.keyboard.press('ControlOrMeta+z');
  const [back] = await units(page);
  expect(back!.size.w).toBe(u!.size.w);
  expect(back!.position.x).toBe(u!.position.x);
  expect(errors).toEqual([]);
});

test('double-click opens a unit; a shelf and a drawer dropped into its column, one undo step each', async ({
  page,
}) => {
  const errors = await boot(page);
  await page.evaluate(() => window.__butor!.fixture('reference'));
  await page.evaluate(() => window.__butor!.view({ mode: 'front' }));
  const before = await units(page);
  const u = before.reduce((a, b) => (a.position.x < b.position.x ? a : b)); // the left wardrobe
  const count = (x: UnitLike) => x.columns.reduce((n, c) => n + c.items.length, 0);
  const front = u.position.z + u.size.d / 2;

  // Open it first so the drop lands inside the carcass rather than on a door.
  const centre = await screen(page, { x: u.position.x, y: 1500, z: front });
  await page.mouse.dblclick(centre.x, centre.y);
  await expect.poll(async () => (await state(page)).open).toContain(u.id);

  await dropCard(page, 'item.shelf', { x: u.position.x, y: 1200, z: front });
  await expect.poll(async () => count((await units(page)).find((x) => x.id === u.id)!)).toBe(count(u) + 1);
  expect((await state(page)).undo).toBe(1);

  await dropCard(page, 'item.drawer', { x: u.position.x, y: 850, z: front }); // above the three drawers;
  await expect.poll(async () => count((await units(page)).find((x) => x.id === u.id)!)).toBe(count(u) + 2);
  expect((await state(page)).undo).toBe(2);
  expect(errors).toEqual([]);
});

test('moving a unit snaps it flush to a wall, then another unit flush to it', async ({ page }) => {
  const errors = await boot(page);
  await page.evaluate(() => window.__butor!.fixture('reference'));
  await page.evaluate(() => window.__butor!.view({ mode: 'top' }));
  const [a, b] = (await units(page)).sort((p, q) => p.position.x - q.position.x);
  const top = 2400;
  const byId = async (id: string) => (await units(page)).find((x) => x.id === id)!;

  // a: left edge at 100, aim it 25 mm from the left wall (x = 0).
  const aLeft = a!.position.x - a!.size.w / 2;
  await drag(
    page,
    await screen(page, { x: a!.position.x, y: top, z: a!.position.z }),
    await screen(page, { x: a!.position.x - aLeft + 25, y: top, z: a!.position.z }),
  );
  const a2 = await byId(a!.id);
  expect(a2.position.x - a2.size.w / 2).toBeCloseTo(0, 0);
  expect(a2.position.z).toBeCloseTo(a!.position.z, 0);
  expect((await state(page)).undo).toBe(1);

  // b: aim its left edge 25 mm short of a's new right face.
  const aRight = a2.position.x + a2.size.w / 2;
  const bLeft = b!.position.x - b!.size.w / 2;
  await drag(
    page,
    await screen(page, { x: b!.position.x, y: top, z: b!.position.z }),
    await screen(page, { x: b!.position.x - (bLeft - aRight) + 25, y: top, z: b!.position.z }),
  );
  const b2 = await byId(b!.id);
  expect(b2.position.x - b2.size.w / 2).toBeCloseTo(aRight, 0);
  expect(b2.position.z).toBeCloseTo(b!.position.z, 0);
  expect((await state(page)).undo).toBe(2);
  expect(errors).toEqual([]);
});

test('copy and paste a unit, then undo the paste', async ({ page }) => {
  const errors = await boot(page);
  await page.evaluate(() => window.__butor!.fixture('reference'));
  await page.evaluate(() => window.__butor!.view({ mode: 'top' }));
  const before = await units(page);
  const [a] = [...before].sort((p, q) => p.position.x - q.position.x);
  const p = await screen(page, { x: a!.position.x, y: 2400, z: a!.position.z });
  await page.mouse.click(p.x, p.y);
  await expect.poll(async () => (await state(page)).selection).toEqual([a!.id]);
  await page.keyboard.press('ControlOrMeta+c');
  await page.keyboard.press('ControlOrMeta+v');
  const after = await units(page);
  expect(after).toHaveLength(3);
  const pasted = after.find((x) => !before.some((y) => y.id === x.id));
  expect(pasted?.size).toEqual(a!.size);
  expect(pasted!.position).not.toEqual(a!.position);
  expect((await state(page)).selection).toEqual([pasted!.id]);
  await page.keyboard.press('ControlOrMeta+z');
  expect(await units(page)).toHaveLength(2);
  expect(errors).toEqual([]);
});
