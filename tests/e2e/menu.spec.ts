import { expect, test } from '@playwright/test';
import { gotoHydrated, waitForUrlHydrated } from './_helpers';

// Both specs require a signed-in session + a live Convex backend; gated.
test.describe('menu (auth-gated)', () => {
  test.skip(!process.env.RUN_AUTH_E2E, 'set RUN_AUTH_E2E=1 to run');
  // ~20 step flow with networkidle waits routinely sits above Playwright's
  // default 30s budget. 180s leaves headroom for the slower CRUD round-trip
  // when running the full auth-gated suite back-to-back.
  test.setTimeout(180_000);

  test('wizard happy path: profile → menu → first item', async ({ page }) => {
    const email = `e2e+${Date.now()}@kodapos.test`;
    const password = 'Sa{ngat-Aman-123';

    // Sign up.
    await gotoHydrated(page, '/signup');
    await page.getByLabel('Nama Anda').fill('E2E Owner');
    await page.getByLabel('Nama kafe').fill('Kopi E2E');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').first().fill(password);
    await page.locator('#terms').click();
    await page.getByRole('button', { name: /Daftar/ }).click();

    // Lands on onboarding/profile after redirect.
    await waitForUrlHydrated(page, /\/onboarding\/profile$/, { timeout: 15_000 });
    await page.getByLabel('Persentase PPN').fill('11');
    await page.getByRole('button', { name: /Lanjut/ }).click();

    // Step 2.
    await waitForUrlHydrated(page, /\/onboarding\/menu$/);
    await page.getByRole('button', { name: /Mulai dengan kategori/ }).click();

    // Categories.
    await waitForUrlHydrated(page, /\/menu\/categories$/);
    await page.getByRole('button', { name: /Tambah Kategori/ }).click();
    await page.getByLabel('Nama kategori').fill('Kopi');
    await page.getByRole('button', { name: /^Simpan$/ }).click();
    await expect(page.getByText(/Kategori ditambahkan/)).toBeVisible();
    await expect(page.getByText('Kopi')).toBeVisible();

    // Items.
    await page.getByRole('link', { name: 'Items' }).click();
    await waitForUrlHydrated(page, /\/menu$/);
    await page.getByRole('link', { name: /Tambah Item/ }).click();
    await waitForUrlHydrated(page, /\/menu\/items\/new$/);
    await page.getByLabel('Nama').fill('Kopi Susu Gula Aren');
    await page.getByLabel('Kategori').selectOption({ label: 'Kopi' });
    await page.getByLabel('Harga (Rp)').fill('22000');
    await page.getByRole('button', { name: /Simpan/ }).click();
    await waitForUrlHydrated(page, /\/menu$/);
    await expect(page.getByText('Kopi Susu Gula Aren')).toBeVisible();
  });

  test('CRUD round-trip on an existing item', async ({ page }) => {
    // This test creates its own fresh cafe + initial item to avoid leaking
    // state across tests.
    const email = `e2e+${Date.now()}@kodapos.test`;
    const password = 'Sa{ngat-Aman-123';
    await gotoHydrated(page, '/signup');
    await page.getByLabel('Nama Anda').fill('E2E Owner');
    await page.getByLabel('Nama kafe').fill('Kopi E2E 2');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').first().fill(password);
    await page.locator('#terms').click();
    await page.getByRole('button', { name: /Daftar/ }).click();
    await waitForUrlHydrated(page, /\/onboarding\/profile$/);
    await page.getByRole('button', { name: /Lanjut/ }).click();
    await waitForUrlHydrated(page, /\/onboarding\/menu$/);
    await page.getByRole('button', { name: /Mulai dengan kategori/ }).click();
    await waitForUrlHydrated(page, /\/menu\/categories$/);
    await page.getByRole('button', { name: /Tambah Kategori/ }).click();
    await page.getByLabel('Nama kategori').fill('Kopi');
    await page.getByRole('button', { name: /^Simpan$/ }).click();
    await expect(page.getByText(/Kategori ditambahkan/)).toBeVisible();
    await page.getByRole('link', { name: 'Items' }).click();
    await page.getByRole('link', { name: /Tambah Item/ }).click();
    await page.getByLabel('Nama').fill('Espresso');
    await page.getByLabel('Kategori').selectOption({ label: 'Kopi' });
    await page.getByLabel('Harga (Rp)').fill('18000');
    await page.getByRole('button', { name: /Simpan/ }).click();
    await waitForUrlHydrated(page, /\/menu$/);

    // Now edit it. Wait for the category dropdown to be populated before
    // interacting; the categories query may still be loading on navigation.
    await page.getByRole('link', { name: 'Espresso' }).click();
    await waitForUrlHydrated(page, /\/menu\/items\/[^/]+$/);
    await expect(page.getByLabel('Kategori')).toContainText('Kopi');
    await page.getByLabel('Harga (Rp)').fill('20000');
    // Use exact match to avoid also matching the "Simpan resep" button in the
    // recipe editor that's rendered on the existing-item edit page.
    await page.getByRole('button', { name: /^Simpan$/ }).click();
    await waitForUrlHydrated(page, /\/menu$/);
    await expect(page.getByText('Rp 20.000')).toBeVisible();
  });

  test('kit: items recipe column, ⋯ toggle active, modifiers Arsip filter', async ({ page }) => {
    const email = `e2e+${Date.now()}@kodapos.test`;
    const password = 'Sa{ngat-Aman-123';
    await gotoHydrated(page, '/signup');
    await page.getByLabel('Nama Anda').fill('E2E Owner');
    await page.getByLabel('Nama kafe').fill('Kopi E2E Kit');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').first().fill(password);
    await page.locator('#terms').click();
    await page.getByRole('button', { name: /Daftar/ }).click();
    await waitForUrlHydrated(page, /\/onboarding\/profile$/, { timeout: 15_000 });
    await page.getByRole('button', { name: /Lanjut/ }).click();
    await waitForUrlHydrated(page, /\/onboarding\/menu$/);
    await page.getByRole('button', { name: /Mulai dengan kategori/ }).click();
    await waitForUrlHydrated(page, /\/menu\/categories$/);
    await page.getByRole('button', { name: /Tambah Kategori/ }).click();
    await page.getByLabel('Nama kategori').fill('Kopi');
    await page.getByRole('button', { name: /^Simpan$/ }).click();
    await expect(page.getByText(/Kategori ditambahkan/)).toBeVisible();

    // Create an item.
    await page.getByRole('link', { name: 'Items' }).click();
    await waitForUrlHydrated(page, /\/menu$/);
    await page.getByRole('link', { name: /Tambah Item/ }).click();
    await waitForUrlHydrated(page, /\/menu\/items\/new$/);
    await page.getByLabel('Nama').fill('Espresso');
    await page.getByLabel('Kategori').selectOption({ label: 'Kopi' });
    await page.getByLabel('Harga (Rp)').fill('18000');
    await page.getByRole('button', { name: /Simpan/ }).click();
    await waitForUrlHydrated(page, /\/menu$/);

    // Items list shows the Resep column header and a Belum badge (no recipe yet).
    await expect(page.getByRole('columnheader', { name: /Resep/ })).toBeVisible();
    await expect(page.getByText(/Belum/).first()).toBeVisible();

    // Toggle active via the ⋯ menu → toast.
    await page.getByRole('button', { name: /Aksi baris/ }).first().click();
    await page.getByRole('menuitem', { name: /Nonaktifkan/ }).click();
    await expect(page.getByText(/Item dinonaktifkan/)).toBeVisible();

    // Modifiers page: Arsip filter chip exists and the list renders.
    await page.getByRole('link', { name: /Grup Modifier/ }).click();
    await waitForUrlHydrated(page, /\/menu\/modifiers$/);
    await expect(page.getByRole('button', { name: /Arsip/ })).toBeVisible();
  });
});
