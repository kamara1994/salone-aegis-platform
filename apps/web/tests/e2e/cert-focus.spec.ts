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
  await expect(page.getByTestId('dashboard-side-title')).toContainText('Networking');
  await expect(page.getByTestId('dash-toolbar')).toContainText('Network+, CCNA, CCNP');
  await expect(page.getByTestId('dashboard-playground-empty')).toBeVisible();
  // icon rail of sections; each section has a second toolbar and its own side panel
  for (const x of ['learn', 'labs', 'scenario-lab', 'games', 'projects', 'skills', 'progress', 'career', 'settings']) await expect(page.getByTestId(`side-${x}`)).toBeVisible();
  await page.getByTestId('side-learn').click();
  await expect(page.getByTestId('dash-toolbar-section')).toHaveText('Learn');
  for (const x of ['topics', 'images', 'exam', 'flashcards', 'scenario-questions', 'interview']) await expect(page.getByTestId(`side-part-${x}`)).toBeVisible();
  // Learn by topic stays empty until a topic is chosen, then shows only that topic
  await expect(page.getByTestId('topic-empty')).toBeVisible();
  for (const x of ['dash-tool-lab', 'dash-tool-exam', 'dash-tool-flashcards', 'dash-tool-interview']) await expect(page.getByTestId(x)).toHaveCount(0);
  await page.getByTestId('dash-topic').selectOption('ospf');
  await expect(page.getByTestId('topic-title')).toHaveText('OSPF basics');
  await expect(page.getByTestId('topics-heading')).toHaveCount(0);
  await page.getByTestId('mode-advanced').click();
  await expect(page.getByTestId('mode-advanced')).toHaveAttribute('aria-checked', 'true');
  await page.getByTestId('dash-topic-tools').click();
  await page.getByTestId('topic-tool-key-terms').click();
  await expect(page.getByTestId('topic-terms')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByTestId('dash-topic').selectOption('');
  await page.getByTestId('side-part-exam').click();
  await expect(page.getByTestId('exam-course')).toHaveValue('cert:networking');
  // the toolbar topic picker narrows the exam, flashcards and scenario questions to one topic
  await page.getByTestId('dash-topic').selectOption('vlans');
  await expect(page.getByTestId('exam-course')).toHaveValue('topic:vlans');
  await page.getByTestId('side-part-scenario-questions').click();
  await expect(page.getByTestId('scenario-q-stem')).toBeVisible();
  await page.getByTestId('scenario-q-option-0').click();
  await expect(page.getByTestId('scenario-q-explain')).toBeVisible();
  await page.getByTestId('dash-topic').selectOption('');
  await page.getByTestId('side-part-flashcards').click();
  await expect(page.getByTestId('playground-flashcards')).toBeVisible();
  await expect(page).toHaveURL(/item=learn%2Fflashcards|item=learn\/flashcards/);
  await expect(page.getByTestId('side-learn')).toHaveAttribute('aria-current', 'page');
  // Labs opens the lab designer: its toolbar and the device library
  await page.getByTestId('side-labs').click();
  await expect(page.getByTestId('lab-designer')).toBeVisible();
  await expect(page.getByRole('toolbar', { name: 'Lab designer tools' })).toBeVisible();
  await page.getByTestId('side-scenario-lab').click();
  await expect(page.getByTestId('side-part-faults')).toBeVisible();
  await expect(page.getByTestId('side-part-drills')).toBeVisible();
  await page.getByTestId('side-games').click();
  await expect(page.getByTestId('playground-games')).toBeVisible();
  await expect(page.getByTestId('side-part-all')).toBeVisible();
  await page.getByTestId('side-projects').click();
  await expect(page.getByTestId('playground-projects')).toBeVisible();
  await sw.selectOption('security');
  await expect(page).toHaveURL(/\/dashboard\/security$/);
  await expect(page.getByTestId('dashboard-side-title')).toContainText('Security fundamentals');
  await expect(page.getByTestId('dash-toolbar')).toContainText('Security+');

  await sw.selectOption('pentest');
  await expect(page.getByTestId('dash-toolbar')).toContainText('eJPT');
  await expect(page.getByTestId('dash-toolbar')).toContainText('PJPT');
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
