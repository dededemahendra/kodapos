import type { DocTopic } from './docs-content';

export const DOCS_PART_3: DocTopic[] = [
  // ───────────────────────────────────────────────────────────────────────────
  // 1. Tables & Kitchen
  // ───────────────────────────────────────────────────────────────────────────
  {
    slug: 'tables-kitchen',
    icon: 'tables',
    title: { id: 'Meja & Dapur', en: 'Tables & kitchen' },
    summary: {
      id: 'Atur meja, kaitkan pesanan makan di tempat ke meja, pantau layar dapur, kelola reservasi, dan terima pesanan QR pelanggan.',
      en: 'Set up tables, attach dine-in orders to a table, watch the kitchen screen, manage reservations, and accept customer QR orders.',
    },
    sections: [
      {
        heading: { id: 'Meja dan denah ruangan', en: 'Tables and floor plan' },
        blocks: [
          {
            type: 'p',
            text: {
              id: 'Meja membantu Anda melacak pesanan makan di tempat (dine-in). Setiap meja menunjukkan apakah ia kosong atau sedang ada pesanan, lengkap dengan jumlah item. Gunakan halaman ini saat tamu duduk dan memesan langsung ke kasir.',
              en: 'Tables help you track dine-in orders. Each table shows whether it is empty or has an open order, along with how many items it holds. Use this page when guests sit down and order at the counter.',
            },
          },
          {
            type: 'p',
            text: {
              id: 'Untuk membuka denah meja, ketuk Meja di bilah atas layar kasir.',
              en: 'To open the table layout, tap Meja (Tables) in the top bar of the selling screen.',
            },
          },
          {
            type: 'steps',
            items: [
              {
                id: 'Di layar kasir, ketuk Meja di bilah atas.',
                en: 'On the selling screen, tap Meja (Tables) in the top bar.',
              },
              {
                id: 'Ketuk tombol Kelola meja di pojok untuk menambah, mengubah nama, atau menghapus meja.',
                en: 'Tap the Kelola meja (Manage tables) button in the corner to add, rename, or remove tables.',
              },
              {
                id: 'Tambahkan satu meja untuk setiap tempat duduk yang ingin Anda lacak, lalu simpan.',
                en: 'Add one table for each seating spot you want to track, then save.',
              },
            ],
          },
          {
            type: 'note',
            text: {
              id: 'Kalau halaman Meja masih kosong, buka Kelola meja terlebih dulu untuk menambah meja sebelum Anda bisa mengaitkan pesanan.',
              en: 'If the Meja (Tables) page is still empty, open Kelola meja (Manage tables) first to add tables before you can attach any order.',
            },
          },
        ],
      },
      {
        heading: { id: 'Kaitkan pesanan ke meja', en: 'Attach an order to a table' },
        blocks: [
          {
            type: 'p',
            text: {
              id: 'Mengaitkan pesanan ke meja artinya keranjang yang sedang Anda buat disimpan atas nama meja itu, sehingga bisa Anda buka lagi dan tambah pesanannya sebelum tamu membayar.',
              en: 'Attaching an order to a table means the cart you are building is saved under that table, so you can reopen it and add to it before the guest pays.',
            },
          },
          {
            type: 'steps',
            items: [
              {
                id: 'Di layar kasir, masukkan item tamu ke dalam keranjang seperti biasa.',
                en: 'On the selling screen, add the guest items to the cart as usual.',
              },
              {
                id: 'Ketuk Meja di bilah atas, lalu pilih meja yang kosong untuk menyimpan keranjang ke meja tersebut.',
                en: 'Tap Meja (Tables) in the top bar, then choose an empty table to save the cart to it.',
              },
              {
                id: 'Untuk menambah pesanan, buka kembali Meja dan ketuk meja yang sudah berisi pesanan.',
                en: 'To add more, reopen Meja (Tables) and tap the table that already has an order.',
              },
              {
                id: 'Saat tamu siap membayar, buka pesanan meja itu lalu selesaikan pembayaran seperti biasa.',
                en: 'When the guest is ready to pay, open that table order and complete the payment as usual.',
              },
            ],
          },
        ],
      },
      {
        heading: { id: 'Layar dapur (KDS)', en: 'Kitchen display (KDS)' },
        blocks: [
          {
            type: 'p',
            text: {
              id: 'Layar dapur, atau KDS (Kitchen Display System, layar pesanan untuk dapur), menampilkan pesanan yang sudah dibayar agar tim dapur tahu apa yang harus dibuat. Buka lewat Dapur di bilah atas.',
              en: 'The kitchen display, or KDS (Kitchen Display System, the order screen for the kitchen), shows paid orders so the kitchen team knows what to make. Open it from Dapur (Kitchen) in the top bar.',
            },
          },
          {
            type: 'steps',
            items: [
              {
                id: 'Ketuk Dapur di bilah atas untuk membuka layar pesanan dapur.',
                en: 'Tap Dapur (Kitchen) in the top bar to open the kitchen order screen.',
              },
              {
                id: 'Setiap kartu adalah satu pesanan; ketuk Siap saat makanan selesai dimasak.',
                en: 'Each card is one order; tap Siap (Ready) when the food is cooked.',
              },
              {
                id: 'Ketuk Selesai untuk menghapus kartu dari layar setelah pesanan diantar.',
                en: 'Tap Selesai (Done) to clear the card from the screen after the order is served.',
              },
            ],
          },
          {
            type: 'note',
            text: {
              id: 'Pesanan baru hanya muncul di Dapur setelah dibayar. Sebaiknya buka layar ini di perangkat terpisah di area dapur.',
              en: 'New orders only appear in Dapur (Kitchen) after they are paid. It is best to open this screen on a separate device in the kitchen area.',
            },
          },
        ],
      },
      {
        heading: { id: 'Reservasi', en: 'Reservations' },
        blocks: [
          {
            type: 'p',
            text: {
              id: 'Reservasi adalah pemesanan tempat di muka oleh tamu untuk waktu tertentu. Halaman Reservasi membantu Anda mencatat siapa yang datang, jam berapa, jumlah tamu, dan meja yang disiapkan.',
              en: 'A reservation is a booking made in advance by a guest for a specific time. The Reservasi (Reservations) page helps you note who is coming, at what time, how many guests, and which table is set aside.',
            },
          },
          {
            type: 'steps',
            items: [
              {
                id: 'Buka halaman Reservasi (dari menu samping kantor belakang).',
                en: 'Open the Reservasi (Reservations) page (from the back-office side menu).',
              },
              {
                id: 'Ketuk Buat reservasi, lalu isi nama tamu, waktu, jumlah tamu, dan meja.',
                en: 'Tap Buat reservasi (Create reservation), then fill in the guest name, time, party size, and table.',
              },
              {
                id: 'Saat tamu tiba, ubah status menjadi Duduk; setelah selesai, tandai Selesai.',
                en: 'When the guest arrives, change the status to Duduk (Seated); after they finish, mark it Selesai (Completed).',
              },
              {
                id: 'Jika tamu tidak muncul, tandai Tidak datang, atau ketuk Batalkan untuk membatalkan.',
                en: 'If the guest does not show up, mark Tidak datang (No show), or tap Batalkan (Cancel) to cancel.',
              },
            ],
          },
        ],
      },
      {
        heading: { id: 'Pesanan QR pelanggan (Pesanan Masuk)', en: 'Customer QR orders (incoming orders)' },
        blocks: [
          {
            type: 'p',
            text: {
              id: 'Pesanan QR adalah pesanan yang dikirim tamu sendiri dengan memindai kode QR di meja. Pesanan ini masuk ke antrean Pesanan Masuk untuk Anda terima. Angka kecil (badge) di tombol Pesanan Masuk menunjukkan jumlah pesanan yang menunggu.',
              en: 'A QR order is one a guest sends themselves by scanning a QR code on the table. These land in the Pesanan Masuk (Incoming orders) queue for you to accept. The small number (badge) on the Pesanan Masuk button shows how many are waiting.',
            },
          },
          {
            type: 'steps',
            items: [
              {
                id: 'Ketuk Pesanan Masuk di bilah atas (lonceng notifikasi di kantor belakang juga memberi tahu Anda).',
                en: 'Tap Pesanan Masuk (Incoming orders) in the top bar (the notifications bell in the back office alerts you too).',
              },
              {
                id: 'Periksa item dan catatan tiap pesanan dalam daftar.',
                en: 'Review the items and notes of each order in the list.',
              },
              {
                id: 'Untuk pesanan yang sudah dibayar lewat QRIS, ketuk Terima (sudah dibayar) untuk memasukkannya langsung ke kasir.',
                en: 'For an order already paid by QRIS, tap Terima (sudah dibayar) (Accept, already paid) to bring it straight into the register.',
              },
              {
                id: 'Untuk pesanan yang belum dibayar, ketuk Terima agar item masuk ke keranjang lalu selesaikan pembayaran.',
                en: 'For an unpaid order, tap Terima (Accept) so the items load into the cart, then complete the payment.',
              },
              {
                id: 'Ketuk Tolak jika Anda tidak bisa memenuhi pesanan; pesanan akan dihapus dari antrean.',
                en: 'Tap Tolak (Reject) if you cannot fulfil the order; it is removed from the queue.',
              },
            ],
          },
          {
            type: 'note',
            text: {
              id: 'Pesanan dengan label Lunas (QRIS) sudah dibayar tamu, jadi Anda tinggal menerimanya tanpa menagih ulang.',
              en: 'An order marked Lunas (QRIS) (Paid via QRIS) is already paid by the guest, so you only need to accept it without charging again.',
            },
          },
        ],
      },
    ],
  },

  // ───────────────────────────────────────────────────────────────────────────
  // 2. Staff & Shifts
  // ───────────────────────────────────────────────────────────────────────────
  {
    slug: 'staff-shifts',
    icon: 'staff',
    title: { id: 'Staf & Shift', en: 'Staff & shifts' },
    summary: {
      id: 'Tambahkan staf, atur peran dan izin, buat PIN, ganti atau kunci kasir, buka dan tutup shift dengan hitung kas, catat kas masuk/keluar, jam kerja, dan jadwal.',
      en: 'Add staff, set roles and permissions, create PINs, switch or lock the register, open and close shifts with a cash count, log cash in/out, the time clock, and scheduling.',
    },
    sections: [
      {
        heading: { id: 'Staf, peran, dan PIN', en: 'Staff, roles, and PINs' },
        blocks: [
          {
            type: 'p',
            text: {
              id: 'Staf adalah orang yang bekerja di kafe Anda. Setiap staf punya peran yang menentukan apa yang boleh mereka lakukan. Anda mengelola staf di halaman Staf.',
              en: 'Staff are the people who work at your cafe. Each staff member has a role that decides what they are allowed to do. You manage staff on the Staf (Staff) page.',
            },
          },
          {
            type: 'ul',
            items: [
              {
                id: 'Pemilik (owner): memiliki semua izin, termasuk pengaturan dan laporan.',
                en: 'Pemilik (owner): has every permission, including settings and reports.',
              },
              {
                id: 'Kasir (cashier): menjual di kasir; izin tambahan bisa Anda atur per orang.',
                en: 'Kasir (cashier): sells at the register; extra permissions can be set per person.',
              },
            ],
          },
          {
            type: 'p',
            text: {
              id: 'PIN adalah 4 angka yang dipakai staf untuk masuk sebagai kasir di layar PIN. Buka pengaturan staf dari menu profil (inisial Anda, pojok kanan atas), pilih Kelola staf, atau lewat Pengaturan > Staf.',
              en: 'A PIN is the 4 digits a staff member uses to sign in as cashier on the PIN screen. Open staff settings from the profile menu (your initial, top right) and choose Kelola staf (Manage staff), or go to Pengaturan (Settings) > Staf (Staff).',
            },
          },
          {
            type: 'steps',
            items: [
              {
                id: 'Buka menu profil (inisial Anda, pojok kanan atas) lalu pilih Kelola staf.',
                en: 'Open the profile menu (your initial, top right) and choose Kelola staf (Manage staff).',
              },
              {
                id: 'Isi Nama kasir baru dan PIN 4 digit, lalu tambahkan staf.',
                en: 'Fill in Nama kasir baru (New cashier name) and the PIN 4 digit (4-digit PIN), then add the staff member.',
              },
              {
                id: 'Ketuk seorang staf untuk mengisi kontak, mengatur Izin akses, atau menetapkan Tarif per jam.',
                en: 'Tap a staff member to fill in contact details, set Izin akses (Permissions), or set a Tarif per jam (hourly rate).',
              },
              {
                id: 'Untuk mengubah PIN seseorang, ketuk Ganti PIN dan masukkan 4 angka baru.',
                en: 'To change someone PIN, tap Ganti PIN (Change PIN) and enter 4 new digits.',
              },
            ],
          },
          {
            type: 'note',
            text: {
              id: 'Jika staf berhenti bekerja, ketuk Arsipkan agar mereka tidak bisa masuk lagi, tanpa menghapus riwayatnya.',
              en: 'If a staff member stops working, tap Arsipkan (Archive) so they can no longer sign in, without deleting their history.',
            },
          },
        ],
      },
      {
        heading: { id: 'Ganti dan kunci kasir', en: 'Switch and lock the register' },
        blocks: [
          {
            type: 'p',
            text: {
              id: 'Mengganti kasir berarti pindah ke staf lain tanpa menutup aplikasi: aplikasi kembali ke layar PIN agar staf berikutnya bisa masuk dengan PIN mereka sendiri.',
              en: 'Switching the cashier means handing over to another staff member without closing the app: the app returns to the PIN screen so the next person can sign in with their own PIN.',
            },
          },
          {
            type: 'steps',
            items: [
              {
                id: 'Dari menu profil (inisial Anda, pojok kanan atas), pilih Ganti kasir untuk menuju layar PIN.',
                en: 'From the profile menu (your initial, top right), choose Ganti kasir (Switch cashier) to go to the PIN screen.',
              },
              {
                id: 'Staf berikutnya memasukkan PIN 4 angka mereka untuk masuk.',
                en: 'The next staff member enters their 4-digit PIN to sign in.',
              },
            ],
          },
          {
            type: 'note',
            text: {
              id: 'Kunci otomatis (kembali ke layar PIN setelah kasir tidak aktif beberapa saat) mati secara bawaan. Aktifkan di Pengaturan > Umum bila kasir sering ditinggal.',
              en: 'Auto-lock (returning to the PIN screen after the register sits idle for a while) is off by default. Turn it on in Pengaturan (Settings) > Umum (General) if the register is often left unattended.',
            },
          },
        ],
      },
      {
        heading: { id: 'Buka dan tutup shift', en: 'Open and close a shift' },
        blocks: [
          {
            type: 'p',
            text: {
              id: 'Shift adalah satu sesi kerja, dari buka sampai tutup, yang merekam semua penjualan dan pergerakan kas selama itu. Buka shift di awal hari dan tutup di akhir untuk mencocokkan uang di laci.',
              en: 'A shift is one work session, from open to close, that records all sales and cash movements during it. Open a shift at the start of the day and close it at the end to reconcile the money in the drawer.',
            },
          },
          {
            type: 'steps',
            items: [
              {
                id: 'Untuk membuka, ketuk Shift di bilah atas, masukkan Modal awal (Rp) (uang tunai di laci saat buka), lalu ketuk Buka Shift.',
                en: 'To open, tap Shift in the top bar, enter Modal awal (Rp) (the starting cash in the drawer), then tap Buka Shift (Open shift).',
              },
              {
                id: 'Jualan seperti biasa sepanjang shift.',
                en: 'Sell as usual throughout the shift.',
              },
              {
                id: 'Untuk menutup, ketuk Shift lalu Tutup Shift, hitung uang fisik di laci, dan isi Uang terhitung (Rp).',
                en: 'To close, tap Shift then Tutup Shift (Close shift), count the physical cash in the drawer, and fill in Uang terhitung (Rp) (Counted cash).',
              },
              {
                id: 'Periksa baris Selisih: aplikasi menampilkan (Lebih) jika uang berlebih atau (Kurang) jika kurang dari seharusnya.',
                en: 'Check the Selisih (Variance) line: the app shows (Lebih) (Over) if there is extra cash or (Kurang) (Short) if it is less than expected.',
              },
              {
                id: 'Ketuk Tutup Shift untuk menyimpan; Anda bisa Cetak ringkasan jika perlu.',
                en: 'Tap Tutup Shift (Close shift) to save; you can Cetak ringkasan (Print summary) if needed.',
              },
            ],
          },
          {
            type: 'note',
            text: {
              id: 'Anda harus membuka shift sebelum menerima penjualan. Selisih besar antara uang terhitung dan yang seharusnya bisa menandakan kekeliruan kembalian atau kas yang hilang.',
              en: 'You must open a shift before taking sales. A large gap between counted cash and expected cash can signal a change error or missing money.',
            },
          },
        ],
      },
      {
        heading: { id: 'Kas masuk dan kas keluar', en: 'Cash in and cash out' },
        blocks: [
          {
            type: 'p',
            text: {
              id: 'Kas masuk dan kas keluar adalah uang tunai yang masuk atau keluar dari laci di luar penjualan, misalnya menambah uang receh atau membayar belanja kecil. Mencatatnya menjaga hitungan kas tetap cocok saat tutup shift.',
              en: 'Cash in and cash out are amounts of cash that enter or leave the drawer outside of sales, for example adding small change or paying for a small purchase. Recording them keeps the cash count accurate at shift close.',
            },
          },
          {
            type: 'steps',
            items: [
              {
                id: 'Di layar kasir, ketuk tombol Kas di area keranjang.',
                en: 'On the selling screen, tap the Kas (Cash) button in the cart area.',
              },
              {
                id: 'Pilih Kas masuk atau Kas keluar, masukkan jumlah dan catatan singkat, lalu simpan.',
                en: 'Choose Kas masuk (Cash in) or Kas keluar (Cash out), enter the amount and a short note, then save.',
              },
            ],
          },
          {
            type: 'note',
            text: {
              id: 'Total Kas masuk dan Kas keluar ikut diperhitungkan saat menutup shift, sehingga selisihnya akurat.',
              en: 'The totals for Kas masuk (Cash in) and Kas keluar (Cash out) are included when you close the shift, so the variance stays accurate.',
            },
          },
        ],
      },
      {
        heading: { id: 'Jam kerja dan jadwal', en: 'Time clock and scheduling' },
        blocks: [
          {
            type: 'p',
            text: {
              id: 'Jam kerja (absensi) mencatat kapan staf masuk dan keluar, lalu menjumlahkan jam mereka. Jadwal membantu Anda merencanakan siapa bekerja kapan dalam seminggu.',
              en: 'The time clock (attendance) records when staff clock in and out, then totals their hours. Scheduling helps you plan who works when across the week.',
            },
          },
          {
            type: 'steps',
            items: [
              {
                id: 'Buka halaman Jam Kerja dari menu samping kantor belakang.',
                en: 'Open the Jam Kerja (Time clock) page from the back-office side menu.',
              },
              {
                id: 'Ketuk Clock in saat staf mulai bekerja dan Clock out saat selesai.',
                en: 'Tap Clock in when a staff member starts and Clock out when they finish.',
              },
              {
                id: 'Pilih rentang (Hari ini atau 7 hari) untuk melihat total jam, dan ekspor ke CSV bila perlu.',
                en: 'Choose a range (Hari ini / Today or 7 hari / 7 days) to see total hours, and export to CSV if needed.',
              },
              {
                id: 'Untuk merencanakan jam kerja, buka Jadwal lalu ketuk Tambah jadwal untuk tiap staf dan hari.',
                en: 'To plan shifts, open Jadwal (Schedule) then tap Tambah jadwal (Add schedule) for each staff member and day.',
              },
            ],
          },
        ],
      },
    ],
  },

  // ───────────────────────────────────────────────────────────────────────────
  // 3. Reports
  // ───────────────────────────────────────────────────────────────────────────
  {
    slug: 'reports',
    icon: 'reports',
    title: { id: 'Laporan', en: 'Reports' },
    summary: {
      id: 'Lihat dasbor, pilih jenis laporan (penjualan, pembayaran, produk, margin, laba/rugi, pengeluaran, pendapatan lain, kasir), atur rentang tanggal, dan unduh ke CSV atau PDF.',
      en: 'View the dashboard, choose a report type (sales, payments, products, margin, profit and loss, expenses, other income, cashier), set a date range, and export to CSV or PDF.',
    },
    sections: [
      {
        heading: { id: 'Dasbor', en: 'Dashboard' },
        blocks: [
          {
            type: 'p',
            text: {
              id: 'Dasbor adalah ringkasan sekilas tentang keadaan kafe Anda: penjualan terbaru, aktivitas, dan angka penting. Gunakan untuk memeriksa keadaan dengan cepat tanpa membuka tiap laporan.',
              en: 'The dashboard is an at-a-glance overview of how your cafe is doing: recent sales, activity, and key numbers. Use it to check the state of things quickly without opening each report.',
            },
          },
          {
            type: 'steps',
            items: [
              {
                id: 'Buka Dasbor dari menu samping kantor belakang.',
                en: 'Open Dasbor (Dashboard) from the back-office side menu.',
              },
              {
                id: 'Lihat angka ringkasan dan daftar aktivitas terbaru, seperti pembayaran diterima dan shift dibuka.',
                en: 'Review the summary numbers and the recent activity list, such as payments received and shifts opened.',
              },
            ],
          },
        ],
      },
      {
        heading: { id: 'Jenis laporan', en: 'Report types' },
        blocks: [
          {
            type: 'p',
            text: {
              id: 'Buka Laporan dari menu samping, lalu pilih jenis laporan dari tab di bagian atas. Setiap laporan menjawab pertanyaan yang berbeda.',
              en: 'Open Laporan (Reports) from the side menu, then pick a report type from the tabs at the top. Each report answers a different question.',
            },
          },
          {
            type: 'ul',
            items: [
              {
                id: 'Penjualan: berapa banyak yang Anda jual dari waktu ke waktu.',
                en: 'Penjualan (Sales): how much you sold over time.',
              },
              {
                id: 'Pembayaran: jumlah per metode bayar (tunai, QRIS, dan lainnya).',
                en: 'Pembayaran (Payments): totals by payment method (cash, QRIS, and others).',
              },
              {
                id: 'Produk: item mana yang paling laku.',
                en: 'Produk (Products): which items sell the most.',
              },
              {
                id: 'Margin: selisih antara harga jual dan biaya bahan.',
                en: 'Margin: the gap between selling price and ingredient cost.',
              },
              {
                id: 'Laba/Rugi: pendapatan dikurangi biaya untuk melihat untung bersih.',
                en: 'Laba/Rugi (Profit and loss): income minus costs to see net profit.',
              },
              {
                id: 'Pengeluaran: uang yang Anda belanjakan untuk operasional kafe.',
                en: 'Pengeluaran (Expenses): money you spent running the cafe.',
              },
              {
                id: 'Pendapatan Lain: pemasukan di luar penjualan biasa.',
                en: 'Pendapatan Lain (Other income): money in from outside normal sales.',
              },
              {
                id: 'Kasir: kinerja dan total per kasir.',
                en: 'Kasir (Cashier): performance and totals per cashier.',
              },
            ],
          },
          {
            type: 'note',
            text: {
              id: 'Hanya pemilik dan staf dengan izin melihat laporan yang bisa membuka halaman ini.',
              en: 'Only the owner and staff with the reports permission can open this page.',
            },
          },
        ],
      },
      {
        heading: { id: 'Pilih rentang tanggal', en: 'Choose a date range' },
        blocks: [
          {
            type: 'p',
            text: {
              id: 'Rentang tanggal menentukan periode waktu yang dihitung oleh laporan. Setiap laporan punya pemilih rentang di bagian atas.',
              en: 'The date range sets which period the report covers. Each report has a range picker at the top.',
            },
          },
          {
            type: 'steps',
            items: [
              {
                id: 'Di atas laporan, pilih pilihan cepat: Hari ini, Kemarin, 7 hari, atau 30 hari.',
                en: 'At the top of the report, pick a quick option: Hari ini (Today), Kemarin (Yesterday), 7 hari (7 days), or 30 hari (30 days).',
              },
              {
                id: 'Untuk periode khusus, ketuk Pilih tanggal lalu tentukan tanggal mulai dan akhir di kalender.',
                en: 'For a custom period, tap Pilih tanggal (Pick date) and set the start and end dates in the calendar.',
              },
            ],
          },
        ],
      },
      {
        heading: { id: 'Unduh ke CSV dan PDF', en: 'Export to CSV and PDF' },
        blocks: [
          {
            type: 'p',
            text: {
              id: 'CSV adalah berkas tabel yang bisa dibuka di Excel atau Google Sheets, cocok untuk diolah lebih lanjut. PDF adalah berkas siap cetak yang rapi untuk dibagikan atau diarsipkan. Halaman Ekspor Akuntansi menyediakan keduanya untuk buku besar.',
              en: 'CSV is a table file you can open in Excel or Google Sheets, good for further work. PDF is a tidy, ready-to-print file for sharing or filing. The Ekspor Akuntansi (Accounting export) page provides both for the ledger.',
            },
          },
          {
            type: 'steps',
            items: [
              {
                id: 'Buka Laporan lalu pilih tab Ekspor Akuntansi.',
                en: 'Open Laporan (Reports) and choose the Ekspor Akuntansi (Accounting export) tab.',
              },
              {
                id: 'Atur rentang tanggal di bagian atas.',
                en: 'Set the date range at the top.',
              },
              {
                id: 'Ketuk Unduh Buku Besar (CSV) untuk berkas tabel, atau Unduh PDF untuk berkas siap cetak.',
                en: 'Tap Unduh Buku Besar (CSV) (Download ledger as CSV) for the table file, or Unduh PDF (Download PDF) for the print-ready file.',
              },
            ],
          },
          {
            type: 'note',
            text: {
              id: 'Beberapa laporan lain (misalnya jam kerja) juga punya tombol unduh CSV-nya sendiri di halaman masing-masing.',
              en: 'Some other reports (for example the time clock) also have their own CSV download button on their page.',
            },
          },
        ],
      },
    ],
  },

  // ───────────────────────────────────────────────────────────────────────────
  // 4. Settings
  // ───────────────────────────────────────────────────────────────────────────
  {
    slug: 'settings',
    icon: 'settings',
    title: { id: 'Pengaturan', en: 'Settings' },
    summary: {
      id: 'Atur profil kafe, pajak dan metode pembayaran (termasuk unggah gambar QRIS), struk dan printer, pengaturan Umum, ringkasan email, dan integrasi.',
      en: 'Set up the cafe profile, tax and payment methods (including uploading the QRIS image), receipt and printer, the General settings, email summaries, and integrations.',
    },
    sections: [
      {
        heading: { id: 'Membuka Pengaturan', en: 'Opening Settings' },
        blocks: [
          {
            type: 'p',
            text: {
              id: 'Pengaturan adalah tempat Anda mengatur cara kafe bekerja: identitas, pajak, cara bayar, tampilan struk, dan lainnya. Hanya pemilik yang bisa membuka semua pengaturan.',
              en: 'Settings is where you control how your cafe works: identity, tax, payment methods, receipt look, and more. Only the owner can open all settings.',
            },
          },
          {
            type: 'steps',
            items: [
              {
                id: 'Buka menu profil (inisial Anda, pojok kanan atas) lalu pilih Pengaturan.',
                en: 'Open the profile menu (your initial, top right) and choose Pengaturan (Settings).',
              },
              {
                id: 'Pilih sub-halaman dari menu samping: Profil, Pajak & Pembayaran, Struk & Printer, Staf, Umum, atau Integrasi.',
                en: 'Pick a sub-page from the side menu: Profil (Profile), Pajak & Pembayaran (Tax & payment), Struk & Printer (Receipt & printer), Staf (Staff), Umum (General), or Integrasi (Integrations).',
              },
            ],
          },
        ],
      },
      {
        heading: { id: 'Profil kafe', en: 'Cafe profile' },
        blocks: [
          {
            type: 'p',
            text: {
              id: 'Profil kafe adalah identitas usaha Anda: nama, jenis usaha, dan logo. Nama dan logo tampil di struk dan halaman kafe.',
              en: 'The cafe profile is your business identity: name, business type, and logo. The name and logo appear on the receipt and the cafe page.',
            },
          },
          {
            type: 'steps',
            items: [
              {
                id: 'Buka Pengaturan > Profil.',
                en: 'Open Pengaturan (Settings) > Profil (Profile).',
              },
              {
                id: 'Isi Nama kafe dan pilih Jenis usaha (Kafe, Restoran, dan lainnya).',
                en: 'Fill in Nama kafe (Cafe name) and pick the Jenis usaha (Business type) such as Kafe (Cafe) or Restoran (Restaurant).',
              },
              {
                id: 'Pada Logo, unggah gambar usaha Anda; logo akan tampil di struk.',
                en: 'Under Logo, upload your business image; the logo will show on the receipt.',
              },
            ],
          },
        ],
      },
      {
        heading: { id: 'Pajak dan metode pembayaran', en: 'Tax and payment methods' },
        blocks: [
          {
            type: 'p',
            text: {
              id: 'Di Pajak & Pembayaran Anda mengatur pajak, biaya layanan, dan cara pelanggan membayar. QRIS statis adalah satu gambar kode QR tetap yang dipindai pelanggan untuk membayar; Anda menggunggah gambarnya di sini.',
              en: 'In Pajak & Pembayaran (Tax & payment) you set up tax, service charge, and how customers pay. Static QRIS is a single fixed QR code image that customers scan to pay; you upload that image here.',
            },
          },
          {
            type: 'steps',
            items: [
              {
                id: 'Buka Pengaturan > Pajak & Pembayaran.',
                en: 'Open Pengaturan (Settings) > Pajak & Pembayaran (Tax & payment).',
              },
              {
                id: 'Untuk pajak, nyalakan Aktifkan pajak lalu isi Nama pajak (mis. PB1) dan Persentase pajak.',
                en: 'For tax, turn on Aktifkan pajak (Enable tax) then fill in Nama pajak (Tax name), for example PB1, and Persentase pajak (Tax percentage).',
              },
              {
                id: 'Di bagian Metode pembayaran, nyalakan atau matikan tiap metode (Tunai, QRIS statis, QRIS dinamis).',
                en: 'Under Metode pembayaran (Payment methods), switch each method on or off (Tunai / Cash, QRIS statis / Static QRIS, QRIS dinamis / Dynamic QRIS).',
              },
              {
                id: 'Untuk QRIS statis, unggah gambar QRIS Anda agar pelanggan bisa memindainya saat membayar.',
                en: 'For static QRIS, upload your QRIS image so customers can scan it when paying.',
              },
              {
                id: 'Pilih Metode default agar terpilih otomatis di kasir.',
                en: 'Pick a Metode default (Default method) so it is selected automatically at the register.',
              },
            ],
          },
          {
            type: 'note',
            text: {
              id: 'QRIS dinamis (kode QR yang menampilkan jumlah otomatis) memerlukan penyedia yang dihubungkan di halaman Integrasi. Metode yang ditandai segera hadir belum bisa dipakai.',
              en: 'Dynamic QRIS (a QR code that shows the amount automatically) needs a provider connected on the Integrasi (Integrations) page. Methods marked coming soon cannot be used yet.',
            },
          },
        ],
      },
      {
        heading: { id: 'Struk dan printer', en: 'Receipt and printer' },
        blocks: [
          {
            type: 'p',
            text: {
              id: 'Di Struk & Printer Anda mengatur isi struk dan cara mencetaknya: teks header dan footer, apa saja yang ditampilkan, ukuran kertas, dan apakah struk dicetak otomatis.',
              en: 'In Struk & Printer (Receipt & printer) you control what the receipt shows and how it prints: header and footer text, which details appear, paper size, and whether the receipt prints automatically.',
            },
          },
          {
            type: 'steps',
            items: [
              {
                id: 'Buka Pengaturan > Struk & Printer.',
                en: 'Open Pengaturan (Settings) > Struk & Printer (Receipt & printer).',
              },
              {
                id: 'Di Konten struk, atur Teks header dan Teks footer, dan pilih apa yang ditampilkan (logo, alamat, kasir, nomor order, rincian pajak).',
                en: 'Under Konten struk (Receipt content), set the Teks header (Header text) and Teks footer (Footer text), and choose what to show (logo, address, cashier, order number, tax breakdown).',
              },
              {
                id: 'Di Tampilan, pilih Ukuran kertas (58 mm atau 80 mm) dan Ukuran font.',
                en: 'Under Tampilan (Appearance), pick the Ukuran kertas (Paper size), 58 mm or 80 mm, and the Ukuran font (Font size).',
              },
              {
                id: 'Di Printer, nyalakan Cetak otomatis agar struk tercetak langsung setelah pembayaran.',
                en: 'Under Printer, turn on Cetak otomatis (Auto print) so the receipt prints right after payment.',
              },
            ],
          },
        ],
      },
      {
        heading: { id: 'Pengaturan Umum', en: 'General settings' },
        blocks: [
          {
            type: 'p',
            text: {
              id: 'Pengaturan Umum mengatur bagaimana aplikasi terlihat dan bekerja sehari-hari. Buka Pengaturan > Umum.',
              en: 'General settings control how the app looks and behaves day to day. Open Pengaturan (Settings) > Umum (General).',
            },
          },
          {
            type: 'ul',
            items: [
              {
                id: 'Bahasa: bahasa tampilan aplikasi (Indonesia atau Inggris).',
                en: 'Bahasa (Language): the app display language (Indonesian or English).',
              },
              {
                id: 'Tema: terang, gelap, atau ikuti sistem.',
                en: 'Tema (Theme): light, dark, or follow the system.',
              },
              {
                id: 'Kepadatan tampilan: seberapa rapat elemen di layar (Ringkas atau Nyaman).',
                en: 'Kepadatan tampilan (Display density): how tightly packed the screen is (Ringkas / Compact or Nyaman / Comfortable).',
              },
              {
                id: 'Format Tanggal dan Format Waktu: cara tanggal dan jam ditampilkan (24 jam atau 12 jam).',
                en: 'Format Tanggal (Date format) and Format Waktu (Time format): how dates and the clock are shown (24-hour or 12-hour).',
              },
              {
                id: 'Konfirmasi sebelum kosongkan keranjang: minta persetujuan sebelum keranjang dikosongkan.',
                en: 'Konfirmasi sebelum kosongkan keranjang (Confirm before clearing cart): ask for confirmation before the cart is emptied.',
              },
              {
                id: 'Suara saat transaksi berhasil: putar suara setelah pembayaran selesai.',
                en: 'Suara saat transaksi berhasil (Success sound): play a sound after a payment completes.',
              },
              {
                id: 'Peringatan stok rendah: tampilkan peringatan saat bahan mendekati batas.',
                en: 'Peringatan stok rendah (Low-stock alerts): warn when an ingredient nears its threshold.',
              },
              {
                id: 'Wajib PIN untuk void/refund: kasir harus memasukkan PIN pemilik untuk membatalkan transaksi.',
                en: 'Wajib PIN untuk void/refund (Require PIN for void/refund): the cashier must enter the owner PIN to cancel a transaction.',
              },
              {
                id: 'Kunci otomatis saat tidak aktif: kembali ke layar PIN setelah diam beberapa waktu (Mati, 5, 15, atau 30 menit).',
                en: 'Kunci otomatis saat tidak aktif (Idle auto-lock): return to the PIN screen after a period of inactivity (Off, 5, 15, or 30 minutes).',
              },
              {
                id: 'Awalan nomor pesanan: teks yang ditambahkan di depan setiap nomor pesanan.',
                en: 'Awalan nomor pesanan (Order-number prefix): text added in front of each order number.',
              },
            ],
          },
          {
            type: 'note',
            text: {
              id: 'Kunci otomatis Mati secara bawaan. Nyalakan di halaman Umum jika kasir Anda sering ditinggal tanpa pengawasan.',
              en: 'Idle auto-lock is Off by default. Turn it on in the Umum (General) page if your register is often left unattended.',
            },
          },
        ],
      },
      {
        heading: { id: 'Ringkasan email dan integrasi', en: 'Email summary and integrations' },
        blocks: [
          {
            type: 'p',
            text: {
              id: 'Ringkasan email mengirim rekap penjualan dan kas ke email saat shift ditutup. Integrasi menghubungkan kafe Anda ke layanan luar, seperti penyedia QRIS dinamis atau pesan-antar.',
              en: 'The email summary sends a recap of sales and cash to your email when a shift is closed. Integrations connect your cafe to outside services, such as a dynamic QRIS provider or delivery.',
            },
          },
          {
            type: 'steps',
            items: [
              {
                id: 'Untuk ringkasan email, buka Pengaturan > Umum dan nyalakan Kirim ringkasan saat tutup shift, lalu isi Email penerima ringkasan.',
                en: 'For the email summary, open Pengaturan (Settings) > Umum (General) and turn on Kirim ringkasan saat tutup shift (Send summary on shift close), then fill in Email penerima ringkasan (Summary recipient email).',
              },
              {
                id: 'Anda juga bisa menyalakan Email peringatan stok menipis harian, yang memakai email penerima yang sama.',
                en: 'You can also turn on Email peringatan stok menipis harian (Daily low-stock email alert), which uses the same recipient email.',
              },
              {
                id: 'Untuk menghubungkan layanan, buka Pengaturan > Integrasi, pilih layanan, lalu ketuk Hubungkan dan ikuti petunjuk (misalnya menempel kunci API).',
                en: 'To connect a service, open Pengaturan (Settings) > Integrasi (Integrations), pick a service, then tap Hubungkan (Connect) and follow the prompts (for example pasting an API key).',
              },
              {
                id: 'Untuk memutus, ketuk Putuskan pada layanan yang terhubung.',
                en: 'To disconnect, tap Putuskan (Disconnect) on a connected service.',
              },
            ],
          },
        ],
      },
    ],
  },
];
