# PRD - Smart Warehouse Firaza

> **Status dokumen:** PRD kanonik — sumber utama kebutuhan produk Smart Warehouse Firaza.
> **Revisi:** Gelombang 2a, 29 Oktober 2026. Pembaruan 30 Oktober 2026: Catatan Owner (FR-NOTE), FR-AUTH-04 dan FR-AUTH-05, OD-21 sampai OD-29, serta penutupan OD-15 melalui STACK-DECISION-LOG ADR-12.
>
> - PRD ini menjadi acuan untuk kebutuhan produk dan aturan bisnis. Keputusan teknologi mengacu pada [STACK-DECISION-LOG.md](STACK-DECISION-LOG.md). Jika terjadi konflik lintas dokumen, konflik tersebut harus dilaporkan untuk diputuskan; jangan menganggap salah satu dokumen otomatis mengungguli dokumen lainnya.
> - [PRD-Smart-Warehouse-Firaza-Professional.md](PRD-Smart-Warehouse-Firaza-Professional.md) bersifat historis; kebutuhan yang masih valid darinya sudah dikonsolidasikan ke dokumen ini.
> - Seluruh fitur di dokumen ini berstatus **[RENCANA — belum diimplementasikan]**. Yang sudah ada baru fondasi aplikasi Next.js dengan Tailwind CSS v4 dan shadcn/ui (STACK-DECISION-LOG ADR-12): halaman awal tanpa data yang lulus production build. Belum ada fitur bisnis, autentikasi, maupun database yang diimplementasikan.

## Legenda Label Sumber

| Label | Arti |
|---|---|
| [BRIEF-dilaporkan] | Isi brief use-case Dicoding sebagaimana dilaporkan pengguna. File brief tidak tersedia di workspace sehingga belum diverifikasi langsung. |
| [PDF hlm.1] | Tertulis di `List Tech Stack [Dicoding Bootcamp Batch 15] - Tipe Capstone_ Individu.pdf`, halaman 1, kolom Full-Stack Web Developer kecuali disebut lain. |
| [ADVISOR] | Tercatat di lembar diskusi advisor, sesi 1:1 tanggal 24 Oktober 2026, bagian "Saran dari Advisor". |
| [KEPUTUSAN] | Keputusan final yang disetujui developer (bertindak sebagai Owner produk). |
| [DITURUNKAN] | Konsekuensi langsung dari keputusan final; bukan keputusan baru. |
| [ASUMSI] | Asumsi operasional yang dipakai karena pihak UMKM tidak dapat dikonfirmasi lebih lanjut. Bukan pernyataan klien. |
| [OPEN DECISION OD-xx] | Belum diputuskan. Pilihan, trade-off, dan rekomendasi dicatat; tidak boleh dianggap disetujui. |
| [Pending Confirmation] | Status persyaratan brief yang perlu dikonfirmasi ke advisor atau tim Dicoding. |
| [RENCANA — belum diimplementasikan] | Fitur atau desain yang direncanakan tetapi belum dibangun maupun diuji. |

Informasi yang berasal dari dokumentasi sebelumnya atau disampaikan langsung oleh pengguna dijelaskan asalnya dalam teks biasa, bukan dengan label.

## Product Overview

Smart Warehouse Firaza merupakan aplikasi inventory management berbasis web yang membantu bisnis retail hampers dan personalized gift dalam melakukan digitalisasi pengelolaan warehouse. Sistem ini membantu owner dan staff warehouse melakukan monitoring, pencatatan, dan pengelolaan inventory secara lebih terstruktur melalui pengelolaan raw material, transaksi stok, stock opname, dashboard monitoring, dan laporan inventory. (berasal dari dokumentasi sebelumnya)

## Background

Firaza merupakan bisnis retail hampers dan personalized gift yang memiliki kebutuhan pengelolaan berbagai material operasional seperti packaging dan material pendukung produk. Karena keterbatasan akses terhadap data operasional internal, sistem menggunakan synthetic dataset yang dirancang berdasarkan asumsi proses bisnis retail hampers. (berasal dari dokumentasi sebelumnya)

Produk Firaza mencakup hampers handuk, sajadah custom, dan kado pernikahan. Material pendukungnya antara lain kardus, pita, packaging, dan bahan pelengkap lainnya. Informasi ini disampaikan pengguna; sumber aslinya belum diverifikasi.

## Problem Statement

Pengelolaan inventory merupakan bagian penting dalam operasional retail karena ketersediaan material berpengaruh terhadap kelancaran fulfillment. Tanpa sistem inventory yang terintegrasi, owner memiliki keterbatasan dalam memperoleh informasi kondisi stok secara cepat dan staff warehouse membutuhkan pencatatan transaksi yang lebih terstruktur. (berasal dari dokumentasi sebelumnya)

Masalah spesifik yang ingin diselesaikan (disampaikan pengguna; sumber aslinya belum diverifikasi):

- Pengelolaan material masih manual dan tersebar.
- Visibilitas kondisi stok rendah.
- Material yang hampir habis terlambat diketahui.
- Sulit menentukan prioritas restock.

## Product Goals

- Membantu owner memonitor kondisi inventory.
- Membantu staff warehouse mencatat transaksi stok.
- Menyediakan data inventory yang terstruktur dan dapat diaudit.
- Memberikan informasi kondisi stok melalui dashboard.
- Menyediakan saluran tugas, informasi operasional, dan reminder dari Owner kepada Staff Warehouse melalui Catatan Owner.

Tujuan di atas berasal dari dokumentasi sebelumnya, dengan tambahan "dapat diaudit" sebagai konsekuensi keputusan audit trail [DITURUNKAN]. Tujuan Catatan Owner ditambahkan dari keputusan developer pada 30 Oktober 2026 [KEPUTUSAN].

## Target User dan Persona

Sistem memiliki **dua role**: Owner dan Staff Warehouse. Admin operasional termasuk role Staff Warehouse; tidak ada role ketiga. [KEPUTUSAN]

### Owner

- Pain point: membutuhkan informasi inventory secara cepat; membutuhkan monitoring tanpa pengecekan manual. (berasal dari PRD Professional)
- Goal: memahami kondisi stok dan mendukung keputusan operasional, termasuk prioritas restock.
- Peran: memantau inventori, aktivitas operasional, histori transaksi, dan Stock Opname. Owner tidak menimpa transaksi final. [KEPUTUSAN]
- Terhadap domain inventori, Owner hanya membaca. Satu-satunya hak tulis Owner berada pada Catatan Owner: membuat, mengedit, dan menghapus catatan miliknya, serta menandai catatan yang sudah selesai sebagai "Sudah Ditinjau" (FR-NOTE). Hak ini tidak memberi Owner izin membuat transaksi stok, mengubah jumlah stok, mengubah data inventori sebagai operator, atau menjalankan Stock Opname. [KEPUTUSAN]

### Staff Warehouse

- Pain point: membutuhkan pencatatan transaksi yang konsisten dan histori aktivitas inventory. (berasal dari PRD Professional)
- Goal: mengelola stok dengan mudah dan benar.
- Peran: menjalankan aktivitas gudang: kategori, material, Stock In, Stock Out, koreksi, dan Stock Opname. [KEPUTUSAN]
- Pada Catatan Owner, Staff Warehouse membaca catatan, menandai pekerjaan selesai, serta menulis dan memperbarui feedback sebelum catatan ditinjau Owner (FR-NOTE). [KEPUTUSAN]

### Matriks Hak Akses

