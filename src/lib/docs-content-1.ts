import type { DocTopic } from './docs-content';

export const DOCS_PART_1: DocTopic[] = [
  {
    slug: 'getting-started',
    icon: 'start',
    title: { id: 'Mulai bekerja', en: 'Getting started' },
    summary: {
      id: 'Masuk sebagai kasir, buka shift, dan catat penjualan pertama Anda.',
      en: 'Sign in as a cashier, open a shift, and ring up your first sale.',
    },
    sections: [
      {
        heading: { id: 'Apa itu kasir kodapos', en: 'What the kodapos register is' },
        blocks: [
          {
            type: 'p',
            text: {
              id: 'kodapos adalah aplikasi kasir untuk kafe. Layar penjualan (atau mesin kasir) adalah tempat Anda memilih menu, menerima pembayaran, dan mencetak struk. Bagian ini menuntun Anda dari pertama kali masuk sampai penjualan pertama.',
              en: 'kodapos is a point of sale app for cafes. The selling screen (also called the register screen) is where you pick menu items, take payment, and print a receipt. This section walks you from your first sign in to your first sale.',
            },
          },
          {
            type: 'p',
            text: {
              id: 'Di bagian atas layar penjualan ada bilah atas berisi tab: Meja, Pesanan Masuk, Dapur, Riwayat, Shift, dan Admin (hanya untuk pemilik). Di kanan ada tombol Layar pelanggan yang membuka tampilan menghadap pelanggan.',
              en: 'Along the top of the selling screen is a top bar with tabs: Meja (tables), Pesanan Masuk (incoming orders), Dapur (kitchen), Riwayat (history), Shift, and Admin (owner only). On the right is a Layar pelanggan (customer display) button that opens the customer-facing view.',
            },
          },
        ],
      },
      {
        heading: { id: 'Masuk sebagai kasir', en: 'Sign in as a cashier' },
        blocks: [
          {
            type: 'steps',
            items: [
              {
                id: 'Buka kodapos. Layar bertajuk "Siapa yang bertugas?" akan muncul dengan kartu nama setiap staf.',
                en: 'Open kodapos. The screen titled "Siapa yang bertugas?" (Who is on duty?) appears, showing a name card for each staff member.',
              },
              {
                id: 'Ketuk kartu dengan nama Anda.',
                en: 'Tap the card with your name.',
              },
              {
                id: 'Jika nama Anda diberi PIN, ketik PIN 4 digit Anda pada kotak yang muncul. Jika tidak, Anda langsung masuk.',
                en: 'If your name has a PIN, type your 4-digit PIN in the box that appears. If it does not, you go straight in.',
              },
            ],
          },
          {
            type: 'note',
            text: {
              id: 'PIN (kode 4 angka) menjaga agar hanya Anda yang dapat bekerja dengan nama Anda. Jika PIN salah, layar akan menampilkan "PIN salah." dan Anda bisa mencoba lagi.',
              en: 'A PIN (a 4-digit code) keeps your name tied to you alone. If the PIN is wrong, the screen shows "PIN salah." (wrong PIN) and you can try again.',
            },
          },
        ],
      },
      {
        heading: { id: 'Buka shift', en: 'Open a shift' },
        blocks: [
          {
            type: 'p',
            text: {
              id: 'Shift adalah sesi kerja Anda dari saat membuka kasir sampai menutupnya. Anda perlu shift yang terbuka sebelum bisa menerima pembayaran.',
              en: 'A shift is your working session from when you open the register until you close it. You need an open shift before you can take any payment.',
            },
          },
          {
            type: 'steps',
            items: [
              {
                id: 'Setelah masuk, jika belum ada shift terbuka, layar "Buka Shift" muncul otomatis.',
                en: 'After you sign in, if no shift is open yet, the "Buka Shift" (Open shift) screen appears automatically.',
              },
              {
                id: 'Pada kolom "Modal awal (Rp)", masukkan jumlah uang tunai yang ada di laci kas saat ini.',
                en: 'In the "Modal awal (Rp)" (opening float) field, enter how much cash is in the drawer right now.',
              },
              {
                id: 'Ketuk tombol Buka Shift. Anda langsung dibawa ke layar penjualan.',
                en: 'Tap the Buka Shift button. You are taken straight to the selling screen.',
              },
            ],
          },
          {
            type: 'note',
            text: {
              id: 'Jika shift sudah terbuka, kodapos akan langsung membuka layar penjualan dan melewati langkah ini.',
              en: 'If a shift is already open, kodapos goes straight to the selling screen and skips this step.',
            },
          },
        ],
      },
      {
        heading: { id: 'Catat penjualan pertama Anda', en: 'Ring up your first sale' },
        blocks: [
          {
            type: 'steps',
            items: [
              {
                id: 'Di sisi kiri layar penjualan, ketuk item menu untuk menambahkannya ke pesanan. Item akan muncul di panel Pesanan di sebelah kanan.',
                en: 'On the left of the selling screen, tap a menu item to add it to the order. It appears in the Pesanan (order) panel on the right.',
              },
              {
                id: 'Periksa Total di bagian bawah panel kanan.',
                en: 'Check the Total at the bottom of the right panel.',
              },
              {
                id: 'Ketuk tombol metode pembayaran (misalnya Tunai atau QRIS) lalu selesaikan pembayarannya.',
                en: 'Tap a payment button (for example Tunai for cash, or QRIS) and complete the payment.',
              },
              {
                id: 'Layar struk muncul. Ketuk Selesai untuk mengakhiri dan mengosongkan pesanan agar siap untuk pelanggan berikutnya.',
                en: 'The receipt screen appears. Tap Selesai (done) to finish and clear the order, ready for the next customer.',
              },
            ],
          },
          {
            type: 'note',
            text: {
              id: 'Detail lengkap cara menambah item dan menerima pembayaran ada di topik Mesin kasir dan Pembayaran.',
              en: 'Full detail on adding items and taking payment is in the Register and Payments topics.',
            },
          },
        ],
      },
    ],
  },
  {
    slug: 'register',
    icon: 'register',
    title: { id: 'Mesin kasir', en: 'The register' },
    summary: {
      id: 'Tambah item, varian, dan modifier, atur tipe pesanan, beri diskon, lalu tahan atau panggil kembali pesanan.',
      en: 'Add items, variants, and modifiers, set the order type, apply discounts, then hold or recall an order.',
    },
    sections: [
      {
        heading: { id: 'Menambah item ke pesanan', en: 'Add items to the order' },
        blocks: [
          {
            type: 'p',
            text: {
              id: 'Mesin kasir (layar penjualan) terbagi dua: daftar menu di kiri, dan panel Pesanan di kanan yang menampilkan apa yang dibeli pelanggan beserta totalnya.',
              en: 'The register (the selling screen) is split in two: the menu list on the left, and the Pesanan (order) panel on the right that shows what the customer is buying and the total.',
            },
          },
          {
            type: 'steps',
            items: [
              {
                id: 'Di daftar menu kiri, ketuk sebuah item untuk menambahkannya. Gunakan tab kategori di atas daftar untuk berpindah kelompok menu.',
                en: 'In the menu list on the left, tap an item to add it. Use the category tabs above the list to switch between menu groups.',
              },
              {
                id: 'Untuk menambah jumlah, ketuk tombol tambah (+) pada baris item di panel Pesanan. Ketuk kurang (-) untuk menguranginya.',
                en: 'To add more of an item, tap the plus (+) button on its row in the Pesanan panel. Tap minus (-) to reduce it.',
              },
              {
                id: 'Untuk menghapus satu baris, ketuk tanda silang (x) pada baris tersebut.',
                en: 'To remove a single line, tap the cross (x) on that row.',
              },
            ],
          },
          {
            type: 'note',
            text: {
              id: 'Jika sebuah item sedang habis, kodapos menolak menambahkannya dan menampilkan "Item sedang habis."',
              en: 'If an item is sold out, kodapos refuses to add it and shows "Item sedang habis." (item is sold out).',
            },
          },
        ],
      },
      {
        heading: { id: 'Varian dan modifier', en: 'Variants and modifiers' },
        blocks: [
          {
            type: 'p',
            text: {
              id: 'Varian adalah pilihan utama sebuah item (misalnya ukuran kecil atau besar). Modifier adalah tambahan (misalnya extra shot atau tanpa gula). Item yang punya pilihan akan membuka kotak pemilihan ketika diketuk.',
              en: 'A variant is the main choice for an item (for example small or large). A modifier is an add-on (for example extra shot, or no sugar). An item with choices opens a picker box when you tap it.',
            },
          },
          {
            type: 'steps',
            items: [
              {
                id: 'Ketuk item yang memiliki pilihan. Sebuah kotak pemilihan akan terbuka.',
                en: 'Tap an item that has options. A picker box opens.',
              },
              {
                id: 'Pilih varian yang diinginkan, lalu pilih modifier apa pun yang diminta pelanggan.',
                en: 'Pick the variant the customer wants, then choose any modifiers they ask for.',
              },
              {
                id: 'Atur jumlah di dalam kotak itu, lalu ketuk tombol konfirmasi untuk menambahkannya ke pesanan.',
                en: 'Set the quantity inside the box, then tap the confirm button to add it to the order.',
              },
            ],
          },
          {
            type: 'note',
            text: {
              id: 'Harga di panel Pesanan sudah termasuk tambahan dari modifier, jadi total yang tampil adalah yang harus dibayar pelanggan.',
              en: 'The price in the Pesanan panel already includes any modifier add-ons, so the total shown is what the customer pays.',
            },
          },
        ],
      },
      {
        heading: { id: 'Tipe pesanan, promo, dan diskon', en: 'Order type, promos, and discounts' },
        blocks: [
          {
            type: 'p',
            text: {
              id: 'Tipe pesanan memberi tahu dapur cara menyajikan pesanan. Pilihannya ada tepat di bawah judul Pesanan: Makan di tempat, Bawa pulang, dan Ambil di tempat.',
              en: 'The order type tells the kitchen how to serve the order. The choices sit just under the Pesanan heading: Makan di tempat (dine in), Bawa pulang (takeaway), and Ambil di tempat (pickup).',
            },
          },
          {
            type: 'steps',
            items: [
              {
                id: 'Ketuk salah satu tombol tipe pesanan (Makan di tempat, Bawa pulang, atau Ambil di tempat). Tombol yang terpilih akan disorot.',
                en: 'Tap one of the order type buttons (Makan di tempat, Bawa pulang, or Ambil di tempat). The selected one is highlighted.',
              },
              {
                id: 'Untuk memakai promo (potongan yang sudah disiapkan pemilik), ketuk "+ Tambah promo" di area total, lalu pilih promo dari daftar.',
                en: 'To use a promo (a discount the owner set up in advance), tap "+ Tambah promo" (add promo) in the totals area, then pick a promo from the list.',
              },
              {
                id: 'Untuk potongan satu kali, ketuk "+ Diskon manual", masukkan nilainya, lalu terapkan.',
                en: 'For a one-off discount, tap "+ Diskon manual" (manual discount), enter the amount, and apply it.',
              },
            ],
          },
          {
            type: 'note',
            text: {
              id: 'Untuk menghapus promo atau diskon manual yang sudah dipasang, ketuk tanda silang (x) di sebelah namanya di area total.',
              en: 'To remove a promo or manual discount you applied, tap the cross (x) next to its name in the totals area.',
            },
          },
          {
            type: 'note',
            text: {
              id: 'Tombol promo dan diskon manual hanya muncul untuk staf yang diizinkan memberi diskon. Jika Anda tidak melihatnya, mintalah pemilik.',
              en: 'The promo and manual discount buttons only appear for staff who are allowed to give discounts. If you do not see them, ask the owner.',
            },
          },
        ],
      },
      {
        heading: { id: 'Menahan, memanggil kembali, dan mengosongkan', en: 'Hold, recall, and clear' },
        blocks: [
          {
            type: 'p',
            text: {
              id: 'Menahan pesanan menyimpannya untuk sementara agar Anda bisa melayani pelanggan lain dulu, lalu memanggilnya kembali nanti. Tombol-tombol ini ada di baris atas panel Pesanan.',
              en: 'Holding an order parks it for a moment so you can serve someone else, then recall it later. These buttons sit in the top row of the Pesanan panel.',
            },
          },
          {
            type: 'steps',
            items: [
              {
                id: 'Untuk menyimpan pesanan saat ini, ketuk Tahan, beri catatan singkat jika perlu, lalu konfirmasi. Pesanan dipindahkan ke daftar tertahan dan keranjang dikosongkan.',
                en: 'To park the current order, tap Tahan (hold), add a short note if needed, then confirm. The order moves to the held list and the cart empties.',
              },
              {
                id: 'Untuk memanggilnya kembali, ketuk tombol Ditahan (yang menampilkan jumlah pesanan tertahan), lalu pilih pesanan yang ingin dilanjutkan.',
                en: 'To bring it back, tap the Ditahan (held) button (it shows a count of held orders), then pick the order you want to continue.',
              },
              {
                id: 'Untuk membuang seluruh pesanan, ketuk Kosongkan. Jika diminta konfirmasi, ketuk Kosongkan sekali lagi untuk membenarkan.',
                en: 'To throw away the whole order, tap Kosongkan (clear). If you are asked to confirm, tap Kosongkan once more to agree.',
              },
            ],
          },
          {
            type: 'note',
            text: {
              id: 'Jika keranjang sudah berisi item dan Anda memanggil pesanan tertahan, kodapos bertanya dulu sebelum menggantinya, agar pesanan yang sedang berjalan tidak hilang tanpa sengaja.',
              en: 'If the cart already has items and you recall a held order, kodapos asks first before replacing it, so you do not lose the order in progress by accident.',
            },
          },
        ],
      },
    ],
  },
  {
    slug: 'payments',
    icon: 'payments',
    title: { id: 'Pembayaran', en: 'Payments' },
    summary: {
      id: 'Terima pembayaran tunai, QRIS, bagi pembayaran, dan kartu hadiah, lalu kelola struk.',
      en: 'Take cash, QRIS, split tender, and gift card payments, then handle the receipt.',
    },
    sections: [
      {
        heading: { id: 'Memilih metode pembayaran', en: 'Choose a payment method' },
        blocks: [
          {
            type: 'p',
            text: {
              id: 'Setiap metode pembayaran yang diaktifkan punya tombolnya sendiri di bagian bawah panel Pesanan. Tombol hanya aktif setelah ada item di keranjang.',
              en: 'Each enabled payment method has its own button at the bottom of the Pesanan panel. The buttons only become active once there are items in the cart.',
            },
          },
          {
            type: 'ul',
            items: [
              {
                id: 'Tunai: pelanggan membayar dengan uang tunai.',
                en: 'Tunai (cash): the customer pays with cash.',
              },
              {
                id: 'QRIS: pelanggan memindai kode QR untuk membayar dari aplikasi ponsel mereka.',
                en: 'QRIS: the customer scans a QR code to pay from their phone app.',
              },
              {
                id: 'Bagi pembayaran: total dibagi ke beberapa metode sekaligus.',
                en: 'Bagi pembayaran (split): the total is split across more than one method at once.',
              },
              {
                id: 'Kartu hadiah: dibayar dari saldo kartu hadiah.',
                en: 'Kartu hadiah (gift card): paid from a gift card balance.',
              },
            ],
          },
          {
            type: 'note',
            text: {
              id: 'Jika Anda melihat tombol "Atur metode pembayaran" yang tidak bisa ditekan, berarti belum ada metode yang siap. Pemilik perlu mengaktifkan metode di Pengaturan > Pajak & Pembayaran.',
              en: 'If you see a greyed out "Atur metode pembayaran" (set up payment method) button, no method is ready yet. The owner needs to enable one in Pengaturan (Settings) > Pajak & Pembayaran (Tax & Payment).',
            },
          },
        ],
      },
      {
        heading: { id: 'Menerima pembayaran tunai', en: 'Take a cash payment' },
        blocks: [
          {
            type: 'steps',
            items: [
              {
                id: 'Di panel Pesanan, ketuk tombol Tunai. Kotak "Pembayaran Tunai" terbuka dan menampilkan Total tagihan.',
                en: 'In the Pesanan panel, tap the Tunai button. The "Pembayaran Tunai" (cash payment) box opens and shows the Total tagihan (amount due).',
              },
              {
                id: 'Masukkan uang yang diterima: ketuk tombol Pas untuk jumlah pas, ketuk salah satu tombol uang cepat, atau ketik jumlahnya di papan angka.',
                en: 'Enter the cash received: tap the Pas (exact) button for the exact amount, tap one of the quick-cash buttons, or type the amount on the keypad.',
              },
              {
                id: 'Periksa Kembalian yang dihitung otomatis, lalu ketuk Konfirmasi.',
                en: 'Check the Kembalian (change), which is worked out automatically, then tap Konfirmasi (confirm).',
              },
            ],
          },
          {
            type: 'note',
            text: {
              id: 'Tombol Konfirmasi baru aktif setelah uang yang diterima menutup total. Jika uang kurang, tombol tetap mati.',
              en: 'The Konfirmasi button only turns on once the cash received covers the total. If the amount is short, the button stays off.',
            },
          },
        ],
      },
      {
        heading: { id: 'Menerima pembayaran QRIS', en: 'Take a QRIS payment' },
        blocks: [
          {
            type: 'p',
            text: {
              id: 'Ada dua jenis QRIS. QRIS statis adalah satu kode QR tetap milik kafe; Anda menandai sendiri saat dana sudah masuk. QRIS dinamis membuat kode QR baru senilai tagihan dan menandai pembayaran lunas secara otomatis.',
              en: 'There are two kinds of QRIS. QRIS statis (static) is one fixed QR code that belongs to the cafe; you mark it paid yourself once the money arrives. QRIS dinamis (dynamic) makes a fresh QR code for the exact amount and marks itself paid automatically.',
            },
          },
          {
            type: 'steps',
            items: [
              {
                id: 'Ketuk tombol QRIS di panel Pesanan. Kotak "Pembayaran QRIS" terbuka dan menampilkan Total tagihan.',
                en: 'Tap the QRIS button in the Pesanan panel. The "Pembayaran QRIS" box opens and shows the Total tagihan (amount due).',
              },
              {
                id: 'Untuk QRIS statis, perlihatkan kode QR pada layar kepada pelanggan agar mereka pindai dan bayar.',
                en: 'For static QRIS, show the QR code on the screen to the customer so they can scan and pay.',
              },
              {
                id: 'Untuk QRIS dinamis, ketuk Buat QRIS terlebih dahulu. Kode QR muncul dan layar menampilkan "Menunggu pembayaran...".',
                en: 'For dynamic QRIS, tap Buat QRIS (create QRIS) first. The QR code appears and the screen shows "Menunggu pembayaran..." (waiting for payment).',
              },
              {
                id: 'Pada QRIS statis, setelah dana masuk ketuk Sudah dibayar. Pada QRIS dinamis, kodapos menandai lunas sendiri begitu pembayaran diterima.',
                en: 'For static QRIS, once the money lands tap Sudah dibayar (already paid). For dynamic QRIS, kodapos marks it paid by itself as soon as the payment comes through.',
              },
            ],
          },
          {
            type: 'note',
            text: {
              id: 'Jika dana belum masuk, tunggu dulu sebelum menekan Sudah dibayar pada QRIS statis. Tombol itu menandai pesanan lunas tanpa pengecekan otomatis.',
              en: 'If the money has not arrived yet, wait before tapping Sudah dibayar on static QRIS. That button marks the order paid without any automatic check.',
            },
          },
          {
            type: 'note',
            text: {
              id: 'Tombol QRIS hanya muncul jika pemilik sudah mengunggah gambar kode QR di Pengaturan > Pajak & Pembayaran (untuk QRIS statis) atau menghubungkan QRIS dinamis.',
              en: 'The QRIS button only appears once the owner has uploaded the QR image in Pengaturan > Pajak & Pembayaran (for static QRIS) or connected dynamic QRIS.',
            },
          },
        ],
      },
      {
        heading: { id: 'Bagi pembayaran dan kartu hadiah', en: 'Split tender and gift card' },
        blocks: [
          {
            type: 'p',
            text: {
              id: 'Bagi pembayaran membagi satu total ke beberapa metode, misalnya sebagian tunai dan sebagian QRIS atau kartu hadiah. Kartu hadiah (saldo prabayar) dapat juga dipakai sendiri.',
              en: 'Split tender divides one total across more than one method, for example part cash and part QRIS or gift card. A gift card (a prepaid balance) can also be used on its own.',
            },
          },
          {
            type: 'steps',
            items: [
              {
                id: 'Untuk membagi, ketuk Bagi pembayaran. Pada tiap baris, pilih metode (Tunai, QRIS statis, atau Kartu hadiah) dan masukkan jumlahnya.',
                en: 'To split, tap Bagi pembayaran. On each row, choose a method (Tunai, QRIS statis, or Kartu hadiah) and enter the amount.',
              },
              {
                id: 'Ketuk "+ Tambah tender" untuk menambah baris lagi. Pantau angka Sisa sampai mencapai nol.',
                en: 'Tap "+ Tambah tender" (add tender) for another row. Watch the Sisa (remaining) figure until it reaches zero.',
              },
              {
                id: 'Untuk baris kartu hadiah, ketik Kode kartu; saldo akan tampil agar Anda tahu cukup atau tidak. Saat Sisa nol, ketuk Bayar.',
                en: 'For a gift card row, type the Kode kartu (card code); the balance shows so you know if it is enough. When Sisa reaches zero, tap Bayar (pay).',
              },
            ],
          },
          {
            type: 'steps',
            items: [
              {
                id: 'Untuk membayar penuh dengan kartu hadiah, ketuk tombol Kartu hadiah di panel Pesanan.',
                en: 'To pay in full with a gift card, tap the Kartu hadiah button in the Pesanan panel.',
              },
              {
                id: 'Masukkan kode kartu, pastikan saldo menutup total, lalu konfirmasi.',
                en: 'Enter the card code, make sure the balance covers the total, then confirm.',
              },
            ],
          },
          {
            type: 'note',
            text: {
              id: 'Bagi pembayaran perlu setidaknya dua baris dan Sisa harus nol; selama belum, tombol Bayar tetap mati. Kartu yang tidak aktif atau saldonya kurang akan ditolak.',
              en: 'A split needs at least two rows and Sisa must be zero; until then the Bayar button stays off. A card that is inactive or short on balance is refused.',
            },
          },
        ],
      },
      {
        heading: { id: 'Struk', en: 'The receipt' },
        blocks: [
          {
            type: 'p',
            text: {
              id: 'Setelah pembayaran selesai, layar struk terbuka dengan rincian pesanan. Dari sini Anda bisa mencetak, mengirim email, atau menyelesaikan transaksi.',
              en: 'Once a payment goes through, the receipt screen opens with the order details. From here you can print, email, or finish the sale.',
            },
          },
          {
            type: 'steps',
            items: [
              {
                id: 'Untuk mencetak, ketuk Cetak.',
                en: 'To print, tap Cetak (print).',
              },
              {
                id: 'Untuk mengirim ke email pelanggan, ketuk Email struk, ketik alamat email, lalu ketuk Kirim email.',
                en: 'To email it to the customer, tap Email struk (email receipt), type the email address, then tap Kirim email (send email).',
              },
              {
                id: 'Setelah selesai, ketuk Selesai untuk menutup struk dan mengosongkan pesanan untuk pelanggan berikutnya.',
                en: 'When you are done, tap Selesai (done) to close the receipt and clear the order for the next customer.',
              },
            ],
          },
          {
            type: 'note',
            text: {
              id: 'Struk yang dicetak selalu dalam bahasa Inggris. Anda bisa membuka kembali struk pesanan lama kapan saja dari tab Riwayat.',
              en: 'The printed receipt is always in English. You can reopen the receipt for an older order any time from the Riwayat (history) tab.',
            },
          },
        ],
      },
    ],
  },
  {
    slug: 'void-refund',
    icon: 'void',
    title: { id: 'Batalkan dan refund', en: 'Void and refund' },
    summary: {
      id: 'Batalkan pesanan yang sudah dibayar, atau refund sebagian maupun seluruhnya.',
      en: 'Void a paid order, or refund part or all of it.',
    },
    sections: [
      {
        heading: { id: 'Membatalkan (void) dan refund itu apa', en: 'What void and refund mean' },
        blocks: [
          {
            type: 'p',
            text: {
              id: 'Membatalkan (void) menghapus seluruh penjualan, misalnya saat dicatat keliru. Refund mengembalikan uang untuk sebagian atau seluruh item, misalnya saat pelanggan mengembalikan satu minuman. Keduanya dilakukan dari layar struk.',
              en: 'Voiding cancels a whole sale, for example when it was rung up by mistake. A refund gives money back for some or all items, for example when a customer returns one drink. You do both from the receipt screen.',
            },
          },
          {
            type: 'steps',
            items: [
              {
                id: 'Buka struk pesanan. Jika baru saja dibayar, struknya masih terbuka. Jika sudah lewat, ketuk tab Riwayat di bilah atas lalu ketuk pesanannya.',
                en: 'Open the order receipt. If it was just paid, the receipt is still open. If it is older, tap the Riwayat (history) tab in the top bar, then tap the order.',
              },
              {
                id: 'Tombol Batalkan pesanan dan Refund ada di bagian bawah kiri struk untuk pesanan yang sudah dibayar.',
                en: 'The Batalkan pesanan (void order) and Refund buttons sit at the bottom left of the receipt for a paid order.',
              },
            ],
          },
          {
            type: 'note',
            text: {
              id: 'Tombol ini hanya muncul untuk staf yang diizinkan. Pemilik dapat mewajibkan PIN pemilik lebih dulu lewat Pengaturan > Umum, "Wajib PIN untuk void/refund".',
              en: 'These buttons only appear for staff who are allowed. The owner can require the owner PIN first via Pengaturan (Settings) > Umum (General), "Wajib PIN untuk void/refund" (require PIN for void/refund).',
            },
          },
        ],
      },
      {
        heading: { id: 'Membatalkan pesanan yang sudah dibayar', en: 'Void a paid order' },
        blocks: [
          {
            type: 'steps',
            items: [
              {
                id: 'Di struk, ketuk Batalkan pesanan. Jika diminta, masukkan PIN pemilik untuk melanjutkan.',
                en: 'On the receipt, tap Batalkan pesanan. If asked, enter the owner PIN to continue.',
              },
              {
                id: 'Pada kotak konfirmasi, ketik alasan jika ingin (boleh dikosongkan).',
                en: 'In the confirmation box, type a reason if you want (it can be left empty).',
              },
              {
                id: 'Ketuk Batalkan untuk memastikan. Struk akan ditandai ** VOID **.',
                en: 'Tap Batalkan (void) to confirm. The receipt is then marked ** VOID **.',
              },
            ],
          },
          {
            type: 'note',
            text: {
              id: 'Membatalkan mengembalikan stok bahan ke gudang dan membatalkan poin loyalitas dari penjualan itu. Tindakan ini tidak bisa diurungkan, jadi pastikan dulu sebelum mengetuk Batalkan.',
              en: 'Voiding returns stock to inventory and reverses any loyalty points from that sale. It cannot be undone, so be sure before you tap Batalkan.',
            },
          },
        ],
      },
      {
        heading: { id: 'Refund sebagian atau seluruhnya', en: 'Refund part or all' },
        blocks: [
          {
            type: 'p',
            text: {
              id: 'Refund mengembalikan uang per item, jadi Anda bisa mengembalikan hanya yang dikembalikan pelanggan, bukan seluruh pesanan.',
              en: 'A refund works item by item, so you can give back money for only what the customer returns, not the whole order.',
            },
          },
          {
            type: 'steps',
            items: [
              {
                id: 'Di struk, ketuk Refund. Jika diminta, masukkan PIN pemilik.',
                en: 'On the receipt, tap Refund. If asked, enter the owner PIN.',
              },
              {
                id: 'Centang setiap item yang ingin direfund. Untuk item dengan beberapa unit, atur jumlah yang dikembalikan di kolom angka di sebelahnya.',
                en: 'Tick each item you want to refund. For an item with several units, set how many to return in the number field beside it.',
              },
              {
                id: 'Di "Refund ke", pilih ke mana uang dikembalikan (misalnya Tunai atau QRIS), dan ketik Alasan bila perlu.',
                en: 'Under "Refund ke" (refund to), choose where the money goes back (for example Tunai or QRIS), and type a reason if needed.',
              },
              {
                id: 'Periksa Jumlah refund, lalu ketuk tombol Refund untuk menyelesaikannya.',
                en: 'Check the Jumlah refund (refund amount), then tap the Refund button to complete it.',
              },
            ],
          },
          {
            type: 'note',
            text: {
              id: 'Untuk mengembalikan seluruh sisa, centang setiap item dan biarkan jumlahnya penuh; label "Seluruh sisa" akan muncul. Item yang sudah pernah direfund ditandai "Sudah direfund" dan tidak bisa dipilih lagi.',
              en: 'To refund everything left, tick every item and keep each quantity at its full amount; the "Seluruh sisa" (all remaining) label appears. An item already refunded is marked "Sudah direfund" (already refunded) and cannot be picked again.',
            },
          },
        ],
      },
    ],
  },
];
