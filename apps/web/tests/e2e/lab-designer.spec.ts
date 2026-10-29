import { expect, test, type Page } from '@playwright/test';

// The Packet Tracer-style lab designer at /lab, run against the simulated lab (mock mode).

test.beforeEach(async ({ page }) => {
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await page.goto('/lab');
  await expect(page.getByTestId('lab-device-SW-ACC-01')).toBeVisible();
});

const device = (page: Page, name: string) => page.getByTestId(`lab-device-${name}`);

async function newCable(page: Page, a: [string, string], b: [string, string], type = 'auto') {
  await page.getByTestId('tool-new-cable').click();
  const dlg = page.getByRole('dialog', { name: 'New cable' });
  await dlg.getByTestId('cable-a-device').selectOption({ label: a[0] });
  await dlg.getByTestId('cable-a-port').selectOption(a[1]);
  await dlg.getByTestId('cable-b-device').selectOption({ label: b[0] });
  await dlg.getByTestId('cable-b-port').selectOption(b[1]);
  if (type !== 'auto') await dlg.getByLabel('Cable type').selectOption(type);
  await dlg.getByTestId('cable-connect').click();
  return dlg;
}

test('places devices by drag and drop and by keyboard, and moves them', async ({ page }) => {
  const canvas = page.getByTestId('lab-canvas');
  const box = (await canvas.boundingBox())!;
  await page.getByTestId('palette-isr4331').dragTo(canvas, { targetPosition: { x: box.width * 0.15, y: box.height * 0.85 } });
  await expect(device(page, 'Router0')).toBeVisible();

  await page.getByTestId('palette-c2960x24').focus();
  await page.keyboard.press('Enter');
  await expect(device(page, 'Switch0')).toBeVisible();

  // Drag Router0 to a new spot; the position is committed to the design.
  const r = (await device(page, 'Router0').boundingBox())!;
  await page.mouse.move(r.x + r.width / 2, r.y + 12);
  await page.mouse.down();
  await page.mouse.move(r.x + r.width / 2 + 140, r.y + 12 - 60, { steps: 8 });
  await page.mouse.up();
  const r2 = (await device(page, 'Router0').boundingBox())!;
  expect(r2.x).toBeGreaterThan(r.x + 60);

  // Undo puts it back, redo moves it again.
  await page.keyboard.press('Escape');
  await page.getByTestId('undo').click();
  await expect.poll(async () => (await device(page, 'Router0').boundingBox())!.x).toBeLessThan(r.x + 20);
  await page.getByTestId('redo').click();
  await expect.poll(async () => (await device(page, 'Router0').boundingBox())!.x).toBeGreaterThan(r.x + 60);
});

test('cable validation: rejects wrong cables and ports with clear errors, accepts a valid one', async ({ page }) => {
  await page.getByTestId('palette-isr4331').focus();
  await page.keyboard.press('Enter');
  await page.getByTestId('palette-c2960x24').focus();
  await page.keyboard.press('Enter');

  // Fibre between an SFP port and a copper port
  let dlg = await newCable(page, ['Router0', 'Gi0/0/2'], ['Switch0', 'Gi0/1'], 'fiber');
  await expect(dlg.getByTestId('cable-issues')).toContainText('Fibre needs an SFP/SFP+ port on both ends');
  await dlg.getByRole('button', { name: 'Cancel' }).click();

  // Serial cable on Ethernet ports
  dlg = await newCable(page, ['Router0', 'Gi0/0/0'], ['Switch0', 'Gi0/1'], 'serial');
  await expect(dlg.getByTestId('cable-issues')).toContainText('Serial cables connect two serial');
  await dlg.getByRole('button', { name: 'Cancel' }).click();

  // Valid: automatic picks straight-through, the cable appears with its port labels.
  dlg = await newCable(page, ['Router0', 'Gi0/0/0'], ['Switch0', 'Gi0/1']);
  await expect(dlg).toBeHidden();
  await expect(page.getByTestId('cable-inspector')).toContainText('Router0 Gi0/0/0 ↔ Switch0 Gi0/1');
  await expect(page.getByTestId('cable-inspector')).toContainText('Ethernet straight-through');
  await expect(page.getByTestId('cable-inspector')).toContainText('link up');

  // Occupied port: Switch0 Gi0/1 is now taken.
  await page.getByTestId('palette-optiplex').focus();
  await page.keyboard.press('Enter');
  dlg = await newCable(page, ['PC0', 'Ethernet'], ['Switch0', 'Gi0/1']);
  await expect(dlg.getByTestId('cable-issues')).toContainText('Switch0 Gi0/1 is already connected to Router0 Gi0/0/0');
  await dlg.getByRole('button', { name: 'Cancel' }).click();

  // Speed mismatch: a legacy 100 Mb NIC against a port hard-set to 1000 connects, but the link stays down.
  await page.getByTestId('palette-legacy-pc').focus();
  await page.keyboard.press('Enter');
  await device(page, 'Switch0').click();
  await page.getByTestId('tab-interfaces').click();
  await page.getByTestId('iface-select').selectOption('Gi0/2');
  await page.getByLabel('Speed').selectOption('1000');
  await page.getByRole('button', { name: 'Apply' }).click();
  dlg = await newCable(page, ['PC1', 'FastEthernet0'], ['Switch0', 'Gi0/2']);
  await expect(page.getByTestId('lab-error')).toContainText('Speed mismatch');
});