| Aktivitas | Owner | Staff Warehouse | Sumber |
|---|---|---|---|
| Login dan logout | Ya | Ya | [KEPUTUSAN] |
| Melihat dashboard, inventori, histori transaksi, laporan, dan sesi Stock Opname | Ya | Ya | [KEPUTUSAN] |
| Mengelola kategori | Tidak | Ya | (berasal dari dokumentasi sebelumnya) |
| Mengelola material, termasuk hapus, arsip, dan reaktivasi | Tidak | Ya | [KEPUTUSAN] |
| Stock In dan Stock Out | Tidak | Ya | [KEPUTUSAN] |
| Mencatat saldo awal (`OPENING_BALANCE`) | Tidak | Belum diputuskan | Owner: aturan dari dokumentasi sebelumnya bahwa Owner tidak mengubah stok secara langsung; Staff: [OPEN DECISION OD-17] |
| Koreksi transaksi final (REVERSAL + pengganti) | Tidak | Ya | [KEPUTUSAN] |
| Membuat sesi Stock Opname | Tidak | Ya | [KEPUTUSAN] |
| Menambah item dan mengisi hasil hitung pada sesi buatan Staff lain | Tidak | Belum diputuskan | [OPEN DECISION OD-02] |
| Memposting sesi buatan Staff lain | Tidak | Belum diputuskan | [OPEN DECISION OD-16] |
| Membatalkan sesi aktif milik siapa pun, dengan alasan wajib | Tidak | Ya | [KEPUTUSAN] |
| Mengedit atau menghapus transaksi final | Tidak | Tidak | [KEPUTUSAN] |
| Membuat Catatan Owner | Ya | Tidak | [KEPUTUSAN] |
| Membaca Catatan Owner beserta kondisi penyelesaian, kondisi peninjauan, dan feedback | Ya | Ya | [KEPUTUSAN] |
| Mengedit atau menghapus Catatan Owner miliknya | Ya | Tidak | [KEPUTUSAN]; setelah catatan selesai atau ditinjau: [OPEN DECISION OD-24]; metode hapus: [OPEN DECISION OD-25] |
| Menandai catatan selesai (checklist "Selesai") | Tidak | Ya | [KEPUTUSAN] |
| Menulis dan memperbarui feedback, selama catatan belum ditinjau | Tidak | Ya | [KEPUTUSAN] |
| Menandai catatan yang sudah selesai sebagai "Sudah Ditinjau" | Ya | Tidak | [KEPUTUSAN] |
| Membuka Riwayat Catatan | Ya | Belum diputuskan | Owner: [KEPUTUSAN]; Staff: [OPEN DECISION OD-27] |

Otorisasi ditegakkan di backend dan database. Menyembunyikan tombol di UI bukan bentuk otorisasi. [KEPUTUSAN] Hak tulis Owner terbatas pada Catatan Owner; terhadap inventori Owner tetap hanya membaca. [KEPUTUSAN]

## Pemetaan Fitur Brief ke Requirement

| Fitur MVP pada brief [BRIEF-dilaporkan] | Requirement |
|---|---|
| Material CRUD | FR-MAT, FR-CAT |
| Stock In | FR-TRX-01 |
| Stock Out | FR-TRX-02 |
| Current Stock | FR-TRX, FR-STS |
| Minimum Stock | FR-MAT-01, FR-STS |
| Stock Opname | FR-OPN |
| Transaction History | FR-HIS |

Fitur tambahan dari dokumen lama yang tetap dipertahankan: Authentication dan role, Dashboard, Reporting, Search dan Filter.

Fitur tambahan yang disetujui developer pada 30 Oktober 2026 sebagai bagian MVP: Catatan Owner (FR-NOTE). [KEPUTUSAN]

## Functional Requirements

Detail aturan, validasi, dan pesan error setiap requirement dijabarkan di [FEATURE-SPECIFICATION-Smart-Warehouse-Firaza.md](FEATURE-SPECIFICATION-Smart-Warehouse-Firaza.md). Penegakan di database dijabarkan di [DATABASE-DESIGN-Smart-Warehouse-Firaza.md](DATABASE-DESIGN-Smart-Warehouse-Firaza.md).

### FR-AUTH — Autentikasi dan Otorisasi

- **FR-AUTH-01** Pengguna login dan logout memakai email dan password melalui Supabase Auth. [KEPUTUSAN] [ADVISOR]
- **FR-AUTH-02** Tidak ada registrasi publik: public signup di Supabase Auth dinonaktifkan. Akun Owner dan Staff Warehouse dibuat developer melalui provisioning manual; profil dan role disiapkan melalui prosedur admin terkontrol, tanpa trigger otomatis untuk membuat profil. [KEPUTUSAN] (STACK-DECISION-LOG ADR-11)
- **FR-AUTH-03** Setiap operasi terlindungi memvalidasi sesi dan role di server, dan akses data dibatasi di database. [KEPUTUSAN]
- **FR-AUTH-04** Akses akun dapat dinonaktifkan tanpa menghapus profil maupun histori audit yang terkait. Pengguna yang dinonaktifkan tidak boleh tetap memperoleh akses ke fitur bisnis aplikasi, dan sesi aktifnya harus ditangani secara aman. [KEPUTUSAN] (ADR-11) Mekanisme teknis penonaktifan akun dan penanganan sesi aktif belum diputuskan. [OPEN DECISION OD-29]
- **FR-AUTH-05** Role hanya dapat ditetapkan atau diubah melalui proses admin terkontrol; pengguna tidak dapat menetapkan atau menaikkan role sendiri. Autentikasi yang berhasil tidak otomatis memberi otorisasi: pengguna tanpa profil valid atau tanpa hak akses yang sah tidak dapat mengakses fitur bisnis aplikasi, termasuk inventori dan Catatan Owner. Penolakan ini merupakan otorisasi aplikasi, bukan penolakan login di Supabase Auth. [KEPUTUSAN] (ADR-11)

### FR-CAT — Kategori Material

- **FR-CAT-01** Staff Warehouse dapat membuat, melihat, mengubah, dan menghapus kategori. (berasal dari dokumentasi sebelumnya)
- **FR-CAT-02** Penghapusan kategori ditolak selama kategori masih digunakan material mana pun, termasuk material yang diarsipkan. Tidak ada cascading delete. [KEPUTUSAN]
- **FR-CAT-03** Nama kategori unik tanpa membedakan huruf besar/kecil; "Packaging Material" dan "packaging material" dianggap nama yang sama. [KEPUTUSAN] (Keputusan A) Normalisasi spasi di awal/akhir nama belum diputuskan. [OPEN DECISION OD-19]

### FR-MAT — Material

