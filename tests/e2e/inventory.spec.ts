import { expect, test } from '@playwright/test';
import { gotoHydrated, waitForUrlHydrated } from './_helpers';

async function signupAndAddSusu(page: import('@playwright/test').Page) {
  const email = `e2e+${Date.now()}@kodapos.test`;
  const password = 'Sa{ngat-Aman-123';

  await gotoHydrated(page, '/signup');
  await page.getByLabel('Nama Anda').fill('E2E Owner');
  await page.getByLabel('Nama kafe').fill('Kopi E2E Kit');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.locator('#terms').click();
  await page.getByRole('button', { name: /Daftar/ }).click();

  await waitForUrlHydrated(page, /\/onboarding\/profile$/, { timeout: 15_000 });
  await page.getByLabel('Persentase PPN').fill('11');
  await page.getByRole('button', { name: /Lanjut/ }).click();

  await waitForUrlHydrated(page, /\/onboarding\/menu$/);
  await page.goto('/onboarding/cashier');
  await waitForUrlHydrated(page, /\/onboarding\/cashier$/);
  await page.getByRole('button', { name: /Atur PIN/ }).click();
  for (const digit of '1234') await page.keyboard.type(digit);
  await expect(page.getByRole('button', { name: /Ganti PIN/ })).toBeVisible({ timeout: 5_000 });
  await page.getByRole('button', { name: /Selesai/ }).click();

  await page.goto('/pin');
  await waitForUrlHydrated(page, /\/pin$/);
  await page.getByRole('button', { name: /E2E Owner/ }).click();
  for (const digit of '1234') await page.keyboard.type(digit);
  await waitForUrlHydrated(page, /\/shift\/open$/);

  await page.goto('/inventory');
  await waitForUrlHydrated(page, /\/inventory$/);
  await page.getByRole('button', { name: /Tambah Bahan/ }).click();
  await page.getByLabel('Nama').fill('Susu');
  await page.getByLabel('Satuan', { exact: true }).click();
  await page.getByRole('option', { name: /Mililiter/ }).click();
  await page.getByLabel('Ambang isi ulang').fill('500');
  await page.getByLabel('Biaya per satuan (Rp)').fill('25');
  await page.getByRole('button', { name: /^Simpan$/ }).click();
  await expect(page.getByText(/Bahan ditambahkan/)).toBeVisible();
}

