// Browser smoke test. Needs the dev server running (npm run dev).
// Usage: npm run smoke [-- <outDir>]   Env: CHROME=<path to Chrome>, URL=<app url>
import { chromium } from 'playwright-core';
import fs from 'fs';
import path from 'path';

const out = path.resolve(process.argv[2] ?? 'smoke-out');
fs.mkdirSync(out, { recursive: true });
const URL = process.env.URL ?? 'http://localhost:5173/';
const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1400, height: 850 } });
const errors = [];
let failures = 0;
page.on('pageerror', (e) => errors.push(e.message));
page.on('dialog', (d) => d.accept());

const S = (fn, arg) => page.evaluate(fn, arg);
const store = () => S(() => window.__store.getState());
const check = (name, ok, detail = '') => {
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
};
const shot = (name) => page.screenshot({ path: path.join(out, `${name}.png`) });
const screen = (p) => S((p) => {
  const { camera, gl } = window.__three; const r = gl.domElement.getBoundingClientRect();
  const v = new (camera.position.constructor)(p.x / 1000, p.y / 1000, p.z / 1000).project(camera);
  return { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height };
}, p);

await page.goto(URL);
await S(() => localStorage.clear());
await page.reload();
await page.waitForTimeout(1000);

// Drag-and-drop from the library
await S(() => {
  const el = document.querySelector('.viewport'); const dt = new DataTransfer(); dt.setData('template', 'carcass');
  const r = el.getBoundingClientRect(); const o = { bubbles: true, cancelable: true, dataTransfer: dt, clientX: r.left + r.width / 2, clientY: r.top + r.height * 0.7 };
  el.dispatchEvent(new DragEvent('dragover', o)); el.dispatchEvent(new DragEvent('drop', o));
});
check('drop adds an object', (await store()).design.objects.length === 1);

// A small wardrobe: carcass with doors, a carcass with drawers
await S(() => {
  const s = window.__store.getState();
  s.commit((d) => ({ ...d, objects: [] }));
  s.addObject('carcass-doors', { x: 1000, y: 0, z: 300 });
  s.addObject('carcass', { x: 1800, y: 0, z: 290 });
  const c = window.__store.getState().design.objects[1];
  window.__store.getState().setParam(c.id, 'shelves', 0);
  for (let i = 0; i < 3; i++) window.__store.getState().addObject('drawer', { x: 1800, y: 18 + i * 210, z: 330 });
  window.__store.getState().select(null, false);
});
let st = await store();
check('no overlaps in the sample wardrobe', (await page.textContent('.status')).includes('overlapping') === false, await page.textContent('.status'));
await page.waitForTimeout(600);
await shot('1-closed');

// Click selects; double-click opens
await page.click('text=Front'); await page.waitForTimeout(600);
let pt = await screen({ x: 1000, y: 1100, z: 600 });
await page.mouse.click(pt.x, pt.y); await page.waitForTimeout(150);
check('click selects', (await store()).selection.length === 1);
await page.mouse.dblclick(pt.x, pt.y); await page.waitForTimeout(150);
st = await store();
check('double-click opens the doors', st.openIds.length === 1);
await page.click('text=3D'); await page.waitForTimeout(400);
await S(() => window.__store.getState().select(null, false));
await page.click('text=Close all'); await page.waitForTimeout(100);
check('toolbar closes what is open', (await store()).openIds.length === 0);
await page.click('text=Open all'); await page.waitForTimeout(1200);
check('open all opens doors and drawers', (await store()).openIds.length === 4);
await shot('2-open');
await page.click('text=Close all'); await page.waitForTimeout(300);
check('close all', (await store()).openIds.length === 0);

// Exploded view
const past = (await store()).past.length;
await page.click('button:has-text("Explode")'); await page.waitForTimeout(1500);
check('explode adds no undo history', (await store()).past.length === past);
await shot('3-exploded');
await page.click('button:has-text("Explode")'); await page.waitForTimeout(300);

// Hardware selects + cut list
await S(() => window.__store.getState().select(window.__store.getState().design.objects[2].id, false));
await page.waitForTimeout(150);
await page.locator('.props .row', { hasText: 'Handle' }).locator('select').selectOption({ label: 'Cutout (grip)' });
check('handle select updates params', (await store()).design.objects[2].params.handle === 3);
await page.click('text=Cut list'); await page.waitForTimeout(200);
const modal = await page.textContent('.modal');
check('cut list shows hardware', modal.includes('Knob Ø30') && modal.includes('Bar handle'));
check('cut list marks cutouts', modal.includes('grip notch'));
await shot('4-cutlist');
await page.click('text=Close');

// Number fields clamp; bad files are rejected; autosave survives reload
await S(() => window.__store.getState().select(window.__store.getState().design.objects[0].id, false));
await page.waitForTimeout(150);
const width = page.locator('.props .row', { hasText: 'Width' }).locator('input');
await width.fill('99999'); await width.press('Enter'); await page.waitForTimeout(100);
check('width clamps to max', (await store()).design.objects[0].params.width === 2400 && (await width.inputValue()) === '2400', `store=${(await store()).design.objects[0].params.width} field=${await width.inputValue()}`);
const bad = path.join(out, 'bad.json'); fs.writeFileSync(bad, '{"hello":1}');
const n = (await store()).design.objects.length;
const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('text=Open…')]);
await chooser.setFiles(bad); await page.waitForTimeout(300);
check('invalid file keeps the design', (await store()).design.objects.length === n);
await page.waitForTimeout(700); await page.reload(); await page.waitForTimeout(1000);
check('autosave restores after reload', (await store()).design.objects.length === n);

check('no page errors', errors.length === 0, errors.join('; '));
await browser.close();
console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exit(failures ? 1 : 0);
