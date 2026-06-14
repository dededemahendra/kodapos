import type { Localized } from './localized';

export type HelpCategory =
  | 'start'
  | 'sales'
  | 'payments'
  | 'menu'
  | 'inventory'
  | 'staff'
  | 'reports'
  | 'settings';

export interface HelpCategoryDef {
  key: HelpCategory;
  label: Localized;
}

export const HELP_CATEGORIES: HelpCategoryDef[] = [
  { key: 'start', label: { id: 'Mulai', en: 'Getting started' } },
  { key: 'sales', label: { id: 'Penjualan', en: 'Sales' } },
  { key: 'payments', label: { id: 'Pembayaran', en: 'Payments' } },
  { key: 'menu', label: { id: 'Menu', en: 'Menu' } },
  { key: 'inventory', label: { id: 'Inventaris', en: 'Inventory' } },
  { key: 'staff', label: { id: 'Staf', en: 'Staff' } },
  { key: 'reports', label: { id: 'Laporan', en: 'Reports' } },
  { key: 'settings', label: { id: 'Pengaturan', en: 'Settings' } },
];

export interface FaqItem {
  /** short stable kebab-case id */
  id: string;
  category: HelpCategory;
  question: Localized;
  /** 1 to 3 sentences, plain text (may use \n for a line break) */
  answer: Localized;
  /** optional: a docs topic slug to link to */
  docSlug?: string;
}

