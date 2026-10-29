import { expect, test } from '@playwright/test';

// Learn tabs (topics with teaching levels, exams, flashcards, images), the Labs picker and cable disconnect.

test.beforeEach(async ({ page }) => {
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
});

test('Learn has four tabs; pick a course and topic, switch teaching level, take the topic exam, go to the lab', async ({ page }) => {
  await page.goto('/learn');
  for (const name of ['Learn with images', 'Topics', 'Exams and flashcards', 'Tracks and progress']) await expect(page.getByRole('tab', { name })).toBeVisible();
  await expect(page.getByTestId('topics-view')).toBeVisible();
  await page.getByTestId('topic-course').selectOption('networking');
  await page.getByTestId('topic-select').selectOption('vlans');
  await expect(page.getByTestId('topic-title')).toHaveText('VLANs');
  await page.getByTestId('level-simple').click();
  await expect(page.getByTestId('topic-explanation')).toContainText('invisible walls');
  await page.getByTestId('level-advanced').click();
  await expect(page.getByTestId('topic-explanation')).toContainText('parking VLAN');
  const exam = page.getByTestId('topic-exam');
  for (let k = 0; k < 3; k++) await exam.getByTestId(`exam-q${k}-o1`).click();
  await page.getByTestId('topic-exam-submit').click();
  await expect(page.getByTestId('topic-exam-score')).toContainText('/3');
  await page.reload();
  await expect(page.getByTestId('topic-title')).toHaveText('VLANs');
  await expect(page.getByTestId('level-advanced')).toHaveAttribute('aria-checked', 'true');
  await page.getByTestId('topic-next').click();
  await expect(page.getByTestId('topic-title')).toHaveText('802.1Q trunks');
  await page.getByTestId('topic-prev').click();
  await page.getByTestId('topic-lab-link').click();
  await expect(page).toHaveURL(/\/lab/);
  await expect(page.getByTestId('workbook-active')).toBeVisible();
});

test('topic search spans every course and opens the full interactive lesson', async ({ page }) => {
  await page.goto('/learn');
  await page.getByTestId('topic-search').fill('kerberos');
  await page.getByTestId('topic-hit-kerberos').click();
  await expect(page.getByTestId('topic-title')).toHaveText('Kerberos authentication');
  await page.getByTestId('topic-search').fill('ticket');
  await page.getByTestId('topic-hit-ticket-writing').click();
  await page.getByTestId('topic-full-lesson').click();
  await expect(page.getByTestId('lesson-reader')).toBeVisible();
});

test('timed exam: start, answer, finish, see score and topics to study', async ({ page }) => {
  await page.goto('/learn?tab=exams');
  await page.getByTestId('exam-course').selectOption('security-plus');
  await page.getByTestId('exam-count').selectOption('5');
  await page.getByTestId('exam-start').click();
  await expect(page.getByTestId('exam-clock')).toContainText(/^\d+:\d\d$/);
  for (let k = 0; k < 5; k++) {
    await page.getByTestId('exam-option-0').click();
    if (k < 4) await page.getByTestId('exam-next').click();
  }
  await page.getByTestId('exam-finish').click();
  await expect(page.getByTestId('exam-score')).toContainText('/5');
});

test('flashcards flip and count what you know', async ({ page }) => {
  await page.goto('/learn?tab=exams&sub=flashcards');
  const card = page.getByTestId('flash-card');
  const front = await card.innerText();
  await card.click();
  await expect(card).not.toHaveText(front);
  await page.getByTestId('flash-known').click();
  await expect(page.getByTestId('flash-stats')).toContainText('1 known');
});

test('learn with images lists the picture library or says it is coming', async ({ page }) => {
  await page.goto('/learn?tab=images');
  await expect(page.getByTestId('visuals-view')).toBeVisible();
});

test('Labs picker: lab types, start the enterprise campus build', async ({ page }) => {
  await page.goto('/lab');
  await expect(page.getByTestId('lab-device-SW-ACC-01')).toBeVisible();
  await page.getByTestId('tool-labs').click();
  await expect(page.getByTestId('lab-picker')).toBeVisible();
  for (const c of ['getting-started', 'switching', 'routing', 'enterprise-builds', 'security', 'soc-and-monitoring', 'services', 'wireless', 'troubleshooting-tickets']) await expect(page.getByTestId(`lab-cat-${c}`)).toBeVisible();
  await page.getByTestId('lab-cat-soc-and-monitoring').click();
  await expect(page.getByTestId('lab-card-soc-investigate')).toBeVisible();
  await page.getByTestId('lab-cat-enterprise-builds').click();
  await page.getByTestId('lab-card-enterprise-campus').click();
  await expect(page.getByTestId('lab-device-CORE')).toBeVisible();
  await expect(page.getByTestId('workbook-active')).toContainText('enterprise campus');
});

test('cables disconnect like Packet Tracer: Disconnect tool, Delete key with undo, device menu', async ({ page }) => {
  await page.goto('/lab');
  await expect(page.getByTestId('lab-device-SW-ACC-01')).toBeVisible();
  const edges = page.locator('.react-flow__edge');
  const before = await edges.count();
  // 1) Disconnect tool: click a cable
  await page.getByTestId('tool-disconnect').click();
  await expect(page.getByTestId('disconnect-hint')).toBeVisible();
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: /zoom in/i }).click();
  const target = edges.nth(3);
  const box = (await target.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(edges).toHaveCount(before - 1);
  await expect(page.getByText('Cable disconnected')).toBeVisible();
  // Undo from the toast
  await page.getByTestId('toast-action').click();
  await expect(edges).toHaveCount(before);
  // 2) Device click in disconnect mode lists its cables
  await page.getByTestId('lab-device-FS01').click();
  await page.getByRole('menuitem', { name: /→/ }).first().click();
  await expect(edges).toHaveCount(before - 1);
  await page.keyboard.press('Escape');
  // 3) Port picker shows an Unplug button for used ports
  await page.getByTestId('tool-cable').click();
  await page.getByTestId('lab-device-SW-ACC-01').click();
  const unplug = page.locator('[data-testid^="port-unplug-"]').first();
  await expect(unplug).toBeVisible();
  await unplug.click();
  await expect(edges).toHaveCount(before - 2);
});
