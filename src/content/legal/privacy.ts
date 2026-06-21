import type { LegalContent } from './types';

/**
 * Privacy Policy content, framed around Indonesia's Personal Data Protection
 * Law (UU PDP No. 27 of 2022). Indonesian and English are maintained side by
 * side here for legal review. Bracketed values are placeholders to complete
 * before public launch.
 */
export const PRIVACY: LegalContent = {
  id: {
    title: 'Kebijakan Privasi',
    effectiveDate: '21 Juni 2026',
    intro:
      'Kebijakan Privasi ini menjelaskan bagaimana kodapos mengumpulkan, menggunakan, dan melindungi data pribadi sehubungan dengan penggunaan layanan kami. Kebijakan ini disusun dengan memperhatikan Undang-Undang Nomor 27 Tahun 2022 tentang Pelindungan Data Pribadi (UU PDP).',
    sections: [
      {
        id: 'introduction',
        heading: 'Pendahuluan',
        body: [
          {
            type: 'p',
            text: 'Layanan kodapos dikelola oleh Dede Mahendra ("kami"). Untuk pertanyaan terkait privasi, hubungi kami di contact@kodapos.app. Untuk data akun pemilik dan staf usaha, kami bertindak sebagai pengendali data. Untuk data pelanggan akhir yang Anda simpan di kodapos, kami bertindak sebagai prosesor yang memproses data atas nama Anda.',
          },
        ],
      },
      {
        id: 'data-we-collect',
        heading: 'Data yang kami kumpulkan',
        body: [
          { type: 'p', text: 'Kami mengumpulkan jenis data berikut:' },
          {
            type: 'list',
            items: [
              'Data akun: nama, email, dan nomor telepon yang Anda berikan saat mendaftar.',
              'Profil usaha: nama usaha, alamat, kontak, jam operasional, dan logo.',
              'Data staf: nama, nomor telepon, email, peran, tarif per jam, serta catatan kehadiran (jam masuk dan keluar), jadwal, dan sesi kasir untuk staf yang Anda undang ke akun usaha Anda.',
              'Data transaksi: penjualan, item, harga, metode pembayaran, dan catatan terkait.',
              'Data pelanggan akhir: nama, nomor telepon, atau email pelanggan yang Anda simpan atau yang diberikan pelanggan untuk fitur seperti loyalitas, pesanan mandiri, reservasi, dan pengiriman struk.',
              'Data teknis dan log: log akses dan penggunaan, yang dapat mencakup alamat IP, yang dihasilkan oleh penyedia hosting dan keamanan kami untuk mengoperasikan dan melindungi layanan.',
            ],
          },
        ],
      },
      {
        id: 'how-we-use',
        heading: 'Cara kami menggunakan data',
        body: [
          { type: 'p', text: 'Kami menggunakan data untuk:' },
          {
            type: 'list',
            items: [
              'Menyediakan, mengoperasikan, dan memelihara layanan.',
              'Mengautentikasi akun dan menjaga keamanan.',
              'Memproses pembayaran serta mengirim struk atau konfirmasi pesanan kepada pelanggan.',
              'Menampilkan laporan dan menyediakan fitur AI atas permintaan Anda.',
              'Mengirim pemberitahuan layanan dan, jika relevan, ringkasan operasional yang Anda aktifkan.',
              'Meningkatkan kualitas dan keandalan layanan.',
            ],
          },
        ],
      },
      {
        id: 'legal-basis',
        heading: 'Dasar pemrosesan',
        body: [
          {
            type: 'p',
            text: 'Kami memproses data pribadi berdasarkan dasar yang sah menurut UU PDP, antara lain: pelaksanaan kontrak layanan dengan Anda, pemenuhan kewajiban hukum, kepentingan yang sah untuk mengoperasikan dan mengamankan layanan, serta persetujuan Anda jika diperlukan untuk pemrosesan tertentu.',
          },
        ],
      },
      {
        id: 'controller-processor',
        heading: 'Peran pengendali dan prosesor',
        body: [
          {
            type: 'p',
            text: 'Sebagai pengguna usaha, Anda adalah pengendali data atas pelanggan akhir Anda. Anda bertanggung jawab memastikan adanya dasar yang sah untuk mengumpulkan dan menggunakan data pelanggan tersebut. kodapos memproses data pelanggan akhir hanya sesuai instruksi Anda dan untuk menyediakan layanan.',
          },
        ],
      },
      {
        id: 'sharing',
        heading: 'Berbagi data dan sub-prosesor',
        body: [
          {
            type: 'p',
            text: 'Kami tidak menjual data pribadi. Kami membagikan data hanya kepada penyedia layanan tepercaya yang membantu kami mengoperasikan layanan, di bawah perjanjian yang membatasi penggunaan data. Sub-prosesor utama kami meliputi:',
          },
          {
            type: 'list',
            items: [
              'Convex, untuk hosting basis data dan backend.',
              'Resend, untuk pengiriman email transaksional seperti kode verifikasi, struk, dan ringkasan operasional.',
              'Cloudflare, untuk hosting dan pengiriman aplikasi.',
              'Penyedia AI yang terhubung dengan akun Anda, untuk memproses permintaan fitur AI.',
              'Penyedia pembayaran QRIS, untuk memproses pembayaran.',
              'Penyedia pesan WhatsApp yang Anda konfigurasikan, untuk mengirim struk pesanan kepada pelanggan jika Anda mengaktifkan fitur ini.',
              'Penyedia peta, untuk mencari koordinat alamat usaha Anda (geocoding).',
            ],
          },
          {
            type: 'p',
            text: 'Kami juga dapat mengungkapkan data jika diwajibkan oleh hukum atau untuk melindungi hak dan keamanan.',
          },
        ],
      },
      {
        id: 'retention',
        heading: 'Penyimpanan dan retensi',
        body: [
          {
            type: 'p',
            text: 'Kami menyimpan data pribadi selama akun Anda aktif atau selama diperlukan untuk menyediakan layanan dan memenuhi kewajiban hukum. Setelah itu, data akan dihapus atau dianonimkan dalam jangka waktu yang wajar, kecuali penyimpanan lebih lama diwajibkan oleh hukum.',
          },
        ],
      },
      {
        id: 'security',
        heading: 'Keamanan',
        body: [
          {
            type: 'p',
            text: 'Kami menerapkan langkah teknis dan organisasi yang wajar untuk melindungi data, termasuk enkripsi saat transit dan kontrol akses. Tidak ada sistem yang sepenuhnya aman, sehingga kami tidak dapat menjamin keamanan mutlak. Jika terjadi kegagalan pelindungan data pribadi, kami akan menindaklanjuti sesuai ketentuan UU PDP.',
          },
        ],
      },
      {
        id: 'your-rights',
        heading: 'Hak Anda',
        body: [
          {
            type: 'p',
            text: 'Sesuai UU PDP, sebagai subjek data Anda memiliki hak antara lain:',
          },
          {
            type: 'list',
            items: [
              'Memperoleh informasi tentang pemrosesan data Anda.',
              'Mengakses dan memperoleh salinan data Anda.',
              'Memperbaiki atau memperbarui data yang tidak akurat.',
              'Menghapus atau memusnahkan data dalam hal tertentu.',
              'Menarik persetujuan atas pemrosesan yang didasarkan pada persetujuan.',
              'Mengajukan keberatan atau membatasi pemrosesan tertentu.',
              'Memperoleh dan memindahkan data Anda jika memungkinkan secara teknis.',
              'Mengajukan pengaduan kepada lembaga yang berwenang.',
            ],
          },
          {
            type: 'p',
            text: 'Untuk menggunakan hak ini, hubungi kami di contact@kodapos.app. Jika permintaan berkaitan dengan data pelanggan akhir suatu usaha, kami akan mengarahkannya kepada usaha tersebut sebagai pengendali data.',
          },
        ],
      },
      {
        id: 'ai-features',
        heading: 'Fitur AI',
        body: [
          {
            type: 'p',
            text: 'Saat Anda menggunakan fitur AI, ringkasan data bisnis yang relevan dengan permintaan Anda (seperti angka penjualan, produk teratas, dan tingkat stok) dikirim ke penyedia AI yang terhubung dengan akun Anda untuk menghasilkan jawaban. Kami tidak mengirimkan data pribadi pelanggan akhir ke penyedia AI. Pemrosesan oleh penyedia AI tunduk pada ketentuan layanan mereka. Keluaran AI bisa keliru, jadi periksa informasi penting sebelum mengandalkannya.',
          },
        ],
      },
      {
        id: 'cookies',
        heading: 'Cookie dan penyimpanan lokal',
        body: [
          {
            type: 'p',
            text: 'Kami menggunakan penyimpanan lokal peramban (local storage) dan cookie milik kami sendiri untuk menyimpan preferensi seperti bahasa, tema, dan tampilan antarmuka, serta untuk menjaga sesi masuk Anda. Kami tidak menggunakan cookie iklan atau pelacakan pihak ketiga.',
          },
        ],
      },
      {
        id: 'children',
        heading: 'Data anak',
        body: [
          {
            type: 'p',
            text: 'Layanan ditujukan untuk pelaku usaha dewasa dan tidak ditujukan bagi anak. Kami tidak dengan sengaja mengumpulkan data pribadi anak. Jika Anda yakin seorang anak telah memberikan data kepada kami, hubungi kami agar dapat kami tindak lanjuti.',
          },
        ],
      },
      {
        id: 'international',
        heading: 'Transfer internasional',
        body: [
          {
            type: 'p',
            text: 'Sebagian sub-prosesor kami dapat memproses data di luar Indonesia. Jika terjadi transfer ke luar wilayah, kami berupaya memastikan adanya tingkat pelindungan yang memadai sesuai UU PDP dan menerapkan pengamanan yang wajar.',
          },
        ],
      },
      {
        id: 'changes',
        heading: 'Perubahan kebijakan',
        body: [
          {
            type: 'p',
            text: 'Kami dapat memperbarui Kebijakan Privasi ini dari waktu ke waktu. Jika ada perubahan penting, kami akan memberi tahu melalui layanan atau email. Tanggal "Terakhir diperbarui" di atas menunjukkan versi terbaru.',
          },
        ],
      },
      {
        id: 'contact',
        heading: 'Narahubung',
        body: [
          {
            type: 'p',
            text: 'Untuk pertanyaan atau permintaan terkait privasi, hubungi kami di contact@kodapos.app.',
          },
        ],
      },
    ],
  },
  en: {
    title: 'Privacy Policy',
    effectiveDate: '21 June 2026',
    intro:
      'This Privacy Policy explains how kodapos collects, uses, and protects personal data in connection with your use of our services. It is prepared with regard to Indonesia Personal Data Protection Law No. 27 of 2022 (UU PDP).',
    sections: [
      {
        id: 'introduction',
        heading: 'Introduction',
        body: [
          {
            type: 'p',
            text: 'The kodapos service is operated by Dede Mahendra ("we" or "us"). For privacy questions, contact us at contact@kodapos.app. For the account data of business owners and staff, we act as the data controller. For the end-customer data you store in kodapos, we act as a processor that processes data on your behalf.',
          },
        ],
      },
      {
        id: 'data-we-collect',
        heading: 'Data we collect',
        body: [
          { type: 'p', text: 'We collect the following types of data:' },
          {
            type: 'list',
            items: [
              'Account data: the name, email, and phone number you provide at sign up.',
              'Business profile: business name, address, contacts, operating hours, and logo.',
              'Staff data: name, phone, email, role, hourly rate, and attendance records (clock in and out), schedules, and cashier sessions for staff you invite into your business account.',
              'Transaction data: sales, items, prices, payment methods, and related notes.',
              'End-customer data: customer name, phone, or email you store or that customers provide for features such as loyalty, self ordering, reservations, and sending receipts.',
              'Technical and log data: access and usage logs, which may include IP address, generated by our hosting and security providers to operate and protect the service.',
            ],
          },
        ],
      },
      {
        id: 'how-we-use',
        heading: 'How we use data',
        body: [
          { type: 'p', text: 'We use data to:' },
          {
            type: 'list',
            items: [
              'Provide, operate, and maintain the service.',
              'Authenticate accounts and keep them secure.',
              'Process payments and send receipts or order confirmations to customers.',
              'Show reports and provide AI features at your request.',
              'Send service notifications and, where relevant, operational summaries you enable.',
              'Improve the quality and reliability of the service.',
            ],
          },
        ],
      },
      {
        id: 'legal-basis',
        heading: 'Legal basis',
        body: [
          {
            type: 'p',
            text: 'We process personal data on lawful bases under the UU PDP, including: performing our service contract with you, complying with legal obligations, legitimate interests in operating and securing the service, and your consent where it is required for certain processing.',
          },
        ],
      },
      {
        id: 'controller-processor',
        heading: 'Controller and processor roles',
        body: [
          {
            type: 'p',
            text: 'As a business user, you are the controller of your end-customer data. You are responsible for ensuring there is a lawful basis to collect and use that customer data. kodapos processes end-customer data only on your instructions and to provide the service.',
          },
        ],
      },
      {
        id: 'sharing',
        heading: 'Sharing and sub-processors',
        body: [
          {
            type: 'p',
            text: 'We do not sell personal data. We share data only with trusted service providers who help us operate the service, under agreements that limit how they use the data. Our key sub-processors include:',
          },
          {
            type: 'list',
            items: [
              'Convex, for database and backend hosting.',
              'Resend, for transactional email such as verification codes, receipts, and operational summaries.',
              'Cloudflare, for application hosting and delivery.',
              'An AI provider connected to your account, for processing AI feature requests.',
              'A QRIS payment provider, for processing payments.',
              'A WhatsApp messaging provider you configure, to send order receipts to customers where you enable this feature.',
              'A mapping provider, to look up the coordinates of your business address (geocoding).',
            ],
          },
          {
            type: 'p',
            text: 'We may also disclose data where required by law or to protect rights and safety.',
          },
        ],
      },
      {
        id: 'retention',
        heading: 'Retention',
        body: [
          {
            type: 'p',
            text: 'We retain personal data while your account is active or as needed to provide the service and meet legal obligations. After that, data is deleted or anonymized within a reasonable period, unless longer retention is required by law.',
          },
        ],
      },
      {
        id: 'security',
        heading: 'Security',
        body: [
          {
            type: 'p',
            text: 'We apply reasonable technical and organizational measures to protect data, including encryption in transit and access controls. No system is completely secure, so we cannot guarantee absolute security. In the event of a personal data breach, we will respond in line with the UU PDP.',
          },
        ],
      },
      {
        id: 'your-rights',
        heading: 'Your rights',
        body: [
          {
            type: 'p',
            text: 'Under the UU PDP, as a data subject you have rights including to:',
          },
          {
            type: 'list',
            items: [
              'Obtain information about how your data is processed.',
              'Access and obtain a copy of your data.',
              'Correct or update inaccurate data.',
              'Delete or erase data in certain circumstances.',
              'Withdraw consent for processing based on consent.',
              'Object to or restrict certain processing.',
              'Obtain and move your data where technically feasible.',
              'Lodge a complaint with the competent authority.',
            ],
          },
          {
            type: 'p',
            text: 'To exercise these rights, contact us at contact@kodapos.app. If a request concerns the end-customer data of a business, we will direct it to that business as the data controller.',
          },
        ],
      },
      {
        id: 'ai-features',
        heading: 'AI features',
        body: [
          {
            type: 'p',
            text: 'When you use AI features, a summary of the business data relevant to your request (such as sales figures, top products, and stock levels) is sent to the AI provider connected to your account to generate a response. We do not send end-customer personal data to the AI provider. Processing by the AI provider is subject to its own terms. AI output can be wrong, so check important information before relying on it.',
          },
        ],
      },
      {
        id: 'cookies',
        heading: 'Cookies and local storage',
        body: [
          {
            type: 'p',
            text: 'We use browser local storage and our own first party cookies to remember preferences such as language, theme, and interface layout, and to keep you signed in. We do not use third party advertising or tracking cookies.',
          },
        ],
      },
      {
        id: 'children',
        heading: 'Children data',
        body: [
          {
            type: 'p',
            text: 'The service is intended for adult business operators and is not directed at children. We do not knowingly collect personal data from children. If you believe a child has provided data to us, contact us so we can address it.',
          },
        ],
      },
      {
        id: 'international',
        heading: 'International transfers',
        body: [
          {
            type: 'p',
            text: 'Some of our sub-processors may process data outside Indonesia. Where data is transferred abroad, we work to ensure an adequate level of protection consistent with the UU PDP and apply reasonable safeguards.',
          },
        ],
      },
      {
        id: 'changes',
        heading: 'Changes to this policy',
        body: [
          {
            type: 'p',
            text: 'We may update this Privacy Policy from time to time. If a change is significant, we will notify you through the service or by email. The "Last updated" date above indicates the latest version.',
          },
        ],
      },
      {
        id: 'contact',
        heading: 'Contact',
        body: [
          {
            type: 'p',
            text: 'For privacy questions or requests, contact us at contact@kodapos.app.',
          },
        ],
      },
    ],
  },
};