export const FAQ: FaqItem[] = [
  // ── start ───────────────────────────────────────────────────────────────
  {
    id: 'first-setup',
    category: 'start',
    question: {
      id: 'Bagaimana cara menyiapkan kafe saya pertama kali?',
      en: 'How do I set up my cafe for the first time?',
    },
    answer: {
      id: 'Ikuti panduan onboarding untuk mengisi nama kafe, mata uang, dan pajak, lalu tambahkan beberapa item menu. Setelah itu Anda bisa membuka shift dan langsung mulai berjualan.',
      en: 'Follow the onboarding guide to fill in your cafe name, currency, and tax, then add a few menu items. After that you can open a shift and start selling right away.',
    },
    docSlug: 'getting-started',
  },
  {
    id: 'open-register',
    category: 'start',
    question: {
      id: 'Bagaimana cara membuka layar kasir?',
      en: 'How do I open the register screen?',
    },
    answer: {
      id: 'Masuk dengan PIN Anda lalu buka menu Penjualan. Anda perlu memiliki shift yang aktif sebelum bisa mencatat transaksi.',
      en: 'Sign in with your PIN, then open the Sales menu. You need an active shift before you can record transactions.',
    },
    docSlug: 'register',
  },
  {
    id: 'sign-in-pin',
    category: 'start',
    question: {
      id: 'Bagaimana cara masuk ke aplikasi?',
      en: 'How do I sign in to the app?',
    },
    answer: {
      id: 'Pilih nama Anda lalu masukkan PIN 4 digit di layar PIN. Setiap staf punya PIN sendiri sehingga aktivitas tercatat atas nama orang yang benar.',
      en: 'Pick your name and enter your 4 digit PIN on the PIN screen. Each staff member has their own PIN so activity is recorded under the right person.',
    },
    docSlug: 'staff-shifts',
  },

  // ── sales ───────────────────────────────────────────────────────────────
  {
    id: 'create-sale',
    category: 'sales',
    question: {
      id: 'Bagaimana cara membuat transaksi penjualan?',
      en: 'How do I create a sale?',
    },
    answer: {
      id: 'Ketuk item menu untuk menambahkannya ke keranjang, sesuaikan jumlah atau modifier bila perlu, lalu tekan tombol bayar. Pilih metode pembayaran untuk menyelesaikan transaksi.',
      en: 'Tap menu items to add them to the cart, adjust quantities or modifiers if needed, then press the pay button. Choose a payment method to complete the sale.',
    },
    docSlug: 'register',
  },
  {
    id: 'void-refund',
    category: 'sales',
    question: {
      id: 'Bagaimana cara membatalkan (void) atau mengembalikan dana (refund) sebuah transaksi?',
      en: 'How do I void or refund a sale?',
    },
    answer: {
      id: 'Buka Riwayat, pilih transaksi yang dimaksud, lalu pilih void atau refund. Tindakan ini perlu akses pemilik, jadi masuk dengan PIN pemilik bila diminta.',
      en: 'Open History, select the sale, then choose void or refund. These actions need owner access, so sign in with the owner PIN if prompted.',
    },
    docSlug: 'void-refund',
  },

  // ── payments ────────────────────────────────────────────────────────────
  {
    id: 'qris-payment',
    category: 'payments',
    question: {
      id: 'Bagaimana cara menerima pembayaran QRIS?',
      en: 'How do I take a QRIS payment?',
    },
    answer: {
      id: 'Di layar bayar, pilih QRIS lalu tunjukkan kode QR kepada pelanggan untuk dipindai. Setelah pelanggan membayar, konfirmasi untuk menyelesaikan transaksi.',
      en: 'On the pay screen, choose QRIS and show the QR code for the customer to scan. After they pay, confirm to complete the sale.',
    },
    docSlug: 'payments',
  },
  {
    id: 'cash-payment',
    category: 'payments',
    question: {
      id: 'Bagaimana cara menerima pembayaran tunai dan menghitung kembalian?',
      en: 'How do I take a cash payment and calculate change?',
    },
    answer: {
      id: 'Pilih Tunai, masukkan jumlah uang yang diterima atau ketuk tombol nominal cepat, dan kembalian dihitung otomatis. Tekan selesai untuk mencatat pembayaran.',
      en: 'Choose Cash, enter the amount received or tap a quick-cash button, and the change is calculated for you. Press done to record the payment.',
    },
    docSlug: 'payments',
  },
  {
    id: 'split-payment',
    category: 'payments',
    question: {
      id: 'Bisakah pelanggan membayar dengan beberapa metode sekaligus?',
      en: 'Can a customer pay with more than one method?',
    },
    answer: {
      id: 'Ya. Gunakan pembayaran terpisah (split) untuk membagi total antara tunai dan QRIS sampai seluruh tagihan terbayar.',
      en: 'Yes. Use split payment to divide the total between cash and QRIS until the whole bill is covered.',
    },
    docSlug: 'payments',
  },
  {
    id: 'qris-not-showing',
    category: 'payments',
    question: {
      id: 'Mengapa metode QRIS tidak muncul saat membayar?',
      en: 'Why is the QRIS method not showing at checkout?',
    },
    answer: {
      id: 'QRIS statis hanya aktif setelah Anda mengunggah gambar QR di Pengaturan. Periksa juga bahwa metode QRIS tidak dinonaktifkan di pengaturan pembayaran.',
      en: 'Static QRIS only appears after you upload your QR image in Settings. Also check that the QRIS method is not disabled in your payment settings.',
    },
    docSlug: 'settings',
  },

  // ── menu ────────────────────────────────────────────────────────────────
  {
    id: 'add-menu-item',
    category: 'menu',
    question: {
      id: 'Bagaimana cara menambah item menu baru?',
      en: 'How do I add a new menu item?',
    },
    answer: {
      id: 'Buka Menu lalu tambahkan item dengan nama, harga, dan kategori. Item baru langsung tersedia di layar kasir.',
      en: 'Open Menu and add an item with a name, price, and category. New items appear on the register right away.',
    },
    docSlug: 'menu-recipes',
  },
  {
    id: 'mark-sold-out',
    category: 'menu',
    question: {
      id: 'Bagaimana cara menandai item sebagai habis?',
      en: 'How do I mark an item as sold out?',
    },
    answer: {
      id: 'Di daftar menu, gunakan tindakan tandai habis pada item tersebut. Item yang habis tidak bisa dipilih di kasir sampai Anda menandainya tersedia kembali.',
      en: 'In the menu list, use the mark sold out action on the item. Sold out items cannot be selected on the register until you mark them available again.',
    },
    docSlug: 'menu-recipes',
  },
  {
    id: 'add-recipe',
    category: 'menu',
    question: {
      id: 'Bagaimana cara menautkan resep ke item menu?',
      en: 'How do I link a recipe to a menu item?',
    },
    answer: {
      id: 'Buka Resep dan tetapkan bahan beserta takarannya untuk item tersebut. Saat item terjual, stok bahan ikut berkurang otomatis.',
      en: 'Open Recipes and assign ingredients with their amounts for the item. When the item sells, ingredient stock is reduced automatically.',
    },
    docSlug: 'menu-recipes',
  },

  // ── inventory ───────────────────────────────────────────────────────────
  {
    id: 'add-ingredient',
    category: 'inventory',
    question: {
      id: 'Bagaimana cara menambah bahan dan mencatat stok?',
      en: 'How do I add an ingredient and record stock?',
    },
    answer: {
      id: 'Buka Inventaris untuk menambah bahan dengan satuannya, lalu catat pembelian untuk menambah stok. Stok berkurang sendiri seiring penjualan item yang memakai bahan itu.',
      en: 'Open Inventory to add an ingredient with its unit, then record a purchase to add stock. Stock goes down on its own as items using that ingredient sell.',
    },
    docSlug: 'inventory',
  },
  {
    id: 'low-stock-alert',
    category: 'inventory',
    question: {
      id: 'Bagaimana cara mengatur peringatan stok menipis?',
      en: 'How do I set up low-stock alerts?',
    },
    answer: {
      id: 'Tetapkan ambang batas pemesanan ulang pada setiap bahan di Inventaris. Saat stok turun di bawah ambang itu, bahan tersebut ditandai sebagai stok menipis.',
      en: 'Set a reorder threshold on each ingredient in Inventory. When stock drops below that threshold, the ingredient is flagged as low stock.',
    },
    docSlug: 'inventory',
  },

  // ── staff ───────────────────────────────────────────────────────────────
  {
    id: 'add-cashier',
    category: 'staff',
    question: {
      id: 'Bagaimana cara menambah kasir dan mengatur PIN-nya?',
      en: 'How do I add a cashier and set their PIN?',
    },
    answer: {
      id: 'Buka Pengaturan lalu Staf, isi nama dan PIN 4 digit, dan pilih peran kasir. Anda bisa mengganti PIN seseorang kapan saja dari halaman yang sama.',
      en: 'Go to Settings, then Staff, enter a name and a 4 digit PIN, and pick the cashier role. You can reset someone PIN at any time from the same page.',
    },
    docSlug: 'staff-shifts',
  },
  {
    id: 'open-close-shift',
    category: 'staff',
    question: {
      id: 'Bagaimana cara membuka dan menutup shift?',
      en: 'How do I open and close a shift?',
    },
    answer: {
      id: 'Buka shift dengan mencatat modal kas awal sebelum berjualan. Saat menutup, hitung uang di laci dan aplikasi menunjukkan selisih terhadap jumlah yang diharapkan.',
      en: 'Open a shift by entering your starting cash float before you sell. When closing, count the cash in the drawer and the app shows the variance against the expected amount.',
    },
    docSlug: 'staff-shifts',
  },

  // ── reports ─────────────────────────────────────────────────────────────
  {
    id: 'todays-sales',
    category: 'reports',
    question: {
      id: 'Di mana saya bisa melihat penjualan hari ini?',
      en: 'Where can I see today sales?',
    },
    answer: {
      id: 'Buka Laporan untuk melihat ringkasan penjualan, item terlaris, dan rincian metode pembayaran. Anda bisa memilih rentang tanggal untuk melihat periode lain.',
      en: 'Open Reports to see your sales summary, top selling items, and a breakdown by payment method. You can pick a date range to view other periods.',
    },
    docSlug: 'reports',
  },
  {
    id: 'export-report',
    category: 'reports',
    question: {
      id: 'Bagaimana cara mengekspor laporan penjualan?',
      en: 'How do I export a sales report?',
    },
    answer: {
      id: 'Dari halaman Laporan, pilih rentang tanggal lalu ekspor data untuk pembukuan atau dibagikan ke akuntan Anda.',
      en: 'From the Reports page, choose a date range and export the data for bookkeeping or to share with your accountant.',
    },
    docSlug: 'reports',
  },

  // ── settings ────────────────────────────────────────────────────────────
  {
    id: 'switch-language',
    category: 'settings',
    question: {
      id: 'Bagaimana cara mengganti bahasa aplikasi?',
      en: 'How do I switch the app language?',
    },
    answer: {
      id: 'Buka Pengaturan lalu bagian Bahasa dan Wilayah, dan pilih Bahasa Indonesia atau Inggris. Tampilan langsung berganti ke bahasa yang dipilih.',
      en: 'Open Settings, go to Language and Region, and pick Indonesian or English. The interface switches to your chosen language right away.',
    },
    docSlug: 'settings',
  },
  {
    id: 'change-theme',
    category: 'settings',
    question: {
      id: 'Bagaimana cara mengubah tema terang atau gelap?',
      en: 'How do I change the light or dark theme?',
    },
    answer: {
      id: 'Buka Pengaturan dan pilih tema terang, gelap, atau ikut sistem. Pilihan ini disimpan di perangkat ini.',
      en: 'Open Settings and choose the light, dark, or system theme. Your choice is saved on this device.',
    },
    docSlug: 'settings',
  },
  {
    id: 'auto-lock',
    category: 'settings',
    question: {
      id: 'Bagaimana cara kerja kunci otomatis?',
      en: 'How does auto-lock work?',
    },
    answer: {
      id: 'Kunci otomatis mengembalikan aplikasi ke layar PIN setelah perangkat tidak dipakai selama waktu yang Anda pilih di Pengaturan. Secara bawaan fitur ini mati, dan Anda bisa mengaktifkannya untuk keamanan tambahan.',
      en: 'Auto-lock returns the app to the PIN screen after the device is idle for the time you pick in Settings. It is off by default, and you can turn it on for extra security.',
    },
    docSlug: 'settings',
  },
  {
    id: 'upload-qris',
    category: 'settings',
    question: {
      id: 'Bagaimana cara mengunggah gambar QRIS statis saya?',
      en: 'How do I upload my static QRIS image?',
    },
    answer: {
      id: 'Buka Pengaturan dan unggah gambar QRIS statis dari penyedia pembayaran Anda. Setelah tersimpan, QRIS akan muncul sebagai metode pembayaran di kasir.',
      en: 'Open Settings and upload the static QRIS image from your payment provider. Once saved, QRIS appears as a payment method on the register.',
    },
    docSlug: 'payments',
  },
];

