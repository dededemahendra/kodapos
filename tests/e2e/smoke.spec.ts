import { expect, test } from '@playwright/test';

test('public home renders and links to sign-in / sign-up', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'kodapos' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Masuk/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /Daftar/ })).toBeVisible();
});

// Creates a real user in the connected Convex deployment. Gated behind
// RUN_AUTH_E2E to keep `pnpm test:e2e` clean against dev Convex; CI sets the
// flag against an ephemeral deployment.
test.describe('auth flow', () => {
  test.skip(!process.env.RUN_AUTH_E2E, 'set RUN_AUTH_E2E=1 to run');

  test('sign-up → dashboard → sign-out', async ({ page }) => {
    const email = `e2e+${Date.now()}@kodapos.test`;
    const password = 'Sa{ngat-Aman-123';

    await page.goto('/signup');
    await page.getByLabel('Nama').fill('E2E User');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: /Daftar/ }).click();

    await expect(page).toHaveURL(/\/dashboard$/, { timeout: 15_000 });
    await expect(page.getByText(/Halo, E2E User/)).toBeVisible({ timeout: 10_000 });

    await page.getByRole('button', { name: /Keluar/ }).click();
    await expect(page).toHaveURL('/');
  });
});
