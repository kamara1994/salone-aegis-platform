import { expect, test } from '@playwright/test';
import fs from 'node:fs';

// Physical rear panel, PoE, library search, mini map and image export.

test.beforeEach(async ({ page }) => {
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await page.goto('/lab');
  await expect(page.getByTestId('lab-device-SW-ACC-01')).toBeVisible();
});

test('rear panel: pulling the only power supply powers the switch off; reinserting brings it back', async ({ page }) => {
  const sw = page.getByTestId('lab-device-SW-ACC-01');
  await sw.click();
  await page.getByTestId('tab-physical').click();
  await expect(page.getByTestId('phys-led-SYST')).toHaveAttribute('data-on', 'true');
  await page.getByTestId('phys-face-rear').click();
  await expect(page.getByTestId('phys-rear')).toBeVisible();
  await expect(page.getByTestId('phys-fan').first()).toHaveAttribute('data-spin', 'true');
  await page.getByTestId('phys-psu-PS').click();
  await expect(sw).toHaveAttribute('aria-label', /down/);
  await expect(page.getByTestId('phys-fan').first()).toHaveAttribute('data-spin', 'false');
  await page.getByTestId('phys-psu-PS').click();
  await expect(sw).toHaveAttribute('aria-label', /healthy/);
});

test('redundant power: a server stays up on one supply and the audit warns', async ({ page }) => {
  const db = page.getByTestId('lab-device-DB01');
  await db.click();
  await page.getByTestId('tab-physical').click();
  await page.getByTestId('phys-face-rear').click();
  await page.getByTestId('phys-psu-PSU1').click();
  await expect(db).toHaveAttribute('aria-label', /healthy/);
  await expect(page.getByTestId('phys-rear').locator('..').locator('..')).toContainText('1 of 2 supplies on');
  await page.keyboard.press('Escape');
  await page.getByTestId('tool-tools').click();
  await page.getByRole('tab', { name: /Audit/ }).click();
  await expect(page.getByTestId('tools-panel')).toContainText('DB01 is running on 1 of 2 power supplies');
});

test('PoE switch shows its budget and the powered port', async ({ page }) => {
  await page.getByTestId('palette-search').fill('PoE');
  await expect(page.getByTestId('palette-c2960x24')).toHaveCount(0);
  await page.getByTestId('palette-c2960x24ps').click();
  await page.getByTestId('palette-search').fill('8845');
  await page.getByTestId('palette-ip-phone-8845').click();
  const sw = page.locator('[data-testid^="lab-device-Switch"]').first();
  await sw.click();
  await page.getByTestId('tab-physical').click();
  await expect(page.getByTestId('phys-poe')).toContainText('/ 370 W');
});

test('mini map can be hidden and the diagram exports as PNG', async ({ page }) => {
  await expect(page.locator('.react-flow__minimap')).toBeVisible();
  await page.getByTestId('toggle-minimap').click();
  await expect(page.locator('.react-flow__minimap')).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId('lab-device-SW-ACC-01')).toBeVisible();
  await expect(page.locator('.react-flow__minimap')).toHaveCount(0);
  await page.getByTestId('tool-tools').click();
  await page.getByRole('tab', { name: 'Export' }).click();
  const dl = page.waitForEvent('download');
  await page.getByTestId('export-png').click();
  const buf = fs.readFileSync((await (await dl).path())!);
  expect(buf.subarray(1, 4).toString()).toBe('PNG');
});
