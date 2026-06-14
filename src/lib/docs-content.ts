import type { Localized } from './localized';

export type DocBlock =
  | { type: 'p'; text: Localized }
  | { type: 'ul'; items: Localized[] };

export interface DocSection {
  heading: Localized;
  blocks: DocBlock[];
}

export type DocIcon =
  | 'start' | 'register' | 'payments' | 'void' | 'menu' | 'inventory'
  | 'customers' | 'promos' | 'tables' | 'staff' | 'reports' | 'settings';

export interface DocTopic {
  slug: string;
  icon: DocIcon;
  title: Localized;
  summary: Localized;     // one line
  sections: DocSection[];
}

export const DOCS: DocTopic[] = [
  {
    slug: 'getting-started',
    icon: 'start',
    title: {
      id: 'Memulai',
      en: 'Getting Started',
    },
    summary: {
      id: 'Siapkan kafe Anda, masuk sebagai kasir, buka shift, dan catat penjualan pertama.',
      en: 'Set up your cafe, sign in as a cashier, open a shift, and ring up your first sale.',
    },
    sections: [
      {
        heading: {
          id: 'Buat kafe dan lengkapi penyiapan',
          en: 'Create your cafe and complete setup',
        },
        blocks: [
          {
            type: 'p',
            text: {
              id: 'Saat pertama kali masuk, Anda akan diminta membuat kafe. Beri nama kafe, lalu lengkapi langkah penyiapan yang ditampilkan agar register siap dipakai.',
              en: 'On first sign in you are asked to create a cafe. Give it a name, then work through the setup steps shown so the register is ready to use.',
            },
          },
          {
            type: 'ul',
            items: [
              {
                id: 'Tambahkan beberapa kategori dan item menu agar ada yang bisa dijual.',
                en: 'Add a few categories and menu items so there is something to sell.',
              },
              {
                id: 'Atur pajak dan metode pembayaran di Pengaturan sebelum mulai berjualan.',
                en: 'Set tax and payment methods in Settings before you start selling.',
              },
              {
                id: 'Buat minimal satu staf dengan PIN agar bisa masuk ke register.',
                en: 'Create at least one staff member with a PIN so someone can sign in to the register.',
              },
            ],
          },
        ],
      },
      {
        heading: {
          id: 'Pilih kasir dengan PIN dan buka shift',
          en: 'Pick a cashier by PIN and open a shift',
        },
        blocks: [
          {
            type: 'p',
            text: {
              id: 'Register dibuka dengan layar PIN. Pilih nama Anda lalu masukkan PIN untuk mulai bekerja sebagai kasir tersebut. Semua transaksi tercatat atas nama kasir yang aktif.',
              en: 'The register opens to a PIN screen. Choose your name and enter your PIN to start working as that cashier. Every transaction is recorded against the active cashier.',
            },
          },
          {
            type: 'p',
            text: {
              id: 'Sebelum penjualan pertama, buka shift dan masukkan jumlah uang tunai awal di laci (modal). Shift menghubungkan semua penjualan dan pergerakan kas hingga Anda menutupnya.',
              en: 'Before the first sale, open a shift and enter the starting cash in the drawer (the float). A shift groups all sales and cash movements until you close it.',
            },
          },
        ],
      },
      {
        heading: {
          id: 'Catat penjualan pertama',
          en: 'Ring up your first sale',
        },
        blocks: [
          {
            type: 'p',
            text: {
              id: 'Ketuk item di panel menu untuk menambahkannya ke keranjang, lalu tekan tombol bayar dan pilih metode pembayaran. Setelah pembayaran selesai, struk siap dicetak atau dikirim lewat email.',
              en: 'Tap an item in the menu pane to add it to the cart, then press pay and choose a payment method. Once payment completes, the receipt is ready to print or email.',
            },
          },
        ],
      },
      {
        heading: {
          id: 'Bilah atas register dan layar pelanggan',
          en: 'The register top bar and customer display',
        },
        blocks: [
          {
            type: 'p',
            text: {
              id: 'Bilah atas register memberi akses cepat ke seluruh bagian operasional kafe.',
              en: 'The register top bar gives quick access to every operational part of the cafe.',
            },
          },
          {
            type: 'ul',
            items: [
              {
                id: 'Meja: kelola denah dan status meja untuk pesanan makan di tempat.',
                en: 'Meja (Tables): manage the floor and table status for dine-in orders.',
              },
              {
                id: 'Pesanan Masuk: antrean pesanan mandiri (QR) yang menunggu diterima; lencana menunjukkan jumlah pesanan baru.',
                en: 'Pesanan Masuk (Incoming Orders): the queue of QR self-orders waiting to be accepted; the badge shows how many are new.',
              },
              {
                id: 'Dapur: tampilan dapur (KDS) berisi pesanan yang sedang disiapkan.',
                en: 'Dapur (Kitchen): the kitchen display (KDS) with orders being prepared.',
              },
              {
                id: 'Riwayat: daftar transaksi untuk dicari, dilihat, dicetak ulang, atau direfund.',
                en: 'Riwayat (History): the list of transactions to search, view, reprint, or refund.',
              },
              {
                id: 'Shift: buka dan tutup shift beserta hitung kas.',
                en: 'Shift: open and close shifts and count the cash.',
              },
              {
                id: 'Admin: dasbor pemilik dengan laporan dan pengaturan (hanya tampil untuk pemilik).',
                en: 'Admin: the owner dashboard with reports and settings (shown to owners only).',
              },
            ],
          },
          {
            type: 'p',
            text: {
              id: 'Tombol Layar pelanggan membuka jendela terpisah yang dapat dipindahkan ke monitor kedua menghadap pelanggan, menampilkan rincian pesanan dan total saat Anda mengetik.',
              en: 'The Layar pelanggan (Customer display) button opens a separate window you can move to a second monitor facing the customer, showing the order lines and total as you ring it up.',
            },
          },
        ],
      },
    ],
  },
  {
    slug: 'register',
    icon: 'register',
    title: {
      id: 'Register',
      en: 'Register',
    },
    summary: {
      id: 'Susun pesanan: cari item, atur varian dan modifier, terapkan diskon, tahan dan panggil ulang.',
      en: 'Build an order: find items, set variants and modifiers, apply discounts, hold and recall.',
    },
    sections: [
      {
        heading: {
          id: 'Panel menu',
          en: 'The menu pane',
        },
        blocks: [
          {
            type: 'p',
            text: {
              id: 'Panel menu menampilkan item yang dapat dijual. Gunakan kotak pencarian untuk menemukan item berdasarkan nama, atau saring berdasarkan kategori.',
              en: 'The menu pane shows your sellable items. Use the search box to find an item by name, or filter by category.',
            },
          },
          {
            type: 'ul',
            items: [
              {
                id: 'Ketuk kartu item untuk menambahkannya ke keranjang.',
                en: 'Tap an item card to add it to the cart.',
              },
              {
                id: 'Pindai barcode untuk langsung menambahkan item yang cocok ke keranjang (scan-to-cart).',
                en: 'Scan a barcode to add the matching item straight to the cart (scan-to-cart).',
              },
              {
                id: 'Item yang ditandai habis tidak dapat ditambahkan hingga statusnya dipulihkan.',
                en: 'Items marked sold out cannot be added until their status is restored.',
              },
            ],
          },
        ],
      },
      {
        heading: {
          id: 'Varian dan modifier',
          en: 'Variants and modifiers',
        },
        blocks: [
          {
            type: 'p',
            text: {
              id: 'Jika item memiliki varian (misalnya ukuran) atau grup modifier (misalnya tingkat gula atau topping tambahan), dialog pemilih akan muncul saat ditambahkan. Pilih varian dan opsi yang diinginkan, lalu konfirmasi.',
              en: 'If an item has variants (such as size) or modifier groups (such as sugar level or extra toppings), a picker dialog appears when you add it. Choose the variant and the options you want, then confirm.',
            },
          },
          {
            type: 'p',
            text: {
              id: 'Setiap kombinasi varian dan modifier menjadi baris keranjang tersendiri sehingga harga dihitung dengan benar.',
              en: 'Each combination of variant and modifiers becomes its own cart line so the price is calculated correctly.',
            },
          },
        ],
      },
      {
        heading: {
          id: 'Keranjang, jenis pesanan, dan diskon',
          en: 'The cart, order type, and discounts',
        },
        blocks: [
          {
            type: 'ul',
            items: [
              {
                id: 'Ubah jumlah pada setiap baris keranjang, atau hapus baris yang tidak jadi.',
                en: 'Adjust the quantity on any cart line, or remove a line you no longer need.',
              },
              {
                id: 'Pilih jenis pesanan: Makan di tempat, Bawa pulang, atau Ambil di tempat.',
                en: 'Choose an order type: dine-in, takeaway, or pickup.',
              },
              {
                id: 'Terapkan diskon manual berupa nominal atau persen langsung pada pesanan.',
                en: 'Apply a manual discount as a fixed amount or a percentage directly on the order.',
              },
              {
                id: 'Terapkan promo dari pemilih promo; sistem menghitung potongannya secara otomatis.',
                en: 'Apply a promo from the promo picker; the system works out the discount automatically.',
              },
            ],
          },
        ],
      },
      {
        heading: {
          id: 'Tahan, panggil ulang, kosongkan, dan ganti kasir',
          en: 'Hold, recall, clear, and switch cashier',
        },
        blocks: [
          {
            type: 'p',
            text: {
              id: 'Tahan pesanan untuk menyimpannya sementara dan melayani pelanggan lain, lalu panggil ulang nanti untuk melanjutkan pembayaran. Pesanan yang ditahan beserta meja yang ditautkan dipulihkan persis seperti saat ditahan.',
              en: 'Hold an order to park it while you serve someone else, then recall it later to finish payment. A held order and its linked table are restored exactly as they were.',
            },
          },
          {
            type: 'ul',
            items: [
              {
                id: 'Kosongkan keranjang untuk membatalkan pesanan yang sedang disusun; aktifkan konfirmasi di Pengaturan agar tidak terhapus tak sengaja.',
                en: 'Clear the cart to discard the order you are building; turn on confirmation in Settings to avoid clearing it by accident.',
              },
              {
                id: 'Ganti kasir untuk menyerahkan register ke staf lain tanpa keluar dari aplikasi.',
                en: 'Switch cashier to hand the register to another staff member without leaving the app.',
              },
            ],
          },
        ],
      },
    ],
  },
  {
    slug: 'payments',
    icon: 'payments',
    title: {
      id: 'Pembayaran',
      en: 'Payments',
    },
    summary: {
      id: 'Terima tunai, QRIS, kartu hadiah, dan pembayaran terpisah, lalu cetak atau kirim struk.',
      en: 'Take cash, QRIS, gift cards, and split tender, then print or email the receipt.',
    },
    sections: [
      {
        heading: {
          id: 'Tunai',
          en: 'Cash',
        },
        blocks: [
          {
            type: 'p',
            text: {
              id: 'Pilih Tunai untuk membuka dialog pembayaran tunai. Masukkan jumlah yang diterima, atau ketuk tombol uang cepat untuk nominal umum. Kembalian dihitung otomatis dari total.',
              en: 'Choose Tunai (Cash) to open the cash payment dialog. Enter the amount received, or tap a quick-cash button for common amounts. Change is calculated automatically from the total.',
            },
          },
          {
            type: 'p',
            text: {
              id: 'Tombol uang cepat hanya menampilkan nominal yang menutupi total; gunakan tombol Pas untuk uang pas. Atur nominal uang cepat Anda sendiri di Pengaturan.',
              en: 'Quick-cash buttons only show amounts that cover the total; use the exact button for exact money. Set your own quick-cash amounts in Settings.',
            },
          },
        ],
      },
      {
        heading: {
          id: 'QRIS',
          en: 'QRIS',
        },
        blocks: [
          {
            type: 'p',
            text: {
              id: 'QRIS statis menampilkan gambar kode QR tetap milik kafe untuk dipindai pelanggan. Unggah gambar QRIS Anda di Pengaturan agar metode ini tersedia, lalu tandai pembayaran sebagai selesai setelah dana masuk.',
              en: 'QRIS static shows your cafe fixed QR image for the customer to scan. Upload your QRIS image in Settings to make this method available, then mark the payment complete once you confirm the funds.',
            },
          },
          {
            type: 'p',
            text: {
              id: 'QRIS dinamis membuat kode QR unik untuk setiap transaksi melalui integrasi terhubung. Dialog menunggu pembayaran dan otomatis berlanjut saat dana terkonfirmasi; Anda dapat membatalkannya jika pelanggan berubah pikiran.',
              en: 'QRIS dynamic generates a unique QR per transaction through a connected integration. The dialog waits for payment and continues automatically once funds are confirmed; you can cancel it if the customer changes their mind.',
            },
          },
        ],
      },
      {
        heading: {
          id: 'Bayar terpisah dan kartu hadiah',
          en: 'Split tender and gift cards',
        },
        blocks: [
          {
            type: 'p',
            text: {
              id: 'Gunakan bayar terpisah saat satu pesanan dibayar dengan lebih dari satu metode, misalnya sebagian tunai dan sisanya QRIS. Tambahkan setiap pembayaran hingga total terpenuhi.',
              en: 'Use split tender when one order is paid with more than one method, for example part cash and the rest QRIS. Add each payment until the total is covered.',
            },
          },
          {
            type: 'p',
            text: {
              id: 'Pembayaran kartu hadiah memotong saldo dari kartu prabayar pelanggan. Saldo yang tersisa dapat dipakai untuk pembelian berikutnya.',
              en: 'A gift-card payment draws the balance from the customer prepaid card. Any remaining balance can be used on a later purchase.',
            },
          },
        ],
      },
      {
        heading: {
          id: 'Struk dan konfirmasi',
          en: 'Receipt and confirmation',
        },
        blocks: [
          {
            type: 'p',
            text: {
              id: 'Saat pembayaran berhasil, sebuah suara konfirmasi berbunyi (dapat dimatikan di Pengaturan) dan struk ditampilkan. Anda dapat mencetaknya atau mengirimkannya ke email pelanggan.',
              en: 'When a payment succeeds a confirmation chime plays (it can be turned off in Settings) and the receipt is shown. You can print it or send it to the customer by email.',
            },
          },
          {
            type: 'p',
            text: {
              id: 'Nomor pesanan dapat diberi awalan (misalnya INV-) yang dicetak di depan nomor pada struk. Atur awalan ini di Pengaturan.',
              en: 'The order number can carry a prefix (such as INV-) printed in front of the number on the receipt. Set this prefix in Settings.',
            },
          },
        ],
      },
    ],
  },
  {
    slug: 'void-refund',
    icon: 'void',
    title: {
      id: 'Void dan Refund',
      en: 'Void and Refund',
    },
    summary: {
      id: 'Batalkan atau refund pesanan yang sudah dibayar dengan pengembalian stok dan poin yang benar.',
      en: 'Cancel or refund a paid order with stock and points correctly reversed.',
    },
    sections: [
      {
        heading: {
          id: 'Membatalkan pesanan yang sudah dibayar (void)',
          en: 'Voiding a paid order',
        },
        blocks: [
          {
            type: 'p',
            text: {
              id: 'Void membatalkan seluruh pesanan yang sudah dibayar dan membalikkan dampaknya. Gunakan ini untuk transaksi yang salah, bukan untuk pengembalian sebagian.',
              en: 'A void cancels an entire paid order and reverses its effects. Use it for a mistaken transaction, not for a partial return.',
            },
          },
          {
            type: 'ul',
            items: [
              {
                id: 'Stok bahan yang dipakai pesanan dikembalikan ke inventaris.',
                en: 'The ingredient stock used by the order is returned to inventory.',
              },
              {
                id: 'Poin loyalti yang diperoleh atau ditukar pada pesanan tersebut dibalikkan.',
                en: 'Loyalty points earned or redeemed on that order are reversed.',
              },
              {
                id: 'Pesanan ditandai void di Riwayat dan tidak lagi dihitung sebagai penjualan.',
                en: 'The order is marked void in History and no longer counts as a sale.',
              },
            ],
          },
        ],
      },
      {
        heading: {
          id: 'Refund penuh dan sebagian',
          en: 'Full and partial refunds',
        },
        blocks: [
          {
            type: 'p',
            text: {
              id: 'Refund mengembalikan uang untuk seluruh atau sebagian pesanan. Dalam dialog refund, centang baris yang dikembalikan dan atur jumlahnya. Refund sebagian mengembalikan hanya item dan jumlah yang dipilih.',
              en: 'A refund returns money for all or part of an order. In the refund dialog, check the lines being returned and set the quantity. A partial refund returns only the chosen items and quantities.',
            },
          },
          {
            type: 'p',
            text: {
              id: 'Nilai refund dihitung secara proporsional per unit, dan setiap refund dicatat dalam catatan refund pesanan agar total yang sudah dikembalikan selalu akurat.',
              en: 'The refund value is computed proportionally per unit, and each refund is recorded in the order refund ledger so the cumulative refunded total stays accurate.',
            },
          },
        ],
      },
      {
        heading: {
          id: 'Gerbang PIN pemilik dan izin canVoid',
          en: 'The owner-PIN gate and the canVoid permission',
        },
        blocks: [
          {
            type: 'p',
            text: {
              id: 'Anda dapat mewajibkan PIN pemilik sebelum void atau refund dapat dijalankan. Aktifkan ini di Pengaturan > Keamanan agar kasir tidak dapat membatalkan transaksi tanpa persetujuan.',
              en: 'You can require an owner PIN before a void or refund can proceed. Turn this on in Settings > Security so cashiers cannot cancel transactions without approval.',
            },
          },
          {
            type: 'p',
            text: {
              id: 'Izin canVoid menentukan peran mana yang boleh membatalkan atau merefund pesanan. Atur izin per peran di Staf agar hanya orang yang berwenang dapat melakukannya.',
              en: 'The canVoid permission controls which roles may void or refund orders. Set permissions per role under Staff so only authorized people can do it.',
            },
          },
        ],
      },
    ],
  },
  {
    slug: 'menu-recipes',
    icon: 'menu',
    title: {
      id: 'Menu dan Resep',
      en: 'Menu and Recipes',
    },
    summary: {
      id: 'Susun kategori, item, varian, modifier, dan resep yang menggerakkan stok.',
      en: 'Build categories, items, variants, modifiers, and recipes that drive stock.',
    },
    sections: [
      {
        heading: {
          id: 'Kategori dan item',
          en: 'Categories and items',
        },
        blocks: [
          {
            type: 'p',
            text: {
              id: 'Kategori mengelompokkan menu agar mudah dicari di register. Setiap item milik sebuah kategori dan memiliki harga dasar.',
              en: 'Categories group your menu so it is easy to find on the register. Each item belongs to a category and has a base price.',
            },
          },
          {
            type: 'ul',
            items: [
              {
                id: 'Tambahkan gambar item agar lebih mudah dikenali di panel menu.',
                en: 'Add an item image to make it easier to recognize in the menu pane.',
              },
              {
                id: 'Tetapkan barcode pada item agar dapat dipindai langsung ke keranjang.',
                en: 'Assign a barcode to an item so it can be scanned straight to the cart.',
              },
            ],
          },
        ],
      },
      {
        heading: {
          id: 'Varian, grup modifier, dan harga',
          en: 'Variants, modifier groups, and pricing',
        },
        blocks: [
          {
            type: 'p',
            text: {
              id: 'Varian adalah pilihan yang mengubah harga dasar, misalnya ukuran kecil, sedang, dan besar. Grup modifier menawarkan opsi tambahan seperti tingkat gula atau topping, dan setiap opsi dapat menambah atau mengurangi harga.',
              en: 'Variants are choices that change the base price, such as small, medium, and large. Modifier groups offer extra options such as sugar level or toppings, and each option can add to or reduce the price.',
            },
          },
          {
            type: 'ul',
            items: [
              {
                id: 'Atur grup modifier sebagai wajib atau opsional, dan tentukan berapa opsi yang boleh dipilih.',
                en: 'Set a modifier group as required or optional, and define how many options can be chosen.',
              },
              {
                id: 'Penyesuaian harga opsi diterapkan otomatis pada total baris keranjang.',
                en: 'Option price adjustments are applied automatically to the cart line total.',
              },
            ],
          },
        ],
      },
      {
        heading: {
          id: 'Resep dan status habis',
          en: 'Recipes and the sold-out toggle',
        },
        blocks: [
          {
            type: 'p',
            text: {
              id: 'Resep mendaftar bahan yang dipakai setiap item. Saat item terjual, bahan dalam resepnya dikurangi dari stok, sehingga inventaris selalu mengikuti penjualan secara otomatis.',
              en: 'A recipe lists the ingredients each item uses. When an item is sold, the ingredients in its recipe are deducted from stock, so inventory follows sales automatically.',
            },
          },
          {
            type: 'p',
            text: {
              id: 'Gunakan tombol habis untuk menyembunyikan item dari penjualan sementara, misalnya saat bahan habis, tanpa menghapus item dari menu.',
              en: 'Use the sold-out toggle to temporarily stop an item from being sold, for example when an ingredient runs out, without removing the item from the menu.',
            },
          },
        ],
      },
    ],
  },
  {
    slug: 'inventory',
    icon: 'inventory',
    title: {
      id: 'Inventaris',
      en: 'Inventory',
    },
    summary: {
      id: 'Lacak bahan dan stok, kelola pembelian, pemasok, stok opname, dan limbah.',
      en: 'Track ingredients and stock, manage purchases, suppliers, stock-takes, and waste.',
    },
    sections: [
      {
        heading: {
          id: 'Bahan, satuan, dan stok',
          en: 'Ingredients, units, and stock',
        },
        blocks: [
          {
            type: 'p',
            text: {
              id: 'Bahan adalah barang yang Anda beli dan pakai dalam resep, masing-masing dengan satuannya (misalnya gram, mililiter, atau buah). Tingkat stok bahan turun otomatis saat item menu terjual.',
              en: 'Ingredients are the items you buy and use in recipes, each with its unit (such as grams, milliliters, or pieces). Ingredient stock levels drop automatically as menu items are sold.',
            },
          },
          {
            type: 'ul',
            items: [
              {
                id: 'Tetapkan ambang pemesanan ulang pada setiap bahan untuk memicu peringatan stok rendah.',
                en: 'Set a reorder threshold on each ingredient to trigger low-stock alerts.',
              },
              {
                id: 'Peringatan stok rendah muncul di bilah atas register saat bahan mendekati ambangnya (dapat dimatikan di Pengaturan).',
                en: 'A low-stock warning appears in the register top bar when an ingredient nears its threshold (this can be turned off in Settings).',
              },
            ],
          },
        ],
      },
      {
        heading: {
          id: 'Pembelian, pesanan pembelian, dan pemasok',
          en: 'Purchases, purchase orders, and suppliers',
        },
        blocks: [
          {
            type: 'p',
            text: {
              id: 'Catat pembelian untuk menambah stok bahan saat barang masuk. Simpan daftar pemasok agar pembelian dan pesanan dapat dihubungkan ke sumbernya.',
              en: 'Record a purchase to add ingredient stock when goods arrive. Keep a list of suppliers so purchases and orders can be linked to their source.',
            },
          },
          {
            type: 'ul',
            items: [
              {
                id: 'Buat pesanan pembelian untuk barang yang dipesan ke pemasok.',
                en: 'Create a purchase order for goods ordered from a supplier.',
              },
              {
                id: 'Terima pesanan pembelian saat barang tiba untuk menambah stok.',
                en: 'Receive a purchase order when the goods arrive to add the stock.',
              },
              {
                id: 'Batalkan pesanan pembelian yang tidak jadi dipenuhi.',
                en: 'Cancel a purchase order that will not be fulfilled.',
              },
            ],
          },
        ],
      },
      {
        heading: {
          id: 'Stok opname, penyesuaian, dan limbah',
          en: 'Stock-take, adjustments, and waste',
        },
        blocks: [
          {
            type: 'p',
            text: {
              id: 'Lakukan stok opname untuk menghitung stok fisik dan mencatat penyesuaian agar angka di sistem cocok dengan kenyataan di rak.',
              en: 'Run a stock-take to count physical stock and record adjustments so the system figures match what is on the shelf.',
            },
          },
          {
            type: 'p',
            text: {
              id: 'Catat limbah saat bahan rusak, kedaluwarsa, atau tumpah, agar penyusutan stok terdokumentasi dan tidak terlihat seperti kehilangan misterius.',
              en: 'Log waste when ingredients spoil, expire, or are spilled, so stock shrinkage is documented and does not look like mystery loss.',
            },
          },
        ],
      },
    ],
  },
  {
    slug: 'customers-loyalty',
    icon: 'customers',
    title: {
      id: 'Pelanggan dan Loyalti',
      en: 'Customers and Loyalty',
    },
    summary: {
      id: 'Kelola pelanggan, poin dan tier, penukaran hadiah, serta kartu hadiah.',
      en: 'Manage customers, points and tiers, reward redemption, and gift cards.',
    },
    sections: [
      {
        heading: {
          id: 'Pelanggan dan poin',
          en: 'Customers and points',
        },
        blocks: [
          {
            type: 'p',
            text: {
              id: 'Simpan daftar pelanggan dan tautkan mereka ke transaksi saat membayar. Pelanggan yang tertaut memperoleh poin loyalti dari setiap pembelian sesuai aturan loyalti Anda.',
              en: 'Keep a list of customers and link them to a transaction at payment time. A linked customer earns loyalty points on each purchase according to your loyalty rules.',
            },
          },
          {
            type: 'p',
            text: {
              id: 'Tier loyalti mengelompokkan pelanggan berdasarkan aktivitas mereka dan dapat memberi mereka keuntungan berbeda.',
              en: 'Loyalty tiers group customers by their activity and can grant them different benefits.',
            },
          },
        ],
      },
      {
        heading: {
          id: 'Menukar hadiah',
          en: 'Redeeming rewards',
        },
        blocks: [
          {
            type: 'p',
            text: {
              id: 'Saat membayar, pelanggan dapat menukar poin sebagai potongan pada pesanan. Pilih pelanggan di bagian pembayaran lalu tentukan jumlah poin atau hadiah yang ditukar; nilainya otomatis mengurangi total.',
              en: 'At payment, a customer can redeem points as a discount on the order. Select the customer in the payment section, then choose how many points or which reward to redeem; the value reduces the total automatically.',
            },
          },
        ],
      },
      {
        heading: {
          id: 'Kartu hadiah',
          en: 'Gift cards',
        },
        blocks: [
          {
            type: 'p',
            text: {
              id: 'Kartu hadiah adalah voucher prabayar yang dapat Anda jual dan terima sebagai pembayaran.',
              en: 'Gift cards are prepaid vouchers you can sell and accept as payment.',
            },
          },
          {
            type: 'ul',
            items: [
              {
                id: 'Terbitkan kartu hadiah baru dengan saldo awal dari halaman Kartu Hadiah.',
                en: 'Issue a new gift card with a starting balance from the Gift Cards page.',
              },
              {
                id: 'Tukar (redeem) kartu hadiah saat pembayaran untuk memotong saldonya.',
                en: 'Redeem a gift card at payment to draw down its balance.',
              },
              {
                id: 'Cek saldo kartu kapan saja di daftar kartu hadiah.',
                en: 'Check a card balance at any time in the gift cards list.',
              },
            ],
          },
        ],
      },
    ],
  },
  {
    slug: 'promotions',
    icon: 'promos',
    title: {
      id: 'Promosi',
      en: 'Promotions',
    },
    summary: {
      id: 'Buat promo persen atau nominal dengan cakupan tertentu, lalu terapkan saat pembayaran.',
      en: 'Create percentage or fixed promos with a defined scope, then apply them at checkout.',
    },
    sections: [
      {
        heading: {
          id: 'Jenis promo',
          en: 'Promo types',
        },
        blocks: [
          {
            type: 'p',
            text: {
              id: 'Promo dapat berupa potongan persen atau potongan nominal tetap. Pilih jenis yang sesuai dengan penawaran Anda saat membuat promo.',
              en: 'A promo can be a percentage discount or a fixed amount discount. Choose the type that matches your offer when you create the promo.',
            },
          },
        ],
      },
      {
        heading: {
          id: 'Cakupan promo',
          en: 'Promo scope',
        },
        blocks: [
          {
            type: 'p',
            text: {
              id: 'Cakupan menentukan bagian pesanan yang dikenai promo.',
              en: 'The scope decides which part of the order the promo applies to.',
            },
          },
          {
            type: 'ul',
            items: [
              {
                id: 'Seluruh pesanan: potongan dihitung dari total pesanan.',
                en: 'Whole order: the discount is taken from the order total.',
              },
              {
                id: 'Item tertentu: hanya item yang dipilih yang memenuhi syarat promo.',
                en: 'Specific items: only the chosen items qualify for the promo.',
              },
              {
                id: 'Kategori: semua item dalam kategori yang dipilih memenuhi syarat.',
                en: 'Categories: every item in the chosen categories qualifies.',
              },
            ],
          },
        ],
      },
      {
        heading: {
          id: 'Promo berkode dan penerapan',
          en: 'Coded promos and applying them',
        },
        blocks: [
          {
            type: 'p',
            text: {
              id: 'Promo dapat memiliki kode yang dibagikan ke pelanggan. Di register, buka pemilih promo, pilih atau masukkan promo, dan potongannya dihitung secara otomatis dari dokumen promo.',
              en: 'A promo can carry a code you share with customers. At the register, open the promo picker, select or enter the promo, and the discount is calculated automatically from the promo definition.',
            },
          },
        ],
      },
    ],
  },
  {
    slug: 'tables-kitchen',
    icon: 'tables',
    title: {
      id: 'Meja dan Dapur',
      en: 'Tables and Kitchen',
    },
    summary: {
      id: 'Kelola denah meja, tampilan dapur, reservasi, dan pesanan mandiri lewat QR.',
      en: 'Manage the floor, the kitchen display, reservations, and QR self-orders.',
    },
    sections: [
      {
        heading: {
          id: 'Meja dan denah',
          en: 'Tables and the floor',
        },
        blocks: [
          {
            type: 'p',
            text: {
              id: 'Kelola meja kafe dan statusnya dari halaman Meja. Saat membuat pesanan makan di tempat, tautkan ke sebuah meja agar pesanan dan meja terhubung sepanjang transaksi.',
              en: 'Manage your cafe tables and their status from the Tables page. When you ring up a dine-in order, tag it to a table so the order and the table stay linked through the transaction.',
            },
          },
        ],
      },
      {
        heading: {
          id: 'Tampilan dapur (KDS) dan reservasi',
          en: 'The kitchen display (KDS) and reservations',
        },
        blocks: [
          {
            type: 'p',
            text: {
              id: 'Tampilan dapur menunjukkan pesanan yang harus disiapkan, sehingga staf dapur tahu apa yang sedang dimasak tanpa struk kertas.',
              en: 'The kitchen display shows the orders that need preparing, so kitchen staff know what to cook without paper tickets.',
            },
          },
          {
            type: 'p',
            text: {
              id: 'Gunakan reservasi untuk mencatat pemesanan meja di muka beserta waktu dan detail tamu.',
              en: 'Use reservations to record table bookings in advance with the time and guest details.',
            },
          },
        ],
      },
      {
        heading: {
          id: 'Pesanan mandiri lewat QR',
          en: 'QR self-orders',
        },
        blocks: [
          {
            type: 'p',
            text: {
              id: 'Pelanggan dapat memesan sendiri dengan memindai kode QR. Pesanan tersebut masuk ke antrean Pesanan Masuk di bilah atas register, dengan lencana menunjukkan jumlah pesanan baru.',
              en: 'Customers can order for themselves by scanning a QR code. Those orders arrive in the Pesanan Masuk (Incoming Orders) queue in the register top bar, with a badge showing how many are new.',
            },
          },
          {
            type: 'p',
            text: {
              id: 'Terima pesanan dari antrean untuk memuatnya ke register, lalu proses dan terima pembayaran seperti pesanan biasa.',
              en: 'Accept an order from the queue to load it into the register, then process it and take payment like any other order.',
            },
          },
        ],
      },
    ],
  },
  {
    slug: 'staff-shifts',
    icon: 'staff',
    title: {
      id: 'Staf dan Shift',
      en: 'Staff and Shifts',
    },
    summary: {
      id: 'Kelola staf, peran dan izin, PIN, shift, pergerakan kas, jam kerja, dan jadwal.',
      en: 'Manage staff, roles and permissions, PINs, shifts, cash movements, time clock, and scheduling.',
    },
    sections: [
      {
        heading: {
          id: 'Staf, peran, dan PIN',
          en: 'Staff, roles, and PINs',
        },
        blocks: [
          {
            type: 'p',
            text: {
              id: 'Tambahkan staf dan tetapkan peran ke masing-masing. Peran menentukan izin, misalnya apakah seseorang boleh membatalkan transaksi atau membuka pengaturan.',
              en: 'Add staff and assign a role to each. Roles carry permissions, for example whether someone may void transactions or open settings.',
            },
          },
          {
            type: 'ul',
            items: [
              {
                id: 'Tetapkan PIN untuk setiap staf; PIN dipakai untuk masuk ke register.',
                en: 'Set a PIN for each staff member; the PIN is used to sign in to the register.',
              },
              {
                id: 'Ganti kasir untuk berpindah pengguna, dan kunci register untuk kembali ke layar PIN.',
                en: 'Switch cashier to change users, and lock the register to return to the PIN screen.',
              },
            ],
          },
        ],
      },
      {
        heading: {
          id: 'Shift dan pergerakan kas',
          en: 'Shifts and cash movements',
        },
        blocks: [
          {
            type: 'p',
            text: {
              id: 'Buka shift dengan modal awal di laci, dan tutup shift dengan menghitung kas akhir. Penutupan membandingkan kas yang dihitung dengan kas yang diharapkan untuk menyoroti selisih.',
              en: 'Open a shift with a starting float in the drawer, and close it by counting the final cash. Closing compares the counted cash against the expected cash to highlight any difference.',
            },
          },
          {
            type: 'p',
            text: {
              id: 'Catat pergerakan kas selama shift: kas masuk untuk uang yang ditambahkan ke laci dan kas keluar untuk uang yang dikeluarkan, sehingga hitungan akhir tetap akurat.',
              en: 'Record cash movements during a shift: kas masuk (cash in) for money added to the drawer and kas keluar (cash out) for money removed, so the final count stays accurate.',
            },
          },
        ],
      },
      {
        heading: {
          id: 'Jam kerja dan jadwal',
          en: 'Time clock and scheduling',
        },
        blocks: [
          {
            type: 'p',
            text: {
              id: 'Jam kerja mencatat saat staf mulai dan selesai bekerja sehingga Anda dapat melacak jam kerja. Gunakan jadwal untuk merencanakan giliran kerja staf di muka.',
              en: 'The time clock records when staff clock in and out so you can track hours worked. Use scheduling to plan staff shifts in advance.',
            },
          },
        ],
      },
    ],
  },
  {
    slug: 'reports',
    icon: 'reports',
    title: {
      id: 'Laporan',
      en: 'Reports',
    },
    summary: {
      id: 'Tinjau penjualan, pembayaran, produk, margin, laba rugi, dan ekspor data.',
      en: 'Review sales, payments, products, margin, profit and loss, and export the data.',
    },
    sections: [
      {
        heading: {
          id: 'Dasbor dan rentang tanggal',
          en: 'The dashboard and date ranges',
        },
        blocks: [
          {
            type: 'p',
            text: {
              id: 'Dasbor admin memberi gambaran cepat kinerja kafe. Setiap laporan dapat disaring berdasarkan rentang tanggal sehingga Anda dapat membandingkan hari, minggu, atau bulan.',
              en: 'The admin dashboard gives a quick view of cafe performance. Each report can be filtered by date range so you can compare days, weeks, or months.',
            },
          },
        ],
      },
      {
        heading: {
          id: 'Laporan yang tersedia',
          en: 'Available reports',
        },
        blocks: [
          {
            type: 'ul',
            items: [
              {
                id: 'Penjualan: total dan tren penjualan sepanjang waktu.',
                en: 'Sales: totals and sales trends over time.',
              },
              {
                id: 'Pembayaran: rincian per metode pembayaran.',
                en: 'Payments: a breakdown by payment method.',
              },
              {
                id: 'Produk: item dan kategori yang paling laku.',
                en: 'Products: best-selling items and categories.',
              },
              {
                id: 'Margin: keuntungan per produk berdasarkan biaya resep.',
                en: 'Margin: profit per product based on recipe cost.',
              },
              {
                id: 'Laba rugi, pengeluaran, dan pendapatan lain: gambaran keuangan kafe Anda.',
                en: 'Profit and loss, expenses, and other income: the financial picture of your cafe.',
              },
              {
                id: 'Laporan kasir: aktivitas dan total per kasir.',
                en: 'Cashier report: activity and totals per cashier.',
              },
            ],
          },
        ],
      },
      {
        heading: {
          id: 'Ekspor',
          en: 'Export',
        },
        blocks: [
          {
            type: 'p',
            text: {
              id: 'Ekspor laporan ke CSV untuk diolah di spreadsheet, atau ke PDF untuk dibagikan dan diarsipkan.',
              en: 'Export a report to CSV to work with in a spreadsheet, or to PDF to share and archive.',
            },
          },
        ],
      },
    ],
  },
  {
    slug: 'settings',
    icon: 'settings',
    title: {
      id: 'Pengaturan',
      en: 'Settings',
    },
    summary: {
      id: 'Atur profil, pajak dan pembayaran, struk dan printer, preferensi umum, serta integrasi.',
      en: 'Configure profile, tax and payments, receipt and printer, general preferences, and integrations.',
    },
    sections: [
      {
        heading: {
          id: 'Profil, pajak, dan pembayaran',
          en: 'Profile, tax, and payments',
        },
        blocks: [
          {
            type: 'p',
            text: {
              id: 'Atur profil kafe seperti nama dan logo. Di Pajak dan Pembayaran, tetapkan tarif pajak dan kelola metode pembayaran.',
              en: 'Set your cafe profile such as name and logo. Under Tax and Payments, set the tax rate and manage payment methods.',
            },
          },
          {
            type: 'ul',
            items: [
              {
                id: 'Unggah gambar QRIS agar metode QRIS statis tersedia di register.',
                en: 'Upload your QRIS image so the QRIS static method becomes available at the register.',
              },
              {
                id: 'Aktifkan atau nonaktifkan metode pembayaran; metode yang belum siap tidak ditampilkan saat membayar.',
                en: 'Enable or disable payment methods; a method that is not ready does not appear at payment time.',
              },
            ],
          },
        ],
      },
      {
        heading: {
          id: 'Struk dan printer',
          en: 'Receipt and printer',
        },
        blocks: [
          {
            type: 'p',
            text: {
              id: 'Sesuaikan tampilan struk dan atur printer Anda di pengaturan struk. Isi struk tercetak selalu dalam bahasa Inggris.',
              en: 'Customize how the receipt looks and set up your printer in the receipt settings. The printed receipt content is always in English.',
            },
          },
        ],
      },
      {
        heading: {
          id: 'Preferensi umum',
          en: 'General preferences',
        },
        blocks: [
          {
            type: 'p',
            text: {
              id: 'Pengaturan umum menampung preferensi sehari-hari register.',
              en: 'General settings hold the day-to-day preferences for the register.',
            },
          },
          {
            type: 'ul',
            items: [
              {
                id: 'Bahasa, tema (terang, gelap, atau ikuti sistem), dan kepadatan tampilan (ringkas atau nyaman).',
                en: 'Language, theme (light, dark, or follow system), and display density (compact or comfortable).',
              },
              {
                id: 'Format tanggal dan waktu yang dipakai pada struk dan laporan.',
                en: 'Date and time format used on receipts and reports.',
              },
              {
                id: 'Konfirmasi sebelum mengosongkan keranjang, suara saat transaksi berhasil, dan peringatan stok rendah.',
                en: 'Confirm before clearing the cart, the success sound, and low-stock alerts.',
              },
              {
                id: 'Wajib PIN untuk void atau refund, kunci otomatis saat tidak aktif, dan awalan nomor pesanan.',
                en: 'Require a PIN for void or refund, idle auto-lock, and the order-number prefix.',
              },
            ],
          },
        ],
      },
      {
        heading: {
          id: 'Ringkasan email, notifikasi, dan integrasi',
          en: 'Email summary, notifications, and integrations',
        },
        blocks: [
          {
            type: 'p',
            text: {
              id: 'Aktifkan ringkasan email saat shift ditutup dan peringatan stok rendah harian ke alamat email yang Anda tentukan. Kelola layanan yang terhubung, seperti QRIS dinamis, di Integrasi.',
              en: 'Turn on an email summary when a shift closes and a daily low-stock alert to an address you choose. Manage connected services, such as dynamic QRIS, under Integrations.',
            },
          },
        ],
      },
    ],
  },
];
