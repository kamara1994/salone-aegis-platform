import { expect, test } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

// Interactive textbook, tracks, content packs and the triage game.

test.beforeEach(async ({ page }) => {
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
});

test('lesson reader: next/back, keyboard, quiz, trainer, bookmark survives reload, open in lab', async ({ page }) => {
  await page.goto('/learn');
  await expect(page.getByTestId('lesson-library')).toBeVisible();
  await page.getByTestId('lesson-search').fill('802.1Q');
  await expect(page.getByTestId('lesson-vlans')).toBeVisible();
  await page.getByTestId('lesson-search').fill('');
  await page.getByTestId('lesson-vlans').click();
  await expect(page.getByTestId('lesson-section-title')).toHaveText('What is a VLAN?');
  await page.getByTestId('lesson-next').click();
  await expect(page.getByTestId('lesson-section-title')).toHaveText('Why VLANs are used');
  await page.getByTestId('lesson-back').click();
  await expect(page.getByTestId('lesson-section-title')).toHaveText('What is a VLAN?');
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('lesson-section-title')).toHaveText('Why VLANs are used');

  // Section 8: the command trainer (guided mode, hint on request only)
  await page.getByRole('button', { name: /Cisco configuration, step by step/ }).click();
  const tr = page.getByTestId('trainer-vlan-cisco');
  await tr.getByLabel('Command').fill('show run');
  await tr.getByLabel('Command').press('Enter');
  await expect(tr).toContainText('Not what this step needs');
  await tr.getByLabel('Command').fill('conf t');
  await tr.getByLabel('Command').press('Enter');
  await expect(tr).toContainText('SW1(config)#');
  await expect(tr).toContainText('not a live device');

  await page.getByRole('button', { name: /Practice quiz/ }).click();
  const quiz = page.getByTestId('quiz-vlan-final');
  for (const c of await quiz.getByTestId('choice').all()) await c.getByRole('button').nth(1).click();
  await expect(quiz.getByTestId('quiz-score')).toContainText('/4');

  await page.getByTestId('lesson-bookmark').click();
  await page.reload();
  await expect(page.getByTestId('lesson-section-title')).toHaveText('Practice quiz');
  await page.goto('/learn');
  await expect(page.getByTestId('bookmarks')).toContainText('Practice quiz');
  await expect(page.getByTestId('lesson-vlans')).toContainText('%');

  await page.goto('/learn?lesson=vlans&section=configure');
  await page.getByTestId('lesson-open-lab').click();
  await expect(page).toHaveURL(/\/lab/);
  await expect(page.getByTestId('workbook-active')).toBeVisible();
});

test('watch mode shows answers; tracks list content and export progress', async ({ page }) => {
  await page.goto('/learn?lesson=impact-urgency');
  await page.getByTestId('mode-watch').click();
  await page.getByRole('button', { name: /Traps$/ }).click();
  await expect(page.locator('[data-testid="choice"] button.border-healthy').first()).toBeVisible();

  await page.goto('/learn?tab=tracks');
  await page.getByTestId('track-ccna').click();
  await expect(page.getByTestId('tracks')).toContainText('VLANs from zero');
  await page.getByTestId('track-soc').click();
  await expect(page.getByTestId('tracks')).toContainText('SIEM');
  const dl = page.waitForEvent('download');
  await page.getByTestId('export-progress').click();
  const file = await (await dl).path();
  expect(JSON.parse(fs.readFileSync(file!, 'utf8')).format).toBe('aegis-progress');
});

test('content pack import adds a lesson; invalid packs are rejected', async ({ page }) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pack-'));
  const good = path.join(dir, 'good.json');
  fs.writeFileSync(good, JSON.stringify({ format: 'aegis-content-pack', version: 1, name: 'Test pack', createdAt: '2026-01-01', lessons: [{ id: 'pack-lesson', title: 'Imported DNS basics', summary: 'From a pack', tracks: ['helpdesk'], minutes: 5, difficulty: 1, sections: [{ id: 'a', title: 'Intro', blocks: [{ type: 'p', text: 'DNS turns names into addresses.' }] }] }] }));
  const bad = path.join(dir, 'bad.json');
  fs.writeFileSync(bad, JSON.stringify({ format: 'nope' }));
  await page.goto('/learn?tab=tracks');
  await page.getByTestId('pack-file').setInputFiles(bad);
  await expect(page.getByTestId('packs')).toContainText('Not imported');
  await page.getByTestId('pack-file').setInputFiles(good);
  await expect(page.getByTestId('packs')).toContainText('Installed "Test pack"');
  await page.goto('/learn');
  await page.getByTestId('lesson-search').fill('Imported DNS');
  await page.getByTestId('lesson-pack-lesson').click();
  await expect(page.getByTestId('lesson-reader')).toContainText('DNS turns names into addresses.');
});