- **FR-MAT-01** Staff Warehouse dapat membuat dan mengubah material: nama, kategori, satuan dasar, dan `minimum_stock` (bilangan bulat ≥ 0). [KEPUTUSAN] Pengubahan material arsip mengikuti FR-MAT-11.
- **FR-MAT-02** Setiap material wajib memiliki satuan dasar yang eksplisit dan konsisten (misalnya pcs, pack, roll, lembar). Satuan tidak dipaksakan sama untuk semua material. [KEPUTUSAN]
- **FR-MAT-03** Satuan tidak dapat diubah setelah material memiliki transaksi atau tercatat dalam sesi Stock Opname. [DITURUNKAN dari "satuan eksplisit dan konsisten"]
- **FR-MAT-04** `current_stock` tidak dapat diubah melalui form material; stok hanya berubah lewat transaksi dan posting Stock Opname. (berasal dari dokumentasi sebelumnya)
- **FR-MAT-05** Material hanya dapat dihapus permanen jika belum memiliki riwayat transaksi. [KEPUTUSAN] Material yang pernah tercatat dalam sesi Stock Opname juga tidak dapat dihapus karena direferensikan oleh catatan audit. [DITURUNKAN] Material yang memiliki riwayat pengarsipan atau reaktivasi di `material_status_events` juga tidak dapat dihapus permanen. [KEPUTUSAN] (Keputusan B)
- **FR-MAT-06** Material hanya dapat diarsipkan jika stoknya nol. Alasan wajib diisi dan peristiwa dicatat di `material_status_events`. [KEPUTUSAN]
- **FR-MAT-07** Material arsip tidak dapat digunakan dalam Stock In, Stock Out, atau sesi Stock Opname baru; histori transaksinya tetap tersedia. [KEPUTUSAN]
- **FR-MAT-08** Reaktivasi material memerlukan alasan wajib dan dicatat di `material_status_events`. [KEPUTUSAN] Reaktivasi adalah satu-satunya jalan agar material arsip dapat diedit kembali (FR-MAT-11).
- **FR-MAT-09** **Pertanyaan terbuka [OPEN DECISION OD-05]:** apakah material yang sedang dibekukan karena berada dalam sesi Stock Opname aktif boleh diarsipkan, jika stoknya nol? Rekomendasi (belum disetujui): **tolak** pengarsipan selama material dibekukan, agar material tidak berubah status di tengah penghitungan fisik. Sampai diputuskan, aturan ini tidak dianggap final.
- **FR-MAT-10** Nama material unik tanpa membedakan huruf besar/kecil. Nama material arsip tetap dianggap terpakai, sehingga material baru tidak dapat memakai nama yang sama. [KEPUTUSAN] (Keputusan A) Normalisasi spasi di awal/akhir nama belum diputuskan. [OPEN DECISION OD-19]
- **FR-MAT-11** Material arsip tidak dapat diedit; seluruh field, termasuk nama, kategori, dan `minimum_stock`, hanya dapat diubah setelah material direaktivasi melalui proses resmi (FR-MAT-08). [KEPUTUSAN] (Keputusan F) Setelah reaktivasi, pembatasan perubahan satuan pada FR-MAT-03 tetap berlaku.

### FR-TRX — Transaksi Stok

- **FR-TRX-01** Stock In: Staff memilih material dan memasukkan jumlah positif; stok bertambah. [BRIEF-dilaporkan] [KEPUTUSAN]
- **FR-TRX-02** Stock Out: Staff memasukkan jumlah positif; dampak yang disimpan bernilai negatif. Transaksi ditolak jika stok tidak mencukupi. [BRIEF-dilaporkan] [KEPUTUSAN]
- **FR-TRX-03** Setiap perubahan stok tercatat sebagai transaksi yang dapat diaudit, dengan `quantity_delta` bertanda (positif menambah, negatif mengurangi), pelaku, waktu, dan catatan. [KEPUTUSAN]
- **FR-TRX-04** Stock In/Out menjadi transaksi final saat penyimpanan berhasil. Draft formulir tidak disimpan di database. [KEPUTUSAN]
- **FR-TRX-05** Request yang dikirim ulang dengan idempotency key yang sama tidak menggandakan perubahan stok. Key yang sama dengan payload berbeda ditolak. [KEPUTUSAN] Ketentuan idempotency [KEPUTUSAN] (Keputusan E):
  - Key unik per pengguna (pasangan pengguna dan key), dicatat dalam satu tabel idempotency yang dipakai lintas operasi mutasi yang relevan. Untuk inventori, operasi tersebut adalah Stock In/Out dan koreksi transaksi final. Mekanisme yang sama juga dipakai pembuatan Catatan Owner (FR-NOTE-21); keunikan pasangan pengguna dan key berlaku lintas operasi tersebut.
  - Request ulang dengan key dan payload yang sama mengembalikan hasil operasi pertama tanpa mengulang mutasi (replay).
  - Tidak ada kedaluwarsa atau penghapusan otomatis catatan idempotency sebelum kebijakan retensi disetujui.
  - Operasi lain, seperti posting dan pembatalan sesi Stock Opname, mencegah duplikasi melalui pemeriksaan status atau constraint; request ulangnya ditolak, bukan di-replay. (DATABASE-DESIGN §9.1)
  - Idempotency untuk pembuatan sesi Stock Opname belum diputuskan. [OPEN DECISION OD-20]
- **FR-TRX-06** Transaksi ditolak jika material sedang dibekukan oleh sesi Stock Opname aktif atau sudah diarsipkan. [KEPUTUSAN]
- **FR-TRX-07** Kuantitas berupa bilangan bulat > 0. Stok tidak pernah negatif; validasi berlaku di API dan database, bukan hanya UI. [KEPUTUSAN]
- **FR-TRX-08** Saldo stok dan histori transaksi berubah dalam satu operasi atomik. [KEPUTUSAN]
- **FR-TRX-09** Saldo awal material dicatat sebagai transaksi bertipe `OPENING_BALANCE`. [KEPUTUSAN] Aturan dan validasinya belum diputuskan. [OPEN DECISION OD-17]

Tipe transaksi yang dikenal sistem: `OPENING_BALANCE`, `STOCK_IN`, `STOCK_OUT`, `ADJUSTMENT`, `REVERSAL`. [KEPUTUSAN]

### FR-COR — Koreksi Transaksi Final

- **FR-COR-01** Transaksi final tidak dapat diedit atau dihapus oleh siapa pun. Owner dapat meninjau histori tetapi tidak dapat menimpanya. [KEPUTUSAN]
- **FR-COR-02** Koreksi dilakukan dengan transaksi `REVERSAL` yang merujuk transaksi awal dan membalik efeknya, ditambah transaksi pengganti yang mencatat nilai benar. Keduanya diproses atomik dan alasan koreksi wajib diisi. [KEPUTUSAN]
- **FR-COR-03** Penyesuaian dari sesi Stock Opname yang telah diposting dikoreksi melalui sesi Stock Opname baru, bukan `REVERSAL`. [KEPUTUSAN]
- **FR-COR-04** Koreksi ditolak jika material terkait sedang dibekukan [DITURUNKAN dari aturan pembekuan] atau jika hasilnya membuat stok negatif [DITURUNKAN dari larangan stok negatif]. Koreksi yang menulis transaksi pengubah stok, yaitu `REVERSAL` maupun transaksi pengganti, pada material yang diarsipkan juga ditolak sampai material tersebut direaktivasi sesuai FR-MAT-08; pemeriksaan ini berlaku untuk setiap material yang stoknya dimutasi oleh koreksi. Histori transaksi material arsip tetap dapat dibaca. [KEPUTUSAN]
- **FR-COR-05** Koreksi memakai mekanisme idempotency yang sama dengan Stock In/Out. [KEPUTUSAN]
- **FR-COR-06** Aturan koreksi berulang [KEPUTUSAN] (Keputusan D):
  - Satu transaksi asal paling banyak memiliki satu `REVERSAL`.
  - Transaksi bertipe `REVERSAL` tidak dapat di-reverse.
  - Transaksi pengganti adalah transaksi biasa sehingga dapat dikoreksi kembali dengan pola yang sama.
  - Transaksi asal, `REVERSAL`, dan transaksi pengganti tetap tersimpan tanpa diedit atau dihapus.
- Kasus belum terdefinisi: transaksi duplikat tanpa nilai pengganti [OPEN DECISION OD-09]; pengganti dengan material atau tipe berbeda [OPEN DECISION OD-10]; koreksi transaksi `OPENING_BALANCE` termasuk lingkup [OPEN DECISION OD-17].

### FR-OPN — Stock Opname Berbasis Sesi

