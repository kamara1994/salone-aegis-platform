import { expect, test } from '@playwright/test';

// The core loop from the blueprint: ticket -> claim -> investigate -> fix in a console -> checks
// -> plain-language explanation to the client -> automatic debrief -> closed with a score.
test.describe.configure({ mode: 'serial' });

test.beforeEach(async ({ page }) => {
  // Google Fonts may be unreachable in CI; the app falls back to system fonts.
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
});

test('cockpit shows the live map, queue and shift summary', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('map-node-FW01')).toBeVisible();
  await expect(page.getByText('Connected but nothing opens').first()).toBeVisible();
  await expect(page.getByText('Open work')).toBeVisible();
});

test('full ticket loop ends in an automatic debrief and a closed ticket', async ({ page }) => {
  await page.goto('/tickets');
  await page.getByText('Connected but nothing opens').click();
  await expect(page).toHaveURL(/\/tickets\/[0-9a-f-]+$/);

  await page.getByRole('button', { name: 'Claim ticket' }).click();
  await page.getByRole('button', { name: 'Start investigating' }).click();

  const chat = page.getByLabel('Message to the client');
  await chat.fill('Hi Aminata, what happens when you open SalonePay?');
  await chat.press('Enter');
  await expect(page.getByText('Hi Aminata, what happens when you open SalonePay?')).toBeVisible();

  await page.getByText('Console', { exact: true }).first().click();
  const term = page.locator('.xterm').first();
  await term.click();
  await page.keyboard.type('ipconfig /all\n');
  await expect(term).toContainText('10.10.20.254');
  await page.keyboard.type('netsh interface ipv4 set address name="Ethernet" source=dhcp\n');
  await page.keyboard.type('ipconfig\n');
  await expect(term).toContainText('10.10.20.1');

  await page.getByText(/^Work notes/).click();
  await page.getByLabel('New work note').fill('Static IP with gateway 10.10.20.254 set by hand. Switched the NIC back to DHCP; gateway now 10.10.20.1.');
  await page.getByRole('button', { name: 'Add note' }).click();

  await page.getByRole('button', { name: 'Resolve' }).first().click();
  await page.getByLabel('Resolution note').fill('Wrong static gateway on WS-FIN-02; reverted to DHCP; HTTPS to SalonePay verified.');
  await page.getByRole('button', { name: 'Run checks' }).click();
  await expect(page.getByText(/The fix is verified/)).toBeVisible({ timeout: 20_000 });

  await page.getByText('Client chat', { exact: true }).click();
  await chat.fill('Your computer had a wrong setting that pointed it at a door that does not exist, so it could not reach anything outside your floor. I switched it back to automatic settings and it works now. If it happens again, restart and call us.');
  await chat.press('Enter');

  const debrief = page.getByRole('dialog', { name: 'Debrief interview' });
  await expect(debrief).toBeVisible({ timeout: 20_000 });
  const answer = debrief.getByLabel('Your answer');
  for (let i = 0; i < 8 && (await answer.isVisible()); i++) {
    await answer.fill('First I ran ipconfig /all: static 10.10.20.45 with gateway 10.10.20.254, which does not exist, so ARP for the gateway failed. I set DHCP back so it took 10.10.20.1, then verified HTTPS to 10.10.30.20:443. Prevention: DHCP for user devices, static only for servers in IPAM.');
    await debrief.getByRole('button', { name: 'Submit answer' }).click();
    await page.waitForTimeout(1500);
  }
  await expect(debrief.getByText(/overall debrief score/)).toBeVisible();
  await debrief.getByRole('button', { name: 'Close' }).click();
  await expect(page.getByText('Closed', { exact: true }).first()).toBeVisible();
});

test('SOC analyst can claim and classify an alert with a rationale', async ({ page }) => {
  await page.goto('/soc');
  await page.getByText('Encoded PowerShell command executed').click();
  await page.getByRole('button', { name: 'Claim alert' }).click();
  await page.locator('input[name=verdict]').nth(1).check();
  await page.getByLabel('Rationale').fill('Decoded it: the signed IT inventory script, run on schedule; matches the change record.');
  await page.getByRole('button', { name: 'Classify' }).click();
  await expect(page.getByText(/Classified as/)).toBeVisible();
});

test('launching a scenario injects a fault and opens its ticket', async ({ page }) => {
  await page.goto('/scenarios');
  await page.getByRole('row', { name: /Users can reach the payments database/ }).getByRole('button', { name: 'Launch' }).click();
  await page.getByRole('button', { name: 'Inject fault and open ticket' }).click();
  await expect(page).toHaveURL(/\/tickets\/[0-9a-f-]+$/, { timeout: 15_000 });
});

test('every screen renders without a page error', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  for (const path of ['/', '/tickets', '/topology', '/soc', '/scenarios', '/skills', '/evidence', '/replay', '/settings', '/recruiter']) {
    await page.goto(path);
    await page.waitForTimeout(800);
  }
  expect(errors).toEqual([]);
});
