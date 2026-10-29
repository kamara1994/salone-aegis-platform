import { expect, test } from '@playwright/test';

// Choosing a certification in the top bar focuses the cockpit, Learn, Labs and Games on it.

test.beforeEach(async ({ page }) => {
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
});

test('pick eJPT in the top bar and every area follows it', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('cert-strip-empty')).toBeVisible();
  await page.getByTestId('cert-switch').selectOption('ejpt');
  await expect(page.getByTestId('cert-strip-name')).toContainText('eJPT');
  await expect(page.getByTestId('cert-strip')).toContainText('Host and network auditing');
  await page.reload();
  await expect(page.getByTestId('cert-switch')).toHaveValue('ejpt');
  await expect(page.getByTestId('cert-strip-name')).toContainText('eJPT');

  await page.getByTestId('cert-next-topic').click();
  await expect(page).toHaveURL(/\/learn\?topic=/);
  await expect(page.getByTestId('learn-cert')).toHaveText('eJPT');
  await expect(page.getByTestId('topics-cert')).toContainText('eJPT');
  await page.goto('/learn');
  await expect(page.getByTestId('topics-heading')).toContainText('eJPT');
  await expect(page.getByTestId('topic-card-nmap-scanning')).toBeVisible();
  await expect(page.getByTestId('topic-card-vlans')).toHaveCount(0);
  await page.getByTestId('topics-show-all').check();
  await expect(page.getByTestId('topic-course')).toBeVisible();

  await page.goto('/learn?tab=exams');
  await expect(page.getByTestId('exam-course')).toHaveValue('cert:ejpt');

  await page.goto('/lab');
  await expect(page.getByTestId('lab-device-SW-ACC-01')).toBeVisible();
  await page.getByTestId('tool-labs').click();
  await expect(page.getByTestId('lab-cat-for-your-certification')).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('lab-cat-for-your-certification')).toContainText('For eJPT');
  await expect(page.getByTestId('lab-card-subnet-plan')).toBeVisible();

  await page.goto('/games');
  await expect(page.getByTestId('game-template')).toHaveValue('pentest');

  // switch to Network+ and the cockpit follows
  await page.goto('/');
  await page.getByTestId('cert-switch').selectOption('network-plus');
  await expect(page.getByTestId('cert-strip-name')).toContainText('Network+');
  await page.getByTestId('cert-switch').selectOption('all');
  await expect(page.getByTestId('cert-strip-empty')).toBeVisible();
});

test('the client filter still works from the notifications drawer', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Notifications/ }).click();
  await expect(page.locator('#client-switch')).toBeVisible();
});