- **FR-OPN-01** Stock Opname berbentuk sesi yang dapat mencakup banyak material dan dibuat oleh Staff Warehouse. [KEPUTUSAN]
- **FR-OPN-02** Status sesi: `ACTIVE` → `POSTED` atau `CANCELLED`. Tidak ada tahap persetujuan Owner. [DITURUNKAN dari keputusan posting langsung tanpa persetujuan Owner]
- **FR-OPN-03** Material dapat ditambahkan selama sesi masih aktif; material arsip tidak dapat ditambahkan. [KEPUTUSAN]
- **FR-OPN-04** Stock In, Stock Out, dan operasi lain yang mengubah stok ditolak untuk material yang berada di sesi aktif. Material di luar sesi tidak ikut dibekukan. Pembekuan ditegakkan di database dengan operasi atomik dan row locking. [KEPUTUSAN] Penanda pembekuan adalah kolom `materials.active_opname_id` yang menunjuk sesi aktif; pembekuan dilepas dalam operasi yang sama dengan posting (FR-OPN-10) atau pembatalan (FR-OPN-14). [KEPUTUSAN] (Keputusan C; DATABASE-DESIGN §4.3, §11)
- **FR-OPN-05** Satu material hanya dapat berada di satu sesi aktif; sesi aktif berbeda boleh berjalan bersamaan hanya jika materialnya tidak beririsan. [KEPUTUSAN]
- **FR-OPN-06** Hasil hitung (bilangan bulat ≥ 0) dapat diedit sebelum posting. [KEPUTUSAN]
- **FR-OPN-07** Setiap item menyimpan hasil hitung terakhir beserta metadata pelaku dan waktu pengisian atau perubahan terakhir. Metadata ini **bukan** riwayat lengkap revisi nilai: nilai-nilai sebelumnya tidak disimpan di MVP. [KEPUTUSAN]
- **FR-OPN-08** Posting ditolak jika masih ada material yang belum dihitung. [KEPUTUSAN]
- **FR-OPN-09** Sesi tanpa item tidak dapat diposting dan hanya dapat dibatalkan. [KEPUTUSAN]
- **FR-OPN-10** Posting bersifat atomik: seluruh penyesuaian sesi berhasil bersama atau gagal tanpa perubahan stok parsial, dan pembekuan dilepas dalam operasi yang sama. [KEPUTUSAN]
- **FR-OPN-11** Hasil hitung dengan selisih nol tetap disimpan, tetapi tidak menghasilkan transaksi `ADJUSTMENT`. [KEPUTUSAN]
- **FR-OPN-12** Setiap transaksi `ADJUSTMENT` dapat ditelusuri ke sesi dan item Stock Opname terkait. [KEPUTUSAN]
- **FR-OPN-13** Staff Warehouse dapat langsung menerapkan penyesuaian setelah sesi selesai; Owner memantau proses dan hasil. [KEPUTUSAN]
- **FR-OPN-14** Semua Staff Warehouse dapat membatalkan sesi aktif, termasuk buatan Staff lain. Alasan wajib; pelaku, waktu, dan alasan dicatat; stok tidak berubah; pembekuan dilepas secara atomik; `CANCELLED` bersifat terminal. [KEPUTUSAN]
- **FR-OPN-15** Sesi `POSTED` tidak dapat dibatalkan melalui mekanisme pembatalan sesi aktif. [KEPUTUSAN]
- **FR-OPN-16** Sesi Stock Opname tidak kedaluwarsa secara otomatis pada MVP. [KEPUTUSAN]
- **FR-OPN-17** Blind count tidak diwajibkan untuk MVP. [KEPUTUSAN]
- Belum diputuskan: OD-01, OD-02, OD-05, OD-16 (lihat Inventaris Keputusan).

### FR-STS — Status Stok Operasional

- **FR-STS-01** Status ditentukan secara deterministik dari `current_stock` dan `minimum_stock` [KEPUTUSAN]:

| Status | Kondisi |
|---|---|
| `OUT_OF_STOCK` | `current_stock == 0` |
| `LOW_STOCK` | `current_stock > 0` dan `current_stock <= minimum_stock` |
| `NORMAL` | `current_stock > minimum_stock` |

- **FR-STS-02** Status operasional dihitung dari data, tidak diinput manual, dan tidak dicampur dengan klasifikasi AI. [KEPUTUSAN]
- Status lama "Aman / Perlu Perhatian / Prioritas Restock" pada dokumen sebelumnya digantikan oleh tiga status di atas.

### FR-HIS — Histori Transaksi

- **FR-HIS-01** Histori menampilkan material, tipe transaksi (`OPENING_BALANCE`, `STOCK_IN`, `STOCK_OUT`, `ADJUSTMENT`, `REVERSAL`), `quantity_delta` beserta satuan, pelaku, waktu, catatan atau alasan, serta relasi koreksi dan sesi Stock Opname. [BRIEF-dilaporkan] [KEPUTUSAN]
- **FR-HIS-02** Histori dapat difilter berdasarkan tipe transaksi, material, dan rentang tanggal. (berasal dari dokumentasi sebelumnya)

### FR-DASH — Dashboard

- **FR-DASH-01** Kartu ringkasan: Total Material, Stok Normal, Stok Rendah, Stok Habis. [KEPUTUSAN] Seluruh kartu ringkasan hanya menghitung material aktif; material arsip tidak dihitung. [DITURUNKAN]
- **FR-DASH-02** Tabel material yang perlu perhatian, diurutkan `OUT_OF_STOCK` lalu `LOW_STOCK`. [KEPUTUSAN]
- **FR-DASH-03** Informasi pergerakan stok yang berguna bagi Owner. Kuantitas dengan satuan berbeda tidak dijumlahkan. [DITURUNKAN] Bentuk widget ditentukan saat desain UI.
- **FR-DASH-04** Data contoh yang belum berasal dari database diberi label "DATA DUMMY". [KEPUTUSAN]

Dashboard juga memuat panel Catatan Owner di area utama dan ringkasan Catatan Owner di sidebar, yang diatur di FR-NOTE-12, FR-NOTE-13, dan FR-NOTE-20. Urutan penempatannya dijelaskan di bagian Arah UI/UX.

### FR-NOTE — Catatan Owner

Catatan Owner adalah saluran tugas, informasi operasional, atau reminder dari Owner kepada Staff Warehouse yang ditampilkan di dashboard. Fitur ini bukan chat, komentar bertingkat, notifikasi real-time, maupun penugasan ke banyak penerima. [KEPUTUSAN]

Kondisi fungsional catatan [KEPUTUSAN]:

| Kondisi | Arti | Tampilan |
|---|---|---|
| Belum selesai | Staff Warehouse belum menandai pekerjaan selesai | Teks dan kartu normal |
| Selesai, menunggu tinjauan | Staff Warehouse sudah menandai "Selesai"; Owner belum menandai "Sudah Ditinjau" | Teks dicoret, kartu redup tetapi terbaca, label "Menunggu Tinjauan" |
| Selesai, sudah ditinjau | Owner sudah menandai "Sudah Ditinjau" | Teks dicoret, kartu redup tetapi terbaca, label "Sudah Ditinjau"; feedback terkunci |

Checklist "Selesai" (aksi Staff Warehouse) dan checklist "Sudah Ditinjau" (aksi Owner) adalah dua aksi terpisah dengan status yang tersimpan terpisah. Teks yang dicoret menandakan pekerjaan selesai, bukan bahwa Owner sudah meninjau.

