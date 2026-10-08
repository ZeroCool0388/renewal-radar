import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

test('dashboard → filter → cited Q&A → contract → export', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Portfolio overview' })).toBeVisible();
  await expect(page.getByText('£420k', { exact: true })).toBeVisible();
  await expect(page.locator('tbody tr')).toHaveCount(9);
  await page.getByLabel('Renewing within', { exact: true }).selectOption('90');
  await expect(page.locator('tbody tr')).toHaveCount(4);
  await page.getByRole('button', { name: 'Reset filters' }).click();
  await page.getByRole('button', { name: 'Apex BioLabs Ltd', exact: true }).click();
  await page.getByRole('button', { name: 'Source for Customer liability', exact: true }).click();
  await expect(page.locator('[data-highlighted=true]')).toContainText(
    'uncapped for Customer IP indemnity',
  );
  await expect(page.locator('[data-highlighted=true] mark')).toBeVisible();
  await page.getByRole('button', { name: 'Back to portfolio' }).click();
  await page.getByRole('button', { name: 'Ask the corpus', exact: true }).first().click();
  await page
    .getByRole('button', { name: 'Which suppliers can we exit in Q1?', exact: true })
    .click();
  await expect(
    page.locator('.answer-match').filter({ hasText: 'Helix Pharma UK Ltd' }),
  ).toBeVisible();
  await page
    .locator('.answer-match')
    .filter({ hasText: 'Helix Pharma UK Ltd' })
    .getByRole('button', { name: '8. Term and termination', exact: true })
    .first()
    .click();
  await expect(
    page.getByRole('dialog', { name: 'Helix Pharma UK Ltd', exact: true }),
  ).toContainText('Helix Pharma UK Ltd');
  await expect(page.locator('[data-highlighted=true]')).toContainText(
    'may terminate this SOW for convenience',
  );
  await page.getByRole('button', { name: 'Back to portfolio' }).click();
  await page.getByLabel('Auto-renew', { exact: true }).selectOption('yes');
  await page.getByLabel('Notice period', { exact: true }).selectOption('short');
  await expect(page.locator('tbody tr')).toHaveCount(2);
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export summary', exact: true }).click();
  const file = await downloadPromise;
  const content = await readFile((await file.path())!, 'utf8');
  expect(content).toContain('SYNTHETIC DEMO DATA');
  expect(content).toContain('Sterling FinTech');
  expect(content).not.toContain('Apex BioLabs');
  expect(errors).toEqual([]);
});
test('all starter questions, free text and a session follow-up', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Ask the corpus', exact: true }).first().click();
  const questions = [
    'Which suppliers can we exit in Q1?',
    'Which contracts auto-renew with less than 60 days’ notice?',
    'Where is our liability uncapped or above £1m?',
    'List all contracts governed by English law with a DPA.',
    "What's our total spend renewing in the next 90 days?",
  ];
  for (const question of questions) {
    await page.locator('.suggested').evaluate((el) => ((el as HTMLDetailsElement).open = true));
    await page.getByRole('button', { name: question, exact: true }).click();
    await expect(page.locator('.thinking')).toHaveCount(0);
    await expect(page.locator('.chat-turn').last().locator('.answer-match')).not.toHaveCount(0);
  }
  await page.getByRole('textbox', { name: 'Ask a question' }).fill('What about Northwind?');
  await page.getByRole('button', { name: 'Send question' }).click();
  await expect(page.locator('.thinking')).toHaveCount(0);
  await expect(page.locator('.chat-turn').last()).toContainText('Northwind Logistics');
});
test('Markdown and PDF uploads, review persistence and re-extraction', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Upload contract', exact: true }).click();
  await page.locator('input[type=file]').setInputFiles(path.resolve('tests/fixtures/upload.md'));
  await page.getByRole('button', { name: 'Import 1 contract', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Pine Demo Services Ltd', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Pine Demo Services Ltd', exact: true }).click();
  await page.getByRole('button', { name: 'Mark reviewed', exact: true }).click();
  await page.getByLabel('Add a note').fill('Reviewed the synthetic notice provision.');
  await page.getByRole('button', { name: 'Back to portfolio' }).click();
  await page.reload();
  await page.getByRole('button', { name: 'Pine Demo Services Ltd', exact: true }).click();
  await expect(page.getByLabel('Add a note')).toHaveValue(
    'Reviewed the synthetic notice provision.',
  );
  await expect(page.getByRole('button', { name: 'Reviewed', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Back to portfolio' }).click();
  await page.getByRole('button', { name: 'Upload contract', exact: true }).click();
  await page
    .locator('input[type=file]')
    .setInputFiles(path.resolve('data/contracts/03-helix-pharma-sow.pdf'));
  await page.getByRole('button', { name: 'Import 1 contract', exact: true }).click();
  await expect(page.locator('tbody tr')).toHaveCount(11);
  await page.getByRole('button', { name: 'Re-extract', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Re-extract', exact: true })).toBeEnabled();
  await expect(page.locator('tbody tr')).toHaveCount(11);
  await page.getByRole('button', { name: 'Pine Demo Services Ltd', exact: true }).click();
  await expect(page.getByLabel('Add a note')).toHaveValue(
    'Reviewed the synthetic notice provision.',
  );
});
test('keyboard navigation, empty state, dark mode, mobile source navigation', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Search suppliers').fill('No such supplier');
  await expect(page.getByText('No matching contracts', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Reset filters', exact: true }).first().click();
  const first = page.locator('.supplier-name').first();
  await first.focus();
  await first.press('ArrowDown');
  await expect(page.locator('.supplier-name').nth(1)).toBeFocused();
  await page.getByRole('button', { name: 'Toggle dark mode' }).click();
  await expect(page.locator('html')).toHaveClass(/dark/);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Filters', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Portfolio filters', exact: true })
    .getByLabel('Auto-renew', { exact: true })
    .selectOption('yes');
  await page.getByRole('button', { name: 'Show 5 contracts' }).click();
  await expect(page.locator('tbody tr')).toHaveCount(5);
  await page.getByRole('button', { name: 'Sterling FinTech Ltd', exact: true }).click();
  await page.getByRole('button', { name: 'Source for Auto-renew', exact: true }).click();
  await expect(page.locator('[data-highlighted=true] mark')).toBeVisible();
});
test('command palette selects a question and prepares Ask', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Search portfolio and questions' }).click();
  await page
    .getByRole('option', { name: 'Which suppliers can we exit in Q1?', exact: true })
    .click();
  await expect(page.getByRole('textbox', { name: 'Ask a question' })).toHaveValue(
    'Which suppliers can we exit in Q1?',
  );
  await page.getByRole('button', { name: 'Send question' }).click();
  await expect(
    page.locator('.answer-match').filter({ hasText: 'Helix Pharma UK Ltd' }),
  ).toBeVisible();
});