test.describe('inventory + recipes (auth-gated)', () => {
  test.skip(!process.env.RUN_AUTH_E2E, 'set RUN_AUTH_E2E=1 to run');
  test.setTimeout(180_000);

  test('signup → add ingredient → add recipe → open shift → cash sale → stock decreased', async ({ page }) => {
    const email = `e2e+${Date.now()}@kodapos.test`;
    const password = 'Sa{ngat-Aman-123';

    // 1. Signup
    await gotoHydrated(page, '/signup');
    await page.getByLabel('Nama Anda').fill('E2E Owner');
    await page.getByLabel('Nama kafe').fill('Kopi E2E S4');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password', { exact: true }).fill(password);
    // T&C checkbox is required to enable the Daftar submit. Radix Checkbox
    // is a <button role="checkbox">, not a native input — addressable by id.
    await page.locator('#terms').click();
    await page.getByRole('button', { name: /Daftar/ }).click();

    // 2. Onboarding/profile
    await waitForUrlHydrated(page, /\/onboarding\/profile$/, { timeout: 15_000 });
    await page.getByLabel('Persentase PPN').fill('11');
    await page.getByRole('button', { name: /Lanjut/ }).click();

    // 3. Onboarding/menu — add category + item
    await waitForUrlHydrated(page, /\/onboarding\/menu$/);
    await page.getByRole('button', { name: /Mulai dengan kategori/ }).click();
    await waitForUrlHydrated(page, /\/menu\/categories$/);
    await page.getByLabel('Nama kategori baru').fill('Kopi');
    await page.getByRole('button', { name: /\+ Tambah/ }).click();
    await page.getByRole('link', { name: 'Items' }).click();
    await page.getByRole('link', { name: /\+ Item/ }).click();
    await page.getByLabel('Nama').fill('Espresso');
    await page.getByLabel('Kategori').selectOption({ label: 'Kopi' });
    await page.getByLabel('Harga (Rp)').fill('18000');
    await page.getByRole('button', { name: /Simpan/ }).click();
    await waitForUrlHydrated(page, /\/menu$/);

    // 4. Onboarding/cashier
    await page.goto('/onboarding/cashier');
    await waitForUrlHydrated(page, /\/onboarding\/cashier$/);
    await page.getByRole('button', { name: /Atur PIN/ }).click();
    for (const digit of '1234') {
      await page.keyboard.type(digit);
    }
    await expect(page.getByRole('button', { name: /Ganti PIN/ })).toBeVisible({ timeout: 5_000 });
    await page.getByRole('button', { name: /Selesai/ }).click();
    await waitForUrlHydrated(page, /\/menu$/);

    // 5. PIN in — /inventory is PinGate-protected, so select cashier first.
    // Successful PIN entry redirects to /shift/open; waiting for that
    // confirms setCashier() has run before we navigate to /inventory.
    await page.goto('/pin');
    await waitForUrlHydrated(page, /\/pin$/);
    await page.getByRole('button', { name: /E2E Owner/ }).click();
    for (const digit of '1234') {
      await page.keyboard.type(digit);
    }
    await waitForUrlHydrated(page, /\/shift\/open$/);

    // 6. /inventory: add Susu
    await page.goto('/inventory');
    await waitForUrlHydrated(page, /\/inventory$/);
    await page.getByRole('button', { name: /Tambah Bahan/ }).click();
    await page.getByLabel('Nama').fill('Susu');
    // Unit select - shadcn Select. Use exact match because "Satuan" also
    // appears in "Biaya per satuan (Rp)".
    await page.getByLabel('Satuan', { exact: true }).click();
    await page.getByRole('option', { name: /Mililiter/ }).click();
    await page.getByLabel('Ambang isi ulang').fill('500');
    await page.getByLabel('Biaya per satuan (Rp)').fill('25');
    await page.getByRole('button', { name: /^Simpan$/ }).click();
    await expect(page.getByText(/Susu/)).toBeVisible();

    // 6. /menu - find the Espresso item link and click into recipe editor
    // The "Menu" sidebar entry is now a collapsible button, not a direct link — navigate directly.
    await page.goto('/menu');
    await waitForUrlHydrated(page, /\/menu$/);
    await page.getByRole('link', { name: /Espresso/ }).click();
    await expect(page).toHaveURL(/\/menu\/items\/[^/]+$/);

    // 7. Add recipe line
    await page.getByRole('button', { name: /\+ Tambah bahan/ }).click();
    // Click the new picker and choose Susu
    await page.getByPlaceholder('Pilih bahan…').click();
    await page.getByRole('button', { name: /^Susu/ }).click();
    await page.getByLabel('Jumlah').fill('200');
    await expect(page.getByText(/Rp 5\.000/).first()).toBeVisible();
    await page.getByRole('button', { name: /Simpan resep/ }).click();
    await expect(page.getByText(/Tersimpan/).first()).toBeVisible();

    // 8. Open shift — cashier is already PIN'd from step 5, so /sale
    // redirects straight to /shift/open (no /pin stop).
    await page.goto('/sale');
    await waitForUrlHydrated(page, /\/shift\/open$/);
    await page.getByLabel('Modal awal').fill('100000');
    await page.getByRole('button', { name: /Buka Shift/ }).click();
    await waitForUrlHydrated(page, /\/shift\/close$/);

    // 9. Sale
    await page.goto('/sale');
    await waitForUrlHydrated(page, /\/sale$/);
    await page.getByRole('button', { name: /Espresso/ }).click();
    await page.getByRole('button', { name: /^Bayar$/ }).click();
    await page.getByRole('button', { name: /^100k$/ }).click();
    await page.getByRole('button', { name: /Konfirmasi/ }).click();
    await expect(page.getByText(/Rp 19\.980/).first()).toBeVisible();
    await page.getByRole('button', { name: /Selesai/ }).click();

    // 10. /inventory — Susu stock now -200 (started at 0)
    await page.goto('/inventory');
    await waitForUrlHydrated(page, /\/inventory$/);
    await expect(page.getByText(/-200 ml/)).toBeVisible();
  });

  test('Stock page: sort, ⋯ menu, cancel archive, adjust-stock toast', async ({ page }) => {
    await signupAndAddSusu(page);

    // Sort the "Bahan" column — header is a button (exact to avoid matching "Tambah Bahan").
    await page.getByRole('button', { name: 'Bahan', exact: true }).click();

    // Open the ⋯ row menu for Susu.
    await page.getByRole('button', { name: /Aksi baris/ }).first().click();
    await expect(page.getByRole('menuitem', { name: /Arsipkan/ })).toBeVisible();

    // Open the archive confirm, then cancel it — row stays.
    await page.getByRole('menuitem', { name: /Arsipkan/ }).click();
    await expect(page.getByRole('alertdialog')).toBeVisible();
    await page.getByRole('button', { name: /Batal/ }).click();
    // Row must still be visible after cancel — match the name cell text.
    await expect(page.getByRole('cell', { name: /Susu/ }).first()).toBeVisible();

    // Adjust stock from the ⋯ menu → success toast.
    await page.getByRole('button', { name: /Aksi baris/ }).first().click();
    await page.getByRole('menuitem', { name: /Catat stok masuk/ }).click();
    await page.getByLabel(/Stok baru/).fill('1000');
    await page.getByRole('button', { name: /^Simpan$/ }).click();
    await expect(page.getByText(/Stok dicatat/)).toBeVisible();
  });
});
