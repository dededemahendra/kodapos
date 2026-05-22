import { expect, test } from '@playwright/test';
import { gotoHydrated, waitForUrlHydrated } from './_helpers';

// Auth-gated, like the menu spec. Creates one throwaway user per run.
test.describe('shifts (auth-gated)', () => {
  test.skip(!process.env.RUN_AUTH_E2E, 'set RUN_AUTH_E2E=1 to run');
  test.setTimeout(120_000);

  test('signup → set PIN → pick → open shift → close shift', async ({ page }) => {
    const email = `e2e+${Date.now()}@kodapos.test`;
    const password = 'Sa{ngat-Aman-123';

    // Signup creates the cafe and the owner staff row (Task 4).
    await gotoHydrated(page, '/signup');
    await page.getByLabel('Nama Anda').fill('E2E Owner');
    await page.getByLabel('Nama kafe').fill('Kopi E2E S2');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: /Daftar/ }).click();

    await waitForUrlHydrated(page, /\/onboarding\/profile$/, { timeout: 15_000 });
    await page.getByRole('button', { name: /Lanjut/ }).click();

    await waitForUrlHydrated(page, /\/onboarding\/menu$/);
    await page.getByRole('link', { name: /Lanjut: PIN & Kasir/ }).click();

    // Onboarding step 4: set owner PIN.
    await waitForUrlHydrated(page, /\/onboarding\/cashier$/);
    await page.getByRole('button', { name: /Atur PIN/ }).click();
    // PIN dialog opens; fill 4 cells via keyboard input.
    for (const digit of '1234') {
      await page.keyboard.type(digit);
    }
    // Dialog auto-submits on 4th digit; "Atur PIN" button should now say "Ganti PIN".
    await expect(page.getByRole('button', { name: /Ganti PIN/ })).toBeVisible({ timeout: 5_000 });
    await page.getByRole('button', { name: /Selesai/ }).click();
    await waitForUrlHydrated(page, /\/menu$/);

    // Navigating to /shift/open trips PinGate → /pin
    await page.goto('/shift/open');
    await waitForUrlHydrated(page, /\/pin$/);

    // Pick owner card; PIN entry opens.
    await page.getByRole('button', { name: /E2E Owner/ }).click();
    for (const digit of '1234') {
      await page.keyboard.type(digit);
    }

    // Land on /shift/open.
    await waitForUrlHydrated(page, /\/shift\/open$/);
    await page.getByLabel('Modal awal').fill('100000');
    await page.getByRole('button', { name: /Buka Shift/ }).click();
    await waitForUrlHydrated(page, /\/shift\/close$/);

    // Close the shift.
    await page.getByLabel('Uang terhitung').fill('100000');
    await page.getByRole('button', { name: /Tutup Shift/ }).click();

    await expect(page.getByText(/Shift ditutup/)).toBeVisible({ timeout: 10_000 });
    await page.getByRole('link', { name: /Kembali ke menu/ }).click();
    await waitForUrlHydrated(page, /\/menu$/);
  });
});
