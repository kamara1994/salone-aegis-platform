import { expect, test } from '@playwright/test';

// Every screen of the study app opens without a page error.
test('every screen renders without a page error', async ({ page }) => {
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  for (const path of ['/', '/dashboard/networking', '/dashboard/networking?item=labs', '/dashboard/security?item=settings', '/lab', '/arena', '/learn', '/games', '/skills', '/settings']) {
    await page.goto(path);
    await expect(page.locator('main')).toBeVisible();
  }
  expect(errors).toEqual([]);
});