- **FR-NOTE-01** Owner dapat membuat catatan dengan isi tidak kosong. Tidak ada batas jumlah catatan yang dapat dibuat per hari. [KEPUTUSAN]
- **FR-NOTE-02** Owner dan Staff Warehouse dapat membaca catatan beserta kondisi penyelesaian, kondisi peninjauan, dan feedback-nya, sesuai hak akses masing-masing; akses ke Riwayat Catatan mengikuti FR-NOTE-14. [KEPUTUSAN]
- **FR-NOTE-03** Owner dapat mengedit isi catatan miliknya. [KEPUTUSAN] Aturan edit setelah catatan selesai atau ditinjau belum diputuskan. [OPEN DECISION OD-24]
- **FR-NOTE-04** Owner dapat menghapus catatan miliknya. [KEPUTUSAN] Aturan hapus setelah catatan selesai atau ditinjau belum diputuskan [OPEN DECISION OD-24], begitu pula metode penghapusannya [OPEN DECISION OD-25].
- **FR-NOTE-05** Catatan baru berada dalam kondisi belum selesai. [KEPUTUSAN]
- **FR-NOTE-06** Staff Warehouse dapat menandai catatan selesai melalui checklist "Selesai". Satu catatan hanya memiliki satu penyelesai; identitas penyelesai dan waktu penyelesaian dicatat. [KEPUTUSAN] Catatan yang sudah selesai tidak dapat diselesaikan ulang oleh pengguna lain. [DITURUNKAN dari aturan satu penyelesai] Pembatalan checklist "Selesai" belum diputuskan. [OPEN DECISION OD-26]
- **FR-NOTE-07** Staff Warehouse dapat menulis feedback di bawah catatan Owner; penulis dan waktu feedback dicatat. [KEPUTUSAN] Kewajiban mengisi feedback sebelum checklist "Selesai", serta boleh tidaknya feedback ditulis sebelum catatan selesai, belum diputuskan [OPEN DECISION OD-21]. Struktur feedback, yaitu satu record atau berversi, belum diputuskan [OPEN DECISION OD-22].
- **FR-NOTE-08** Staff Warehouse dapat memperbarui feedback selama catatan belum ditinjau Owner. Setelah catatan ditandai "Sudah Ditinjau", feedback terkunci: perubahan ditolak oleh backend dan database, termasuk perubahan yang diminta di luar antarmuka aplikasi. [KEPUTUSAN]
- **FR-NOTE-09** Owner dapat membaca feedback serta memantau kondisi dan waktu penyelesaian catatan. [KEPUTUSAN]
- **FR-NOTE-10** Owner dapat menandai catatan sebagai "Sudah Ditinjau" hanya bila catatan sudah selesai. Identitas peninjau dan waktu peninjauan dicatat, dan kondisi peninjauan tersimpan terpisah dari kondisi penyelesaian. Staff Warehouse tidak dapat menandai "Sudah Ditinjau". [KEPUTUSAN] Pembatalan tinjauan dan peninjauan catatan selesai yang tidak memiliki feedback belum diputuskan. [OPEN DECISION OD-23]
- **FR-NOTE-11** Staff Warehouse tidak dapat membuat Catatan Owner, mengubah isi asli catatan Owner, menghapus catatan Owner, maupun menandai "Sudah Ditinjau". Hak tulis Owner pada Catatan Owner tidak memberi hak membuat transaksi stok, mengubah jumlah stok, mengubah data inventori sebagai operator, atau menjalankan Stock Opname. [KEPUTUSAN] Owner tidak menandai catatan selesai dan tidak menulis feedback atas nama Staff Warehouse. [DITURUNKAN dari pembagian aksi Owner dan Staff Warehouse]
- **FR-NOTE-12** Panel Catatan Owner di dashboard menampilkan maksimal 3 catatan dari daftar aktif (FR-NOTE-13), dengan catatan belum selesai diprioritaskan. Bila daftar aktif berisi lebih dari 3 catatan, tersedia akses "Lihat Semua Catatan". Batas 3 hanya berlaku untuk tampilan panel, bukan untuk jumlah data maupun jumlah catatan yang boleh dibuat. [KEPUTUSAN]
- **FR-NOTE-13** Daftar aktif ditentukan oleh kondisi penyelesaian dan tanggal kalender `Asia/Jakarta` (WIB). Catatan belum selesai selalu termasuk, tanpa batas pergantian tanggal. Catatan selesai termasuk hanya sampai akhir tanggal WIB hari penyelesaiannya. Aturan ini berbasis tanggal kalender, bukan 24 jam sejak penyelesaian. Contoh: catatan yang diselesaikan 30 Oktober 2026 pukul 15.00 WIB termasuk daftar aktif sepanjang 30 Oktober 2026, dan tidak lagi termasuk mulai 31 Oktober 2026 pukul 00.00 WIB. [KEPUTUSAN]
- **FR-NOTE-14** Catatan tidak dihapus otomatis. Catatan selesai beserta feedback-nya tetap tersimpan dan dapat dibuka melalui Riwayat Catatan; membuka riwayat tidak mengubah kondisi catatan maupun audit trail. Owner dapat membuka Riwayat Catatan untuk tanggal berapa pun. [KEPUTUSAN] Akses Staff Warehouse ke Riwayat Catatan belum diputuskan. [OPEN DECISION OD-27]
- **FR-NOTE-15** Owner dapat menemukan catatan yang selesai tetapi belum ditinjau setelah catatan tersebut tidak lagi termasuk daftar aktif, lalu menandainya "Sudah Ditinjau". Peninjauan tidak bergantung pada keberadaan catatan di panel dashboard. [KEPUTUSAN]
- **FR-NOTE-16** Identitas pelaku dan seluruh waktu aktivitas catatan (pembuatan, perubahan, penyelesaian, feedback, dan peninjauan) ditetapkan oleh server atau database berdasarkan sesi pengguna, bukan dari input browser. [KEPUTUSAN]
- **FR-NOTE-17** Pada kondisi selesai, baik menunggu tinjauan maupun sudah ditinjau, teks catatan ditampilkan dicoret dan kartu ditampilkan lebih redup dengan teks tetap terbaca, bagi Owner maupun Staff Warehouse. Perubahan tampilan tidak mengubah isi catatan yang tersimpan. [KEPUTUSAN]
- **FR-NOTE-18** Feedback ditampilkan di bawah isi catatan, tidak dicoret, dan tetap jelas terbaca pada setiap kondisi. [KEPUTUSAN]
- **FR-NOTE-19** Kondisi "Menunggu Tinjauan" dan "Sudah Ditinjau" dibedakan dengan label teks yang berbeda dan jelas. [KEPUTUSAN]
- **FR-NOTE-20** Sidebar dashboard menampilkan ringkasan Catatan Owner: jumlah catatan belum selesai, jumlah catatan yang diselesaikan pada tanggal WIB hari ini, dan shortcut menuju panel Catatan Owner atau daftar lengkap. Kedua jumlah dihitung dari seluruh data yang memenuhi kriteria, bukan hanya dari catatan yang tampil di panel. Sidebar tidak memuat isi catatan panjang, feedback lengkap, checklist "Selesai", maupun checklist "Sudah Ditinjau". [KEPUTUSAN]
- **FR-NOTE-21** Pembuatan Catatan Owner wajib menggunakan idempotency key yang terikat pada pengguna terautentikasi; request tanpa key ditolak. Pengiriman ulang dengan key, operasi, dan payload yang sama mengembalikan hasil pembuatan sebelumnya tanpa membuat catatan baru, termasuk bila respons pertama tidak diterima pengguna. Key yang sama dengan payload atau operasi berbeda ditolak. Dua tindakan dengan key berbeda tetap dapat menghasilkan dua catatan berisi identik. Request bersamaan dengan key yang sama menghasilkan tepat satu catatan. [KEPUTUSAN]

Rincian FR-NOTE-21 [KEPUTUSAN]:

