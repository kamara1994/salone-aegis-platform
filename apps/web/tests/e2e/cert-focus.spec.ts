import { expect, test } from '@playwright/test';

// The top-bar drop-down opens one dashboard per certification area; similar certifications share one.

test.beforeEach(async ({ page }) => {
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
});

test('each dashboard has its own screen; Network+ and CCNA share Networking', async ({ page }) => {
  await page.goto('/');
  const sw = page.getByTestId('cert-switch');
  await expect(sw.locator('option')).toHaveCount(10);
  await expect(sw.locator('option[value="networking"]')).toHaveText(/Networking: Network\+, CCNA/);

  await sw.selectOption('networking');
  await expect(page).toHaveURL(/\/dashboard\/networking$/);
  await expect(page.getByTestId('dashboard-title')).toHaveText('Networking');
  await expect(page.getByTestId('dashboard-certs')).toContainText('Network+');
  await expect(page.getByTestId('dashboard-certs')).toContainText('CCNA');
  await expect(page.getByTestId('dashboard-section-labs')).toBeVisible();

  await sw.selectOption('security');
  await expect(page).toHaveURL(/\/dashboard\/security$/);
  await expect(page.getByTestId('dashboard-title')).toHaveText('Security fundamentals');
  await expect(page.getByTestId('dashboard-certs')).toContainText('Security+');

  await sw.selectOption('pentest');
  await expect(page.getByTestId('dashboard-certs')).toContainText('eJPT');
  await expect(page.getByTestId('dashboard-certs')).toContainText('PJPT');
  await page.reload();
  await expect(sw).toHaveValue('pentest');
  await expect(page.getByTestId('nav-dashboard')).toContainText('Pentest');

  // the rest of the app follows the dashboard
  await page.goto('/learn');
  await expect(page.getByTestId('learn-cert')).toHaveText('Pentest');
  await expect(page.getByTestId('topic-card-nmap-scanning')).toBeVisible();
  await page.goto('/learn?tab=exams');
  await expect(page.getByTestId('exam-course')).toHaveValue('cert:pentest');
  await page.goto('/games');
  await expect(page.getByTestId('game-template')).toHaveValue('pentest');

  await page.getByTestId('nav-dashboard').click();
  await expect(page).toHaveURL(/\/dashboard\/pentest$/);
  await sw.selectOption('all');
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByTestId('nav-dashboard')).toHaveCount(0);
});

test('a choice saved before dashboards existed opens the right dashboard', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('aegis.cert', JSON.stringify('ccna')));
  await page.goto('/learn');
  await expect(page.getByTestId('cert-switch')).toHaveValue('networking');
});

test('the client filter still works from the notifications drawer', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Notifications/ }).click();
  await expect(page.locator('#client-switch')).toBeVisible();
});
