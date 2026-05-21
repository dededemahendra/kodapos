import { expect, test } from '@playwright/test';
import { gotoHydrated, waitForUrlHydrated } from './_helpers';

test('public home renders and links to sign-in / sign-up', async ({ page }) => {
  await gotoHydrated(page, '/');
  await expect(page.getByRole('heading', { name: 'kodapos' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Masuk/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /Daftar/ })).toBeVisible();
});

// Creates a real user in the connected Convex deployment. Gated behind
// RUN_AUTH_E2E to keep `pnpm test:e2e` clean against dev Convex; CI sets the
// flag against an ephemeral deployment.
test.describe('auth flow', () => {
  test.skip(!process.env.RUN_AUTH_E2E, 'set RUN_AUTH_E2E=1 to run');
  // Full signup → onboarding skip → dashboard → sign-out flow sits above
  // Playwright's default 30s budget with networkidle waits.
  test.setTimeout(60_000);

  test('sign-up → onboarding → dashboard → sign-out', async ({ page }) => {
    const email = `e2e+${Date.now()}@kodapos.test`;
    const password = 'Sa{ngat-Aman-123';

    await gotoHydrated(page, '/signup');
    await page.getByLabel('Nama Anda').fill('E2E User');
    await page.getByLabel('Nama kafe').fill('Kopi E2E Smoke');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: /Daftar/ }).click();

    // Signup creates user + cafe + navigates to /onboarding/profile.
    await waitForUrlHydrated(page, /\/onboarding\/profile$/, { timeout: 15_000 });
    // Take the "Lewati semua" exit to land on /menu without filling profile.
    await page.getByRole('button', { name: /Lewati semua/ }).click();
    await waitForUrlHydrated(page, /\/menu$/);

    // /dashboard is reachable once setupCompletedAt is set; the greeting
    // proves the authenticated query path works end-to-end.
    await gotoHydrated(page, '/dashboard');
    await expect(page.getByText(/Halo, E2E User/)).toBeVisible({ timeout: 10_000 });

    // After sign-out, _pos's Unauthenticated boundary redirects to /signin
    // via window.location.replace. The dashboard's own redirect to '/' loses
    // the race — that's intentional, the layout owns auth flow.
    await page.getByRole('button', { name: /Keluar/ }).click();
    await waitForUrlHydrated(page, /\/signin$/);
  });
});