- Identitas pengguna untuk idempotency diambil dari sesi autentikasi yang valid, bukan dari parameter identitas yang dikirim browser (FR-NOTE-16).
- Perbandingan request memakai payload relevan yang dikanonisasi beserta identitas operasi, bukan sekadar teks catatan. Algoritma dan format penyimpanannya ditetapkan di DATABASE-DESIGN.
- Pembuatan catatan dan pencatatan idempotency berlangsung atomik.
- Penyimpanan idempotency memakai mekanisme bersama dengan operasi inventori (FR-TRX-05, Keputusan E), termasuk ketentuan retensinya.
- Hak membuat catatan tetap hanya untuk Owner dengan profil valid (FR-NOTE-01, FR-AUTH-05).
- Hasil replay untuk catatan yang sudah dihapus mengikuti metode penghapusan yang belum diputuskan. [OPEN DECISION OD-25]

### FR-RPT — Laporan

- **FR-RPT-01** Laporan inventori: material, kategori, satuan, `current_stock`, `minimum_stock`, status operasional. (berasal dari dokumentasi sebelumnya)
- **FR-RPT-02** Laporan transaksi: tipe, material, `quantity_delta`, pelaku, tanggal. (berasal dari dokumentasi sebelumnya)

### FR-SRCH — Pencarian dan Filter

- **FR-SRCH-01** Pencarian berdasarkan nama material; filter berdasarkan kategori, status operasional, dan tipe transaksi. (berasal dari dokumentasi sebelumnya)

## Ruang Lingkup AI

Fitur AI tidak dihapus dari scope. Statusnya **[Pending Confirmation]** sampai ada konfirmasi dari advisor atau tim Dicoding. Prioritas implementasi adalah fondasi inventori; AI direncanakan setelahnya dan tidak boleh menghambat fondasi tersebut. [KEPUTUSAN]

| Persyaratan brief [BRIEF-dilaporkan] | Status | Rencana | Risiko / dependensi |
|---|---|---|---|
| Preprocessing data historis penggunaan atau inventori | Pending Confirmation | Setelah fondasi transaksi tersedia | Bergantung pada volume data histori sintetis |
| Klasifikasi material: `Safe`, `Need Attention`, `Restock Priority` | Pending Confirmation | Fitur terpisah setelah fondasi | Harus terpisah dari status operasional; butuh dataset berlabel |
| Inference API | Pending Confirmation | Setelah model tersedia | Bergantung pada pendekatan model yang diterima |
| Ringkasan kondisi inventori dengan Generative AI | Pending Confirmation | Setelah dashboard dan laporan | Butuh API key yang hanya ada di server; biaya penggunaan |
| Evaluasi model dengan test set dan pembandingan baseline | Pending Confirmation | Bersamaan dengan klasifikasi | Butuh data uji terpisah |

Aturan yang sudah final [KEPUTUSAN]:

- Klasifikasi AI adalah fitur terpisah. AI tidak menentukan status operasional dan tidak menggantikan validasi transaksi.

Bukti yang tersedia [PDF hlm.1]:

- Main Quest kolom Full-Stack Web Developer tidak mencantumkan kewajiban AI.
- Kewajiban membangun model AI, preprocessing data, fitur generatif AI, dan antarmuka inferensi tercantum di kolom Generative AI.
- PDF meminta peserta menyesuaikan dengan learning path masing-masing.
- Bukti ini **tidak** cukup untuk menyatakan fitur AI pada brief bersifat opsional, karena brief mengatur fitur produk sedangkan PDF mengatur tech stack.

Pertanyaan untuk advisor atau tim Dicoding:

1. Apakah fitur AI pada brief Firaza wajib untuk peserta individu path Full-Stack Web Developer, atau cukup Main Quest kolom Full-Stack?
2. Jika wajib, apakah klasifikasi berbasis aturan diterima, atau harus model yang dilatih dari data historis?
3. Apakah ringkasan Generative AI boleh memakai API model proprietary dari server, dan apakah larangan "fitur pertama" pada kolom Generative AI berlaku untuk path Full-Stack?
4. Apakah data sintetis yang disimpan di database dapat dipakai sebagai data historis untuk AI?

## Non-Functional Requirements

- **NFR-01 Keamanan** — Otorisasi ditegakkan di server dan database; Row Level Security aktif; service role key hanya dipakai di server untuk seed/administrasi; secret tidak disimpan di repository. [KEPUTUSAN]
- **NFR-02 Integritas data** — Constraint database, operasi atomik untuk perubahan stok, larangan stok negatif, dan referential integrity tanpa cascading delete. [KEPUTUSAN]
- **NFR-03 Auditability** — Setiap perubahan stok, koreksi, pembatalan sesi, arsip, dan reaktivasi mencatat pelaku, waktu, dan alasan bila diwajibkan. [KEPUTUSAN] Pada Catatan Owner, identitas pelaku dan waktu dicatat untuk pembuatan, penyelesaian, penulisan feedback, dan peninjauan (FR-NOTE-06, FR-NOTE-07, FR-NOTE-10, FR-NOTE-16); untuk perubahan isi catatan, yang dicatat adalah waktu perubahan terakhir. Ketentuan ini bukan riwayat lengkap setiap perubahan: jejak penghapusan mengikuti OD-25, dan riwayat revisi feedback mengikuti OD-22. [KEPUTUSAN]
- **NFR-04 Data** — Tidak ada hardcode data dummy permanen sebagai pengganti koneksi API. [PDF hlm.1] Data sintetis disimpan di database melalui seed. [DITURUNKAN]
- **NFR-05 Responsif** — Antarmuka dapat digunakan di mobile, tablet, dan desktop. [PDF hlm.1, Side Quest] (berasal dari dokumentasi sebelumnya)
- **NFR-06 Usability** — Mudah digunakan oleh pengguna non-teknis. (berasal dari PRD Professional)
- **NFR-07 Arsitektur** — Mengikuti Opsi A (Front-End & Back-End Style) pada checklist. Rincian di [STACK-DECISION-LOG.md](STACK-DECISION-LOG.md). [PDF hlm.1]

## Arah UI/UX

Arah visual yang dipilih: **Forest & Linen + logo Firaza Official**. [KEPUTUSAN]

| Token | Nilai |
|---|---|
| Forest Green | `#183D32` |
| Warm Linen | `#F4F1E8` |
| Soft Sage | `#C8DD9A` |
| Ivory | `#FFFEFA` |

Prinsip desain:

- Warna status operasional terkendali dan mudah dibedakan.
- Tipografi jelas, hierarki informasi kuat, whitespace terukur, komponen konsisten.
- Dashboard memprioritaskan keputusan operasional; tidak ada grafik atau dekorasi yang tidak membantu pengguna.

Status aset:

- **Logo resmi Firaza Official belum tersedia di workspace.** Logo harus dipertahankan bentuk dan proporsinya; tidak boleh dibuat pengganti atau dimodifikasi tanpa persetujuan.
- Gambar referensi dashboard (`firaza-dashboard-01-forest-linen.png`) berada di luar repository dan belum ditambahkan. Elemen huruf "F" pada gambar tersebut adalah placeholder, bukan logo resmi.

Penempatan Catatan Owner pada dashboard [KEPUTUSAN]:

- Desain dashboard yang sudah ada dipertahankan dengan identitas Forest & Linen. Dashboard tidak dirancang ulang, dan isi komponen lain tidak berubah.
- Urutan area utama:
  1. Empat kartu ringkasan stok.
  2. Panel Catatan Owner (FR-NOTE-12 sampai FR-NOTE-19).
  3. Grafik Pergerakan Stok dan Material per Kategori.
  4. Tabel Material yang Perlu Perhatian.
