import { expect, test } from '@playwright/test';

test('CCNA book explains the selected topic at both reading levels without quiz prompts', async ({ page }) => {
  await page.goto('/dashboard/networking?item=learn%2Ftopics');
  const picker = page.getByTestId('ccna-book-topic');
  await expect(picker).toBeVisible();
  await picker.fill('4.01');
  await picker.press('Enter');
  await expect(page.getByTestId('ccna-book-title')).toHaveText('How a Switch Learns MAC Addresses');
  await page.getByTestId('ccna-book-stage-mechanism').click();
  await expect(page.getByTestId('ccna-book-reader')).toContainText('source MAC');
  await page.getByTestId('mode-technical').click();
  await expect(page.getByTestId('mode-technical')).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('ccna-book-reader')).toContainText('VLAN');
  await page.getByTestId('ccna-book-stage-recap').click();
  await expect(page.getByRole('button', { name: 'Mark lesson read' })).toBeVisible();
  await expect(page.getByTestId('ccna-book-reader')).not.toContainText('Submit answers');
});
