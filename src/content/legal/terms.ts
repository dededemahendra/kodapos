import type { LegalContent } from './types';

/**
 * Terms of Service content. Indonesian and English are maintained side by side
 * here (not in the lingui catalog) so the full document stays readable for legal
 * review. Bracketed values are placeholders to complete before public launch.
 */
export const TERMS: LegalContent = {
  id: {
    title: 'Syarat Layanan',
    effectiveDate: '21 Juni 2026',
    intro:
      'Syarat Layanan ini mengatur penggunaan Anda atas aplikasi dan layanan kodapos. Dengan membuat akun atau menggunakan layanan, Anda menyetujui syarat berikut. Mohon dibaca dengan saksama.',
    sections: [
      {
        id: 'acceptance',
        heading: 'Penerimaan ketentuan',
        body: [
          {
            type: 'p',
            text: 'Layanan kodapos disediakan oleh Dede Mahendra (selanjutnya disebut "kami"). Dengan mendaftar atau menggunakan layanan, Anda menyatakan telah membaca, memahami, dan menyetujui Syarat Layanan ini beserta Kebijakan Privasi kami.',
          },
          {
            type: 'p',
            text: 'Jika Anda menggunakan layanan atas nama sebuah usaha, Anda menyatakan berwenang untuk mengikat usaha tersebut pada syarat ini. Jika Anda tidak menyetujui syarat ini, mohon untuk tidak menggunakan layanan.',
          },
        ],
      },
      {
        id: 'service',
        heading: 'Tentang layanan',
        body: [
          {
            type: 'p',
            text: 'kodapos adalah aplikasi kasir (point of sale) untuk kafe dan restoran, mencakup pencatatan penjualan, pengelolaan menu dan stok, laporan, serta fitur pendukung lain. Fitur dapat ditambah, diubah, atau dihentikan dari waktu ke waktu.',
          },
          {
            type: 'p',
            text: 'Sebagian fitur menggunakan kecerdasan buatan (AI) untuk memberikan ringkasan, estimasi, dan saran. Keluaran AI bisa keliru. Periksa informasi penting sebelum mengambil keputusan bisnis, dan jangan menggunakannya sebagai satu-satunya dasar keputusan.',
          },
        ],
      },
      {
        id: 'accounts',
        heading: 'Akun dan keamanan',
        body: [
          {
            type: 'p',
            text: 'Anda bertanggung jawab menjaga kerahasiaan kredensial akun dan atas semua aktivitas yang terjadi di bawah akun Anda. Beri tahu kami segera jika ada penggunaan tanpa izin.',
          },
          {
            type: 'p',
            text: 'Anda wajib memberikan informasi yang benar dan menjaganya tetap mutakhir. Anda bertanggung jawab atas pengelolaan akses staf yang Anda undang ke dalam akun usaha Anda.',
          },
        ],
      },
      {
        id: 'acceptable-use',
        heading: 'Penggunaan yang wajar',
        body: [
          { type: 'p', text: 'Anda setuju untuk tidak:' },
          {
            type: 'list',
            items: [
              'Menggunakan layanan untuk kegiatan yang melanggar hukum yang berlaku.',
              'Mengganggu, merusak, atau mencoba mengakses sistem tanpa izin.',
              'Menyalahgunakan layanan untuk mengirim spam atau konten berbahaya.',
              'Menyalin, menjual kembali, atau merekayasa balik bagian mana pun dari layanan tanpa izin tertulis.',
            ],
          },
        ],
      },
      {
        id: 'your-data',
        heading: 'Konten dan data Anda',
        body: [
          {
            type: 'p',
            text: 'Data yang Anda masukkan, termasuk menu, transaksi, dan data pelanggan, tetap menjadi milik Anda. Anda memberikan kami izin terbatas untuk memproses data tersebut semata-mata untuk menyediakan dan meningkatkan layanan, sesuai Kebijakan Privasi.',
          },
          {
            type: 'p',
            text: 'Anda bertanggung jawab memastikan bahwa Anda berhak mengumpulkan dan memproses data pelanggan yang Anda simpan di kodapos, termasuk memenuhi kewajiban Anda sebagai pengendali data atas pelanggan Anda.',
          },
        ],
      },
      {
        id: 'pricing',
        heading: 'Harga dan pembayaran',
        body: [
          {
            type: 'p',
            text: 'Selama masa akses awal, layanan inti disediakan tanpa biaya. Paket berbayar dan harganya akan diumumkan sebelum masa akses awal berakhir, dan Anda dapat memilih untuk berlangganan atau berhenti pada saat itu.',
          },
          {
            type: 'p',
            text: 'Biaya transaksi pembayaran (misalnya QRIS) dapat dikenakan oleh penyedia pembayaran pihak ketiga sesuai ketentuan mereka, terpisah dari biaya layanan kodapos.',
          },
        ],
      },
      {
        id: 'third-party',
        heading: 'Layanan pihak ketiga',
        body: [
          {
            type: 'p',
            text: 'Layanan dapat terhubung dengan penyedia pihak ketiga, seperti pemrosesan pembayaran QRIS, pengiriman email, pesan WhatsApp, dan penyedia AI. Penggunaan layanan pihak ketiga tunduk pada syarat dan kebijakan privasi masing-masing penyedia, dan kami tidak bertanggung jawab atas tindakan mereka.',
          },
        ],
      },
      {
        id: 'availability',
        heading: 'Ketersediaan layanan',
        body: [
          {
            type: 'p',
            text: 'Kami berupaya menjaga layanan tetap tersedia, tetapi tidak menjamin layanan akan selalu bebas gangguan atau kesalahan. Kami dapat melakukan pemeliharaan, pembaruan, atau perubahan yang sewaktu-waktu memengaruhi ketersediaan.',
          },
          {
            type: 'p',
            text: 'Kami menganjurkan Anda menyimpan catatan penting Anda sendiri sebagai cadangan jika diperlukan untuk kegiatan usaha Anda.',
          },
        ],
      },
      {
        id: 'disclaimer',
        heading: 'Penafian dan batas tanggung jawab',
        body: [
          {
            type: 'p',
            text: 'Sepanjang diizinkan hukum yang berlaku, layanan disediakan "sebagaimana adanya" tanpa jaminan dalam bentuk apa pun. Kami tidak bertanggung jawab atas kerugian tidak langsung, insidental, atau konsekuensial yang timbul dari penggunaan atau ketidakmampuan menggunakan layanan.',
          },
          {
            type: 'p',
            text: 'Bagian ini tidak membatasi tanggung jawab yang tidak dapat dikecualikan menurut hukum yang berlaku.',
          },
        ],
      },
      {
        id: 'termination',
        heading: 'Penghentian',
        body: [
          {
            type: 'p',
            text: 'Anda dapat berhenti menggunakan layanan kapan saja. Kami dapat menangguhkan atau menghentikan akses Anda jika Anda melanggar syarat ini atau jika diperlukan untuk melindungi layanan atau pengguna lain.',
          },
          {
            type: 'p',
            text: 'Setelah penghentian, ketentuan yang menurut sifatnya tetap berlaku (seperti batas tanggung jawab) akan terus berlaku. Penanganan data setelah penghentian dijelaskan dalam Kebijakan Privasi.',
          },
        ],
      },
      {
        id: 'changes',
        heading: 'Perubahan ketentuan',
        body: [
          {
            type: 'p',
            text: 'Kami dapat memperbarui syarat ini dari waktu ke waktu. Jika ada perubahan penting, kami akan memberi tahu melalui layanan atau email. Dengan terus menggunakan layanan setelah perubahan berlaku, Anda dianggap menyetujui syarat yang diperbarui.',
          },
        ],
      },
      {
        id: 'governing-law',
        heading: 'Hukum yang berlaku',
        body: [
          {
            type: 'p',
            text: 'Syarat ini diatur oleh dan ditafsirkan berdasarkan hukum Republik Indonesia. Setiap sengketa yang timbul akan diselesaikan terlebih dahulu secara musyawarah, dan jika tidak tercapai, melalui pengadilan yang berwenang di Indonesia.',
          },
        ],
      },
      {
        id: 'contact',
        heading: 'Hubungi kami',
        body: [
          {
            type: 'p',
            text: 'Untuk pertanyaan tentang Syarat Layanan ini, hubungi kami di contact@kodapos.app.',
          },
        ],
      },
    ],
  },
  en: {
    title: 'Terms of Service',
    effectiveDate: '21 June 2026',
    intro:
      'These Terms of Service govern your use of the kodapos application and services. By creating an account or using the services, you agree to the terms below. Please read them carefully.',
    sections: [
      {
        id: 'acceptance',
        heading: 'Acceptance of terms',
        body: [
          {
            type: 'p',
            text: 'The kodapos service is provided by Dede Mahendra (referred to as "we" or "us"). By signing up or using the service, you confirm that you have read, understood, and agree to these Terms of Service and our Privacy Policy.',
          },
          {
            type: 'p',
            text: 'If you use the service on behalf of a business, you represent that you are authorized to bind that business to these terms. If you do not agree, please do not use the service.',
          },
        ],
      },
      {
        id: 'service',
        heading: 'About the service',
        body: [
          {
            type: 'p',
            text: 'kodapos is a point of sale application for cafes and restaurants, covering sales recording, menu and stock management, reports, and other supporting features. Features may be added, changed, or discontinued over time.',
          },
          {
            type: 'p',
            text: 'Some features use artificial intelligence (AI) to provide summaries, estimates, and suggestions. AI output can be wrong. Check important information before making business decisions, and do not rely on it as the sole basis for a decision.',
          },
        ],
      },
      {
        id: 'accounts',
        heading: 'Accounts and security',
        body: [
          {
            type: 'p',
            text: 'You are responsible for keeping your account credentials confidential and for all activity that happens under your account. Notify us promptly of any unauthorized use.',
          },
          {
            type: 'p',
            text: 'You must provide accurate information and keep it up to date. You are responsible for managing access for any staff you invite into your business account.',
          },
        ],
      },
      {
        id: 'acceptable-use',
        heading: 'Acceptable use',
        body: [
          { type: 'p', text: 'You agree not to:' },
          {
            type: 'list',
            items: [
              'Use the service for any activity that violates applicable law.',
              'Disrupt, damage, or attempt to access systems without authorization.',
              'Misuse the service to send spam or harmful content.',
              'Copy, resell, or reverse engineer any part of the service without written permission.',
            ],
          },
        ],
      },
      {
        id: 'your-data',
        heading: 'Your content and data',
        body: [
          {
            type: 'p',
            text: 'The data you enter, including menus, transactions, and customer data, remains yours. You grant us a limited license to process that data solely to provide and improve the service, as described in our Privacy Policy.',
          },
          {
            type: 'p',
            text: 'You are responsible for ensuring you have the right to collect and process the customer data you store in kodapos, including meeting your own obligations as the controller of your customers data.',
          },
        ],
      },
      {
        id: 'pricing',
        heading: 'Pricing and payment',
        body: [
          {
            type: 'p',
            text: 'During the early access period, core features are provided at no cost. Paid plans and their prices will be announced before the early access period ends, and you may choose to subscribe or stop at that time.',
          },
          {
            type: 'p',
            text: 'Payment transaction fees (for example QRIS) may be charged by third party payment providers under their own terms, separate from any kodapos service fee.',
          },
        ],
      },
      {
        id: 'third-party',
        heading: 'Third party services',
        body: [
          {
            type: 'p',
            text: 'The service may connect with third party providers, such as QRIS payment processing, email delivery, WhatsApp messaging, and AI providers. Use of third party services is subject to each provider\'s own terms and privacy policy, and we are not responsible for their actions.',
          },
        ],
      },
      {
        id: 'availability',
        heading: 'Service availability',
        body: [
          {
            type: 'p',
            text: 'We strive to keep the service available, but we do not guarantee it will always be uninterrupted or error free. We may perform maintenance, updates, or changes that affect availability from time to time.',
          },
          {
            type: 'p',
            text: 'We encourage you to keep your own records of important information as a backup where your business needs it.',
          },
        ],
      },
      {
        id: 'disclaimer',
        heading: 'Disclaimers and limitation of liability',
        body: [
          {
            type: 'p',
            text: 'To the extent permitted by applicable law, the service is provided "as is" without warranties of any kind. We are not liable for indirect, incidental, or consequential damages arising from your use of, or inability to use, the service.',
          },
          {
            type: 'p',
            text: 'This section does not limit liability that cannot be excluded under applicable law.',
          },
        ],
      },
      {
        id: 'termination',
        heading: 'Termination',
        body: [
          {
            type: 'p',
            text: 'You may stop using the service at any time. We may suspend or terminate your access if you breach these terms or where necessary to protect the service or other users.',
          },
          {
            type: 'p',
            text: 'After termination, provisions that by their nature should survive (such as the limitation of liability) will continue to apply. How data is handled after termination is described in the Privacy Policy.',
          },
        ],
      },
      {
        id: 'changes',
        heading: 'Changes to these terms',
        body: [
          {
            type: 'p',
            text: 'We may update these terms from time to time. If a change is significant, we will notify you through the service or by email. By continuing to use the service after a change takes effect, you accept the updated terms.',
          },
        ],
      },
      {
        id: 'governing-law',
        heading: 'Governing law',
        body: [
          {
            type: 'p',
            text: 'These terms are governed by and construed in accordance with the laws of the Republic of Indonesia. Any dispute will first be resolved amicably, and if not resolved, through the competent courts of Indonesia.',
          },
        ],
      },
      {
        id: 'contact',
        heading: 'Contact us',
        body: [
          {
            type: 'p',
            text: 'For questions about these Terms of Service, contact us at contact@kodapos.app.',
          },
        ],
      },
    ],
  },
};
