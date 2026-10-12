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
await page.click('.toolbar >> text=Front'); await page.waitForTimeout(600);
let pt = await screen({ x: 1000, y: 1100, z: 600 });
await page.mouse.click(pt.x, pt.y); await page.waitForTimeout(150);
check('click selects', (await store()).selection.length === 1);
const beforeCopy = (await store()).design.objects.length;
await page.keyboard.press('ControlOrMeta+c'); await page.keyboard.press('ControlOrMeta+v'); await page.keyboard.press('ControlOrMeta+v');
st = await store();
check('Ctrl/⌘+C, Ctrl/⌘+V pastes copies', st.design.objects.length === beforeCopy + 2 && st.selection.length === 1, `${beforeCopy} → ${st.design.objects.length}`);
await page.keyboard.press('ControlOrMeta+z'); await page.keyboard.press('ControlOrMeta+z');
check('undo removes the pasted copies', (await store()).design.objects.length === beforeCopy);
await page.mouse.click(pt.x, pt.y); await page.waitForTimeout(100);
await page.mouse.dblclick(pt.x, pt.y); await page.waitForTimeout(150);
st = await store();
check('double-click opens the doors', st.openIds.length === 1);
await page.click('.toolbar >> text=3D'); await page.waitForTimeout(400);
await S(() => window.__store.getState().select(null, false));
await page.click('.toolbar >> text=Close all'); await page.waitForTimeout(100);
check('toolbar closes what is open', (await store()).openIds.length === 0);
await page.click('.toolbar >> text=Open all'); await page.waitForTimeout(1200);
check('open all opens doors and drawers', (await store()).openIds.length === 4);
await shot('2-open');
await page.click('.toolbar >> text=Close all'); await page.waitForTimeout(300);
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
await page.click('.toolbar >> text=Cut list'); await page.waitForTimeout(200);
const modal = await page.textContent('.modal');
check('cut list shows hardware', modal.includes('Knob Ø30') && modal.includes('Bar handle'));
check('cut list marks cutouts', modal.includes('grip notch'));
await shot('4-cutlist');
await page.click('.modal button:has-text("Close")');

// Number fields clamp; bad files are rejected; autosave survives reload
await S(() => window.__store.getState().select(window.__store.getState().design.objects[0].id, false));
await page.waitForTimeout(150);
const width = page.locator('.props .row', { hasText: 'Width' }).locator('input');
await width.fill('99999'); await width.press('Enter'); await page.waitForTimeout(100);
check('width clamps to max', (await store()).design.objects[0].params.width === 2400 && (await width.inputValue()) === '2400', `store=${(await store()).design.objects[0].params.width} field=${await width.inputValue()}`);
const bad = path.join(out, 'bad.json'); fs.writeFileSync(bad, '{"hello":1}');
const n = (await store()).design.objects.length;
const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('.toolbar >> text=Open…')]);
await chooser.setFiles(bad); await page.waitForTimeout(300);
check('invalid file keeps the design', (await store()).design.objects.length === n);
await page.waitForTimeout(700); await page.reload(); await page.waitForTimeout(1000);
check('autosave restores after reload', (await store()).design.objects.length === n);

// ---------- Library: search, categories, every template renders ----------
await page.fill('.library input[type=search]', 'shoe'); await page.waitForTimeout(150);
const shoeCards = await page.$$eval('.library .card .card-name', (els) => els.map((e) => e.textContent));
check('search finds shoe templates', shoeCards.length >= 2 && shoeCards.every((n) => /shoe/i.test(n)), shoeCards.join(', '));
await page.fill('.library input[type=search]', ''); await page.click('.chips >> text=Fronts'); await page.waitForTimeout(150);
const frontCards = await page.$$eval('.library section h3 span:first-child', (els) => els.map((e) => e.textContent.trim()));
check('category chip filters the library', frontCards.length === 1 && frontCards[0].includes('Fronts'), frontCards.join(', '));
await page.click('.chips >> text=All');
const snapshot = await S(() => window.__store.getState().design);
await S(() => {
  const s = window.__store.getState();
  s.commit((d) => ({ ...d, room: { ...d.room, points: [{ x: 0, z: 0 }, { x: 14000, z: 0 }, { x: 14000, z: 6000 }, { x: 0, z: 6000 }], columns: [] }, objects: [] }));
});
const all = await S(() => {
  const s = window.__store.getState();
  const tpl = window.__templates;
  tpl.forEach((t, i) => s.addObject(t.id, { x: 800 + (i % 8) * 1650, y: 0, z: 800 + Math.floor(i / 8) * 1900 }));
  return tpl.length;
});
await page.waitForTimeout(800);
check('every template can be placed', (await store()).design.objects.length === all, `${all} templates`);
await S(() => window.__store.getState().select(null, false));
await page.click('.toolbar >> text=Top'); await page.waitForTimeout(600);
await shot('9-all-templates-top');
await page.click('.toolbar >> text=3D'); await page.click('.toolbar >> text=Open all'); await page.waitForTimeout(1200);
await shot('10-all-templates-open');
await page.click('button:has-text("Explode")'); await page.waitForTimeout(1200);
await shot('11-all-templates-exploded');
await page.click('button:has-text("Explode")'); await page.click('.toolbar >> text=Close all');
await S((d) => window.__store.getState().commit(() => d), snapshot);
await page.waitForTimeout(300);

