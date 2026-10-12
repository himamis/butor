import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

async function editorReady(page: Page) {
  await expect.poll(() => page.evaluate(() => window.__butor?.ready === true)).toBe(true);
}

/** Everything the app keeps in IndexedDB, as one string (to prove it is untouched). */
const dumpDb = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<string>((resolve, reject) => {
        const req = indexedDB.open('butor');
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const db = req.result;
          const names = [...db.objectStoreNames].sort();
          if (!names.length) return resolve('{}');
          const tx = db.transaction(names, 'readonly');
          const out: Record<string, unknown> = {};
          let left = names.length;
          for (const n of names) {
            const r = tx.objectStore(n).getAll();
            r.onsuccess = () => {
              out[n] = r.result;
              if (--left === 0) {
                db.close();
                resolve(JSON.stringify(out));
              }
            };
          }
        };
      }),
  );

const savedNames = async (page: Page) => (await page.locator('.design-name').allTextContents()).sort();

test('designs: new, rename, duplicate, delete — all survive a reload (F1)', async ({ page }) => {
  page.on('dialog', (d) => void d.accept());
  await page.goto('/');
  await expect(page.getByText('No designs yet')).toBeVisible();
  await page.getByRole('button', { name: 'New design' }).click();
  await editorReady(page);
  await page.evaluate(() => window.__butor!.fixture('reference'));
  const props = page.getByRole('tabpanel', { name: 'Properties' });
  await props.getByLabel('Name', { exact: true }).fill('Bedroom');
  await props.getByLabel('Name', { exact: true }).press('Enter');
  await page.waitForTimeout(800); // autosave (500 ms debounce)
  await page.getByRole('button', { name: 'File ▾' }).click();
  await page.getByRole('menuitem', { name: 'All designs' }).click();

  // The fixture replaced the new empty design in memory; both were saved.
  await expect(page.getByRole('listitem', { name: 'Bedroom' })).toBeVisible();
  await page.getByRole('listitem', { name: 'Bedroom' }).getByRole('button', { name: 'Duplicate' }).click();
  await expect(page.getByRole('listitem', { name: 'Bedroom (copy)' })).toBeVisible();
  await page.getByRole('listitem', { name: 'Bedroom (copy)' }).getByRole('button', { name: 'Rename' }).click();
  await page.getByLabel('New name').fill('Guest room');
  await page.getByLabel('New name').press('Enter');
  await expect(page.getByRole('listitem', { name: 'Guest room' })).toBeVisible();
  await page.getByRole('listitem', { name: 'Untitled design' }).getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByRole('listitem', { name: 'Untitled design' })).toHaveCount(0);

  await page.reload();
  await expect.poll(() => savedNames(page)).toEqual(['Bedroom', 'Guest room']);
  await page.getByRole('button', { name: 'Open Guest room' }).click();
  await editorReady(page);
  await expect.poll(() => page.evaluate(() => Object.keys(window.__butor!.design().entities).length)).toBe(2);
  expect(await page.evaluate(() => window.__butor!.design().name)).toBe('Guest room');
});