- Sidebar: ringkasan kecil Catatan Owner di ruang antara menu "06 Riwayat" dan kartu "Kondisi Gudang" (FR-NOTE-20).
- Urutan dan posisi di atas mengacu pada gambar referensi dashboard. Widget Material per Kategori dan kartu Kondisi Gudang disebut sebagai patokan posisi; bagian ini tidak menetapkan keduanya sebagai requirement.
- Ukuran, koordinat, dan perilaku responsif panel maupun ringkasan sidebar belum diverifikasi dan ditentukan saat implementasi UI.
- Tampilan kondisi catatan memakai token Forest & Linen di atas, tanpa logo baru maupun aset gambar baru.

## Inventory Scope

Scope MVP adalah **inventaris bahan baku (raw material)**. [KEPUTUSAN]

Material diperoleh dari vendor. [ASUMSI] Ini adalah asumsi operasional, bukan fakta yang telah diverifikasi dari klien.

Contoh material (berasal dari dokumentasi sebelumnya):

- Packaging material: kardus, ribbon, bubble wrap, plastik packaging, sticker, box.
- Product supporting material: handuk polos, sajadah polos.

Ketentuan kuantitas [KEPUTUSAN]:

- Kuantitas dicatat dalam unit utuh (buah, gulungan, pak, lembar, dan sejenisnya).
- Kuantitas pecahan dan konversi satuan tidak didukung di MVP.

Asumsi bahwa Firaza tidak memproduksi hampers sendiri belum terverifikasi sebagai fakta operasional. [ASUMSI] Stock Out untuk keperluan perakitan hampers dicatat sebagai pemakaian material biasa, bukan proses produksi.

## Out of Scope MVP

- Bill of Materials, perhitungan resep produksi, dan workflow manufaktur. [KEPUTUSAN]
- Manajemen produksi internal. [KEPUTUSAN]
- Inventaris barang jadi (finished product inventory). (berasal dari dokumentasi sebelumnya)
- Supplier management. (berasal dari dokumentasi sebelumnya)
- Integrasi marketplace. (berasal dari dokumentasi sebelumnya)
- Aplikasi mobile native. (berasal dari dokumentasi sebelumnya)
- Konversi satuan dan kuantitas pecahan. [KEPUTUSAN]
- Role selain Owner dan Staff Warehouse. [KEPUTUSAN]
- Pada Catatan Owner: chat, komentar bertingkat, notifikasi real-time, penugasan catatan ke banyak penerima, dan alur persetujuan berlapis. [KEPUTUSAN]

## Asumsi

- Deployment MVP digunakan oleh satu Owner dan satu Staff Warehouse. Ini asumsi deployment, bukan batasan jumlah akun di sistem maupun di database. (Pembuatan akun kini merupakan keputusan; lihat FR-AUTH-02.)
- Data operasional menggunakan dataset sintetis yang disimpan di database.
- Material diperoleh dari vendor dalam unit utuh.
- Developer bertindak sebagai Owner produk untuk menentukan asumsi operasional, karena pihak UMKM tidak dapat diajak berdiskusi lebih lanjut.

## Inventaris Keputusan

Audit awal mencatat OD-01 sampai OD-15. OD-16 sampai OD-29 **tidak termasuk daftar audit awal**:

- OD-16 ditemukan saat menyusun matriks hak akses PRD, karena kewenangan memposting sesi buatan Staff lain tidak tercakup oleh OD-02 maupun keputusan pembatalan sesi.
- OD-17 ditambahkan karena tipe `OPENING_BALANCE` telah diputuskan, tetapi aturan dan validasinya belum didefinisikan.
- OD-18 ditambahkan saat merevisi STACK-DECISION-LOG, karena pola pembacaan data oleh Server Components tidak diatur oleh keputusan REST API melalui Route Handlers.
- OD-19 dan OD-20 ditambahkan saat merevisi DATABASE-DESIGN, karena normalisasi spasi nama dan idempotency pembuatan sesi Stock Opname belum diatur oleh keputusan mana pun.
- OD-21 sampai OD-29 ditambahkan pada 30 Oktober 2026 saat merancang Catatan Owner dan keputusan akun (STACK-DECISION-LOG ADR-11). OD-21 sampai OD-27 menyangkut rincian Catatan Owner yang belum diputuskan, OD-28 menyangkut hak baca profil pengguna lain, dan OD-29 menyangkut mekanisme penonaktifan akun dan sesi.

Keputusan desain database A–F disetujui developer pada 29 Oktober 2026 saat meninjau [DATABASE-DESIGN-Smart-Warehouse-Firaza.md](DATABASE-DESIGN-Smart-Warehouse-Firaza.md) dan tercermin pada requirement berikut: A → FR-CAT-03, FR-MAT-10; B → FR-MAT-05; C → FR-OPN-04 (menutup OD-11); D → FR-COR-06; E → FR-TRX-05; F → FR-MAT-11.

### Keputusan final atau diturunkan

| ID | Topik | Status | Dirujuk di |
|---|---|---|---|
| OD-03 | Status antara "hitung selesai" dan posting | Final (diturunkan): `ACTIVE` → `POSTED` / `CANCELLED`, tanpa tahap persetujuan | FR-OPN-02 |
| OD-04 | Sesi tanpa item | Final: tidak dapat diposting, hanya dapat dibatalkan | FR-OPN-09 |
| OD-06 | REVERSAL/pengganti pada material beku | Final (diturunkan): ditolak | FR-COR-04 |
| OD-07 | Metadata hasil hitung | Final: hasil hitung terakhir + pelaku dan waktu; bukan riwayat lengkap revisi | FR-OPN-07 |
| OD-08 | Batas waktu sesi aktif | Final: tidak kedaluwarsa otomatis pada MVP | FR-OPN-16 |
| OD-11 | Penanda pembekuan material | Final: `materials.active_opname_id` (Keputusan C, 29 Oktober 2026) | FR-OPN-04; DATABASE-DESIGN §4.3, §11 |
| OD-12 | Idempotency dan aksi berulang | Inti final; bentuk respons HTTP dirinci di dokumentasi API (Gelombang 2b) | FR-TRX-05, FR-COR-05 |
| OD-13 | Perubahan satuan setelah ada histori | Final (diturunkan): tidak dapat diubah | FR-MAT-03 |
| OD-14 | Pergerakan stok lintas satuan | Aturan final (diturunkan); bentuk widget ditentukan saat desain UI | FR-DASH-03 |
| OD-15 | Framework CSS, komponen UI, HTTP client, library schema validation, platform deploy | Final (30 Oktober 2026): Tailwind CSS v4; shadcn/ui dengan Radix UI, style `radix-nova`; Axios; Zod v4; Vercel, khusus demonstrasi capstone nonkomersial. Status implementasi tercatat terpisah di ADR-12 | STACK-DECISION-LOG ADR-12 |

### Keputusan terbuka

Rekomendasi di bawah **belum disetujui**. Rincian pilihan dan trade-off ada di [FEATURE-SPECIFICATION-Smart-Warehouse-Firaza.md](FEATURE-SPECIFICATION-Smart-Warehouse-Firaza.md), [DATABASE-DESIGN-Smart-Warehouse-Firaza.md](DATABASE-DESIGN-Smart-Warehouse-Firaza.md), dan [STACK-DECISION-LOG.md](STACK-DECISION-LOG.md).