test('invalid ports are crossed out in the port picker and explain themselves', async ({ page }) => {
  await page.getByTestId('tool-cable').click();
  await device(page, 'SW-ACC-01').click();
  const picker = page.getByRole('dialog');
  await expect(picker.getByTestId('port-option-Gi0/5')).toHaveAttribute('data-ok', 'false');
  await expect(picker).toContainText('In use by WS-FIN-02 Ethernet');
  await picker.getByTestId('port-option-Gi0/5').click();
  await expect(page.getByTestId('lab-error')).toContainText('SW-ACC-01 Gi0/5 is already connected to WS-FIN-02 Ethernet');

  // Start a console cable from the switch console port to a PC: copper ports on the PC are rejected.
  await page.getByTestId('lab-error').getByRole('button', { name: 'Dismiss' }).click();
  await page.locator('#toolbar-cable-type').selectOption('console');
  await device(page, 'SW-ACC-01').click();
  await page.getByRole('dialog').getByTestId('port-option-Console').click();
  await expect(page.getByTestId('cable-hint')).toContainText('Cable from SW-ACC-01 Console');
  await device(page, 'WS-FIN-07').click();
  const second = page.getByRole('dialog');
  await expect(second.getByTestId('port-option-Ethernet')).toHaveAttribute('data-ok', 'false');
  await expect(second.getByTestId('port-option-RS232')).toHaveAttribute('data-ok', 'true');
  await second.getByTestId('port-option-RS232').click();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('cable-inspector')).toContainText('Console (rollover)');
  await expect(page.getByTestId('cable-inspector')).toContainText('SW-ACC-01 Console ↔ WS-FIN-07 RS232');
});

test('packet simulation: delivered, blocked by the firewall with the rule, and the reason', async ({ page }) => {
  await page.getByTestId('tool-simulate').click();
  const sim = page.getByTestId('sim-panel');
  await sim.getByTestId('sim-src').selectOption({ label: 'WS-FIN-07' });
  await sim.getByTestId('sim-dst').selectOption({ label: 'DB01 (10.10.40.10)' });
  await sim.getByTestId('sim-proto').selectOption('tcp:5432');
  await sim.getByTestId('sim-send').click();
  await expect(sim.getByTestId('sim-trace').first()).toHaveAttribute('data-status', 'blocked');
  await expect(sim.getByTestId('sim-result')).toContainText('Blocked by FW01 on VLAN20: rule 99 "Default deny (logged)"');
  await sim.getByTestId('sim-hop').last().click();
  await expect(sim.getByTestId('acl-decision')).toContainText('block');
  await expect(page.getByTestId('packet-envelope')).toHaveAttribute('data-decision', 'block');

  await sim.getByLabel('Or destination IP').fill('10.10.30.20');
  await sim.getByTestId('sim-proto').selectOption('tcp:443');
  await sim.getByTestId('sim-send').click();
  await expect(sim.getByTestId('sim-trace').first()).toHaveAttribute('data-status', 'delivered');
  await expect(sim.getByTestId('sim-result')).toContainText('APP01 accepted the connection on HTTPS (443)');
  await expect(sim.getByTestId('pdu-details')).toContainText('Layer 2');
  await expect(sim.getByTestId('sim-hop')).toHaveCount(9); // 5 forwarding hops plus ARP request/reply on two segments
  await sim.getByTestId('sim-filter').selectOption('noarp');
  await expect(sim.getByTestId('sim-hop')).toHaveCount(5);
  await expect(sim.getByTestId('osi-stack')).toBeVisible();
});

test('a shut-down switch port shows on the cable and in the packet result', async ({ page }) => {
  await device(page, 'SW-ACC-01').click();
  await page.getByTestId('tab-interfaces').click();
  await page.getByTestId('iface-select').selectOption('Gi0/4');
  await page.getByLabel('Enabled (no shutdown)').uncheck();
  await page.getByRole('button', { name: 'Apply' }).click();
  await page.getByTestId('tab-logs').click();
  await expect(page.getByTestId('device-logs')).toContainText('Gi0/4, changed state to administratively down');
  await page.getByTestId('tool-simulate').click();
  const sim = page.getByTestId('sim-panel');
  await sim.getByTestId('sim-src').selectOption({ label: 'WS-FIN-07' });
  await sim.getByLabel('Or destination IP').fill('10.10.30.20');
  await sim.getByTestId('sim-proto').selectOption('tcp:443');
  await sim.getByTestId('sim-send').click();
  await expect(sim.getByTestId('sim-result')).toContainText('Gi0/4 is administratively down');
});