// ---------- Resize handles ----------
await S(() => { const s = window.__store.getState(); s.addObject('carcass', { x: 3000, y: 0, z: 290 }); });
const resized = (await store()).design.objects.at(-1);
await page.click('.toolbar >> text=Front'); await page.waitForTimeout(700);
const dragHandle = async (from, toMmX) => {
  const a = await screen(from);
  const b = await screen({ ...from, x: toMmX });
  await page.mouse.move(a.x, a.y); await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 10 }); await page.mouse.up(); await page.waitForTimeout(200);
};
const pastResize = (await store()).past.length;
await dragHandle({ x: 3400 + 45, y: 1100, z: 290 }, 3400 + 45 + 300); // +x handle, 300 mm to the right
let r = (await store()).design.objects.find((o) => o.id === resized.id);
check('dragging the right handle widens to the right', r.params.width === 1100 && r.position.x - r.params.width / 2 === 2600, `width ${r.params.width}, left ${r.position.x - r.params.width / 2}`);
check('a resize drag is one undo step', (await store()).past.length === pastResize + 1);
await dragHandle({ x: 3700 + 45, y: 1100, z: 290 }, 3990 + 45); // to 10 mm from the wall → snaps flush
r = (await store()).design.objects.find((o) => o.id === resized.id);
check('resizing snaps flush to the wall', r.position.x + r.params.width / 2 === 4000, `right face ${r.position.x + r.params.width / 2}`);
await shot('12-resize');
await S(() => { const s = window.__store.getState(); s.undo(); s.undo(); s.undo(); });
check('undo restores the original', !(await store()).design.objects.some((o) => o.id === resized.id));
await page.click('.toolbar >> text=3D'); await page.waitForTimeout(300);

// ---------- Measure tool ----------
const designBeforeMeasure = (await store()).design;
await S(() => { const s = window.__store.getState(); s.commit((d) => ({ ...d, objects: [] })); s.addObject('carcass', { x: 2000, y: 0, z: 290 }); s.select(null, false); });
const pastBeforeMeasure = (await store()).past.length;
await page.click('.toolbar >> text=Front'); await page.waitForTimeout(600);
await page.keyboard.press('m');
check('M turns on the measure tool', (await store()).tool === 'measure');
let pt1 = await screen({ x: 600, y: 1800, z: 0 });      // back wall, beside the unit
let pt2 = await screen({ x: 2000, y: 1100, z: 580 });   // the unit's front (side panel edge / shelf)
await page.mouse.click(pt1.x, pt1.y); await page.mouse.move(pt2.x, pt2.y, { steps: 5 }); await page.mouse.click(pt2.x, pt2.y);
await page.waitForTimeout(200);
let ms = (await store()).measures;
check('wall to unit front measures the depth', ms.length === 1 && ms[0].distance === 580, JSON.stringify(ms.map((m) => m.distance)));
await page.click('.toolbar >> text=Top'); await page.waitForTimeout(600);
pt1 = await screen({ x: 2000, y: 2200, z: 290 });   // top of the unit
pt2 = await screen({ x: 3200, y: 0, z: 1500 });     // floor
await page.mouse.click(pt1.x, pt1.y); await page.mouse.click(pt2.x, pt2.y); await page.waitForTimeout(200);
ms = (await store()).measures;
check('top of unit to floor measures its height', ms.length === 2 && ms[1].distance === 2200, JSON.stringify(ms.map((m) => m.distance)));
await page.click('.toolbar >> text=3D'); await page.waitForTimeout(500);
await shot('13-measure');
st = await store();
check('measuring selects nothing and changes nothing', st.selection.length === 0 && st.past.length === pastBeforeMeasure);
await page.click('.toolbar >> text=Clear'); await page.keyboard.press('Escape');
check('clear and Esc leave the tool', (await store()).measures.length === 0 && (await store()).tool === 'select');
await S((d) => window.__store.getState().commit(() => d), designBeforeMeasure);

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
await page.click('.toolbar >> text=3D'); await page.waitForTimeout(500);
await shot('7-column');
await page.click('button:has-text("Explode")'); await page.waitForTimeout(1500);
await shot('8-exploded-faded-room');
await page.click('button:has-text("Explode")'); await page.waitForTimeout(300);
await S(() => window.__store.getState().undo());
await page.waitForTimeout(800); // let the editor's debounced autosave settle before the viewer checks

// ---------- A crash in the 3D view does not take down the app ----------
const good = (await store()).design;
await S(() => { const s = window.__store; s.setState({ design: { ...s.getState().design, objects: [...s.getState().design.objects, { id: 'bad', templateId: 'no-such-template', name: 'x', params: {}, position: { x: 0, y: 0, z: 0 }, rotationY: 0, color: '#fff' }] } }); });
await page.waitForTimeout(300);
check('a broken object shows an error panel, toolbar and library stay usable', (await page.$('.crash')) !== null && (await page.$('.library')) !== null && (await page.$('.toolbar')) !== null);
await S((d) => window.__store.setState({ design: d }), good);
for (const b of await page.$$('.crash button:has-text("Try again")')) await b.click();
await page.waitForTimeout(500);
check('"Try again" brings the 3D view back', (await page.$('.crash')) === null && (await page.$('.viewport canvas')) !== null);

// ---------- Share link: read-only viewer ----------
await page.click('.toolbar >> text=Share'); await page.waitForTimeout(200);
const link = await page.inputValue('.modal input');
check('share dialog shows a view link', link.includes('#view='));
await page.click('.modal button:has-text("Close")');
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
await viewer.click('.toolbar >> text=Open all'); await viewer.waitForTimeout(300);
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

check('no page errors', errors.filter((e) => !e.includes('no-such-template')).length === 0, errors.join('; '));
await browser.close();
console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exit(failures ? 1 : 0);