| ID | Topik | Rekomendasi |
|---|---|---|
| OD-01 | Menghapus item dari sesi aktif | Boleh selama sesi `ACTIVE`; pembekuan material itu langsung dilepas; pelaku dan waktu dicatat |
| OD-02 | Kewenangan menambah item dan mengisi hasil hitung pada sesi buatan Staff lain | Semua Staff Warehouse, dengan metadata pelaku per item. Trade-off: kepemilikan sesi kurang tegas; alternatif "hanya pembuat sesi" lebih ketat tetapi menghambat bila pembuat berhalangan |
| OD-05 | Mengarsipkan material yang sedang dibekukan | Tolak pengarsipan selama material dibekukan |
| OD-09 | Transaksi duplikat yang seharusnya tidak ada | `REVERSAL` tanpa transaksi pengganti, alasan wajib |
| OD-10 | Transaksi pengganti dengan material atau tipe berbeda | Diizinkan untuk `STOCK_IN`/`STOCK_OUT`; semua material terkait dikunci dalam satu transaksi |
| OD-16 | Kewenangan memposting sesi buatan Staff lain | Semua Staff Warehouse, dengan pelaku posting dicatat, agar konsisten dengan rekomendasi OD-02. Trade-off: Staff dapat memposting hasil hitung yang diisi orang lain; alternatif "hanya pembuat sesi" lebih ketat tetapi sesi dapat tertahan bila pembuat berhalangan |
| OD-17 | Aturan dan validasi transaksi `OPENING_BALANCE` | Lihat rincian di bawah |
| OD-18 | Pola pembacaan data server-side oleh Server Components | Lihat STACK-DECISION-LOG |
| OD-19 | Normalisasi spasi nama kategori dan material | Lihat DATABASE-DESIGN §4.2 |
| OD-20 | Idempotency untuk pembuatan sesi Stock Opname (`create_stock_opname`) | Lihat DATABASE-DESIGN §9.1 |
| OD-21 | Kewajiban mengisi feedback sebelum checklist "Selesai", serta boleh tidaknya feedback ditulis sebelum catatan selesai | Feedback tidak wajib; boleh ditulis kapan pun sebelum catatan ditinjau |
| OD-22 | Struktur feedback: satu record per catatan atau berversi | Satu record per catatan yang dapat diperbarui sampai ditinjau |
| OD-23 | Pembatalan tinjauan oleh Owner, dan peninjauan catatan selesai yang tidak memiliki feedback. Checklist "Sudah Ditinjau" dan penguncian feedback sudah diputuskan (FR-NOTE-08, FR-NOTE-10) | Pembatalan tinjauan tidak tersedia di MVP; peninjauan tanpa feedback diperbolehkan |
| OD-24 | Edit atau hapus catatan oleh Owner setelah catatan selesai atau ditinjau | Isi catatan tidak dapat diedit setelah selesai, agar penyelesaian dan feedback tetap merujuk pada isi yang sama; penghapusan mengikuti OD-25. Trade-off: Owner harus membuat catatan baru untuk koreksi |
| OD-25 | Metode penghapusan catatan: soft delete atau hard delete | Soft delete dengan pelaku dan waktu, agar riwayat dan feedback tidak hilang |
| OD-26 | Pembatalan checklist "Selesai" oleh Staff Warehouse | Hanya oleh penyelesai dan sebelum catatan ditinjau |
| OD-27 | Akses Staff Warehouse ke Riwayat Catatan | Staff Warehouse dapat membaca riwayat |
| OD-28 | Hak baca profil pengguna lain, khususnya nama dan role. Berdampak pada tampilan pelaku di histori transaksi (FR-HIS-01) dan Catatan Owner | Pengguna ber-profil dapat membaca nama dan role pengguna lain |
| OD-29 | Mekanisme teknis penonaktifan akun dan penanganan sesi aktif (FR-AUTH-04) | Belum ada rekomendasi teknis; dirancang dan diuji sebelum implementasi autentikasi (ADR-11) |

### OD-17 — Aturan dan Validasi Transaksi `OPENING_BALANCE`

**Status:** [OPEN DECISION OD-17]. Yang sudah final hanya keberadaan tipe `OPENING_BALANCE` untuk pencatatan saldo awal (FR-TRX-09).

**Pertanyaan yang perlu diputuskan:**

1. Berapa kali `OPENING_BALANCE` boleh dicatat untuk satu material?
2. Kapan boleh dicatat: hanya sebagai transaksi stok pertama material, atau kapan saja?
3. Nilai apa yang sah: hanya bilangan bulat > 0, atau juga 0?
4. Siapa yang boleh mencatatnya?
5. Bagaimana mengoreksi `OPENING_BALANCE` yang salah?
6. Apakah berlaku penolakan yang sama seperti Stock In/Out untuk material beku atau arsip, serta mekanisme idempotency yang sama?

**Alternatif:**

| Alternatif | Penjelasan | Kelebihan | Kekurangan |
|---|---|---|---|
| A. Satu kali per material, dicatat bersamaan dengan pembuatan material | Saldo awal diisi di form pembuatan material dan disimpan dalam satu operasi atomik | Paling sederhana; saldo awal tidak mungkin tertinggal | Material yang dibuat tanpa saldo awal tidak dapat diberi saldo awal belakangan |
| B. Satu kali per material, sebagai transaksi stok pertama, melalui aksi terpisah | Material dibuat dulu, lalu saldo awal dicatat sebelum transaksi stok lain | Fleksibel untuk input data awal secara bertahap; tetap satu kali per material | Perlu validasi "belum ada transaksi lain"; ada satu aksi tambahan di UI |
| C. Tanpa batasan khusus | `OPENING_BALANCE` diperlakukan seperti Stock In | Implementasi paling ringan | Makna "saldo awal" hilang; histori dan laporan sulit dibaca; rawan disalahgunakan sebagai Stock In |

**Rekomendasi (belum disetujui): Alternatif B.**

- Paling banyak satu `OPENING_BALANCE` per material, dan harus menjadi transaksi stok pertama material tersebut.
- Nilai berupa bilangan bulat > 0. Material yang saldo awalnya nol tidak memerlukan transaksi ini.
- Dicatat oleh Staff Warehouse.
- Ditolak untuk material arsip atau beku, dan memakai idempotency yang sama dengan Stock In/Out.
- Koreksi mengikuti pola `REVERSAL` + pengganti seperti transaksi final lainnya.

Alasan: B menjaga makna saldo awal di histori, tetap fleksibel saat data awal dimasukkan bertahap, dan memakai mekanisme yang sudah diputuskan untuk transaksi lain sehingga tidak menambah konsep baru.

## Future Development

- Supplier management.
- Finished product inventory.
- Forecasting kebutuhan material.
- Integrasi marketplace.

Fitur AI pada brief tidak termasuk daftar ini; statusnya diatur di bagian Ruang Lingkup AI.

## Dokumen Terkait

- [STACK-DECISION-LOG.md](STACK-DECISION-LOG.md) — keputusan teknologi.
- [FEATURE-SPECIFICATION-Smart-Warehouse-Firaza.md](FEATURE-SPECIFICATION-Smart-Warehouse-Firaza.md) — aturan rinci per fitur.
- [DATABASE-DESIGN-Smart-Warehouse-Firaza.md](DATABASE-DESIGN-Smart-Warehouse-Firaza.md) — skema, constraint, dan operasi atomik.
- [PROJECT-CONTEXT-Smart-Warehouse-Firaza.md](PROJECT-CONTEXT-Smart-Warehouse-Firaza.md) — briefing untuk AI coding assistant. Dokumen ini belum disinkronkan dengan keputusan arsitektur terbaru dan masih memuat stack lama. Jangan gunakan sebagai acuan implementasi teknologi sampai direvisi; ikuti [STACK-DECISION-LOG.md](STACK-DECISION-LOG.md) untuk keputusan stack yang berlaku.
