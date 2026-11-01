import { expect, test } from '@playwright/test';

test('on a phone the dashboard menu moves to the bottom and nothing overflows', async ({ page }) => {
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await page.goto('/');
  await expect(page).toHaveURL(/\/dashboard\//);
  await expect(page.getByTestId('dashboard-side')).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
