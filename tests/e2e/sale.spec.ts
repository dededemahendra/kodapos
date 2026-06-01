import { expect, test } from '@playwright/test';
import { gotoHydrated, waitForUrlHydrated } from './_helpers';

test.describe('sale (auth-gated)', () => {
  test.skip(!process.env.RUN_AUTH_E2E, 'set RUN_AUTH_E2E=1 to run');
  test.setTimeout(180_000);

  test('signup → onboarding → PIN → open shift → cash sale → history', async ({ page }) => {
    const email = `e2e+${Date.now()}@kodapos.test`;
    const password = 'Sa{ngat-Aman-123';

    // 1. Signup
    await gotoHydrated(page, '/signup');
    await page.getByLabel('Nama Anda').fill('E2E Owner');
    await page.getByLabel('Nama kafe').fill('Kopi E2E S3');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: /Daftar/ }).click();

    // 2. Onboarding/profile — set PPN 11%
    await waitForUrlHydrated(page, /\/onboarding\/profile$/, { timeout: 15_000 });
    await page.getByLabel('Persentase PPN').fill('11');
    await page.getByRole('button', { name: /Lanjut/ }).click();

    // 3. Onboarding/menu — add category "Kopi", then item "Espresso" Rp 18.000
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

    // 4. Onboarding/cashier — owner sets PIN 1234
    await page.goto('/onboarding/cashier');
    await waitForUrlHydrated(page, /\/onboarding\/cashier$/);
    await page.getByRole('button', { name: /Atur PIN/ }).click();
    // PIN dialog opens; fill 4 cells via keyboard input.
    for (const digit of '1234') {
      await page.keyboard.type(digit);
    }
    // Dialog auto-submits on 4th digit; button should now say "Ganti PIN".
    await expect(page.getByRole('button', { name: /Ganti PIN/ })).toBeVisible({ timeout: 5_000 });
    await page.getByRole('button', { name: /Selesai/ }).click();
    await waitForUrlHydrated(page, /\/menu$/);

    // 5. /sale → PinGate → /pin → enter PIN
    await page.goto('/sale');
    await waitForUrlHydrated(page, /\/pin$/);
    await page.getByRole('button', { name: /E2E Owner/ }).click();
    for (const digit of '1234') {
      await page.keyboard.type(digit);
    }

    // 6. ShiftGate redirects to /shift/open; open shift Rp 100.000
    await waitForUrlHydrated(page, /\/shift\/open$/);
    await page.getByLabel('Modal awal').fill('100000');
    await page.getByRole('button', { name: /Buka Shift/ }).click();
    await waitForUrlHydrated(page, /\/shift\/close$/);

    // 7. Back to /sale, now both gates pass
    await page.goto('/sale');
    await waitForUrlHydrated(page, /\/sale$/);

    // 8. Tap Espresso tile → cart shows "Espresso" line, total Rp 19.980 (18.000 + 11% PPN)
    await page.getByRole('button', { name: /Espresso/ }).first().click();
    await expect(page.getByText(/Espresso/).first()).toBeVisible();
    await expect(page.getByText(/Rp 19\.980/).first()).toBeVisible();

    // 9. Bayar → cash payment dialog
    await page.getByRole('button', { name: /^Bayar$/ }).click();

    // 10. Tap 100k chip → tendered = 100.000, change = Rp 80.020
    await page.getByRole('button', { name: /^100k$/ }).click();
    await expect(page.getByText(/Rp 80\.020/)).toBeVisible();

    // 11. Konfirmasi → receipt preview with total
    await page.getByRole('button', { name: /Konfirmasi/ }).click();
    await expect(page.getByText(/Rp 19\.980/).first()).toBeVisible();

    // 12. Selesai → cart empty
    await page.getByRole('button', { name: /Selesai/ }).click();
    await expect(page.getByText(/Belum ada item\./)).toBeVisible();

    // 13. /history shows the order
    await page.goto('/history');
    await waitForUrlHydrated(page, /\/history$/);
    await expect(page.getByText(/Rp 19\.980/).first()).toBeVisible();
  });

  test('apply a percent promo at checkout → reduced total + receipt discount', async ({ page }) => {
    const email = `e2e+promo+${Date.now()}@kodapos.test`;
    const password = 'Sa{ngat-Aman-123';

    // Signup
    await gotoHydrated(page, '/signup');
    await page.getByLabel('Nama Anda').fill('E2E Promo');
    await page.getByLabel('Nama kafe').fill('Kopi Promo');
    await page.getByLabel('Email').fill(email);
    await page.getByRole('textbox', { name: 'Password' }).fill(password);
    await page.getByRole('button', { name: /Daftar/ }).click();

    // Onboarding/profile — no PPN this time (keeps the math simple)
    await waitForUrlHydrated(page, /\/onboarding\/profile$/, { timeout: 15_000 });
    await page.getByRole('button', { name: /Lanjut/ }).click();

    // Onboarding/menu — category "Kopi", item "Espresso" Rp 20.000
    await waitForUrlHydrated(page, /\/onboarding\/menu$/);
    await page.getByRole('button', { name: /Mulai dengan kategori/ }).click();
    await waitForUrlHydrated(page, /\/menu\/categories$/);
    await page.getByLabel('Nama kategori baru').fill('Kopi');
    await page.getByRole('button', { name: /\+ Tambah/ }).click();
    await page.getByRole('link', { name: 'Items' }).click();
    await page.getByRole('link', { name: /\+ Item/ }).click();
    await page.getByLabel('Nama').fill('Espresso');
    await page.getByLabel('Kategori').selectOption({ label: 'Kopi' });
    await page.getByLabel('Harga (Rp)').fill('20000');
    await page.getByRole('button', { name: /Simpan/ }).click();
    await waitForUrlHydrated(page, /\/menu$/);

    // Onboarding/cashier — PIN 1234
    await page.goto('/onboarding/cashier');
    await waitForUrlHydrated(page, /\/onboarding\/cashier$/);
    await page.getByRole('button', { name: /Atur PIN/ }).click();
    for (const digit of '1234') await page.keyboard.type(digit);
    await expect(page.getByRole('button', { name: /Ganti PIN/ })).toBeVisible({ timeout: 5_000 });
    await page.getByRole('button', { name: /Selesai/ }).click();
    await waitForUrlHydrated(page, /\/menu$/);

    // Create a 25% promo on /promos
    await page.goto('/promos');
    await waitForUrlHydrated(page, /\/promos$/);
    await page.getByRole('button', { name: /Tambah Promo/ }).click();
    await page.getByLabel('Nama promo').fill('Diskon Kopi');
    await page.getByLabel('Nilai (%)').fill('25');
    await page.getByRole('button', { name: /^Simpan$/ }).click();
    await expect(page.getByText('Diskon Kopi')).toBeVisible();

    // Enter the sale screen (PIN + open shift)
    await page.goto('/sale');
    await waitForUrlHydrated(page, /\/pin$/);
    await page.getByRole('button', { name: /E2E Promo/ }).click();
    for (const digit of '1234') await page.keyboard.type(digit);
    await waitForUrlHydrated(page, /\/shift\/open$/);
    await page.getByLabel('Modal awal').fill('100000');
    await page.getByRole('button', { name: /Buka Shift/ }).click();
    await waitForUrlHydrated(page, /\/shift\/close$/);
    await page.goto('/sale');
    await waitForUrlHydrated(page, /\/sale$/);

    // Add Espresso → subtotal Rp 20.000
    await page.getByRole('button', { name: /Espresso/ }).first().click();
    await expect(page.getByText(/Rp 20\.000/).first()).toBeVisible();

    // Apply the promo → Diskon line + total Rp 15.000 (20.000 − 25%)
    await page.getByRole('button', { name: /Tambah promo/ }).click();
    await page.getByRole('button', { name: /Diskon Kopi/ }).click();
    await expect(page.getByText(/−Rp 5\.000/)).toBeVisible();
    await expect(page.getByText(/Rp 15\.000/).first()).toBeVisible();

    // Pay exact → receipt shows the discount row
    await page.getByRole('button', { name: /^Bayar$/ }).click();
    await page.getByRole('button', { name: /^Pas$/ }).click();
    await page.getByRole('button', { name: /Konfirmasi/ }).click();
    await expect(page.getByText(/Diskon Kopi/)).toBeVisible();
    await expect(page.getByText(/−Rp 5\.000/)).toBeVisible();
  });

  test('reports: record a sale, view it on /reports, switch range, download CSV', async ({ page }) => {
    const email = `e2e+reports+${Date.now()}@kodapos.test`;
    const password = 'Sa{ngat-Aman-123';

    await gotoHydrated(page, '/signup');
    await page.getByLabel('Nama Anda').fill('E2E Reports');
    await page.getByLabel('Nama kafe').fill('Kopi Reports');
    await page.getByLabel('Email').fill(email);
    await page.getByRole('textbox', { name: 'Password' }).fill(password);
    await page.getByRole('button', { name: /Daftar/ }).click();

    await waitForUrlHydrated(page, /\/onboarding\/profile$/, { timeout: 15_000 });
    await page.getByRole('button', { name: /Lanjut/ }).click();

    await waitForUrlHydrated(page, /\/onboarding\/menu$/);
    await page.getByRole('button', { name: /Mulai dengan kategori/ }).click();
    await waitForUrlHydrated(page, /\/menu\/categories$/);
    await page.getByLabel('Nama kategori baru').fill('Kopi');
    await page.getByRole('button', { name: /\+ Tambah/ }).click();
    await page.getByRole('link', { name: 'Items' }).click();
    await page.getByRole('link', { name: /\+ Item/ }).click();
    await page.getByLabel('Nama').fill('Espresso');
    await page.getByLabel('Kategori').selectOption({ label: 'Kopi' });
    await page.getByLabel('Harga (Rp)').fill('20000');
    await page.getByRole('button', { name: /Simpan/ }).click();
    await waitForUrlHydrated(page, /\/menu$/);

    await page.goto('/onboarding/cashier');
    await waitForUrlHydrated(page, /\/onboarding\/cashier$/);
    await page.getByRole('button', { name: /Atur PIN/ }).click();
    for (const digit of '1234') await page.keyboard.type(digit);
    await expect(page.getByRole('button', { name: /Ganti PIN/ })).toBeVisible({ timeout: 5_000 });
    await page.getByRole('button', { name: /Selesai/ }).click();
    await waitForUrlHydrated(page, /\/menu$/);

    await page.goto('/sale');
    await waitForUrlHydrated(page, /\/pin$/);
    await page.getByRole('button', { name: /E2E Reports/ }).click();
    for (const digit of '1234') await page.keyboard.type(digit);
    await waitForUrlHydrated(page, /\/shift\/open$/);
    await page.getByLabel('Modal awal').fill('100000');
    await page.getByRole('button', { name: /Buka Shift/ }).click();
    await waitForUrlHydrated(page, /\/shift\/close$/);
    await page.goto('/sale');
    await waitForUrlHydrated(page, /\/sale$/);
    await page.getByRole('button', { name: /Espresso/ }).first().click();
    await page.getByRole('button', { name: /^Bayar$/ }).click();
    await page.getByRole('button', { name: /^Pas$/ }).click();
    await page.getByRole('button', { name: /Konfirmasi/ }).click();
    await page.getByRole('button', { name: /Selesai/ }).click();

    await page.goto('/reports');
    await waitForUrlHydrated(page, /\/reports/);
    await page.getByRole('button', { name: /Hari ini/ }).click();
    await expect(page.getByText(/Rp 20\.000/).first()).toBeVisible();

    await page.getByRole('link', { name: /Penjualan/ }).click();
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: /Unduh CSV/ }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/penjualan-.*\.csv/);
  });
});
