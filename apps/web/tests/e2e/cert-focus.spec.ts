import { expect, test } from '@playwright/test';

// The top-bar drop-down opens one dashboard per certification area; similar certifications share one.

test.beforeEach(async ({ page }) => {
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
});

test('each dashboard has its own screen; Network+ and CCNA share Networking', async ({ page }) => {
  await page.goto('/');
  const sw = page.getByTestId('cert-switch');
  await expect(sw.locator('option')).toHaveCount(9);
  await expect(sw.locator('option[value="networking"]')).toHaveText(/Networking: Network\+, CCNA, CCNP/);

  await sw.selectOption('networking');
  await expect(page).toHaveURL(/\/dashboard\/networking$/);
  // the left side becomes the dashboard's own menu; the middle is an empty playground
  const side = page.getByTestId('dashboard-side');
  await expect(side).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Main' })).toHaveCount(0);
  await expect(page.getByTestId('dashboard-side-title')).toHaveText('Networking');
  await expect(side).toContainText('Network+ · CCNA · CCNP');
  await expect(page.getByTestId('dashboard-playground-empty')).toBeVisible();
  // the side lists sections only (no topic syllabus); exams and flashcards live inside Learn
  await expect(page.getByTestId('side-syllabus')).toHaveCount(0);
  for (const s of ['learn', 'labs', 'games', 'projects', 'skills', 'progress', 'career', 'settings']) await expect(page.getByTestId(`side-${s}`)).toBeVisible();
  await page.getByTestId('side-learn').click();
  await expect(page.getByTestId('playground-learn')).toBeVisible();
  await expect(page.getByTestId('exam-course')).toHaveValue('cert:networking');
  await page.getByTestId('learn-tab-flashcards').click();
  await expect(page.getByTestId('playground-flashcards')).toBeVisible();
  await expect(page).toHaveURL(/item=learn%2Fflashcards|item=learn\/flashcards/);
  await expect(page.getByTestId('side-learn')).toHaveAttribute('aria-current', 'page');
  await page.getByTestId('side-labs').click();
  await expect(page.getByTestId('playground-labs')).toContainText('VLANs and 802.1Q trunking');
  await page.getByTestId('side-games').click();
  await expect(page.getByTestId('playground-games')).toBeVisible();
  await page.getByTestId('side-projects').click();
  await expect(page.getByTestId('playground-projects')).toBeVisible();
  await sw.selectOption('security');
  await expect(page).toHaveURL(/\/dashboard\/security$/);
  await expect(page.getByTestId('dashboard-side-title')).toHaveText('Security fundamentals');
  await expect(side).toContainText('Security+');

  await sw.selectOption('pentest');
  await expect(side).toContainText('eJPT');
  await expect(side).toContainText('PJPT');
  await page.reload();
  await expect(sw).toHaveValue('pentest');
  await page.getByTestId('dashboard-back').click();
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
