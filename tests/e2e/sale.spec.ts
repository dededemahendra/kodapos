import { Buffer } from 'node:buffer';
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

    // 9. Tunai → cash payment dialog
    await page.getByRole('button', { name: /^Tunai$/ }).click();

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
    await page.getByRole('button', { name: /^Tunai$/ }).click();
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
    await page.getByRole('button', { name: /^Tunai$/ }).click();
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

  test('forecast: a fresh cafe sees the cold-start learning message', async ({ page }) => {
    const email = `e2e+forecast+${Date.now()}@kodapos.test`;
    const password = 'Sa{ngat-Aman-123';

    await gotoHydrated(page, '/signup');
    await page.getByLabel('Nama Anda').fill('E2E Forecast');
    await page.getByLabel('Nama kafe').fill('Kopi Forecast');
    await page.getByLabel('Email').fill(email);
    await page.getByRole('textbox', { name: 'Password' }).fill(password);
    await page.getByRole('button', { name: /Daftar/ }).click();

    await waitForUrlHydrated(page, /\/onboarding\/profile$/, { timeout: 15_000 });
    await page.getByRole('button', { name: /Lanjut/ }).click();
    await waitForUrlHydrated(page, /\/onboarding\/menu$/);

    await page.goto('/forecast');
    await waitForUrlHydrated(page, /\/forecast$/);
    await expect(page.getByText(/sedang belajar/i)).toBeVisible();
  });

  test('suppliers: create a supplier and see it listed', async ({ page }) => {
    const email = `e2e+supplier+${Date.now()}@kodapos.test`;
    const password = 'Sa{ngat-Aman-123';

    await gotoHydrated(page, '/signup');
    await page.getByLabel('Nama Anda').fill('E2E Supplier');
    await page.getByLabel('Nama kafe').fill('Kopi Supplier');
    await page.getByLabel('Email').fill(email);
    await page.getByRole('textbox', { name: 'Password' }).fill(password);
    await page.getByRole('button', { name: /Daftar/ }).click();

    await waitForUrlHydrated(page, /\/onboarding\/profile$/, { timeout: 15_000 });
    await page.getByRole('button', { name: /Lanjut/ }).click();
    await waitForUrlHydrated(page, /\/onboarding\/menu$/);

    await page.goto('/suppliers');
    await waitForUrlHydrated(page, /\/suppliers$/);
    await page.getByRole('button', { name: /Tambah Pemasok/ }).click();
    await page.getByLabel('Nama pemasok').fill('Sumber Susu');
    await page.getByLabel('Telepon').fill('0812-3456-7890');
    await page.getByRole('button', { name: /^Simpan$/ }).click();
    await expect(page.getByText('Sumber Susu')).toBeVisible();
  });

  test('dynamic QRIS: connect provider → pay → webhook confirms → receipt', async ({
    page,
    request,
  }) => {
    const email = `e2e+qris-dyn+${Date.now()}@kodapos.test`;
    const password = 'Sa{ngat-Aman-123';

    // ── 1. Signup ─────────────────────────────────────────────────────────────
    await gotoHydrated(page, '/signup');
    await page.getByLabel('Nama Anda').fill('E2E Owner');
    await page.getByLabel('Nama kafe').fill('Kopi QRIS Dyn');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: /Daftar/ }).click();

    // ── 2. Onboarding/profile ─────────────────────────────────────────────────
    await waitForUrlHydrated(page, /\/onboarding\/profile$/, { timeout: 15_000 });
    await page.getByLabel('Persentase PPN').fill('11');
    await page.getByRole('button', { name: /Lanjut/ }).click();

    // ── 3. Onboarding/menu — category "Kopi", item "Espresso" Rp 18.000 ───────
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

    // ── 4. Onboarding/cashier — PIN 1234 ──────────────────────────────────────
    await page.goto('/onboarding/cashier');
    await waitForUrlHydrated(page, /\/onboarding\/cashier$/);
    await page.getByRole('button', { name: /Atur PIN/ }).click();
    for (const digit of '1234') {
      await page.keyboard.type(digit);
    }
    await expect(page.getByRole('button', { name: /Ganti PIN/ })).toBeVisible({ timeout: 5_000 });
    await page.getByRole('button', { name: /Selesai/ }).click();
    await waitForUrlHydrated(page, /\/menu$/);

    // ── 5. PIN gate → shift gate → open shift ────────────────────────────────
    await page.goto('/sale');
    await waitForUrlHydrated(page, /\/pin$/);
    await page.getByRole('button', { name: /E2E Owner/ }).click();
    for (const digit of '1234') {
      await page.keyboard.type(digit);
    }
    await waitForUrlHydrated(page, /\/shift\/open$/);
    await page.getByLabel('Modal awal').fill('100000');
    await page.getByRole('button', { name: /Buka Shift/ }).click();
    await waitForUrlHydrated(page, /\/shift\/close$/);

    // ── 6. Connect the `qris` integration ────────────────────────────────────
    // Navigate to /settings/integrations; find the "QRIS (Midtrans/Xendit)"
    // card and click its "Hubungkan" button to open the connect dialog.
    await page.goto('/settings/integrations');
    await waitForUrlHydrated(page, /\/settings\/integrations$/);

    // The card for "QRIS (Midtrans/Xendit)" — click its "Hubungkan" button.
    // Use the card heading as a scope to avoid clicking the wrong card.
    const qrisCard = page.locator('text=QRIS (Midtrans/Xendit)').locator('../../../..');
    await qrisCard.getByRole('button', { name: /Hubungkan/ }).click();

    // Connect dialog: fill the API key field (any non-empty string triggers
    // the real config.apiKey path in handleConnect).
    await page.getByLabel('Kunci API').fill('test-api-key');
    // Click the "Hubungkan" button inside the dialog footer (not the card button).
    await page.getByRole('dialog').getByRole('button', { name: /Hubungkan/ }).click();

    // Wait for the dialog to close — the card badge should flip to "Terhubung".
    await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 10_000 });

    // ── 7. Go to /sale, add an item, open QRIS payment dialog ────────────────
    await page.goto('/sale');
    await waitForUrlHydrated(page, /\/sale$/);
    await page.getByRole('button', { name: /Espresso/ }).first().click();
    await expect(page.getByText(/Espresso/).first()).toBeVisible();

    // Click the QRIS pay button. With the qris integration connected (and no
    // static QR image uploaded), the button triggers the dynamic-QRIS dialog.
    await page.getByRole('button', { name: /^QRIS$/ }).click();

    // ── 8. "Buat QRIS" → waiting state ───────────────────────────────────────
    await page.getByRole('button', { name: /Buat QRIS/ }).click();
    await expect(page.getByText(/Menunggu pembayaran…/)).toBeVisible({ timeout: 10_000 });

    // ── 9. Read the QR string and parse out the providerRef ──────────────────
    // The dialog renders the QR string in a font-mono div.
    // Format: MOCKQR|<providerRef>|<amountIDR>
    const qrText = await page.locator('.font-mono').textContent({ timeout: 10_000 });
    if (!qrText) throw new Error('QR string div not found');
    const parts = qrText.trim().split('|');
    if (parts.length < 3 || parts[0] !== 'MOCKQR') {
      throw new Error(`Unexpected QR string format: ${qrText}`);
    }
    const providerRef = parts[1]; // e.g. "mock_<clientId>"

    // ── 10. POST a signed webhook to confirm payment ──────────────────────────
    // Derive the Convex HTTP-actions base URL from VITE_CONVEX_URL:
    //   https://<deployment>.convex.cloud  →  https://<deployment>.convex.site
    const convexCloudUrl = process.env.VITE_CONVEX_URL ?? '';
    const convexSiteUrl = convexCloudUrl.replace(/\.convex\.cloud\/?$/, '.convex.site');

    if (!convexSiteUrl || convexSiteUrl === convexCloudUrl) {
      // TODO: VITE_CONVEX_URL not set or doesn't match the expected pattern.
      // The webhook-confirmation step requires a live Convex deployment URL.
      // Skip the confirmation and leave the dialog in "Menunggu pembayaran…"
      // state — remove this branch when running against a real deployment.
      console.warn(
        'Skipping webhook confirmation: VITE_CONVEX_URL is unset or not a *.convex.cloud URL.',
        `VITE_CONVEX_URL=${convexCloudUrl}`
      );
    } else {
      // Compute HMAC-SHA256 signature (Node.js crypto).
      const { createHmac } = await import('node:crypto');
      const body = JSON.stringify({ providerRef, status: 'paid' });
      const sig = createHmac('sha256', 'dev-qris-secret').update(body).digest('hex');

      const webhookResp = await request.post(`${convexSiteUrl}/webhooks/qris`, {
        headers: {
          'x-signature': sig,
          'content-type': 'application/json',
        },
        data: body,
      });

      if (!webhookResp.ok()) {
        const text = await webhookResp.text();
        throw new Error(`Webhook returned ${webhookResp.status()}: ${text}`);
      }

      // ── 11. Assert dialog auto-advances → receipt visible ──────────────────
      // The liveOrder query re-renders when paymentStatus flips to 'paid',
      // which closes the dialog and shows the receipt.
      await expect(page.getByText(/QRIS/)).toBeVisible({ timeout: 15_000 });
    }
  });

  test('static QRIS: upload QR image → QRIS payment → receipt shows QRIS', async ({ page }) => {
    const email = `e2e+qris+${Date.now()}@kodapos.test`;
    const password = 'Sa{ngat-Aman-123';

    // 1. Signup
    await gotoHydrated(page, '/signup');
    await page.getByLabel('Nama Anda').fill('E2E Owner');
    await page.getByLabel('Nama kafe').fill('Kopi QRIS E2E');
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

    // Upload a static QRIS image in settings (QRIS statis is enabled by default)
    await page.goto('/settings/tax');
    await waitForUrlHydrated(page, '/settings/tax');
    await page.locator('input[type=file]').setInputFiles({
      name: 'qr.png',
      mimeType: 'image/png',
      buffer: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
        'base64'
      ),
    });
    await page.getByRole('button', { name: /Simpan perubahan/ }).click();
    await expect(page.getByText(/Tersimpan/)).toBeVisible();

    // Sale: add an item and pay via QRIS
    await page.goto('/sale');
    await waitForUrlHydrated(page, '/sale');
    await page.getByRole('button', { name: /Espresso/ }).first().click();
    await page.getByRole('button', { name: /^QRIS$/ }).click();
    await page.getByRole('button', { name: /Sudah dibayar/ }).click();

    // Receipt shows the QRIS payment line
    await expect(page.getByText(/QRIS/)).toBeVisible();
    await page.getByRole('button', { name: /Selesai/ }).click();
  });
});