test('files: a design with an unknown template imports with a warning; export → import is identical (flow 8)', async ({
  page,
}) => {
  await page.goto('/new');
  await editorReady(page);
  await page.evaluate(() => window.__butor!.fixture('reference'));
  const doc = await page.evaluate(() => window.__butor!.design());
  const future = {
    kind: 'unit',
    id: 'future',
    name: 'From the future',
    template: { id: 'unit.hologram', version: 3 },
    position: { x: 3500, y: 0, z: 300 },
    rotation: 0,
    locked: false,
    params: { glow: true },
    size: { w: 400, h: 400, d: 400 },
    materials: {},
    columns: [],
    fronts: [],
  };
  const file = {
    format: 'butor-design',
    ...doc,
    entities: { ...doc.entities, future },
    order: [...doc.order, 'future'],
  };

  // Import (File menu) → a new design with a warning naming the unreadable entity
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'File ▾' }).click();
  await page.getByRole('menuitem', { name: 'Import file…' }).click();
  await (
    await chooser
  ).setFiles({ name: 'old.butor.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(file)) });
  await expect(page.getByRole('status').filter({ hasText: 'From the future' })).toBeVisible();
  await editorReady(page);
  const imported = await page.evaluate(() => window.__butor!.design());
  expect(imported.id).not.toBe(doc.id);
  expect(imported.entities.future!.kind).toBe('opaque');

  // Export, then import the exported file: the same document (apart from the new id)
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'File ▾' }).click();
  await page.getByRole('menuitem', { name: 'Export file' }).click();
  const exported = readFileSync(await (await download).path(), 'utf8');
  const again = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'File ▾' }).click();
  await page.getByRole('menuitem', { name: 'Import file…' }).click();
  await (await again).setFiles({ name: 'x.butor.json', mimeType: 'application/json', buffer: Buffer.from(exported) });
  await expect.poll(() => page.evaluate(() => window.__butor!.design().id)).not.toBe(imported.id);
  await editorReady(page);
  const reimported = await page.evaluate(() => window.__butor!.design());
  expect({ ...reimported, id: 'x', meta: null }).toEqual({ ...imported, id: 'x', meta: null });
  expect(JSON.parse(exported).entities.future.raw).toEqual(future);
});

