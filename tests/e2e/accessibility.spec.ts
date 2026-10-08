import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
test('dashboard and mobile filters satisfy automated WCAG AA checks', async ({ page }) => {
  await page.goto('/');
  const desktop = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(desktop.violations).toEqual([]);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Filters', exact: true }).click();
  await expect
    .poll(() =>
      page
        .getByRole('dialog', { name: 'Portfolio filters', exact: true })
        .evaluate((el) => getComputedStyle(el).opacity),
    )
    .toBe('1');
  const mobile = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(mobile.violations).toEqual([]);
});
