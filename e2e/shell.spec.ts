import { expect, test } from '@playwright/test';

test('the app shell renders with a 3D canvas', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/new');
  await expect(page.getByTestId('app-shell')).toBeVisible();
  await expect(page.getByTestId('viewport').locator('canvas')).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__butor?.ready)).toBe(true);
  expect(errors).toEqual([]);
});

test('the lan-http project really is an insecure context', async ({ page }, info) => {
  await page.goto('/new');
  await expect.poll(() => page.evaluate(() => window.__butor?.ready)).toBe(true);
  const secure = await page.evaluate(() => window.__butor?.secureContext);
  expect(secure).toBe(info.project.name === 'localhost');
});

test('the help page is generated from the shortcut table and the catalog', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Help' }).click();
  const help = page.getByRole('main', { name: 'Help' });
  await expect(help.getByRole('heading', { name: 'Butor help' })).toBeVisible();
  for (const name of ['Hinged wardrobe', 'Drawer front', 'Wire basket'])
    await expect(help.getByText(name, { exact: true }).first()).toBeVisible();
  for (const key of ['Ctrl/⌘ Z', 'G', 'M']) await expect(help.locator('kbd', { hasText: key }).first()).toBeVisible();
});

test('unknown pages say so instead of going blank', async ({ page }) => {
  await page.goto('/nowhere');
  await expect(page.getByText('This page does not exist.')).toBeVisible();
});
