import { test, expect } from '@playwright/test';

test.describe('Navigation', () => {
  test.beforeEach(async ({ page }) => {
    // Login first
    await page.goto('/login');
    await page.getByRole('button', { name: 'admin' }).click();
    await page.getByRole('button', { name: /iniciar sesión/i }).click();
    await page.waitForURL(/dashboard/, { timeout: 10000 });
  });

  test('sidebar navigation works', async ({ page }) => {
    // Navigate to Systems
    await page.getByRole('link', { name: /sistemas/i }).click();
    await expect(page).toHaveURL(/systems/);

    // Navigate to Alerts
    await page.getByRole('link', { name: /alertas/i }).click();
    await expect(page).toHaveURL(/alerts/);
  });

  test('dashboard shows KPI cards', async ({ page }) => {
    await expect(page.getByText(/sistemas activos/i)).toBeVisible();
    await expect(page.getByText(/sistemas saludables/i)).toBeVisible();
  });
});