test('triage game: queue, hints only on request, scoring and lab link', async ({ page }) => {
  await page.goto('/games');
  await expect(page.getByTestId('game-queue')).toBeVisible();
  await page.getByTestId('queue-hd-vlan-move').click();
  await expect(page.getByTestId('case-opening')).toContainText('moved to the desk');
  await expect(page.getByTestId('hint-0')).toHaveCount(0);
  await page.getByTestId('urgency-high').click();
  await page.getByTestId('impact-individual').click();
  await page.getByTestId('ask-ip').click();
  await expect(page.getByTestId('answer-ip')).toContainText('169.254');
  await page.getByTestId('evidence-port').click();
  await expect(page.getByTestId('evidence-view')).toContainText('vlan 30');
  await page.getByTestId('hint').click();
  await expect(page.getByTestId('hint-0')).toBeVisible();
  await page.getByTestId('diagnosis-vlan').click();
  await page.getByTestId('fix-setvlan').click();
  await page.getByTestId('escalate-none').click();
  await page.getByTestId('resolution-note').fill('Port Gi0/14 was in VLAN 30. Set it to access VLAN 20 and ran ipconfig /renew. User confirmed email works.');
  await page.getByTestId('submit-case').click();
  await expect(page.getByTestId('game-result')).toBeVisible();
  const score = Number(await page.getByTestId('game-score').innerText());
  expect(score).toBeGreaterThan(70);
  expect(score).toBeLessThan(100);
  await expect(page.getByTestId('score-diagnosis')).toContainText('15/15');
  await expect(page.getByTestId('game-result')).toContainText('3 points for hints');
  await page.getByTestId('game-open-lab').click();
  await expect(page).toHaveURL(/\/lab/);
  await expect(page.getByTestId('challenge-active')).toBeVisible();

  await page.goto('/games?template=soc-alert');
  await expect(page.getByTestId('game-template')).toHaveValue('soc-alert');
  await expect(page.getByTestId('queue-soc-spray')).toBeVisible();
});

test('lab: arrow annotation, VLAN search, SVG export, background upload', async ({ page }) => {
  await page.goto('/lab');
  await expect(page.getByTestId('lab-device-SW-ACC-01')).toBeVisible();
  await page.getByTestId('tool-note').click();
  const note = page.locator('[data-testid^="note-"]').last();
  await note.click();
  await page.getByTestId('note-kind-arrow').click();
  await expect(page.locator('[data-testid^="arrow-"]')).toHaveCount(1);
  await page.getByTestId('note-rotate').click();

  await page.getByTestId('device-finder').fill('vlan 20');
  await page.getByTestId('device-finder').press('Enter');
  await expect(page.locator('form[role="search"]')).not.toContainText('Not found');

  await page.getByTestId('tool-tools').click();
  await page.getByRole('tab', { name: 'Export' }).click();
  const dl = page.waitForEvent('download');
  await page.getByTestId('export-svg').click();
  const svg = fs.readFileSync((await (await dl).path())!, 'utf8');
  expect(svg).toContain('<svg');
  expect(svg).toContain('SW-ACC-01');

  // a 2x2 PNG as a custom background
  const png = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'bg-')), 'bg.png');
  fs.writeFileSync(png, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGNkYGD4z8DAwMDAxMDAAAAOGwECZOHjEgAAAABJRU5ErkJggg==', 'base64'));
  await page.getByTestId('tool-background').click();
  await page.locator('input[type="file"][accept^="image/png"]').setInputFiles(png);
  await page.getByTestId('tool-background').click();
  await expect(page.getByText('My image')).toBeVisible();
});

test('hover card falls back to a labelled placeholder when pictures are missing, and closes on leave', async ({ page }) => {
  await page.route(/\.(png|svg|webp|jpg)(\?.*)?$/, (r) => (r.request().resourceType() === 'image' ? r.fulfill({ status: 404, body: '' }) : r.continue()));
  await page.goto('/lab');
  const sw = page.getByTestId('lab-device-SW-ACC-01');
  await expect(sw).toBeVisible();
  await sw.hover({ position: { x: 64, y: 30 } });
  const card = page.getByTestId('device-hover-card');
  await expect(card).toBeVisible();
  await expect(card.locator('[data-photo="placeholder"]')).toContainText('Picture unavailable');
  await page.mouse.move(5, 300);
  await expect(card).toHaveCount(0);
});
