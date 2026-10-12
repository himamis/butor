import { expect, test } from '@playwright/test';

test('the app shell renders with a 3D canvas', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.getByTestId('app-shell')).toBeVisible();
  await expect(page.getByTestId('viewport').locator('canvas')).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__butor?.ready)).toBe(true);
  expect(errors).toEqual([]);
});

test('the lan-http project really is an insecure context', async ({ page }, info) => {
  await page.goto('/');
  await expect.poll(() => page.evaluate(() => window.__butor?.ready)).toBe(true);
  const secure = await page.evaluate(() => window.__butor?.secureContext);
  expect(secure).toBe(info.project.name === 'localhost');
});
