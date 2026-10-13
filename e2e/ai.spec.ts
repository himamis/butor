import { expect, test, type Page } from '@playwright/test';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

/**
 * Flow 10 with a mock OpenAI-compatible model server (no real keys): one request → one transaction → undo;
 * an edit made while the assistant works → conflict, nothing applied, and the model is told next time.
 */
interface Seen {
  messages: { role: string; content: string | null; tool_calls?: unknown[] }[];
}
let server: Server;
let base = '';
const requests: Seen[] = [];
let slowMs = 0;

const toolCall = (operations: unknown[]) => ({
  choices: [
    {
      delta: {
        tool_calls: [{ index: 0, function: { name: 'apply_operations', arguments: JSON.stringify({ operations }) } }],
      },
      finish_reason: 'tool_calls',
    },
  ],
});
const text = (t: string) => ({ choices: [{ delta: { content: t }, finish_reason: 'stop' }] });

test.beforeAll(async () => {
  server = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', async () => {
      const json = JSON.parse(body) as Seen;
      requests.push(json);
      const last = json.messages.at(-1)!;
      let reply: unknown;
      if (last.role === 'tool') reply = text('Done.');
      else {
        const design = JSON.parse(/<design>\n([\s\S]*)\n<\/design>/.exec(last.content ?? '')![1]!) as {
          entities: { id: string; kind: string; position: number[] }[];
        };
        if ((last.content ?? '').includes('rename')) {
          const left = design.entities
            .filter((e) => e.kind === 'unit')
            .sort((a, b) => a.position[0]! - b.position[0]!)[0]!;
          reply = toolCall([{ type: 'entity.update', id: left.id, name: 'Renamed by AI' }]);
        } else
          reply = toolCall([
            {
              type: 'entity.add',
              entity: {
                kind: 'unit',
                template: { id: 'unit.standard' },
                name: 'AI wardrobe',
                position: { x: 2000, z: 300 },
                size: { w: 1000, h: 2200, d: 600 },
              },
            },
          ]);
        if (slowMs) await new Promise((r) => setTimeout(r, slowMs));
      }
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      res.end(`data: ${JSON.stringify(reply)}\n\ndata: [DONE]\n\n`);
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;
});
test.afterAll(async () => {
  server.closeAllConnections(); // the app server keeps connections alive
  await new Promise((r) => server.close(r));
});
test.beforeEach(() => {
  requests.length = 0;
  slowMs = 0;
});

async function openAssistant(page: Page) {
  await page.goto('/new');
  await expect.poll(() => page.evaluate(() => window.__butor?.ready === true)).toBe(true);
  await page.getByRole('tab', { name: 'AI' }).click();
  await page.getByLabel('AI provider').selectOption('openai');
  if ((await page.getByRole('button', { name: 'Settings' }).getAttribute('aria-expanded')) !== 'true')
    await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByLabel('Base URL').fill(base);
  await page.getByLabel('Model').fill('mock');
}
const units = (page: Page) =>
  page.evaluate(() => Object.values(window.__butor!.design().entities).filter((e) => e.kind === 'unit').length);

test('one request is one transaction; "Undo this" removes it (flow 10)', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await openAssistant(page);
  await page.getByLabel('Message to the assistant').fill('add a wardrobe');
  await page.getByLabel('Message to the assistant').press('Enter');
  await expect(page.getByTestId('chat-assistant').last()).toContainText('Done.');
  expect(await units(page)).toBe(1);
  expect((await page.evaluate(() => window.__butor!.state())).undo).toBe(1);
  await expect(page.getByTestId('chat-assistant').last()).toContainText('1 change');
  // the model saw the tool result for its call, and no key went anywhere
  expect(requests).toHaveLength(2);
  expect(requests[1]!.messages.at(-1)).toMatchObject({ role: 'tool' });

  await page.getByRole('button', { name: 'Undo this' }).click();
  expect(await units(page)).toBe(0);
  expect(errors).toEqual([]);
});

test('an edit during the request: nothing is applied and the model is told next time (flow 10)', async ({ page }) => {
  await openAssistant(page);
  await page.evaluate(() => window.__butor!.fixture('reference'));
  const before = await page.evaluate(() => window.__butor!.design());
  const left = Object.values(before.entities).sort((a, b) => a.position.x - b.position.x)[0]!;
  slowMs = 1500;
  await page.getByLabel('Message to the assistant').fill('rename the left wardrobe');
  await page.getByLabel('Message to the assistant').press('Enter');
  await expect.poll(() => requests.length).toBe(1);
  // meanwhile, the user deletes that wardrobe
  await page.evaluate((id) => {
    const d = window.__butor!.design();
    const { [id]: _gone, ...rest } = d.entities;
    void _gone;
    window.__butor!.load({ ...d, revision: d.revision + 1, entities: rest, order: d.order.filter((x) => x !== id) });
  }, left.id);
  await expect(page.getByTestId('chat-assistant').last()).toContainText('Not applied');
  expect(
    Object.values((await page.evaluate(() => window.__butor!.design())).entities).some(
      (e) => e.name === 'Renamed by AI',
    ),
  ).toBe(false);

  slowMs = 0;
  await page.getByLabel('Message to the assistant').fill('add a wardrobe');
  await page.getByLabel('Message to the assistant').press('Enter');
  await expect(page.getByTestId('chat-assistant').last()).toContainText('Done.');
  const userMessages = requests.at(-1)!.messages.filter((m) => m.role === 'user');
  expect(userMessages.at(-1)!.content).toContain('were NOT applied');
  // history is append-only: the first request's messages are echoed unchanged
  expect(requests.at(-1)!.messages.slice(0, requests[1]!.messages.length)).toEqual(requests[1]!.messages);
});
