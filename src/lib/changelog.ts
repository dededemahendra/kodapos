import { type Localized, localized } from './localized';

export { localized };
export type { Localized };

/**
 * User-facing "what's new" feed shown in the sidebar card and the /changelog
 * page. This is curated owner-facing copy, deliberately separate from the
 * developer-facing CHANGELOG.md (which is too technical for the app).
 *
 * Entries are newest-first. Copy is bilingual data (not in the Lingui catalog)
 * so a release can be added without an extract/compile cycle. Bump the top
 * entry's `version` when shipping a user-facing update: the sidebar card
 * re-appears (dismissal is tracked per-version) whenever the latest version
 * changes.
 */
export interface ChangelogEntry {
  version: string;
  /** ISO date (Asia/Jakarta), yyyy-mm-dd. */
  date: string;
  title: Localized;
  summary: Localized;
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.7',
    date: '2026-07-01',
    title: { id: 'Masuk tanpa sandi', en: 'Passwordless sign-in' },
    summary: {
      id: 'Daftar dan masuk cukup dengan kode yang dikirim ke email Anda, tanpa perlu mengingat sandi.',
      en: 'Register and sign in with a code sent to your email, no password to remember.',
    },
  },
  {
    version: '1.6',
    date: '2026-06-26',
    title: { id: 'Tampilan baru', en: 'A fresh new look' },
    summary: {
      id: 'Tema warna ungu yang lebih segar dengan mode terang dan gelap, plus logo brand asli di halaman integrasi.',
      en: 'A fresher violet theme with light and dark modes, plus real brand logos on the integrations page.',
    },
  },
  {
    version: '1.5',
    date: '2026-06-23',
    title: { id: 'Banyak outlet', en: 'Multiple outlets' },
    summary: {
      id: 'Kelola beberapa outlet dalam satu akun, undang manajer per outlet, dan lihat ringkasan semua outlet dalam satu dasbor.',
      en: 'Run several outlets under one account, invite managers per outlet, and see every outlet in one consolidated dashboard.',
    },
  },
  {
    version: '1.4',
    date: '2026-06-13',
    title: { id: 'Notifikasi & menu profil', en: 'Notifications & profile menu' },
    summary: {
      id: 'Lonceng notifikasi di header dan menu profil yang lebih lengkap (staf, laporan, ganti kasir, bahasa).',
      en: 'A working notifications bell in the header and a richer profile menu (staff, reports, switch cashier, language).',
    },
  },
  {
    version: '1.3',
    date: '2026-06-13',
    title: { id: 'Pengaturan umum aktif', en: 'General settings now live' },
    summary: {
      id: 'Konfirmasi kosongkan keranjang, suara transaksi, peringatan stok, PIN untuk void/refund, kunci otomatis, dan awalan nomor pesanan.',
      en: 'Cart-clear confirm, sale sound, low-stock alerts, a void/refund PIN, idle auto-lock, and an order-number prefix.',
    },
  },
  {
    version: '1.2',
    date: '2026-06-12',
    title: { id: 'Rangkaian Pro-POS', en: 'Pro-POS suite' },
    summary: {
      id: 'Meja, layar dapur, pesanan ditahan, void/refund, laporan laba rugi, varian produk, dan banyak lagi.',
      en: 'Tables, kitchen display, held orders, void/refund, profit and loss reports, product variants, and more.',
    },
  },
  {
    version: '1.1',
    date: '2026-06-09',
    title: { id: 'Pembayaran QRIS', en: 'QRIS payments' },
    summary: {
      id: 'Terima pembayaran QRIS statis dan dinamis langsung di kasir.',
      en: 'Accept static and dynamic QRIS payments right at the register.',
    },
  },
  {
    version: '1.0',
    date: '2026-06-01',
    title: { id: 'Peluncuran kodapos', en: 'kodapos launch' },
    summary: {
      id: 'Kasir, menu, inventaris, shift, dan pelaporan dasar untuk kafe Anda.',
      en: 'Register, menu, inventory, shifts, and core reporting for your cafe.',
    },
  },
];

export const LATEST_CHANGE: ChangelogEntry = CHANGELOG[0]!;
