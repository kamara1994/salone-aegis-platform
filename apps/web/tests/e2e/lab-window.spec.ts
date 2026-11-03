import { expect, test } from '@playwright/test';

// Packet Tracer-style device window, and cables dragged from the library onto devices and ports.
test.use({ storageState: { cookies: [], origins: [] } });

test.beforeEach(async ({ page }) => {
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await page.goto('/lab');
  await expect(page.getByTestId('lab-device-SW-ACC-01')).toBeVisible();
});

test('clicking a device opens a floating window with Physical, Config, CLI, Services and Tools', async ({ page }) => {
  await page.getByTestId('lab-device-SW-ACC-01').click();
  const win = page.getByRole('dialog', { name: 'SW-ACC-01 window' });
  await expect(win).toBeVisible();
  for (const t of ['tab-physical', 'tab-group-config', 'tab-terminal', 'tab-services', 'tab-group-tools']) await expect(win.getByTestId(t)).toBeVisible();
  await win.getByTestId('tab-group-config').click();
  await win.getByTestId('tab-vlans').click();
  const bar = await win.getByTestId('window-titlebar').boundingBox();
  await page.mouse.move(bar!.x + 200, bar!.y + 15);
  await page.mouse.down();
  await page.mouse.move(bar!.x + 60, bar!.y + 95, { steps: 6 });
  await page.mouse.up();
  expect((await win.boundingBox())!.y).toBeGreaterThan(bar!.y + 50);
  await win.getByTestId('window-dock').click();
  await expect(page.getByRole('complementary', { name: 'Inspector' })).toBeVisible();
});

test('drag a cable onto a device, then plug the far end into a port on the Physical view', async ({ page }) => {
  await page.getByTestId('palette-c2960-24tt').click();
  await page.getByTestId('palette-optiplex').click();
  await page.getByTestId('library-cables').click();
  await page.getByTestId('cable-card-straight').dragTo(page.getByTestId('lab-device-PC0'));
  await page.getByTestId('port-option-Ethernet').click();
  await page.getByTestId('lab-view-physical').click();
  await expect(page.getByTestId('phys-holding')).toContainText('PC0 Ethernet');
  await page.getByTestId('phys-unit-Switch0').getByTestId('phys-port-Fa0/5').click();
  await expect(page.getByTestId('phys-focus')).toContainText('PC0 Ethernet');
  await page.getByTestId('phys-unplug').click();
  await expect(page.getByTestId('phys-unit-Switch0').getByTestId('phys-port-Fa0/5')).toHaveAttribute('data-led', 'off');
});

test('Simple PDU and Inspect: click source then destination, see the result and the tables', async ({ page }) => {
  await page.getByTestId('tool-pdu').click();
  await page.getByTestId('lab-device-WS-FIN-02').click();
  await page.getByTestId('lab-device-DC01').click();
  await expect(page.getByTestId('pdu-row')).toHaveCount(1);
  await expect(page.getByTestId('pdu-row')).toHaveAttribute('data-status', /ok|fail/);
  await page.getByTestId('tool-inspect').click();
  await page.getByTestId('lab-device-SW-ACC-01').click();
  await page.getByTestId('inspect-mac').click();
  await expect(page.getByTestId('inspect-text')).toContainText('Mac Address Table');
  await page.getByTestId('inspect-window').getByRole('button', { name: 'Close' }).click();
  await page.keyboard.press('Escape');
  await page.getByTestId('mode-simulation').click();
  await expect(page.getByTestId('sim-panel')).toBeVisible();
  await page.getByTestId('mode-realtime').click();
  await expect(page.getByTestId('sim-panel')).toHaveCount(0);
});

test('router modules: refused with power on, installed with power off, ports appear', async ({ page }) => {
  await page.getByTestId('palette-isr2911').click();
  await page.getByTestId('lab-device-Router0').click({ position: { x: 64, y: 30 } });
  await page.getByTestId('tab-physical').click();
  await page.getByTestId('phys-face-rear').click();
  const slot = page.locator('[data-testid="phys-slot"][data-slot="EHWIC 1"]');
  await page.getByTestId('module-HWIC-4ESW').dragTo(slot);
  await expect(page.getByTestId('module-msg')).toContainText('off first');
  await page.getByTestId('phys-power').click();
  await page.getByTestId('module-HWIC-4ESW').dragTo(slot);
  await expect(page.getByTestId('module-msg')).toContainText('Fa0/1/0');
  await expect(slot).toHaveAttribute('data-module', 'HWIC-4ESW');
});

test('a cable dropped on the canvas lies loose; dragging each plug onto a device connects it', async ({ page }) => {
  await page.getByTestId('palette-c2960-24tt').click();
  await page.getByTestId('palette-optiplex').click();
  await page.getByTestId('library-cables').click();
  const canvas = page.getByTestId('lab-canvas');
  const cb = (await canvas.boundingBox())!;
  await page.getByTestId('cable-card-straight').dragTo(canvas, { targetPosition: { x: 260, y: cb.height - 160 } });
  await expect(page.getByTestId('loose-cable')).toHaveCount(1);
  const drag = async (end: string, dev: string) => {
    const e = (await page.getByTestId(`loose-end-${end}`).boundingBox())!;
    const d = (await page.getByTestId(`lab-device-${dev}`).boundingBox())!;
    await page.mouse.move(e.x + e.width / 2, e.y + e.height / 2);
    await page.mouse.down();
    await page.mouse.move(d.x + 30, d.y + 30, { steps: 10 });
    await page.mouse.up();
  };
  await drag('a', 'PC0');
  await page.getByTestId('port-option-Ethernet').click();
  await expect(page.getByTestId('loose-end-a')).toHaveAttribute('data-plugged', 'true');
  await drag('b', 'Switch0');
  await page.getByTestId('port-option-Fa0/1').click();
  await expect(page.getByTestId('loose-cable')).toHaveCount(0);
  await expect(page.getByTestId('lab-device-PC0')).toHaveAttribute('aria-label', /1\/1 up/);
});