test('share: the viewer cannot edit, leaves the visitor’s designs untouched, and reports damaged links (flow 7)', async ({
  page,
}) => {
  await page.goto('/new');
  await editorReady(page);
  await page.evaluate(() => window.__butor!.fixture('reference'));
  await page.waitForTimeout(800); // saved
  await page.getByRole('button', { name: 'File ▾' }).click();
  await page.getByRole('menuitem', { name: 'Share link…' }).click();
  const link = await page.getByLabel('Share link', { exact: true }).inputValue();
  expect(link).toMatch(/\/view#d=[\w-]+&v=1$/);
  const before = await dumpDb(page);
  const design = await page.evaluate(() => window.__butor!.design());

  await page.goto(link);
  await editorReady(page);
  await expect(page.getByTestId('viewer-shell')).toBeVisible();
  expect(await page.evaluate(() => window.__butor!.design())).toEqual(design);

  // Try to edit: keyboard, drag, the store itself
  await page.evaluate(() => window.__butor!.view({ mode: 'top' }));
  await page.evaluate(() => window.__butor!.settle());
  const b = await page.evaluate(() => window.__butor!.bounds(Object.keys(window.__butor!.design().entities)[0]!)!);
  const p = await page.evaluate((q) => window.__butor!.toScreen(q), { x: b.center.x, y: 2300, z: b.center.z });
  const host = (await page.getByTestId('canvas-host').boundingBox())!;
  await page.mouse.dblclick(host.x + p.x, host.y + p.y); // opening is allowed
  await expect.poll(async () => (await page.evaluate(() => window.__butor!.state())).open.length).toBe(1);
  await page.mouse.click(host.x + p.x, host.y + p.y);
  for (const key of ['Delete', 'ControlOrMeta+d', 'r', 'ControlOrMeta+z']) await page.keyboard.press(key);
  await page.mouse.move(host.x + p.x, host.y + p.y);
  await page.mouse.down();
  await page.mouse.move(host.x + p.x + 200, host.y + p.y + 50, { steps: 5 });
  await page.mouse.up();
  expect(await page.evaluate(() => window.__butor!.design())).toEqual(design);
  await page.getByRole('button', { name: 'Cut list' }).click();
  await expect(page.getByRole('table', { name: 'Cut list' })).toBeVisible();

  await page.waitForTimeout(800);
  expect(await dumpDb(page)).toBe(before);

  await page.goto(link.slice(0, link.length - 40));
  await expect(page.getByRole('alert')).toContainText('damaged');
});

test('cut list and hardware CSV downloads match the lists on screen (flow 9)', async ({ page }) => {
  await page.goto('/new');
  await editorReady(page);
  await page.evaluate(() => window.__butor!.fixture('reference'));
  await page.getByRole('tab', { name: 'Lists' }).click();
  const rows = await page.getByRole('table', { name: 'Cut list' }).locator('tbody tr').count();
  expect(rows).toBeGreaterThan(5);
  const dl = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Cut list CSV' }).click();
  const d = await dl;
  expect(d.suggestedFilename()).toMatch(/cut-list\.csv$/);
  const csv = readFileSync(await d.path(), 'utf8')
    .trim()
    .split('\n');
  expect(csv[0]).toMatch(/^Material,/);
  expect(csv).toHaveLength(rows + 1);
  const hw = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Hardware CSV' }).click();
  const hcsv = readFileSync(await (await hw).path(), 'utf8')
    .trim()
    .split('\n');
  expect(hcsv[0]).toBe('Item,Qty');
  expect(hcsv.length).toBe((await page.getByRole('table', { name: 'Hardware' }).locator('tr').count()) + 1);
});

test('measure: wall → unit front is the exact depth; floor → unit top the exact height (flow 5)', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/new');
  await editorReady(page);
  await page.evaluate(() => window.__butor!.fixture('reference'));
  const ids = await page.evaluate(() => window.__butor!.design().order);
  const all = await Promise.all(ids.map((id) => page.evaluate((x) => window.__butor!.bounds(x)!, id)));
  const left = all.reduce((a, b) => (a.center.x < b.center.x ? a : b));
  const front = left.center.z + left.half.z; // bounds, handles included
  const top = left.center.y + left.half.y;
  const host = (await page.getByTestId('canvas-host').boundingBox())!;
  const at = async (q: { x: number; y: number; z: number }) => {
    await page.evaluate(() => window.__butor!.settle());
    const s = await page.evaluate((v) => window.__butor!.toScreen(v), q);
    return { x: host.x + s.x, y: host.y + s.y };
  };

  await page.keyboard.press('m');
  let p = await at({ x: 3300, y: 1500, z: 0 }); // the back wall, beside the units
  await page.mouse.click(p.x, p.y);
  p = await at({ x: left.center.x - 250, y: 150, z: front }); // a drawer front (the handle sticks out further)
  const hit = (await page.evaluate(([x, y]) => window.__butor!.pick(x!, y!), [p.x, p.y])) as { partId: string };
  const face = await page.evaluate((id) => window.__butor!.part(id)!, hit.partId);
  expect(hit.partId).toMatch(/front:/);
  await page.mouse.click(p.x, p.y);
  await expect(page.getByTestId('measure-label').first()).toHaveText(
    `${Math.round((face.center.z + face.half.z) * 10) / 10} mm`,
  );

  p = await at({ x: 2000, y: 0, z: 2200 }); // the floor
  await page.mouse.click(p.x, p.y);
  p = await at({ x: left.center.x - 200, y: top, z: left.center.z }); // the top of the wardrobe
  await page.mouse.click(p.x, p.y);
  await expect(page.getByTestId('measure-label').nth(1)).toHaveText(`${Math.round(top * 10) / 10} mm`);
  expect(top).toBe(2200);
  await page.getByRole('button', { name: 'Clear 2' }).click();
  await expect(page.getByTestId('measure-label')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('print sheet: plan, wall and unit elevations and the lists render as SVG', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/new');
  await editorReady(page);
  await page.evaluate(() => window.__butor!.fixture('reference'));
  await page.waitForTimeout(800);
  await page.goto('/print/reference');
  await expect(page.getByRole('region', { name: 'Plan' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Wall 1' }).locator('svg rect')).not.toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Unit elevations' }).locator('figure')).toHaveCount(2);
  await expect(page.getByRole('region', { name: 'Lists' }).locator('table').first()).toBeVisible();
  expect(errors).toEqual([]);
});
