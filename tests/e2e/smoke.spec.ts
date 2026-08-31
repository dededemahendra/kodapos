import { expect, test } from '@playwright/test';
import { gotoHydrated, waitForUrlHydrated } from './_helpers';

test('public home renders and links to sign-in / sign-up', async ({ page }) => {
  await gotoHydrated(page, '/');
  await expect(page.getByRole('heading', { name: 'kodapos' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Masuk/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /Daftar/ })).toBeVisible();
});

test('signup URL redirects to signin, which defaults to the code flow', async ({ page }) => {
  await gotoHydrated(page, '/signup');
  await waitForUrlHydrated(page, /\/signin$/);
  // Passwordless-first: the email-code form is the default (no password field shown).
  await expect(page.getByRole('button', { name: /Kirim kode/ })).toBeVisible();
  await expect(page.getByLabel('Password')).toHaveCount(0);
});

test('feature page renders and offers a sign-up path', async ({ page }) => {
  await gotoHydrated(page, '/fitur/pesanan');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  // DEFAULT_LOCALE is 'id' (src/lib/locale.ts), so a fresh browser context
  // renders Indonesian; match both locales rather than assume one.
  await expect(
    page.getByRole('link', { name: /Mulai gratis|Daftar|Start free|Sign up/ }).first()
  ).toBeVisible();
});

test('feature hub links to the pesanan page', async ({ page }) => {
  await gotoHydrated(page, '/fitur');
  await page
    .getByRole('link', { name: /Pesanan/ })
    .first()
    .click();
  await expect(page).toHaveURL(/\/fitur\/pesanan$/);
});
