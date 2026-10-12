// Browser smoke test. Needs the dev server running (npm run dev).
// Usage: npm run smoke [-- <outDir>]   Env: CHROME=<path to Chrome>, URL=<app url>
import { chromium } from 'playwright-core';
import fs from 'fs';
import path from 'path';
import http from 'http';

const out = path.resolve(process.argv[2] ?? 'smoke-out');
fs.mkdirSync(out, { recursive: true });
const URL = process.env.URL ?? 'http://localhost:5173/';
const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const context = await browser.newContext({ viewport: { width: 1400, height: 850 } });
const page = await context.newPage();
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

// ---------- Room columns ----------
await S(() => window.__store.getState().select(null, false)); await page.waitForTimeout(150);
await page.click('text=+ Add column'); await page.waitForTimeout(100);
const colRow = page.locator('.column-row').first();
await colRow.locator('.row3').first().locator('input').nth(0).fill('3800'); await page.keyboard.press('Enter');
await colRow.locator('.row3').first().locator('input').nth(1).fill('200'); await page.keyboard.press('Enter');
await page.waitForTimeout(150);
const cols = (await store()).design.room.columns;
check('a column can be added and positioned', cols.length === 1 && cols[0].x === 3800 && cols[0].z === 200, JSON.stringify(cols));
await S(() => window.__store.getState().addObject('carcass', { x: 3500, y: 0, z: 290 }));
await page.waitForTimeout(150);
check('furniture overlapping a column is flagged', (await page.textContent('.status')).includes('overlapping'));
await page.click('text=3D'); await page.waitForTimeout(500);
await shot('7-column');
await page.click('button:has-text("Explode")'); await page.waitForTimeout(1500);
await shot('8-exploded-faded-room');
await page.click('button:has-text("Explode")'); await page.waitForTimeout(300);
await S(() => window.__store.getState().undo());
await page.waitForTimeout(800); // let the editor's debounced autosave settle before the viewer checks

// ---------- Share link: read-only viewer ----------
await page.click('text=Share'); await page.waitForTimeout(200);
const link = await page.inputValue('.modal input');
check('share dialog shows a view link', link.includes('#view='));
await page.click('.modal >> text=Close');
const autosaveBefore = await S(() => localStorage.getItem('wardrobe-designer:autosave'));
const viewer = await context.newPage(); // same storage as the editor
viewer.on('pageerror', (e) => errors.push('viewer: ' + e.message));
await viewer.goto(link); await viewer.waitForTimeout(1200);
const VS = (fn) => viewer.evaluate(fn);
check('viewer is read-only', await VS(() => window.__store.getState().readOnly));
check('viewer hides library and properties', (await viewer.$('.library')) === null && (await viewer.$('.props')) === null);
const viewerCount = await VS(() => window.__store.getState().design.objects.length);
check('viewer shows the shared design', viewerCount === n, `${viewerCount} objects`);
await viewer.keyboard.press('Meta+a'); await viewer.keyboard.press('Delete'); await viewer.keyboard.press('Meta+z');
await VS(() => window.__store.getState().addObject('carcass', { x: 0, y: 0, z: 0 }));
check('viewer refuses edits', (await VS(() => window.__store.getState().design.objects.length)) === viewerCount);
await viewer.click('text=Open all'); await viewer.waitForTimeout(300);
check('viewer can open doors', (await VS(() => window.__store.getState().openIds.length)) > 0);
await viewer.screenshot({ path: path.join(out, '5-viewer.png') });
await viewer.waitForTimeout(700);
const autosaveAfter = await VS(() => localStorage.getItem('wardrobe-designer:autosave'));
check('viewer never touches autosave', autosaveAfter === autosaveBefore, `before ${autosaveBefore?.length} after ${autosaveAfter?.length} editor now ${(await S(() => localStorage.getItem('wardrobe-designer:autosave')))?.length}`);
await viewer.goto(URL.replace(/\/$/, '') + '/#view=broken!!'); await viewer.reload(); await viewer.waitForTimeout(500);
check('damaged link shows a message', (await viewer.textContent('body')).includes('damaged'));
await viewer.close();

// ---------- AI chat against a mock OpenAI-compatible server ----------
const mock = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    const msgs = JSON.parse(body).messages;
    const last = msgs[msgs.length - 1];
    const message = last.role === 'tool'
      ? { role: 'assistant', content: 'Added a carcass with doors on the left.' }
      : { role: 'assistant', content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name: 'apply_operations', arguments: JSON.stringify({ operations: [{ op: 'add', templateId: 'carcass-doors', position: { x: 2600, y: 0, z: 300 }, color: '#6b4a2f' }] }) } }] };
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ choices: [{ message, finish_reason: last.role === 'tool' ? 'stop' : 'tool_calls' }] }));
  });
});
await new Promise((r) => mock.listen(0, r));
const mockUrl = `http://127.0.0.1:${mock.address().port}/v1`;
await page.click('button:has-text("AI")');
await page.click('.chat >> text=Settings');
await page.locator('.chat-settings .row', { hasText: 'Provider' }).locator('select').selectOption('openai-compatible');
await page.locator('.chat-settings .row', { hasText: 'Model' }).locator('input').fill('mock');
await page.locator('.chat-settings .row', { hasText: 'Base URL' }).locator('input').fill(mockUrl);
const before = (await store()).design.objects.length;
const pastBefore = (await store()).past.length;
await page.fill('.chat textarea', 'Add a walnut carcass with doors on the right');
await page.keyboard.press('Enter');
await page.waitForSelector('.msg.assistant .changes', { timeout: 10000 }).catch(() => {});
const chatText = await page.textContent('.chat-log');
check('AI reply is shown with its changes', chatText.includes('Added a carcass with doors') && chatText.includes('added Carcass with doors'), chatText.slice(-200));
st = await store();
check('AI change applied to the design', st.design.objects.length === before + 1 && st.design.objects.at(-1).color === '#6b4a2f');
check('AI change is one undo step', st.past.length === pastBefore + 1);
await page.screenshot({ path: path.join(out, '6-chat.png') });
await page.keyboard.press('Meta+z');
await S(() => document.activeElement?.blur()); await S(() => window.__store.getState().undo());
check('undo reverts the AI change', (await store()).design.objects.length === before);
mock.close();

check('no page errors', errors.length === 0, errors.join('; '));
await browser.close();
console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exit(failures ? 1 : 0);
