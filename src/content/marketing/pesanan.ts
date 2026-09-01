import type { FeaturePageContent } from './types';

/**
 * Copy for /fitur/pesanan — tables, QR self-ordering, reservations, kitchen
 * display. Every factual claim below traces to a row in the "May be claimed"
 * table of docs/superpowers/specs/2026-08-23-marketing-feature-pages-design.md
 * (each row itself backed by a convex/ file:line citation). Nothing here
 * describes a feature from that spec's "Must NOT be claimed" list.
 */
export const PESANAN: FeaturePageContent = {
  slug: 'pesanan',
  seoTitle: {
    id: 'Pesanan: meja, QR, dan dapur',
    en: 'Orders: tables, QR, and kitchen',
  },
  seoDescription: {
    id: 'Meja, pemesanan mandiri lewat QR, reservasi, dan papan dapur real-time — semua tersambung, tanpa nota kertas yang tercecer.',
    en: 'Tables, QR self-ordering, reservations, and a real-time kitchen board — all connected, with no paper tickets to lose.',
  },
  navLabel: { id: 'Pesanan', en: 'Orders' },
  sections: [
    {
      kind: 'hero',
      eyebrow: { id: 'Meja · QR · Dapur', en: 'Tables · QR · Kitchen' },
      title: {
        id: 'Dari meja ke dapur, tanpa kertas.',
        en: 'From the table to the kitchen, no paper.',
      },
      lede: {
        id: 'Tamu memesan dari meja atau lewat kode QR, staf menerimanya di kasir, dan tiketnya langsung sampai ke dapur — semua real-time, tanpa nota yang tercecer atau salah baca.',
        en: 'Guests order from the table or a QR code, staff accept it at the register, and the ticket lands in the kitchen instantly — all in real time, with no paper slip to lose or misread.',
      },
      shot: 'tables',
      shotAlt: {
        id: 'Grid meja kodapos menampilkan meja yang sedang terisi lengkap dengan total pesanan berjalan dan jumlah item pada setiap kartu.',
        en: 'kodapos table grid showing occupied tables, each card displaying a running order total and item count.',
      },
    },
    {
      kind: 'flow',
      heading: {
        id: 'Bagaimana satu pesanan berjalan',
        en: 'How one order flows',
      },
      steps: [
        {
          title: { id: 'Tamu pindai QR di meja', en: 'Guest scans the table QR' },
          body: {
            id: 'Setiap meja punya kode QR sendiri, dicetak sekali dan terus berfungsi — tidak perlu dicetak ulang setiap hari.',
            en: 'Every table has its own QR code, printed once and it keeps working — no need to reprint it every day.',
          },
        },
        {
          title: { id: 'Pilih menu di ponsel', en: 'Pick items on the phone' },
          body: {
            id: 'Tamu memilih item, varian, dan modifier langsung dari menu yang tampil di ponselnya, sama seperti yang dilihat kasir.',
            en: 'The guest picks items, variants, and modifiers straight from the menu on their phone — the same menu staff see at the register.',
          },
        },
        {
          title: { id: 'Bayar sekarang atau nanti', en: 'Pay now or pay later' },
          body: {
            id: 'Tamu bisa bayar langsung lewat QRIS di ponselnya, atau memilih bayar di kasir setelah makan.',
            en: 'The guest can pay right away with QRIS on their phone, or choose to pay at the register after eating.',
          },
        },
        {
          title: { id: 'Staf menekan Terima', en: 'Staff tap Accept' },
          body: {
            id: 'Sudah dibayar maupun belum, setiap pesanan menunggu staf menekan Terima sebelum masuk ke dapur — tidak ada pesanan yang lolos tanpa dilihat staf.',
            en: 'Paid or not, every order waits for staff to tap Accept before it reaches the kitchen — no order slips through unseen.',
          },
        },
        {
          title: { id: 'Tiket sampai ke dapur', en: 'The ticket reaches the kitchen' },
          body: {
            id: 'Begitu diterima, tiketnya langsung muncul di papan dapur secara real-time.',
            en: 'The moment it is accepted, the ticket appears on the kitchen board in real time.',
          },
        },
      ],
    },
    {
      kind: 'capability',
      id: 'self-order',
      heading: {
        id: 'Pemesanan mandiri lewat QR',
        en: 'QR self-ordering',
      },
      body: {
        id: 'Tamu memesan dari menu yang sama seperti di kasir, tapi setiap harga dihitung ulang oleh server — bukan dari angka yang dikirim ponsel tamu.',
        en: "Guests order from the same menu staff use at the register, but every price is recomputed by the server — never trusted from whatever the guest's phone sends.",
      },
      bullets: [
        {
          id: 'Server menghitung ulang setiap harga; ponsel tamu tidak pernah mengirim angka yang dipakai langsung.',
          en: "The server recomputes every price; the guest's phone never sends an amount that gets used directly.",
        },
        {
          id: 'Kalau koneksi lambat membuat tamu mengirim pesanan yang sama dua kali, sistem mengenalinya dan tidak mencatatnya ganda.',
          en: 'If a slow connection makes the guest submit the same order twice, the system recognizes it and never records it twice.',
        },
        {
          id: 'Item yang sedang habis ditandai "Habis" dan tidak bisa dipesan.',
          en: 'An item that is sold out is marked "Habis" (Sold out) and cannot be ordered.',
        },
        {
          id: 'Antrean pesanan menunggu dibatasi maksimal 8 sekaligus per kafe, supaya tidak membanjiri kasir.',
          en: 'The queue of waiting orders is capped at 8 at a time per cafe, so it never overwhelms the register.',
        },
      ],
      shot: 'order-public',
      shotAlt: {
        id: 'Halaman pemesanan QR yang dilihat tamu, menampilkan menu kafe yang bisa dipesan lengkap dengan harga.',
        en: "The guest-facing QR ordering page, showing the cafe's orderable menu with prices.",
      },
      side: 'right',
    },
    {
      kind: 'capability',
      id: 'queue',
      heading: {
        id: 'Antrean pesanan masuk',
        en: 'Incoming order queue',
      },
      body: {
        id: 'Setiap pesanan QR muncul langsung di layar kasir, lengkap dengan badge jumlah yang selalu real-time.',
        en: 'Every QR order shows up on the register screen immediately, with a live count badge that is always up to date.',
      },
      bullets: [
        {
          id: 'Antrean di kasir dan papan dapur sama-sama query real-time — begitu tamu memesan, staf langsung melihatnya tanpa refresh.',
          en: 'The register queue and the kitchen board are both real-time queries — the moment a guest orders, staff see it with no refresh.',
        },
        {
          id: 'Pesanan yang sudah dibayar lewat QRIS tidak bisa ditolak begitu saja; harus diterima, atau ditangani manual di luar sistem.',
          en: 'An order already paid through QRIS cannot simply be rejected — it has to be accepted, or handled manually outside the system.',
        },
        {
          id: 'Saat staf menerima pesanan yang sudah dibayar, totalnya dihitung ulang; kalau harganya berubah sejak pembayaran, sistem menolak dan meminta penanganan manual, bukan diam-diam membiarkan selisihnya.',
          en: 'When staff accept an order already paid, the total is recomputed; if the price drifted since payment, the system refuses and flags it for manual handling instead of silently letting the difference slide.',
        },
      ],
      shot: 'self-orders',
      shotAlt: {
        id: 'Antrean pesanan QR yang menunggu di kasir, salah satunya sudah lunas lewat QRIS.',
        en: 'The queue of pending QR orders at the register, including one already paid via QRIS.',
      },
      side: 'left',
    },
    {
      kind: 'capability',
      id: 'kitchen',
      heading: {
        id: 'Papan dapur real-time',
        en: 'Real-time kitchen board',
      },
      body: {
        id: 'Tiket masuk begitu staf menekan Terima, urut dari yang paling lama menunggu, lengkap dengan varian dan modifier di setiap baris.',
        en: 'A ticket lands the moment staff tap Accept, ordered by whichever has waited longest, with each line showing its variants and modifiers.',
      },
      bullets: [
        {
          id: 'Papan dapur adalah query real-time — tiket baru langsung tampil tanpa perlu refresh layar.',
          en: 'The kitchen board is a real-time query — a new ticket appears instantly, no screen refresh needed.',
        },
        {
          id: 'Tiket berjalan lebih dulu masuk, lebih dulu tampil dalam status yang sama, jadi dapur tahu urutan mana yang harus dikerjakan lebih dulu.',
          en: 'Tickets are first-in, first-out within the same status, so the kitchen always knows which one to work on next.',
        },
        {
          id: 'Setiap baris pesanan menampilkan varian dan modifier yang dipilih tamu, jadi dapur tahu persis apa yang harus dibuat.',
          en: 'Every order line shows the variant and modifiers the guest chose, so the kitchen knows exactly what to make.',
        },
        {
          id: 'Tiket berpindah dari Siap ke Selesai dengan sekali sentuh.',
          en: 'A ticket moves from Ready to Done with a single tap.',
        },
      ],
      shot: 'kitchen',
      shotAlt: {
        id: 'Papan tiket dapur menampilkan tiket baru dan tiket yang sudah siap, masing-masing dengan varian dan modifiernya.',
        en: 'The kitchen ticket board showing new and ready tickets, each with its variants and modifiers.',
      },
      side: 'right',
    },
    {
      kind: 'capability',
      id: 'tables-reservations',
      heading: {
        id: 'Meja dan reservasi dalam satu layar',
        en: 'Tables and reservations, one screen',
      },
      body: {
        id: 'Kartu meja langsung menunjukkan mana yang terisi, berapa totalnya, dan berapa item yang dipesan — tanpa harus membuka pesanan satu per satu.',
        en: 'Table cards show at a glance which ones are occupied, their running total, and how many items are on order — no need to open each order to check.',
      },
      bullets: [
        {
          id: 'Setiap kartu meja menampilkan status terisi, total berjalan, dan jumlah item secara langsung.',
          en: 'Every table card shows occupied status, a running total, and an item count directly on the card.',
        },
        {
          id: 'Satu meja hanya bisa punya satu tab terbuka — sistem menolak membuka tab kedua selagi tab pertama masih aktif.',
          en: 'A table can only have one open tab at a time — the system refuses to open a second while the first is still active.',
        },
        {
          id: 'Meja dengan reservasi hari ini langsung ditandai di kartunya, jadi staf tahu meja mana yang harus disiapkan.',
          en: 'A table with a reservation today is flagged right on its card, so staff know which one to hold ready.',
        },
        {
          id: 'QR tiap meja dicetak sekali dan terus berfungsi selamanya.',
          en: "Each table's QR is printed once and keeps working indefinitely.",
        },
      ],
      shot: 'reservations',
      shotAlt: {
        id: 'Daftar reservasi hari ini lengkap dengan status masing-masing tamu dan meja yang dituju.',
        en: "Today's reservation list, showing each guest's status and the table they are booked at.",
      },
      side: 'left',
    },
    {
      kind: 'truth',
      heading: {
        id: 'Yang belum bisa dilakukan',
        en: 'What it does not do yet',
      },
      lede: {
        id: 'Supaya Anda tahu persis batasnya sebelum mendaftar, bukan menemukannya sendiri di minggu kedua.',
        en: 'So you know exactly where the edges are before you sign up, not by discovering them yourself in week two.',
      },
      does: [
        {
          id: 'Menghitung ulang setiap harga di server, jadi tamu tidak bisa mengutak-atik total pesanannya sendiri.',
          en: 'Recomputes every price on the server, so a guest cannot tamper with their own order total.',
        },
        {
          id: 'Menahan setiap pesanan QR di antrean sampai staf menekan Terima, sudah dibayar maupun belum.',
          en: 'Holds every QR order in the queue until staff tap Accept, whether it is paid or not.',
        },
        {
          id: 'Menjaga satu meja hanya punya satu tab terbuka pada satu waktu.',
          en: 'Keeps a table to exactly one open tab at a time.',
        },
      ],
      doesNot: [
        {
          id: 'Belum ada denah meja visual — meja adalah daftar bernama, tanpa kapasitas kursi.',
          en: 'No visual floor plan yet — tables are a named list, with no seat capacity.',
        },
        {
          id: 'Belum bisa menggabung, memisah, atau memindahkan pesanan antar meja.',
          en: 'You cannot yet merge, split, or move an order between tables.',
        },
        {
          id: 'Reservasi tidak mengirim pengingat otomatis ke tamu.',
          en: 'Reservations do not send automatic reminders to guests.',
        },
        {
          id: 'Reservasi tidak memblokir jadwal bentrok pada meja yang sama.',
          en: 'Reservations do not block a double booking on the same table.',
        },
        {
          id: 'Dapur belum punya status "sedang dibuat" atau pemisahan per stasiun.',
          en: 'The kitchen has no "in progress" state and no per-station routing.',
        },
        {
          id: 'Pelanggan melihat status diterima atau ditolak, bukan pantauan langsung dari dapur.',
          en: 'Customers see accepted or rejected, not live kitchen progress.',
        },
      ],
    },
    {
      kind: 'faq',
      heading: {
        id: 'Pertanyaan seputar pesanan',
        en: 'Questions about orders',
      },
      items: [
        {
          q: {
            id: 'Apakah pesanan QR bisa langsung sampai ke dapur tanpa sepengetahuan staf?',
            en: 'Can a QR order reach the kitchen without staff knowing?',
          },
          a: {
            id: 'Tidak. Setiap pesanan QR — termasuk yang sudah dibayar — harus diterima staf lewat tombol Terima sebelum masuk ke dapur.',
            en: 'No. Every QR order — including one already paid — must be accepted by staff via the Accept button before it reaches the kitchen.',
          },
        },
        {
          q: {
            id: 'Bagaimana kalau tamu tidak sengaja mengirim pesanan yang sama dua kali?',
            en: 'What if a guest accidentally submits the same order twice?',
          },
          a: {
            id: 'Percobaan kirim yang sama dikenali sistem dan tidak akan tercatat sebagai dua pesanan terpisah.',
            en: 'A repeated submission attempt is recognized by the system and is never recorded as two separate orders.',
          },
        },
        {
          q: {
            id: 'Kalau tamu sudah bayar QRIS tapi harga menu berubah sebelum staf menerima, apa yang terjadi?',
            en: 'If a guest already paid via QRIS but a menu price changes before staff accept, what happens?',
          },
          a: {
            id: 'Sistem menghitung ulang totalnya saat diterima. Kalau ada selisih dari yang sudah dibayar, penerimaan ditolak dan harus ditangani manual — bukan dibiarkan lewat begitu saja.',
            en: 'The system recomputes the total at the moment of acceptance. If it drifts from what was already paid, acceptance is refused and must be handled manually — it is never let through silently.',
          },
        },
        {
          q: {
            id: 'Apakah ada denah meja yang bisa diatur secara visual?',
            en: 'Is there a visual, drag-and-drop floor plan for tables?',
          },
          a: {
            id: 'Belum. Meja saat ini adalah daftar bernama, tanpa kapasitas kursi atau tata letak visual.',
            en: 'Not yet. Tables today are a named list, with no seat capacity or visual layout.',
          },
        },
        {
          q: {
            id: 'Apakah reservasi mengirim pengingat otomatis ke tamu?',
            en: 'Do reservations send automatic reminders to guests?',
          },
          a: {
            id: 'Belum. Reservasi tersimpan dan bisa ditandai statusnya, tapi sistem tidak mengirim pengingat otomatis.',
            en: 'Not yet. Reservations are stored and their status can be tracked, but the system does not send automatic reminders.',
          },
        },
      ],
    },
    {
      kind: 'cta',
      heading: {
        id: 'Coba jalankan pesanan meja dan QR Anda sendiri',
        en: 'See your own tables and QR orders run',
      },
      body: {
        id: 'Daftar dan lihat langsung bagaimana pesanan mengalir dari meja ke dapur, real-time, tanpa nota kertas.',
        en: 'Sign up and watch orders flow from the table to the kitchen, in real time, with no paper tickets.',
      },
    },
  ],
};