export interface GettingStartedCard {
  icon: 'rocket' | 'creditCard' | 'users' | 'boxes';
  title: Localized;
  desc: Localized;
  /** links into the docs page */
  docSlug: string;
}

export const GETTING_STARTED: GettingStartedCard[] = [
  {
    icon: 'rocket',
    docSlug: 'getting-started',
    title: { id: 'Siapkan kafe Anda', en: 'Set up your cafe' },
    desc: {
      id: 'Lewati onboarding, isi detail kafe, dan catat penjualan pertama Anda.',
      en: 'Walk through onboarding, fill in your cafe details, and ring up your first sale.',
    },
  },
  {
    icon: 'creditCard',
    docSlug: 'payments',
    title: { id: 'Terima pembayaran', en: 'Take payments' },
    desc: {
      id: 'Terima tunai dengan kembalian otomatis dan QRIS dengan pemindaian kode QR.',
      en: 'Accept cash with automatic change and QRIS with a quick QR scan.',
    },
  },
  {
    icon: 'users',
    docSlug: 'staff-shifts',
    title: { id: 'Staf & shift', en: 'Staff & shifts' },
    desc: {
      id: 'Buat PIN staf, atur peran, dan buka atau tutup shift dengan hitungan kas.',
      en: 'Create staff PINs, set roles, and open or close shifts with a cash count.',
    },
  },
  {
    icon: 'boxes',
    docSlug: 'inventory',
    title: { id: 'Kelola stok', en: 'Manage stock' },
    desc: {
      id: 'Catat bahan, rekam pembelian, dan dapatkan peringatan saat stok menipis.',
      en: 'Track ingredients, record purchases, and get alerts when stock runs low.',
    },
  },
];
