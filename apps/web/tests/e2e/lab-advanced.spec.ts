import { expect, test, type Page } from '@playwright/test';

// Advanced lab features: design CLI, services, control plane on the canvas, engineering tools.

test.beforeEach(async ({ page }) => {
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await page.goto('/lab');
  await expect(page.getByTestId('lab-device-SW-ACC-01')).toBeVisible();
});

const device = (page: Page, name: string) => page.getByTestId(`lab-device-${name}`);

async function addFromPalette(page: Page, key: string) {
  await page.getByTestId(`palette-${key}`).focus();
  await page.keyboard.press('Enter');
}

async function typeCli(page: Page, lines: string[]) {
  const term = page.getByTestId('design-cli').locator('.xterm');
  await expect(term).toBeVisible();
  await term.click();
  for (const l of lines) await page.keyboard.type(`${l}\n`);
  return term;
}

test('design CLI configures a new router and the change reaches the canvas', async ({ page }) => {
  await addFromPalette(page, 'isr4331');
  await expect(device(page, 'Router0')).toBeVisible();
  await page.getByTestId('tab-terminal').click();
  await expect(page.getByTestId('term-model')).toHaveAttribute('aria-checked', 'true');
  const term = await typeCli(page, ['enable', 'conf t', 'hostname EDGE1', 'interface g0/0/0', 'ip address 192.0.2.1 255.255.255.0', 'no shutdown', 'end', 'show ip interface brief']);
  await expect(term).toContainText('192.0.2.1');
  await expect(device(page, 'EDGE1')).toBeVisible();
  await expect(device(page, 'EDGE1')).toContainText('192.0.2.1');
});

test('workstation command prompt renews DHCP through the relay and explains a blocked ping', async ({ page }) => {
  await device(page, 'WS-FIN-07').click();
  await page.getByTestId('tab-terminal').click();
  await page.getByTestId('term-model').click();
  const term = await typeCli(page, ['ipconfig /renew']);
  await expect(term).toContainText('via relay FW01 igb1.20');
  await page.keyboard.type('ping 10.10.30.20\n');
  await expect(term).toContainText('rule 99');
});

test('services tab: spanning tree blocks a redundant link and the canvas shows BLK and Root', async ({ page }) => {
  await addFromPalette(page, 'c2960x24');
  await addFromPalette(page, 'c2960x24');
  for (const [pa, pb] of [['Gi0/1', 'Gi0/1'], ['Gi0/2', 'Gi0/2']]) {
    await page.getByTestId('tool-new-cable').click();
    const dlg = page.getByRole('dialog', { name: 'New cable' });
    await dlg.getByTestId('cable-a-device').selectOption({ label: 'Switch0' });
    await dlg.getByTestId('cable-a-port').selectOption(pa);
    await dlg.getByTestId('cable-b-device').selectOption({ label: 'Switch1' });
    await dlg.getByTestId('cable-b-port').selectOption(pb);
    await dlg.getByLabel('Cable type').selectOption('trunk');
    await dlg.getByTestId('cable-connect').click();
  }
  await expect(page.getByTestId('stp-blk')).toHaveCount(1);
  await expect(page.getByTestId('lab-canvas')).toContainText('Root');
  let text = '';
  for (const name of ['Switch0', 'Switch1']) {
    await device(page, name).click({ position: { x: 64, y: 30 } });
    await page.getByTestId('tab-services').click();
    await expect(page.getByTestId('svc-stp')).toBeVisible();
    text += await page.getByTestId('svc-stp').innerText();
  }
  expect(text).toContain('Root bridge');
  expect(text).toContain('blocking');
});

test('tools: audit, goals, troubleshooting challenge, capture with pcap download, export', async ({ page }) => {
  await page.getByTestId('tool-tools').click();
  const tools = page.getByTestId('tools-panel');
  await expect(tools.getByTestId('audit-score')).toBeVisible();
  await expect(tools.getByTestId('audit-list')).not.toBeEmpty();

  await tools.getByRole('tab', { name: 'Goals' }).click();
  await tools.getByLabel('Goal source').selectOption({ label: 'WS-FIN-07' });
  await tools.getByLabel('Goal destination').selectOption({ label: 'APP01' });
  await tools.getByLabel('Goal protocol').selectOption('tcp:443');
  await tools.getByTestId('goal-add').click();
  await tools.getByTestId('goal-check').click();
  await expect(tools.getByTestId('goal-score')).toHaveText('1/1 goals met');

  await tools.getByRole('tab', { name: 'Challenge' }).click();
  await tools.getByLabel('Challenge').selectOption('shut-uplink');
  await tools.getByTestId('challenge-start').click();
  await expect(tools.getByTestId('challenge-active')).toContainText('Ticket');
  await tools.getByTestId('challenge-reveal').click();
  await expect(tools.getByTestId('challenge-fault')).toContainText('administratively shut down');

  await tools.getByRole('tab', { name: 'Goals' }).click();
  await tools.getByTestId('goal-check').click();
  await expect(tools.getByTestId('goal-score')).toHaveText('0/1 goals met');

  await tools.getByRole('tab', { name: 'Capture' }).click();
  await expect(tools.getByTestId('capture-table')).toContainText('ARP');
  await tools.getByTestId('capture-table').locator('tbody tr').first().click();
  await expect(tools.getByTestId('capture-detail')).toContainText('Ethernet II');
  const dl = page.waitForEvent('download');
  await tools.getByTestId('pcap-download').click();
  expect((await dl).suggestedFilename()).toMatch(/\.pcap$/);

  await tools.getByRole('tab', { name: 'Export' }).click();
  const dl2 = page.waitForEvent('download');
  await tools.getByTestId('export-csv').click();
  expect((await dl2).suggestedFilename()).toMatch(/\.csv$/);
});

test('PoE: a camera on a non-PoE switch stays off and says why', async ({ page }) => {
  await addFromPalette(page, 'axis-cam');
  await addFromPalette(page, 'c2960x24');
  await page.getByTestId('tool-new-cable').click();
  const dlg = page.getByRole('dialog', { name: 'New cable' });
  await dlg.getByTestId('cable-a-device').selectOption({ label: 'Switch0' });
  await dlg.getByTestId('cable-a-port').selectOption('Gi0/3');
  await dlg.getByTestId('cable-b-device').selectOption({ label: 'IoTdevice0' });
  await dlg.getByTestId('cable-b-port').selectOption('eth0');
  await dlg.getByTestId('cable-connect').click();
  await expect(page.locator('[data-testid^="no-power-"]')).toBeVisible();
});

test('notes can be added to the canvas and edited', async ({ page }) => {
  await page.getByTestId('tool-note').click();
  const note = page.locator('[data-testid^="note-"]').first();
  await expect(note).toBeVisible();
  await note.click({ position: { x: 16, y: 12 } });
  await page.getByTestId('note-edit').click();
  await page.getByLabel('Note text').fill('Finance VLAN 20');
  await page.getByTestId('lab-canvas').click({ position: { x: 20, y: 20 } });
  await expect(note).toContainText('Finance VLAN 20');
});
