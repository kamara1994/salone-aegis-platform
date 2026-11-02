import { expect, test } from '@playwright/test';

test('CCNA book uses the selected topic and reading level for a scenario recall check', async ({ page }) => {
  await page.goto('/dashboard/networking?item=learn%2Ftopics');
  const picker = page.getByTestId('ccna-book-topic');
  await expect(picker).toBeVisible();
  await picker.fill('4.01');
  await picker.press('Enter');
  await expect(page.getByTestId('ccna-book-title')).toHaveText('How a Switch Learns MAC Addresses');
  await page.getByTestId('ccna-book-stage-assessment').click();
  await expect(page.getByTestId('ccna-book-recall')).toContainText('A switch starts with an empty MAC table.');
  await page.getByLabel('Your explanation (optional if speaking aloud)').fill('The switch learns from the incoming source MAC.');
  await page.getByRole('button', { name: 'Show model response' }).click();
  await expect(page.getByRole('paragraph').filter({ hasText: 'The switch learns from the incoming source MAC.' })).toBeVisible();
  await expect(page.getByText('Host A transmits from port Gi0/3', { exact: false })).toBeVisible();
  await page.getByTestId('mode-technical').click();
  await expect(page.getByTestId('mode-technical')).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('button', { name: 'Show model response' }).click();
  await expect(page.getByText('source MAC', { exact: false }).last()).toBeVisible();
});
