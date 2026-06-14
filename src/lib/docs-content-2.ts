import type { DocTopic } from './docs-content';

export const DOCS_PART_2: DocTopic[] = [
  // 1. Menu & recipes
  {
    slug: 'menu-recipes',
    icon: 'menu',
    title: { id: 'Menu & Resep', en: 'Menu & recipes' },
    summary: {
      id: 'Atur kategori, item, varian, modifier, harga, gambar, barcode, dan resep.',
      en: 'Set up categories, items, variants, modifiers, prices, images, barcodes, and recipes.',
    },
    sections: [
      {
        heading: { id: 'Kategori dan item', en: 'Categories and items' },
        blocks: [
          {
            type: 'p',
            text: {
              id: 'Menu adalah daftar produk yang bisa dijual kasir. Anda mengaturnya dari sidebar di sebelah kiri. Sebelum menambah item, buat dulu kategori (kelompok produk seperti Kopi, Teh, atau Makanan) supaya menu rapi.',
              en: 'The menu is the list of products the register can sell. You manage it from the sidebar on the left. Before adding items, create categories first (a group of products such as Coffee, Tea, or Food) so the menu stays tidy.',
            },
          },
          {
            type: 'steps',
            items: [
              {
                id: 'Di sidebar, buka Menu, lalu ketuk tab Kategori.',
                en: 'In the sidebar, open Menu, then tap the Categories tab.',
              },
              {
                id: 'Tambahkan kategori yang Anda butuhkan, misalnya Kopi atau Makanan.',
                en: 'Add the categories you need, for example Coffee or Food.',
              },
              {
                id: 'Kembali ke tab Items, lalu ketuk Tambah Item.',
                en: 'Go back to the Items tab, then tap Add item.',
              },
              {
                id: 'Isi Nama, pilih Kategori, dan isi Harga (Rp), lalu ketuk Simpan.',
                en: 'Fill in the Name, choose a Category, and fill in the Price (Rp), then tap Save.',
              },
            ],
          },
          {
            type: 'note',
            text: {
              id: 'Pilih kategori dulu, item tidak bisa disimpan tanpa kategori. Anda juga bisa menyaring daftar item berdasarkan kategori memakai kotak pilihan di atas tabel.',
              en: 'Pick a category first, an item cannot be saved without one. You can also filter the item list by category using the picker above the table.',
            },
          },
        ],
      },
      {
        heading: { id: 'Gambar dan barcode', en: 'Image and barcode' },
        blocks: [
          {
            type: 'p',
            text: {
              id: 'Setiap item bisa punya gambar (foto produk yang tampil di kasir) dan barcode (kode angka untuk dipindai). Keduanya diatur di layar ubah item yang sama.',
              en: 'Each item can have an image (a product photo shown on the register) and a barcode (a number code that can be scanned). Both are set on the same item edit screen.',
            },
          },
          {
            type: 'steps',
            items: [
              {
                id: 'Di sidebar, buka Menu, lalu ketuk nama item yang ingin diubah.',
                en: 'In the sidebar, open Menu, then tap the name of the item you want to edit.',
              },
              {
                id: 'Pada bagian Gambar item, ketuk Unggah gambar dan pilih foto dari perangkat Anda.',
                en: 'In the Item image area, tap Upload image and pick a photo from your device.',
              },
              {
                id: 'Pada kolom Barcode, pindai atau ketik kode barcode produk, lalu ketuk Simpan.',
                en: 'In the Barcode field, scan or type the product barcode, then tap Save.',
              },
            ],
          },
          {
            type: 'note',
            text: {
              id: 'Untuk mencetak stiker barcode, buka Menu, lalu tab Label Barcode. Centang item, atur jumlah dan ukuran, lalu ketuk Cetak label. Item tanpa barcode bisa dibuatkan otomatis dengan tombol Buat barcode atau Buat semua.',
              en: 'To print barcode stickers, open Menu, then the Barcode labels tab. Tick the items, set the quantity and size, then tap Print labels. Items without a barcode can be generated automatically with the Make barcode or Make all buttons.',
            },
          },
        ],
      },
      {
        heading: { id: 'Varian dan grup modifier', en: 'Variants and modifier groups' },
        blocks: [
          {
            type: 'p',
            text: {
              id: 'Varian adalah pilihan satu item dengan harga berbeda (misalnya ukuran Kecil dan Besar). Grup modifier adalah kumpulan pilihan tambahan (misalnya tingkat gula atau topping) yang bisa dipakai ulang di banyak item.',
              en: 'A variant is a version of one item with a different price (for example Small and Large size). A modifier group is a set of add-on options (for example sugar level or toppings) that can be reused across many items.',
            },
          },
          {
            type: 'steps',
            items: [
              {
                id: 'Untuk varian: buka item, lalu di bagian Varian ketuk Tambah varian. Beri nama (misalnya Besar) dan isi harganya. Harga varian menggantikan harga dasar saat dipilih di kasir.',
                en: 'For variants: open the item, then in the Variants area tap Add variant. Give it a name (for example Large) and set its price. The variant price replaces the base price when chosen at the register.',
              },
              {
                id: 'Untuk grup modifier: di sidebar buka Menu, lalu tab Grup Modifier, dan ketuk Grup baru. Tentukan apakah grup Wajib atau Opsional, lalu tambahkan opsi beserta harga tambahannya.',
                en: 'For modifier groups: in the sidebar open Menu, then the Modifier groups tab, and tap New group. Set whether the group is Required or Optional, then add the options with their extra prices.',
              },
              {
                id: 'Buka kembali item, lalu pada bagian Grup modifier pilih + Pasang grup untuk memasang grup yang sudah dibuat.',
                en: 'Open the item again, then in the Modifier groups area choose + Attach group to attach a group you created.',
              },
            ],
          },
          {
            type: 'note',
            text: {
              id: 'Grup modifier dibuat satu kali dan dipakai ulang. Mengubahnya di satu tempat akan memperbarui semua item yang memakainya.',
              en: 'A modifier group is created once and reused. Editing it in one place updates every item that uses it.',
            },
          },
        ],
      },
      {
        heading: { id: 'Resep dan tandai habis', en: 'Recipes and marking sold out' },
        blocks: [
          {
            type: 'p',
            text: {
              id: 'Resep adalah daftar bahan yang dipakai untuk membuat satu item (misalnya 18 g kopi dan 200 ml susu untuk satu Latte). Dengan resep, stok bahan berkurang otomatis setiap kali item terjual.',
              en: 'A recipe is the list of ingredients used to make one item (for example 18 g coffee and 200 ml milk for one Latte). With a recipe, ingredient stock goes down automatically each time the item is sold.',
            },
          },
          {
            type: 'steps',
            items: [
              {
                id: 'Di sidebar, buka Menu, lalu ketuk item yang ingin diberi resep.',
                en: 'In the sidebar, open Menu, then tap the item you want to give a recipe.',
              },
              {
                id: 'Gulir ke bagian Resep di bawah, lalu ketuk Tambah bahan.',
                en: 'Scroll down to the Recipe area, then tap Add ingredient.',
              },
              {
                id: 'Pilih bahan dan isi Jumlah yang dipakai per porsi, lalu ketuk Simpan resep.',
                en: 'Choose an ingredient and fill in the Quantity used per serving, then tap Save recipe.',
              },
            ],
          },
          {
            type: 'note',
            text: {
              id: 'Stok bahan berkurang otomatis hanya jika item punya resep. Tanpa resep, item tetap bisa dijual, tapi stok tidak ikut berkurang.',
              en: 'Ingredient stock decreases automatically only if the item has a recipe. Without a recipe the item can still be sold, but stock will not go down.',
            },
          },
          {
            type: 'p',
            text: {
              id: 'Kalau satu produk sedang tidak tersedia, tandai item itu habis. Item yang ditandai habis tidak bisa ditambahkan ke keranjang di kasir sampai Anda menandainya tersedia lagi.',
              en: 'When a product is temporarily unavailable, mark the item sold out. A sold-out item cannot be added to the cart at the register until you mark it available again.',
            },
          },
          {
            type: 'steps',
            items: [
              {
                id: 'Di sidebar, buka Menu.',
                en: 'In the sidebar, open Menu.',
              },
              {
                id: 'Pada baris item, ketuk menu aksi (tiga titik) di ujung kanan, lalu pilih Tandai habis.',
                en: 'On the item row, tap the actions menu (three dots) at the far right, then choose Mark sold out.',
              },
              {
                id: 'Untuk membuatnya bisa dijual lagi, ulangi langkah itu dan pilih Tandai tersedia.',
                en: 'To make it sellable again, repeat the step and choose Mark available.',
              },
            ],
          },
        ],
      },
    ],
  },

  // 2. Inventory
  {
    slug: 'inventory',
    icon: 'inventory',
    title: { id: 'Inventaris', en: 'Inventory' },
    summary: {
      id: 'Lacak stok bahan, peringatan stok rendah, pembelian, pesanan beli, pemasok, penyesuaian, dan limbah.',
      en: 'Track ingredient stock, low-stock alerts, purchases, purchase orders, suppliers, adjustments, and waste.',
    },
    sections: [
      {
        heading: { id: 'Bahan dan stok rendah', en: 'Ingredients and low stock' },
        blocks: [
          {
            type: 'p',
            text: {
              id: 'Inventaris melacak bahan baku (seperti kopi, susu, atau gelas), bukan produk jadi. Anda mengaturnya dari Inventaris di sidebar. Setiap bahan punya satuan (g untuk gram, ml untuk mililiter, atau pcs untuk buah) dan ambang isi ulang (batas stok yang memicu peringatan).',
              en: 'Inventory tracks raw ingredients (such as coffee, milk, or cups), not finished products. You manage it from Inventory in the sidebar. Each ingredient has a unit (g for grams, ml for milliliters, or pcs for pieces) and a reorder threshold (the stock level that triggers an alert).',
            },
          },
          {
            type: 'steps',
            items: [
              {
                id: 'Di sidebar, buka Inventaris.',
                en: 'In the sidebar, open Inventory.',
              },
              {
                id: 'Ketuk Tambah Bahan.',
                en: 'Tap Add ingredient.',
              },
              {
                id: 'Isi Nama, pilih Satuan, isi Ambang isi ulang dan Biaya per satuan, lalu ketuk Simpan.',
                en: 'Fill in the Name, choose a Unit, set the Reorder threshold and Cost per unit, then tap Save.',
              },
            ],
          },
          {
            type: 'note',
            text: {
              id: 'Saat stok sebuah bahan turun di bawah ambang isi ulang, bahan itu ditandai stok rendah. Peringatan stok rendah muncul di bagian atas layar kasir dan di lonceng notifikasi pada header. Email harian stok rendah bersifat opsional dan diaktifkan di Pengaturan.',
              en: 'When an ingredient drops below its reorder threshold, it is flagged as low stock. A low-stock warning appears at the top of the register and in the notifications bell in the header. The daily low-stock email is optional and turned on in Settings.',
            },
          },
        ],
      },
      {
        heading: { id: 'Mencatat pembelian', en: 'Recording purchases' },
        blocks: [
          {
            type: 'p',
            text: {
              id: 'Mencatat pembelian menambah stok bahan dan memperbarui biaya bahan secara otomatis. Gunakan ini setiap kali barang datang dari pemasok.',
              en: 'Recording a purchase adds ingredient stock and updates the ingredient cost automatically. Use this each time goods arrive from a supplier.',
            },
          },
          {
            type: 'steps',
            items: [
              {
                id: 'Di sidebar, buka Inventaris, lalu pindah ke halaman Pembelian.',
                en: 'In the sidebar, open Inventory, then go to the Purchases page.',
              },
              {
                id: 'Ketuk Catat Pembelian.',
                en: 'Tap Record purchase.',
              },
              {
                id: 'Pilih pemasok (opsional), tambahkan tiap bahan beserta jumlah dan biaya per satuan, lalu simpan.',
                en: 'Choose a supplier (optional), add each ingredient with its quantity and cost per unit, then save.',
              },
            ],
          },
          {
            type: 'note',
            text: {
              id: 'Ketuk tanggal sebuah pembelian untuk membuka rinciannya dan melihat semua baris bahannya.',
              en: 'Tap a purchase date to open its details and see all of its ingredient lines.',
            },
          },
        ],
      },
      {
        heading: { id: 'Pesanan beli dan pemasok', en: 'Purchase orders and suppliers' },
        blocks: [
          {
            type: 'p',
            text: {
              id: 'Pesanan beli (PO) adalah daftar barang yang Anda pesan ke pemasok sebelum barang datang. Saat barang tiba, Anda menerimanya dan stok bertambah. Pemasok adalah toko atau distributor tempat Anda membeli bahan.',
              en: 'A purchase order (PO) is a list of goods you order from a supplier before they arrive. When the goods arrive, you receive them and the stock increases. A supplier is the shop or distributor you buy ingredients from.',
            },
          },
          {
            type: 'steps',
            items: [
              {
                id: 'Tambahkan pemasok dulu: di sidebar buka Pemasok, ketuk Tambah Pemasok, isi nama dan telepon, lalu simpan.',
                en: 'Add a supplier first: in the sidebar open Suppliers, tap Add supplier, fill in the name and phone, then save.',
              },
              {
                id: 'Di sidebar, buka Inventaris, lalu pindah ke halaman Pesanan Beli dan ketuk Buat PO.',
                en: 'In the sidebar, open Inventory, then go to the Purchase orders page and tap Create PO.',
              },
              {
                id: 'Pilih pemasok, tambahkan bahan yang dipesan, lalu simpan. Pesanan dimulai dengan status Terbuka.',
                en: 'Choose a supplier, add the ordered ingredients, then save. The order starts with the Open status.',
              },
              {
                id: 'Ketika barang datang, ketuk baris pesanan untuk membuka rinciannya, lalu terima barang (sebagian atau seluruhnya). Status berubah menjadi Sebagian lalu Diterima, dan stok bertambah.',
                en: 'When the goods arrive, tap the order row to open its details, then receive the goods (partly or fully). The status changes to Partial then Received, and stock increases.',
              },
            ],
          },
          {
            type: 'note',
            text: {
              id: 'Jika sebuah pesanan dibatalkan, buka rinciannya dan batalkan pesanan. Pesanan yang Dibatalkan tidak menambah stok.',
              en: 'If an order falls through, open its details and cancel the order. A Cancelled order does not add stock.',
            },
          },
        ],
      },
      {
        heading: { id: 'Stok opname dan limbah', en: 'Stock-take and waste' },
        blocks: [
          {
            type: 'p',
            text: {
              id: 'Stok opname adalah menghitung stok fisik sebenarnya lalu memasukkan angka itu, supaya catatan cocok dengan kenyataan. Penyesuaian adalah koreksi manual pada satu bahan. Limbah adalah bahan yang terbuang (misalnya tumpah atau kedaluwarsa).',
              en: 'A stock-take is counting the real physical stock and entering those numbers, so the records match reality. An adjustment is a manual correction to one ingredient. Waste is ingredients that are thrown away (for example spilled or expired).',
            },
          },
          {
            type: 'steps',
            items: [
              {
                id: 'Untuk stok opname: di sidebar buka Inventaris, ketuk Stok opname, masukkan jumlah hasil hitungan untuk tiap bahan, lalu simpan.',
                en: 'For a stock-take: in the sidebar open Inventory, tap Stock-take, enter the counted amount for each ingredient, then save.',
              },
              {
                id: 'Untuk penyesuaian satu bahan: pada baris bahan, ketuk menu aksi (tiga titik), lalu pilih Catat stok masuk dan isi perubahannya. Riwayat tercatat di halaman Penyesuaian.',
                en: 'For a single-ingredient adjustment: on the ingredient row, tap the actions menu (three dots), then choose Record stock in and enter the change. The history is kept on the Adjustments page.',
              },
              {
                id: 'Untuk limbah: di sidebar buka Inventaris, pindah ke halaman Limbah, ketuk Catat Limbah, pilih bahan, isi jumlah dan alasannya, lalu simpan.',
                en: 'For waste: in the sidebar open Inventory, go to the Waste page, tap Record waste, choose the ingredient, fill in the quantity and reason, then save.',
              },
            ],
          },
          {
            type: 'note',
            text: {
              id: 'Halaman Limbah menjumlahkan kerugian 30 hari terakhir, jadi Anda bisa melihat berapa banyak bahan yang terbuang dan biayanya.',
              en: 'The Waste page totals the loss over the last 30 days, so you can see how much was thrown away and what it cost.',
            },
          },
        ],
      },
    ],
  },

  // 3. Customers & loyalty
  {
    slug: 'customers-loyalty',
    icon: 'customers',
    title: { id: 'Pelanggan & Loyalitas', en: 'Customers & loyalty' },
    summary: {
      id: 'Tambah pelanggan, kumpulkan poin, atur tier, tukar reward, dan kelola kartu hadiah.',
      en: 'Add customers, earn points, set tiers, redeem rewards, and manage gift cards.',
    },
    sections: [
      {
        heading: { id: 'Menambah pelanggan', en: 'Adding customers' },
        blocks: [
          {
            type: 'p',
            text: {
              id: 'Pelanggan adalah orang yang datanya Anda simpan untuk melacak poin dan kunjungan. Anda mengelolanya dari Pelanggan di sidebar.',
              en: 'A customer is a person whose details you save to track points and visits. You manage them from Customers in the sidebar.',
            },
          },
          {
            type: 'steps',
            items: [
              {
                id: 'Di sidebar, buka Pelanggan.',
                en: 'In the sidebar, open Customers.',
              },
              {
                id: 'Ketuk Tambah pelanggan, isi nama dan nomor telepon, lalu simpan.',
                en: 'Tap Add customer, fill in the name and phone number, then save.',
              },
              {
                id: 'Ketuk nama pelanggan untuk melihat poin, kunjungan, dan total belanjanya.',
                en: 'Tap a customer name to see their points, visits, and total spend.',
              },
            ],
          },
          {
            type: 'note',
            text: {
              id: 'Saat menjual, kasir mencari pelanggan lewat nomor telepon di layar pembayaran, jadi pastikan nomor telepon diisi.',
              en: 'When selling, the register finds a customer by phone number on the payment screen, so make sure the phone number is filled in.',
            },
          },
        ],
      },
      {
        heading: { id: 'Poin dan tier', en: 'Points and tiers' },
        blocks: [
          {
            type: 'p',
            text: {
              id: 'Poin adalah hadiah yang pelanggan kumpulkan dari belanja, lalu bisa ditukar dengan diskon. Tier adalah tingkatan pelanggan (misalnya Perak atau Emas) yang memberi pengali poin lebih besar bagi pelanggan dengan belanja lebih tinggi.',
              en: 'Points are a reward customers collect from spending, which they can later swap for a discount. A tier is a customer level (for example Silver or Gold) that gives a higher points multiplier to customers who spend more.',
            },
          },
          {
            type: 'steps',
            items: [
              {
                id: 'Di sidebar, buka Loyalitas.',
                en: 'In the sidebar, open Loyalty.',
              },
              {
                id: 'Nyalakan Program aktif supaya pelanggan mulai memperoleh poin.',
                en: 'Turn on Program active so customers start earning points.',
              },
              {
                id: 'Atur Perolehan poin (berapa rupiah belanja untuk 1 poin) dan Penukaran poin (berapa poin sama dengan berapa rupiah diskon).',
                en: 'Set Earning points (how much spend gives 1 point) and Redeeming points (how many points equal how many rupiah of discount).',
              },
              {
                id: 'Di bagian Tier, ketuk + Tambah tier, beri nama, isi belanja minimum dan pengali poin, lalu ketuk Simpan.',
                en: 'In the Tiers area, tap + Add tier, give it a name, set the minimum spend and the points multiplier, then tap Save.',
              },
            ],
          },
          {
            type: 'note',
            text: {
              id: 'Jika program dinonaktifkan, pelanggan tidak memperoleh poin. Pengali poin minimal 1.',
              en: 'If the program is turned off, customers do not earn points. The points multiplier is at least 1.',
            },
          },
        ],
      },
      {
        heading: { id: 'Reward dan menukar poin', en: 'Rewards and redeeming points' },
        blocks: [
          {
            type: 'p',
            text: {
              id: 'Reward adalah diskon tetap yang bisa ditukar pelanggan dengan sejumlah poin (misalnya 100 poin untuk potongan Rp 10.000). Anda membuat daftar reward di halaman Loyalitas, lalu kasir menukarnya saat pembayaran.',
              en: 'A reward is a fixed discount a customer can swap for a set number of points (for example 100 points for Rp 10,000 off). You create the list of rewards on the Loyalty page, then the register redeems them at payment.',
            },
          },
          {
            type: 'steps',
            items: [
              {
                id: 'Di sidebar, buka Loyalitas, lalu gulir ke bagian Reward dan ketuk Tambah reward.',
                en: 'In the sidebar, open Loyalty, then scroll to the Rewards area and tap Add reward.',
              },
              {
                id: 'Beri nama, isi jumlah poin yang dibutuhkan dan nilai diskonnya, lalu simpan.',
                en: 'Give it a name, set the points cost and the discount value, then save.',
              },
              {
                id: 'Saat menjual, cari pelanggan lewat nomor telepon di layar pembayaran, lalu pilih poin atau reward yang ingin ditukar sebelum menyelesaikan pembayaran.',
                en: 'When selling, find the customer by phone number on the payment screen, then pick the points or reward to redeem before finishing the payment.',
              },
            ],
          },
          {
            type: 'note',
            text: {
              id: 'Hanya pelanggan yang dipilih di pembayaran yang bisa menukar poin atau reward, jadi cari pelanggannya dulu.',
              en: 'Only a customer selected at payment can redeem points or a reward, so find the customer first.',
            },
          },
        ],
      },
      {
        heading: { id: 'Kartu hadiah', en: 'Gift cards' },
        blocks: [
          {
            type: 'p',
            text: {
              id: 'Kartu hadiah adalah voucher prabayar dengan saldo dalam rupiah yang bisa dipakai pelanggan untuk membayar. Anda mengelolanya dari Kartu hadiah di sidebar.',
              en: 'A gift card is a prepaid voucher with a rupiah balance that a customer can use to pay. You manage them from Gift cards in the sidebar.',
            },
          },
          {
            type: 'steps',
            items: [
              {
                id: 'Di sidebar, buka Kartu hadiah, ketuk Terbitkan kartu, isi kode kartu dan saldo awal, lalu simpan.',
                en: 'In the sidebar, open Gift cards, tap Issue card, fill in the card code and starting balance, then save.',
              },
              {
                id: 'Untuk menambah saldo: pada baris kartu, ketuk menu aksi (tiga titik), pilih Isi saldo, lalu masukkan jumlahnya.',
                en: 'To add balance: on the card row, tap the actions menu (three dots), choose Top up, then enter the amount.',
              },
              {
                id: 'Untuk membayar dengan kartu hadiah: di layar penjualan ketuk Kartu hadiah, masukkan kode kartu, dan saldo kartu akan tampil sebelum Anda menyelesaikan pembayaran.',
                en: 'To pay with a gift card: on the selling screen tap Gift card, enter the card code, and the card balance shows before you finish the payment.',
              },
            ],
          },
          {
            type: 'note',
            text: {
              id: 'Saldo kartu tampil otomatis saat kode dimasukkan di layar pembayaran. Kalau saldo kurang dari total, gunakan Bagi pembayaran untuk melunasi sisanya dengan metode lain.',
              en: 'The card balance shows automatically once the code is entered on the payment screen. If the balance is less than the total, use Split payment to cover the rest with another method.',
            },
          },
        ],
      },
    ],
  },

  // 4. Promotions
  {
    slug: 'promotions',
    icon: 'promos',
    title: { id: 'Promo & Diskon', en: 'Promotions & discounts' },
    summary: {
      id: 'Buat promo persen atau nominal, atur cakupannya, pakai kode, dan terapkan di kasir.',
      en: 'Create percentage or fixed-amount promos, set their scope, use codes, and apply them at the register.',
    },
    sections: [
      {
        heading: { id: 'Tipe dan cakupan promo', en: 'Promo types and scope' },
        blocks: [
          {
            type: 'p',
            text: {
              id: 'Promo adalah diskon yang Anda buat sekali lalu pakai di kasir. Anda mengelolanya dari Promosi di sidebar. Promo punya tipe (cara menghitung diskon) dan cakupan (bagian pesanan yang terkena diskon).',
              en: 'A promo is a discount you create once and then apply at the register. You manage them from Promotions in the sidebar. A promo has a type (how the discount is calculated) and a scope (which part of the order the discount affects).',
            },
          },
          {
            type: 'ul',
            items: [
              {
                id: 'Persen: memotong sekian persen dari harga (misalnya 10%).',
                en: 'Percentage: takes a percentage off the price (for example 10%).',
              },
              {
                id: 'Nominal: memotong sejumlah rupiah tetap (misalnya Rp 5.000).',
                en: 'Fixed amount: takes a fixed rupiah amount off (for example Rp 5,000).',
              },
              {
                id: 'Cakupan Seluruh order: diskon berlaku untuk seluruh pesanan.',
                en: 'Whole order scope: the discount applies to the entire order.',
              },
              {
                id: 'Cakupan Item tertentu: diskon hanya berlaku untuk item yang Anda pilih.',
                en: 'Specific items scope: the discount applies only to the items you choose.',
              },
              {
                id: 'Cakupan Kategori tertentu: diskon hanya berlaku untuk item dalam kategori yang Anda pilih.',
                en: 'Specific categories scope: the discount applies only to items in the categories you choose.',
              },
            ],
          },
        ],
      },
      {
        heading: { id: 'Membuat promo', en: 'Creating a promo' },
        blocks: [
          {
            type: 'steps',
            items: [
              {
                id: 'Di sidebar, buka Promosi, lalu ketuk Tambah Promo.',
                en: 'In the sidebar, open Promotions, then tap Add promo.',
              },
              {
                id: 'Isi Nama promo, pilih Tipe (Persen atau Nominal), lalu isi Nilainya.',
                en: 'Fill in the Promo name, choose the Type (Percentage or Fixed amount), then fill in the Value.',
              },
              {
                id: 'Pilih Cakupan: Seluruh order, Item tertentu, atau Kategori tertentu. Untuk dua cakupan terakhir, pilih item atau kategori targetnya.',
                en: 'Choose the Scope: Whole order, Specific items, or Specific categories. For the last two, pick the target items or categories.',
              },
              {
                id: 'Ketuk Simpan.',
                en: 'Tap Save.',
              },
            ],
          },
          {
            type: 'note',
            text: {
              id: 'Untuk promo yang dibatasi item atau kategori, Anda harus memilih minimal satu target sebelum bisa menyimpan.',
              en: 'For an item-scoped or category-scoped promo, you must pick at least one target before you can save.',
            },
          },
        ],
      },
      {
        heading: { id: 'Promo berkode dan menerapkan di kasir', en: 'Coded promos and applying at checkout' },
        blocks: [
          {
            type: 'p',
            text: {
              id: 'Kode promo (opsional) adalah kata kunci singkat yang diketik kasir untuk memanggil promo tertentu, berguna untuk promo yang tidak ingin terlihat di daftar. Tanpa kode, promo tetap muncul di daftar pilihan.',
              en: 'A promo code (optional) is a short keyword the cashier types to call up a specific promo, useful for a promo you do not want shown in the list. Without a code, the promo still appears in the picker list.',
            },
          },
          {
            type: 'steps',
            items: [
              {
                id: 'Untuk memberi kode: saat membuat atau mengubah promo, isi kolom Kode promo, lalu simpan.',
                en: 'To add a code: when creating or editing a promo, fill in the Promo code field, then save.',
              },
              {
                id: 'Di layar penjualan, setelah ada item di keranjang, ketuk Tambah promo pada keranjang.',
                en: 'On the selling screen, once there are items in the cart, tap Add promo on the cart.',
              },
              {
                id: 'Pilih promo dari daftar, atau ketik kodenya dan ketuk Pakai. Diskon langsung muncul di ringkasan keranjang sebelum pembayaran.',
                en: 'Choose a promo from the list, or type its code and tap Apply. The discount appears in the cart summary right away, before payment.',
              },
            ],
          },
          {
            type: 'note',
            text: {
              id: 'Satu promo bisa diterapkan per pesanan. Untuk mengganti atau menghapusnya, ketuk tanda silang di sebelah promo pada ringkasan keranjang.',
              en: 'One promo can be applied per order. To change or remove it, tap the cross next to the promo in the cart summary.',
            },
          },
        ],
      },
    ],
  },
];
