import { expect, test, type Page } from '@playwright/test';

interface U {
  id: string;
  kind: string;
  position: { x: number; z: number };
  size: { w: number; h: number; d: number };
  params: Record<string, unknown>;
  columns: { id: string; items: { id: string; template: { id: string } }[] }[];
  fronts: { id: string; drawer?: string }[];
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
    U[]
  >;
const unit = async (page: Page, id: string) => (await units(page)).find((u) => u.id === id)!;
const state = (page: Page) => page.evaluate(() => window.__butor!.state());

async function screen(page: Page, p: { x: number; y: number; z: number }) {
  await page.evaluate(() => window.__butor!.settle());
  const s = await page.evaluate((q) => window.__butor!.toScreen(q), p);
  const box = (await page.getByTestId('canvas-host').boundingBox())!;
  return { x: box.x + s.x, y: box.y + s.y };
}

test('flow 2: add a column and three drawers with fronts; open the unit; the drawers slide with their fronts', async ({
  page,
}) => {
  const errors = await boot(page);
  const p = await screen(page, { x: 2000, y: 0, z: 1750 });
  const host = (await page.getByTestId('canvas-host').boundingBox())!;
  await page.getByTestId('card-preset.wardrobe-hinged').dragTo(page.getByTestId('canvas-host'), {
    targetPosition: { x: p.x - host.x, y: p.y - host.y },
  });
  await expect.poll(async () => (await units(page)).length).toBe(1);
  const id = (await units(page))[0]!.id;

  const props = page.getByRole('tabpanel', { name: 'Properties' });
  await props.getByRole('button', { name: '+ Column' }).click();
  await expect.poll(async () => (await unit(page, id)).columns.length).toBe(2);

  await props.getByLabel('New item type').selectOption({ label: 'Drawer' });
  const col2 = props.getByRole('group', { name: 'Column 2' });
  for (let i = 0; i < 3; i++) await col2.getByRole('button', { name: '+ Drawer' }).click();
  await expect.poll(async () => (await unit(page, id)).columns[1]!.items.length).toBe(3);

  await props.getByLabel('New front type').selectOption({ label: 'Drawer front' });
  for (let i = 0; i < 3; i++) await props.getByRole('button', { name: '+ Front' }).click();
  const u = await unit(page, id);
  const drawerFronts = u.fronts.filter((f) => f.drawer);
  expect(drawerFronts).toHaveLength(3);
  expect(new Set(drawerFronts.map((f) => f.drawer))).toEqual(new Set(u.columns[1]!.items.map((i) => i.id)));
  expect((await state(page)).undo).toBe(1 + 1 + 3 + 3); // every edit is one step

  await page.keyboard.press('o');
  await expect.poll(async () => (await state(page)).open).toContain(id);
  const motions = (await page.evaluate((x) => window.__butor!.motions(x), id)) as {
    part: string;
    motion: { id: string; kind: string };
  }[];
  for (const f of drawerFronts) {
    const front = motions.find((m) => m.part.includes(`front:${f.id}`))!;
    const box = motions.find((m) => m.part.includes(`item:${f.drawer}`))!;
    expect(front.motion.kind).toBe('slide');
    expect(front.motion.id).toBe(box.motion.id);
  }
  expect(errors).toEqual([]);
});

test('properties are generated from the schema: size and construction edits are one undo step each', async ({
  page,
}) => {
  const errors = await boot(page);
  await page.evaluate(() => window.__butor!.fixture('reference'));
  const [a] = (await units(page)).sort((p, q) => p.position.x - q.position.x);
  await page.evaluate(() => window.__butor!.view({ mode: 'front' }));
  const s = await screen(page, { x: a!.position.x, y: 1500, z: a!.position.z + a!.size.d / 2 });
  await page.mouse.click(s.x, s.y);
  await expect.poll(async () => (await state(page)).selection).toEqual([a!.id]);

  const props = page.getByRole('tabpanel', { name: 'Properties' });
  // F9: carcass board 18 → 25 mm rebuilds the unit
  await props.getByLabel('Board', { exact: true }).fill('25');
  await props.getByLabel('Board', { exact: true }).press('Enter');
  await expect.poll(async () => (await unit(page, a!.id)).params.thickness).toBe(25);
  await props.getByLabel('Base', { exact: true }).selectOption('plinth');
  await expect.poll(async () => (await unit(page, a!.id)).params.base).toBe('plinth');
  const height = props.getByLabel('Height', { exact: true }).first();
  await height.fill('1900');
  await height.press('Enter');
  await expect.poll(async () => (await unit(page, a!.id)).size.h).toBe(1900);
  expect((await state(page)).undo).toBe(3);

  // An edit that would break the unit is refused and says why; nothing changes.
  await props.getByLabel('Plinth height', { exact: true }).fill('200');
  await props.getByLabel('Plinth height', { exact: true }).press('Enter');
  await expect(props.getByRole('alert')).toBeVisible();
  expect((await unit(page, a!.id)).params.plinthHeight).toBe(100);
  expect((await state(page)).undo).toBe(3);

  await page.keyboard.press('ControlOrMeta+z');
  expect((await unit(page, a!.id)).size.h).toBe(2200);
  expect((await unit(page, a!.id)).params.base).toBe('plinth');
  expect(errors).toEqual([]);
});

test('checks panel: problems are listed; clicking one selects the entities involved', async ({ page }) => {
  const errors = await boot(page);
  await page.evaluate(() => window.__butor!.fixture('reference'));
  const [a] = (await units(page)).sort((p, q) => p.position.x - q.position.x);
  // Push the left wardrobe into its neighbour → an overlap
  await page.evaluate((x) => {
    const d = window.__butor!.design();
    const e = d.entities[x]!;
    window.__butor!.load({
      ...d,
      entities: { ...d.entities, [x]: { ...e, position: { ...e.position, x: e.position.x + 300 } } },
    });
  }, a!.id);
  await page.getByRole('tab', { name: /Checks/ }).click();
  const panel = page.getByRole('tabpanel', { name: 'Checks' });
  const overlap = panel.getByRole('region', { name: 'Overlaps' }).getByRole('button').first();
  await expect(overlap).toBeVisible();
  await overlap.click();
  await expect.poll(async () => (await state(page)).selection.length).toBe(2);
  expect((await state(page)).selection).toContain(a!.id);
  expect(errors).toEqual([]);
});

test('flow 11 error containment: an entity that cannot be built shows as an error and the rest renders', async ({
  page,
}) => {
  const errors = await boot(page);
  await page.evaluate(() => window.__butor!.fixture('broken'));
  await page.evaluate(() => window.__butor!.settle());
  expect((await state(page)).checks).toContainEqual({ kind: 'invalid', entities: ['broken'] });
  expect(await page.evaluate(() => window.__butor!.stats().calls)).toBeGreaterThan(5); // the rest is drawn
  await page.getByRole('tab', { name: /Checks/ }).click();
  await page
    .getByRole('tabpanel', { name: 'Checks' })
    .getByRole('button', { name: /Broken unit/ })
    .click();
  await expect.poll(async () => (await state(page)).selection).toEqual(['broken']);
  await page.getByRole('tab', { name: 'Properties' }).click();
  await expect(page.getByRole('tabpanel', { name: 'Properties' })).toContainText('cannot be built');
  await expect(page.getByTestId('crash')).toHaveCount(0);
  expect(errors).toEqual([]);
});
