import { test, expect } from '@playwright/test';

test.describe('Login Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
  });

  test('shows login form', async ({ page }) => {
    await expect(page.getByRole('button', { name: /iniciar sesión/i })).toBeVisible();
    await expect(page.getByPlaceholderText(/usuario/i)).toBeVisible();
  });

  test('shows test account buttons', async ({ page }) => {
    await expect(page.getByText(/cuentas de prueba/i)).toBeVisible();
    await expect(page.getByRole('button', { name: 'admin' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'operator' })).toBeVisible();
  });

  test('fills credentials on role button click', async ({ page }) => {
    await page.getByRole('button', { name: 'admin' }).click();
    const usernameInput = page.getByPlaceholderText(/usuario/i);
    await expect(usernameInput).not.toHaveValue('');
  });

  test('shows error on empty submission', async ({ page }) => {
    await page.getByRole('button', { name: /iniciar sesión/i }).click();
    await expect(page.getByText(/ingresa/i)).toBeVisible();
  });

  test('navigates to dashboard after login', async ({ page }) => {
    // Click admin role to fill credentials
    await page.getByRole('button', { name: 'admin' }).click();
    // Submit the form
    await page.getByRole('button', { name: /iniciar sesión/i }).click();
    // Should navigate to dashboard
    await expect(page).toHaveURL(/dashboard/, { timeout: 10000 });
  });
});
