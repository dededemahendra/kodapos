import { expect, test } from '@playwright/test';

// Both specs require a signed-in session + a live Convex backend; gated.
test.describe('menu (auth-gated)', () => {
  test.skip(!process.env.RUN_AUTH_E2E, 'set RUN_AUTH_E2E=1 to run');

  test('wizard happy path: profile → menu → first item', async ({ page }) => {
    const email = `e2e+${Date.now()}@kodapos.test`;
    const password = 'Sa{ngat-Aman-123';

    // Sign up.
    await page.goto('/signup');
    await page.getByLabel('Nama').fill('E2E Owner');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: /Daftar/ }).click();

    // Lands on onboarding/profile after redirect.
    await page.waitForURL(/\/onboarding\/profile$/, { timeout: 15_000 });
    await page.getByLabel('Nama kafe').fill('Kopi E2E');
    await page.getByLabel('Persentase PPN').fill('11');
    await page.getByRole('button', { name: /Lanjut/ }).click();

    // Step 2.
    await page.waitForURL(/\/onboarding\/menu$/);
    await page.getByRole('button', { name: /Mulai dengan kategori/ }).click();

    // Categories.
    await page.waitForURL(/\/menu\/categories$/);
    await page.getByLabel('Nama kategori baru').fill('Kopi');
    await page.getByRole('button', { name: /\+ Tambah/ }).click();
    await expect(page.getByText('Kopi')).toBeVisible();

    // Items.
    await page.getByRole('link', { name: 'Items' }).click();
    await page.waitForURL(/\/menu$/);
    await page.getByRole('link', { name: /\+ Item/ }).click();
    await page.waitForURL(/\/menu\/items\/new$/);
    await page.getByLabel('Nama').fill('Kopi Susu Gula Aren');
    await page.getByLabel('Kategori').selectOption({ label: 'Kopi' });
    await page.getByLabel('Harga (Rp)').fill('22000');
    await page.getByRole('button', { name: /Simpan/ }).click();
    await page.waitForURL(/\/menu$/);
    await expect(page.getByText('Kopi Susu Gula Aren')).toBeVisible();
  });

  test('CRUD round-trip on an existing item', async ({ page }) => {
    // This test creates its own fresh cafe + initial item to avoid leaking
    // state across tests.
    const email = `e2e+${Date.now()}@kodapos.test`;
    const password = 'Sa{ngat-Aman-123';
    await page.goto('/signup');
    await page.getByLabel('Nama').fill('E2E Owner');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: /Daftar/ }).click();
    await page.waitForURL(/\/onboarding\/profile$/);
    await page.getByLabel('Nama kafe').fill('Kopi E2E 2');
    await page.getByRole('button', { name: /Lanjut/ }).click();
    await page.waitForURL(/\/onboarding\/menu$/);
    await page.getByRole('button', { name: /Mulai dengan kategori/ }).click();
    await page.waitForURL(/\/menu\/categories$/);
    await page.getByLabel('Nama kategori baru').fill('Kopi');
    await page.getByRole('button', { name: /\+ Tambah/ }).click();
    await page.getByRole('link', { name: 'Items' }).click();
    await page.getByRole('link', { name: /\+ Item/ }).click();
    await page.getByLabel('Nama').fill('Espresso');
    await page.getByLabel('Kategori').selectOption({ label: 'Kopi' });
    await page.getByLabel('Harga (Rp)').fill('18000');
    await page.getByRole('button', { name: /Simpan/ }).click();
    await page.waitForURL(/\/menu$/);

    // Now edit it.
    await page.getByRole('link', { name: 'Espresso' }).click();
    await expect(page).toHaveURL(/\/menu\/items\/[^/]+$/);
    await page.getByLabel('Harga (Rp)').fill('20000');
    await page.getByRole('button', { name: /Simpan/ }).click();
    await page.waitForURL(/\/menu$/);
    await expect(page.getByText('Rp 20.000')).toBeVisible();
  });
});