test('device inspector tabs show real configuration and open a terminal and VM console', async ({ page }) => {
  await device(page, 'SW-ACC-01').click();
  const insp = page.getByTestId('inspector');
  await expect(insp).toContainText('Cisco Catalyst 2960-X 24TS');
  await page.getByTestId('tab-ports').click();
  await expect(page.getByTestId('ports-table')).toContainText('WS-FIN-02 Ethernet');
  await page.getByTestId('tab-config').click();
  await expect(page.getByTestId('running-config')).toContainText('switchport access vlan 20');
  await page.getByTestId('tab-vlans').click();
  await expect(page.getByTestId('vlan-table')).toContainText('USERS');
  await page.getByTestId('tab-routes').click();
  await expect(page.getByTestId('routes-table')).toContainText('0.0.0.0/0');

  await page.getByTestId('tab-terminal').click();
  const term = page.getByTestId('lab-terminal').locator('.xterm');
  await expect(term).toBeVisible();
  await term.click();
  await page.keyboard.type('show vlan brief\n');
  await expect(term).toContainText('USERS');

  await device(page, 'FW01').click();
  await page.getByTestId('tab-firewall').click();
  await expect(page.getByTestId('fw-rules')).toContainText('Users to SalonePay (HTTPS)');

  await device(page, 'DC01').click();
  await page.getByTestId('tab-actions').click();
  await page.getByTestId('open-vm').click();
  await expect(page.getByTestId('vm-console').locator('.xterm')).toBeVisible();
});

test('cable context menu: test link, disable, and compare with baseline', async ({ page }) => {
  // Right-click the middle of the SW-ACC-01 to DC01 cable.
  const a = (await device(page, 'SW-ACC-01').boundingBox())!;
  const b = (await device(page, 'DC01').boundingBox())!;
  const mid = { x: (a.x + a.width / 2 + b.x + b.width / 2) / 2, y: (a.y + a.height / 2 + b.y + b.height / 2) / 2 };
  await page.mouse.click(mid.x, mid.y, { button: 'right' });
  await page.getByRole('menuitem', { name: 'Test link' }).click();
  await expect(page.getByTestId('lab-error')).toHaveAttribute('data-tone', 'ok');
  await expect(page.getByTestId('lab-error')).toContainText('Link test passed');
  await page.getByTestId('lab-error').getByRole('button', { name: 'Dismiss' }).click();

  await page.mouse.click(mid.x, mid.y, { button: 'right' });
  await page.getByRole('menuitem', { name: 'Disable (unplug)' }).click();
  await page.getByTestId('tool-compare').click();
  await expect(page.getByTestId('diff-panel')).toContainText('disabled');
});

test('saved layouts and the autosaved draft survive a reload', async ({ page }) => {
  await page.getByTestId('palette-c9120').focus();
  await page.keyboard.press('Enter');
  await expect(device(page, 'Accesspoint0')).toBeVisible();
  await page.getByTestId('tool-layouts').click();
  await page.getByTestId('layout-name').fill('E2E layout');
  await page.getByTestId('layout-save').click();
  await expect(page.getByTestId('layout-list')).toContainText('E2E layout');
  await page.keyboard.press('Escape');

  // Delete the AP, reload: the draft (without the AP) is restored.
  await device(page, 'Accesspoint0').click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Delete' }).click();
  await expect(device(page, 'Accesspoint0')).toHaveCount(0);
  await page.reload();
  await expect(device(page, 'SW-ACC-01')).toBeVisible();
  await expect(device(page, 'Accesspoint0')).toHaveCount(0);

  // Load the saved layout: the AP is back.
  await page.getByTestId('tool-layouts').click();
  await page.getByTestId('layout-load-E2E layout').click();
  await expect(device(page, 'Accesspoint0')).toBeVisible();
});

test('tablet: the inspector overlays the canvas and closes again', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await expect(page.getByTestId('lab-canvas')).toBeVisible();
  await device(page, 'FW01').click();
  const insp = page.getByTestId('inspector');
  await expect(insp).toBeVisible();
  await expect(insp).toContainText('OPNsense DEC2750');
  const box = (await insp.boundingBox())!;
  expect(box.x + box.width).toBeLessThanOrEqual(1024);
  await insp.getByRole('button', { name: 'Close inspector' }).click();
  await expect(insp).toBeHidden();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
