# Feature Specification Document

# Smart Warehouse Firaza

> **Status dokumen:** penjabaran rinci kebutuhan dari PRD kanonik.
> **Revisi:** Gelombang 2a, 29 Oktober 2026. Pembaruan 30 Oktober 2026: Catatan Owner (§12a), akun dan akses (§3, §4), serta penyelarasan aturan material, kategori, idempotency, dan koreksi dengan PRD. Pembaruan 31 Oktober 2026: status OD-29 pada aturan bisnis autentikasi. Pembaruan lanjutan 31 Oktober 2026: status fondasi otorisasi yang sudah diuji di lokal dan prosedur admin siklus akun (STACK-DECISION-LOG ADR-14). Pembaruan 1 November 2026: status implementasi dan uji lokal prosedur admin siklus akun (ADR-14) pada aturan bisnis autentikasi disinkronkan; OD-29 tetap terbuka. Pembaruan lanjutan 1 November 2026: kebijakan keamanan G1–G3 (ADR-14) disetujui untuk MVP lokal; G1 belum diimplementasikan. Pembaruan 1 November 2026 (7SUP.4B-3I): G1 diimplementasikan dan lulus uji terarah di Supabase lokal; OD-29 tetap terbuka. Pembaruan 1 November 2026 (7SUP.5A-2 dan 7SUP.5A-3): status implementasi lokal irisan Stock In (§3, §7, §16; STACK-DECISION-LOG ADR-15). Pembaruan 1 November 2026 (7SUP.5A-3B): hasil uji penerimaan browser manual irisan Stock In di lokal, beserta keterbatasannya dan satu sesi Auth tertinggal sebagai residual risk, dicatat (§7, §16); kebutuhan tidak berubah. Pembaruan 2 November 2026 (7SUP.5B-3C): status Stock Out disinkronkan di blok status pembuka, §7, §8 ("Status implementasi"), dan §16. API dan antarmuka Stock Out diimplementasikan di working tree lokal dan belum di-commit ke Git; API lulus uji HTTP lokal (7SUP.5B-2B), sedangkan uji browser belum diverifikasi (7SUP.5B-3A FAIL prosedural). Rinciannya di STACK-DECISION-LOG ADR-15 B5.2 dan ADR-16; kebutuhan tidak berubah dan tidak ada keputusan baru. Pembaruan 4 November 2026 (DOC-SYNC-01): status Git disinkronkan di blok status pembuka, §8, dan §16. Kode aplikasi, migration, dan harness uji kini di-commit secara lokal di branch `feat/supabase-foundation` (C-1 `f132ad7` sampai C-7 `bb6865b`) dan belum di-push ke GitHub. Commit tidak membuktikan perilaku runtime, dan status uji tidak berubah; kebutuhan tidak berubah.
>
> - Kebutuhan produk dan aturan bisnis mengacu pada PRD kanonik, [PRD-Smart-Warehouse-Firaza-Dicoding.md](PRD-Smart-Warehouse-Firaza-Dicoding.md). Keputusan teknologi mengacu pada [STACK-DECISION-LOG.md](STACK-DECISION-LOG.md). Jika terjadi konflik lintas dokumen, laporkan konflik tersebut untuk diputuskan; jangan menetapkan prioritas secara otomatis.
> - Kecuali irisan Stock In dan irisan Stock Out, seluruh fitur di dokumen ini berstatus **[RENCANA — belum diimplementasikan]**. Kedua irisan diimplementasikan, di-commit secara lokal di branch `feat/supabase-foundation` (belum di-push ke GitHub), dan lulus uji HTTP di Supabase **lokal**, tetapi belum dinyatakan selesai; status, bukti, dan batas masing-masing, termasuk uji browser, dicatat di dua butir berikut.
> - Irisan Stock In sudah dibangun dan lulus uji integrasi HTTP di Supabase **lokal** (7SUP.5A-3). Isinya: login dan logout (§3), daftar dan detail material, histori transaksi terbaru, dan Stock In (§7). Rinciannya di "Status implementasi" §7. Uji penerimaan browser manual di lokal (7SUP.5A-3B) memverifikasi alur inti dengan keterbatasan; pengiriman Stock In dengan jumlah valid belum diuji melalui browser, sehingga irisan ini belum dinyatakan selesai.
> - Stock Out (7SUP.5B-2A dan 7SUP.5B-2B, Supabase **lokal**): API (`POST /api/v1/stock-movements` dengan `type: "STOCK_OUT"`) diimplementasikan, di-commit secara lokal (C-6 `b781551`; belum di-push ke GitHub), dan lulus uji HTTP lokal (EXEC-R 48 dari 48 tanpa mutasi inventori; EXEC-C 63 dari 63). Antarmuka (kartu Stock Out terpisah) juga diimplementasikan dan di-commit secara lokal (C-6); build dan unit test (mock) lulus. Uji browser **belum diverifikasi**: 7SUP.5B-3A FAIL prosedural dan B-01 sampai B-29 tidak dinilai. Rinciannya di "Status implementasi" §8.
> - Belum diimplementasikan: kategori, CRUD material, koreksi, Stock Opname, dashboard, laporan, dan Catatan Owner.
> - Fondasi otorisasi di database (tabel `profiles`, helper role, penolakan akun nonaktif, dan validasi sesi) serta prosedur admin siklus akun berupa function SQL (STACK-DECISION-LOG ADR-14) sudah diterapkan di Supabase **lokal** dan lulus uji integrasi lokal dengan akun Supabase Auth uji sekali pakai, tanpa antarmuka aplikasi (STACK-DECISION-LOG ADR-13 dan ADR-14). Aplikasi tidak memanggil function admin, dan tidak ada antarmuka admin maupun layanan orkestrasi permanen. Sejak migration keempat (kebijakan G1), perubahan role membuat sesi lama kehilangan akses aplikasi. Migration kelima menambahkan tabel inventori dan RPC `post_stock_movement` dengan otorisasi database fail-closed (ADR-15 B5.3).
> - Label sumber mengikuti legenda di PRD kanonik. Tidak ada label tambahan di dokumen ini.
> - Rincian pilihan dan rekomendasi keputusan terbuka (OD) dicatat di PRD kanonik dan STACK-DECISION-LOG; dokumen ini hanya menandai di langkah mana keputusan terbuka berpengaruh.

## 1. Purpose

Dokumen ini menjelaskan spesifikasi setiap fitur yang akan dikembangkan
pada aplikasi Smart Warehouse Firaza.

Dokumen ini menjadi penghubung antara:

    PRD
     |
     |
    Feature Specification
     |
     |
    Development Task
     |
     |
    Implementation

Tujuan dokumen ini:

-   Memberikan detail requirement setiap fitur.
-   Mengurangi asumsi saat development.
-   Menjadi acuan AI coding assistant ketika membuat kode.
-   Menentukan business rule sebelum implementasi.

Dokumen terkait:

-   [PRD-Smart-Warehouse-Firaza-Dicoding.md](PRD-Smart-Warehouse-Firaza-Dicoding.md) — kebutuhan produk (kanonik).
-   [STACK-DECISION-LOG.md](STACK-DECISION-LOG.md) — keputusan teknologi.
-   [DATABASE-DESIGN-Smart-Warehouse-Firaza.md](DATABASE-DESIGN-Smart-Warehouse-Firaza.md) — skema, constraint, dan penegakan aturan di database.

------------------------------------------------------------------------

# 2. Feature Priority

## MVP Features

Fitur yang wajib selesai, beserta requirement di PRD kanonik:

| No | Fitur | Requirement PRD |
|---|---|---|
| 1 | Authentication | FR-AUTH |
| 2 | Role Management | FR-AUTH-03, Matriks Hak Akses |
| 3 | Material Management (termasuk kategori) | FR-MAT, FR-CAT |
| 4 | Stock In | FR-TRX-01 |
| 5 | Stock Out | FR-TRX-02 |
| 6 | Stock Opname | FR-OPN |
| 7 | Dashboard | FR-DASH |
| 8 | Reporting | FR-RPT |
| 9 | Search and Filter | FR-SRCH |
| 10 | Catatan Owner | FR-NOTE |

Fitur pendukung yang diatur PRD: saldo awal (FR-TRX-09), koreksi transaksi final (FR-COR), histori transaksi (FR-HIS), dan status stok operasional (FR-STS).

## Fitur AI

Fitur AI dari brief berstatus [Pending Confirmation] dan diatur di PRD, bagian Ruang Lingkup AI. Fitur AI tidak termasuk daftar MVP di atas maupun daftar Future Features di bawah sampai statusnya dikonfirmasi. Lihat juga §11.2.

## Future Features

Tidak termasuk MVP:

-   Supplier Management.
-   Finished Product Inventory.
-   Forecasting.
-   Marketplace Integration.

------------------------------------------------------------------------

# 3. Authentication Feature

## Feature Name

User Authentication

## Actor

-   Owner.
-   Staff Warehouse.

## Purpose

Memberikan akses aman kepada pengguna berdasarkan akun dan role.

------------------------------------------------------------------------

## User Flow

    User membuka aplikasi

    ↓

    Input email dan password

    ↓

    Supabase Auth memvalidasi kredensial dan membuat sesi

    ↓

    User masuk dashboard

------------------------------------------------------------------------

## Input

Email:

-   Format email valid.
-   Tidak boleh kosong.

Password:

-   Tidak boleh kosong.

------------------------------------------------------------------------

## Business Rules

1.  Login dan logout menggunakan email dan password melalui Supabase Auth. Aplikasi tidak membuat sistem penerbitan token sendiri. [KEPUTUSAN] (STACK-DECISION-LOG ADR-04; PRD FR-AUTH-01)
2.  Setiap operasi terlindungi memvalidasi sesi dan role di server, dan akses data dibatasi di database. [KEPUTUSAN] (PRD FR-AUTH-03)
3.  Tidak ada registrasi publik: public signup di Supabase Auth dinonaktifkan. Akun Owner dan Staff Warehouse dibuat developer melalui provisioning manual; profil dan role disiapkan melalui prosedur admin terkontrol, tanpa trigger otomatis untuk membuat profil. [KEPUTUSAN] (PRD FR-AUTH-02; STACK-DECISION-LOG ADR-11) Prosedur provisioning dirancang di STACK-DECISION-LOG ADR-14 (function SQL `admin_provision_profile`). Status 1 November 2026: diimplementasikan dan lulus uji integrasi di Supabase **lokal**, termasuk penolakan untuk akun dengan email belum terkonfirmasi (lulus dalam run yang secara keseluruhan INCONCLUSIVE; DATABASE-DESIGN §14.5 #27). Penolakan saat ban Auth aktif lulus uji lokal (7SUP.4B-3I). Provisioning dijalankan developer melalui sesi SQL tepercaya, bukan dari aplikasi.
4.  Role hanya dapat ditetapkan atau diubah melalui proses admin terkontrol; pengguna tidak dapat menetapkan atau menaikkan role sendiri. Status Owner di aplikasi tidak memberi kewenangan administrasi akun (STACK-DECISION-LOG ADR-14). Login yang berhasil tidak otomatis memberi otorisasi: pengguna tanpa profil valid atau tanpa hak akses yang sah ditolak dari fitur bisnis aplikasi, termasuk inventori dan Catatan Owner. Penolakan ini terjadi di otorisasi aplikasi, bukan di login Supabase Auth. [KEPUTUSAN] (PRD FR-AUTH-05)
5.  Akses akun dapat dinonaktifkan tanpa menghapus profil maupun histori audit. Pengguna yang dinonaktifkan tidak boleh tetap memperoleh akses ke fitur bisnis, dan sesi aktifnya harus ditangani secara aman. [KEPUTUSAN] (PRD FR-AUTH-04) Desain teknis penonaktifan, reaktivasi, dan penanganan sesi sudah ditetapkan (STACK-DECISION-LOG ADR-13 dan amandemennya; DATABASE-DESIGN §12.5). Penolakan berdasarkan status database dan validasi sesi setelah reaktivasi sudah lulus uji integrasi di Supabase lokal, untuk data profil saja. Status 1 November 2026: prosedur admin SQL (STACK-DECISION-LOG ADR-14) diimplementasikan dan lulus uji integrasi lokal, termasuk urutan ban dan pencabutan ban Supabase Auth.
    -   Penonaktifan: (1) nonaktifkan profil di database, (2) pastikan akses database ditolak, (3) ban di Supabase Auth, (4) verifikasi status akhir.
    -   Reaktivasi: (1) cabut ban Supabase Auth, (2) pastikan akses database masih ditolak, (3) reaktivasi database dengan cutoff sesi baru, (4) pengguna wajib membuat sesi Auth baru.
    -   Urutan ini adalah runbook operasional yang dijalankan developer, belum ditegakkan oleh layanan orkestrasi permanen.
    -   Ban Supabase Auth tidak mencabut access token yang sudah terbit. Penolakan langsung berasal dari penonaktifan database.
    -   Kebijakan keamanan G1–G3 (STACK-DECISION-LOG ADR-14) disetujui pemilik proyek pada 1 November 2026 untuk MVP lokal:
        -   G1, untuk perubahan role menurut butir 4: setiap perubahan role yang diterapkan wajib membuat sesi lama kehilangan akses aplikasi, sehingga pengguna harus membuat sesi Auth baru. **Diimplementasikan dan lulus uji terarah di Supabase lokal** (7SUP.4B-3I). Penegakannya ada di otorisasi database; sesi dan refresh token Supabase Auth tidak dicabut. Belum ada antarmuka login aplikasi maupun penanganan logout paksa di aplikasi.
        -   G2: durasi ban Supabase Auth `876000h` untuk MVP lokal. Penonaktifan database tetap kontrol utama penolakan akses. Kebijakan produksi ditinjau terpisah.
        -   G3: runbook manual satu operator dengan pemeriksaan sebelum dan sesudah operasi, deteksi state tidak konsisten, dan penghentian saat terjadi konflik atau hasil tidak pasti. Ini kebijakan operasional, bukan layanan orkestrasi.
    -   Uji penerimaan keamanan belum lengkap, dan implementasi di cloud atau produksi belum diverifikasi. Antarmuka admin dan sebagian besar fitur bisnis gudang belum diimplementasikan. [OPEN DECISION OD-29]
    -   **Status implementasi login dan logout** (7SUP.5A-3, lokal):
        -   `POST /api/v1/auth/login` memvalidasi input, masuk melalui Supabase Auth, lalu mewajibkan database mengotorisasi sesi baru melalui profil aktif. Bila profil tidak terbaca, sesi langsung dicabut.
        -   Kredensial salah, email tidak dikenal, dan akun yang ditolak Supabase Auth mendapat respons generik yang sama.
        -   `POST /api/v1/auth/logout` mencabut sesi saat ini di Supabase Auth dan menghapus cookie.
        -   Cookie sesi bersifat `HttpOnly`, `SameSite=Lax`, dan `Path=/`. Atribut `Secure` diaktifkan melalui konfigurasi saat aplikasi dilayani melalui HTTPS.
        -   Mutasi hanya menerima request JSON dari origin yang sama.
        -   Lulus uji HTTP lokal, termasuk penolakan cookie lama setelah logout.
        -   Penolakan sesi setelah penonaktifan atau cutoff G1 melalui API Next.js **belum diuji** dengan perubahan status yang di-commit. Penolakannya di level database sudah teruji (7SUP.5A-2).

------------------------------------------------------------------------

## Output

Success:

-   Sesi pengguna aktif.
-   Informasi user.
-   Role user.

Failed:

-   Pesan error login.

------------------------------------------------------------------------

# 4. Role Management Feature

## Feature Name

Role Based Access Control

## Purpose

Membatasi akses berdasarkan tanggung jawab pengguna.

Sistem memiliki dua role: Owner dan Staff Warehouse. Admin operasional termasuk role Staff Warehouse; tidak ada role ketiga. [KEPUTUSAN]

------------------------------------------------------------------------

## Role Owner

Allowed:

-   Melihat dashboard.
-   Melihat inventory.
-   Melihat laporan.
-   Melihat histori transaksi.
-   Memantau sesi dan hasil Stock Opname.
-   Catatan Owner: membuat catatan, mengedit dan menghapus catatan miliknya, membaca feedback, memantau penyelesaian, menandai catatan yang sudah selesai sebagai "Sudah Ditinjau", dan membuka Riwayat Catatan (§12a). [KEPUTUSAN] (PRD FR-NOTE)

Terhadap inventori, Owner hanya membaca. Hak tulis Owner terbatas pada Catatan Owner. [KEPUTUSAN]

Restricted:

-   Mengubah stok secara langsung.
-   Mengedit atau menghapus transaksi final.
-   Mengelola kategori dan material.
-   Membuat, mengisi, memposting, atau membatalkan sesi Stock Opname.
-   Mencentang "Selesai" atau menulis feedback pada Catatan Owner atas nama Staff Warehouse. [DITURUNKAN] (PRD FR-NOTE-11)

------------------------------------------------------------------------

## Role Staff Warehouse

Allowed:

-   Mengelola kategori.
-   Mengelola material, termasuk hapus, arsip, dan reaktivasi.
-   Membuat stock in.
-   Membuat stock out.
-   Melakukan koreksi transaksi final.
-   Membuat sesi Stock Opname; menambah item, mengisi hasil hitung, dan memposting sesi yang dibuatnya sendiri.
-   Membatalkan sesi Stock Opname aktif milik siapa pun, dengan alasan wajib.
-   Catatan Owner: membaca catatan, mencentang "Selesai", serta menulis dan memperbarui feedback selama catatan belum ditinjau (§12a). [KEPUTUSAN] (PRD FR-NOTE)

Belum diputuskan:

-   Menambah item dan mengisi hasil hitung pada sesi buatan Staff lain. [OPEN DECISION OD-02]
-   Memposting sesi buatan Staff lain. [OPEN DECISION OD-16]
-   Mencatat saldo awal (`OPENING_BALANCE`). [OPEN DECISION OD-17]
-   Membuka Riwayat Catatan. [OPEN DECISION OD-27]

Restricted:

-   Mengedit atau menghapus transaksi final.
-   Membuat Catatan Owner, mengubah isi asli catatan Owner, menghapus catatan Owner, atau mencentang "Sudah Ditinjau". [KEPUTUSAN] (PRD FR-NOTE-11)

------------------------------------------------------------------------

## Penegakan Hak Akses

-   Matriks lengkap mengacu pada PRD, bagian Matriks Hak Akses.
-   Hak akses ditegakkan di server dan database. Menyembunyikan tombol di UI bukan bentuk otorisasi. [KEPUTUSAN]

------------------------------------------------------------------------

# 5. Material Management Feature

## Feature Name

Raw Material Management

## Actor

Staff Warehouse. Owner hanya melihat.

## Purpose

Mengelola data raw material yang digunakan dalam operasional warehouse.

------------------------------------------------------------------------

## Data Entity

Material memiliki:

-   Name.
-   Category.
-   Unit (satuan dasar).
-   Current Stock.
-   Minimum Stock.
-   Status arsip.

------------------------------------------------------------------------

## Create Material

### Input

-   Nama material.
-   Kategori.
-   Satuan dasar.
-   Minimum stock.

------------------------------------------------------------------------

## Validation

1.  Nama material wajib diisi.
2.  Kategori wajib dipilih.
3.  Satuan dasar wajib diisi secara eksplisit, misalnya pcs, pack, roll, atau lembar. Satuan tidak dipaksakan sama untuk semua material. [KEPUTUSAN] (PRD FR-MAT-02)
4.  Minimum stock berupa bilangan bulat ≥ 0. [KEPUTUSAN] (PRD FR-MAT-01)
5.  Kuantitas pecahan dan konversi satuan tidak didukung. [KEPUTUSAN]
6.  Nama material unik tanpa membedakan huruf besar/kecil, termasuk terhadap nama material arsip; material baru tidak dapat memakai nama material arsip. [KEPUTUSAN] (PRD FR-MAT-10) Normalisasi spasi di awal/akhir nama belum diputuskan. [OPEN DECISION OD-19]

------------------------------------------------------------------------

## Output

Material berhasil tersimpan dengan current stock 0. Stok hanya bertambah melalui transaksi. [DITURUNKAN dari PRD FR-MAT-04]

------------------------------------------------------------------------

## Update Material

User dapat mengubah:

-   Nama material.
-   Kategori.
-   Satuan dasar, **hanya** jika material belum memiliki transaksi dan belum tercatat dalam sesi Stock Opname. [DITURUNKAN] (PRD FR-MAT-03)
-   Minimum stock.

Current stock tidak diubah melalui fitur ini. Stok hanya berubah lewat transaksi dan posting Stock Opname. (PRD FR-MAT-04)

Perubahan nama tunduk pada aturan keunikan di Validation nomor 6. (PRD FR-MAT-10)

Material arsip tidak dapat diedit. Seluruh field, termasuk nama, kategori, dan minimum stock, hanya dapat diubah setelah material direaktivasi melalui proses resmi (Reactivate Material). Setelah reaktivasi, aturan perubahan satuan dasar di atas tetap berlaku. [KEPUTUSAN] (PRD FR-MAT-11)

------------------------------------------------------------------------

## Delete Material

Rule:

-   Material hanya dapat dihapus permanen jika belum memiliki riwayat transaksi. [KEPUTUSAN] (PRD FR-MAT-05)
-   Material yang pernah tercatat dalam sesi Stock Opname juga tidak dapat dihapus, karena direferensikan oleh catatan audit. [DITURUNKAN] (PRD FR-MAT-05)
-   Material yang memiliki riwayat pengarsipan atau reaktivasi di `material_status_events` juga tidak dapat dihapus permanen. [KEPUTUSAN] (PRD FR-MAT-05)
-   Material yang tidak dapat dihapus dapat diarsipkan.

------------------------------------------------------------------------

## Archive Material

Rule:

1.  Material hanya dapat diarsipkan jika current stock = 0. Material yang masih memiliki stok ditolak. [KEPUTUSAN] (PRD FR-MAT-06)
2.  Alasan pengarsipan wajib diisi. Peristiwa dicatat di `material_status_events` beserta pelaku dan waktu. [KEPUTUSAN]
3.  Material arsip tidak dapat digunakan dalam Stock In, Stock Out, atau sesi Stock Opname baru. [KEPUTUSAN] (PRD FR-MAT-07)
4.  Histori transaksi material arsip tetap tersimpan dan dapat dilihat. [KEPUTUSAN]
5.  Material yang sedang dibekukan oleh sesi Stock Opname aktif: boleh tidaknya diarsipkan belum diputuskan. [OPEN DECISION OD-05] (PRD FR-MAT-09)

------------------------------------------------------------------------

## Reactivate Material

Rule:

1.  Reaktivasi material arsip memerlukan alasan wajib. [KEPUTUSAN] (PRD FR-MAT-08)
2.  Peristiwa dicatat di `material_status_events` beserta pelaku dan waktu. [KEPUTUSAN]
3.  Setelah aktif kembali, material dapat digunakan lagi dalam transaksi dan Stock Opname.

------------------------------------------------------------------------

# 6. Category Management Feature

## Feature Name

Material Category Management

## Purpose

Mengelompokkan material agar mudah dicari dan difilter.

------------------------------------------------------------------------

## Example Category

-   Packaging Material.
-   Product Supporting Material.

------------------------------------------------------------------------

## CRUD Operation

Actor: Staff Warehouse. Owner hanya melihat. (PRD FR-CAT-01)

Allowed:

-   Create category.
-   Read category.
-   Update category.
-   Delete category, dengan aturan di bawah.

------------------------------------------------------------------------

## Aturan Nama

-   Nama kategori unik tanpa membedakan huruf besar/kecil: "Packaging Material" dan "packaging material" dianggap nama yang sama. Berlaku saat membuat maupun mengubah kategori. [KEPUTUSAN] (PRD FR-CAT-03)
-   Normalisasi spasi di awal/akhir nama belum diputuskan. [OPEN DECISION OD-19]
-   Pesan penolakan menjelaskan bahwa nama kategori sudah dipakai.

------------------------------------------------------------------------

## Aturan Hapus

-   Penghapusan kategori ditolak selama kategori masih digunakan oleh material mana pun, termasuk material yang diarsipkan. [KEPUTUSAN] (PRD FR-CAT-02)
-   Tidak ada cascading delete. [KEPUTUSAN]
-   Pesan penolakan menjelaskan bahwa kategori masih digunakan material, termasuk material arsip.

------------------------------------------------------------------------

# 7. Stock In Feature

## Feature Name

Incoming Stock Transaction

## Actor

Staff Warehouse.

## Purpose

Mencatat material yang masuk ke warehouse.

------------------------------------------------------------------------

## User Flow

    Material datang

    ↓

    Staff memilih material

    ↓

    Input jumlah masuk

    ↓

    Submit transaksi

    ↓

    Stock bertambah

------------------------------------------------------------------------

## Input

-   Material.
-   Quantity (bilangan bulat positif).
-   Notes.

------------------------------------------------------------------------

## Business Rules

Ketika transaksi berhasil:

    quantity_delta = +Quantity
    Current Stock  = Current Stock + quantity_delta

Sistem harus:

1.  Membuat transaction record bertipe `STOCK_IN` dengan `quantity_delta` positif. [KEPUTUSAN] (PRD FR-TRX-03)
2.  Menambahkan stok material.
3.  Menyimpan user yang melakukan transaksi dan waktunya.
4.  Menjalankan langkah 1–3 dalam satu operasi atomik: semuanya berhasil atau semuanya gagal. [KEPUTUSAN] (PRD FR-TRX-08; STACK-DECISION-LOG ADR-08)
5.  Menjadikan transaksi final saat penyimpanan berhasil. Draft formulir tidak disimpan di database. [KEPUTUSAN] (PRD FR-TRX-04)
6.  Tidak menggandakan perubahan stok jika request yang sama dikirim ulang (idempotency). [KEPUTUSAN] (PRD FR-TRX-05)
    -   Idempotency key unik per pengguna (pasangan pengguna dan key), dicatat dalam satu tabel idempotency yang dipakai lintas operasi mutasi yang relevan. Untuk inventori, operasi tersebut adalah Stock In/Out dan koreksi transaksi final. Mekanisme yang sama juga dipakai pembuatan Catatan Owner (§12a; PRD FR-NOTE-21); keunikan pasangan pengguna dan key berlaku lintas operasi tersebut, dan nama operasi ikut dibandingkan sehingga key yang sama untuk operasi lain tidak di-replay.
    -   Request ulang dengan key dan payload yang sama mengembalikan hasil operasi pertama tanpa mengulang mutasi.
    -   Request dengan key yang sama tetapi payload berbeda ditolak.
    -   Catatan idempotency tidak kedaluwarsa atau dihapus otomatis sebelum kebijakan retensi disetujui.
    -   Operasi lain, seperti posting dan pembatalan sesi Stock Opname, mencegah duplikasi melalui pemeriksaan status atau constraint; request ulangnya ditolak, bukan di-replay.
    -   Idempotency untuk pembuatan sesi Stock Opname belum diputuskan. [OPEN DECISION OD-20]

------------------------------------------------------------------------

## Validation

Transaksi ditolak jika:

-   Quantity bukan bilangan bulat atau tidak lebih besar dari 0. [KEPUTUSAN] (PRD FR-TRX-07)
-   Material sedang dibekukan oleh sesi Stock Opname aktif. [KEPUTUSAN] (PRD FR-TRX-06)
-   Material sudah diarsipkan. [KEPUTUSAN] (PRD FR-TRX-06)

Validasi berlaku di API dan database, bukan hanya di UI. [KEPUTUSAN]

------------------------------------------------------------------------

## Status implementasi (1 November 2026, Supabase lokal)

-   **Database** (7SUP.5A-2): RPC `post_stock_movement` untuk `STOCK_IN` dan `STOCK_OUT`. Rinciannya di DATABASE-DESIGN §15, "Pembaruan 1 November 2026 (7SUP.5A-2 dan 7SUP.5A-3)".
-   **REST API** (7SUP.5A-3):
    -   `GET /api/v1/materials`, `GET /api/v1/materials/{id}`, dan `GET /api/v1/materials/{id}/transactions`.
    -   `POST /api/v1/stock-movements`: hanya menerima `type: "STOCK_IN"`, dengan header `Idempotency-Key` berupa UUID.
        -   Pembaruan 7SUP.5B-2A (2 November 2026; working tree lokal, belum di-commit ke Git): endpoint ini juga menerima `type: "STOCK_OUT"`, dengan header `Idempotency-Key` dan validasi Zod yang sama. Butir di atas adalah potret 7SUP.5A-3. Status Stock Out (uji HTTP 7SUP.5B-2B; uji browser belum diverifikasi) dicatat di STACK-DECISION-LOG ADR-15 B5.2 dan ADR-16.
    -   Tambahan: `GET /api/v1/auth/session` mengembalikan id, nama, dan role pengguna yang sedang masuk.
    -   Validasi Zod sebelum RPC: kuantitas bilangan bulat 1 sampai 2.147.483.647, dan catatan maksimal 500 karakter (batas API; database tidak membatasi panjang catatan).
    -   Role pemanggil dibaca dari database, bukan dari request.
    -   Kode error RPC dipetakan ke status HTTP: 400 validasi, 403 role atau sesi tidak berwenang, 404 material tidak ditemukan, 409 material arsip atau beku dan batas stok, 422 key dipakai ulang dengan payload berbeda, dan 503 untuk kegagalan yang dapat diulang.
-   **Antarmuka** (7SUP.5A-3): halaman `/login`, `/materials`, dan `/materials/{id}` sebagai Client Component yang membaca data hanya melalui API (OD-18 Pilihan C).
    -   Form Stock In tampil hanya untuk Staff Warehouse; Owner melihat keterangan baca-saja.
    -   Setiap pengiriman memakai satu idempotency key. Bila hasilnya tidak pasti, pengiriman ulang memakai key dan payload yang sama.
    -   Setelah berhasil, saldo dan histori dimuat ulang dari API.
-   **Bukti uji:** 29 dari 29 uji HTTP lokal lulus, termasuk satu Stock In yang di-commit melalui API Next.js, replay tanpa transaksi ganda, penolakan Owner, dan penolakan CSRF.
-   **Uji browser manual** (7SUP.5A-3B, oleh pemilik proyek, lokal): login dan logout Staff serta Owner, daftar dan detail material, histori, validasi jumlah (kosong, nol, desimal), form yang tidak tampil untuk Owner, dan redirect `//evil.example` ke `/materials` berhasil diverifikasi.
-   **Belum diverifikasi:**
    -   pengiriman Stock In dengan jumlah valid melalui browser; transaksi committed baru terbukti melalui uji HTTP;
    -   fokus keyboard, atribut cookie `Path=/` di browser, serta input redirect `/\evil.example` dan `https://evil.example`;
    -   penolakan melalui API Next.js setelah penonaktifan atau cutoff G1 yang di-commit.
-   **Temuan terbuka:** satu sesi Auth STAFF_WAREHOUSE dari login pertama pada 1 November 2026 pukul 09:58:54 UTC masih aktif dan refresh token-nya belum dicabut. Sesi ini diterima pemilik proyek sebagai residual risk lokal.

------------------------------------------------------------------------

# 7a. Saldo Awal (`OPENING_BALANCE`)

## Purpose

Mencatat saldo awal material sebagai transaksi yang dapat diaudit.

## Status

-   Saldo awal dicatat sebagai transaksi bertipe `OPENING_BALANCE`. [KEPUTUSAN] (PRD FR-TRX-09)
-   Aturan dan validasinya belum diputuskan, termasuk jumlah pencatatan per material, waktu pencatatan, nilai yang sah, pelaku, cara koreksi, serta penerapan pembekuan, arsip, dan idempotency. [OPEN DECISION OD-17]
-   Alternatif dan rekomendasi (belum disetujui) dicatat di PRD, subbagian OD-17.

------------------------------------------------------------------------

# 8. Stock Out Feature

## Feature Name

Outgoing Stock Transaction

## Actor

Staff Warehouse.

## Purpose

Mencatat material yang digunakan atau keluar dari warehouse.

------------------------------------------------------------------------

## Input

-   Material.
-   Quantity (bilangan bulat positif).
-   Notes.

Pengguna memasukkan jumlah positif. Dampak stok yang disimpan bernilai negatif. [KEPUTUSAN] (PRD FR-TRX-02)

------------------------------------------------------------------------

## Business Rules

Ketika transaksi berhasil:

    quantity_delta = −Quantity
    Current Stock  = Current Stock + quantity_delta

Sistem harus:

1.  Membuat transaction record bertipe `STOCK_OUT` dengan `quantity_delta` negatif. [KEPUTUSAN]
2.  Mengurangi stok material.
3.  Menyimpan user yang melakukan transaksi dan waktunya.
4.  Menjalankan langkah 1–3 dalam satu operasi atomik. [KEPUTUSAN] (PRD FR-TRX-08)
5.  Menjadikan transaksi final saat penyimpanan berhasil, tanpa draft di database. [KEPUTUSAN]
6.  Menerapkan idempotency yang sama dengan Stock In. [KEPUTUSAN] (PRD FR-TRX-05)

------------------------------------------------------------------------

## Validation

1.  Quantity harus bilangan bulat dan lebih besar dari 0.
2.  Quantity tidak boleh melebihi current stock. Stok tidak pernah negatif. [KEPUTUSAN] (PRD FR-TRX-07)
3.  Material tidak sedang dibekukan oleh sesi Stock Opname aktif dan tidak diarsipkan. [KEPUTUSAN] (PRD FR-TRX-06)

Validasi berlaku di API dan database, bukan hanya di UI. [KEPUTUSAN]

Contoh:

Stock:

100 pcs

Request:

150 pcs

Result:

Transaction rejected.

------------------------------------------------------------------------

## Status implementasi (2 November 2026, Supabase lokal)

-   **Implementasi API** (7SUP.5B-2A): **IMPLEMENTED IN LOCAL WORKING TREE (NOT COMMITTED)**. `POST /api/v1/stock-movements` menerima `type: "STOCK_OUT"` dengan header `Idempotency-Key` dan validasi Zod yang sama dengan Stock In; validasi saldo, pembekuan, dan arsip tetap dijalankan oleh RPC database. File implementasinya masih untracked di working tree lokal dan belum di-commit ke Git. Build lulus.
-   **Uji HTTP** (7SUP.5B-2B, lokal): **HTTP-TESTED LOCALLY**.
    -   EXEC-R: 48 dari 48 lulus, tanpa mutasi inventori.
    -   EXEC-C: 63 dari 63 lulus, dengan satu transaksi database `STOCK_OUT` (−1) yang berhasil di-commit pada [DEMO] Kardus Medium. Replay dengan key dan payload identik tidak menghasilkan transaksi ganda; penggunaan ulang key dengan payload berbeda ditolak dengan HTTP 422.
    -   Log run belum diarsipkan permanen.
-   **Implementasi antarmuka** (7SUP.5B-2A): **IMPLEMENTED IN LOCAL WORKING TREE (NOT COMMITTED)**. Kartu Stock Out terpisah dari kartu Stock In dan hanya tampil untuk Staff Warehouse; Owner melihat keterangan baca-saja. Penyimpanan attempt dipisah per tipe transaksi. Build lulus; unit test (mock) 24 dari 24 lulus. Unit test memakai mock dan tidak membuktikan perilaku database maupun browser.
-   **Uji browser:** **NOT VERIFIED**. 7SUP.5B-3A FAIL prosedural (K3); B-01 sampai B-29 tidak dinilai dan tidak berstatus PASS. Uji browser yang memerlukan mutasi ditunda ke stack test E2E terisolasi (K5). Uji HTTP dan unit test tidak membuktikan perilaku antarmuka di browser.
-   **Belum dijalankan:** uji SQL boundary (Stock Out sebesar seluruh saldo, lalu satu unit berikutnya) sudah tersedia di `tests/integration/sql/`, tetapi belum pernah dijalankan.
-   **Pembaruan status Git (4 November 2026, DOC-SYNC-01):** butir di atas adalah potret 2 November 2026. Kode API dan antarmuka Stock Out kini di-commit secara lokal di C-6 (`b781551`), dan harness `tests/` di C-7 (`bb6865b`), di branch `feat/supabase-foundation`; belum di-push ke GitHub. Status uji tidak berubah: uji browser belum diverifikasi dan uji SQL boundary belum dijalankan.
-   Status yang sama dicatat di STACK-DECISION-LOG ADR-15 B5.2 dan ADR-16. Aturan bisnis dan validasi di atas adalah spesifikasi; status ini tidak mengubahnya.

------------------------------------------------------------------------

# 8a. Koreksi Transaksi Final

## Feature Name

Final Transaction Correction

## Actor

Staff Warehouse. Owner dapat meninjau histori koreksi tetapi tidak dapat melakukan atau menimpa koreksi.

## Purpose

Memperbaiki kesalahan pada transaksi final tanpa mengedit atau menghapus histori.

------------------------------------------------------------------------

## Business Rules

1.  Transaksi final tidak dapat diedit atau dihapus oleh siapa pun. [KEPUTUSAN] (PRD FR-COR-01)
2.  Koreksi terdiri dari [KEPUTUSAN] (PRD FR-COR-02):
    -   Transaksi `REVERSAL` yang merujuk transaksi awal dan membalik efeknya (`quantity_delta` berlawanan tanda dengan transaksi awal).
    -   Transaksi pengganti yang mencatat nilai benar.
3.  `REVERSAL` dan transaksi pengganti diproses dalam satu operasi atomik. [KEPUTUSAN]
4.  Alasan koreksi wajib diisi. Pelaku, waktu, alasan, dan relasi antartransaksi disimpan. [KEPUTUSAN]
5.  Koreksi memakai mekanisme idempotency yang sama dengan Stock In/Out. [KEPUTUSAN] (PRD FR-COR-05)
6.  Aturan koreksi berulang [KEPUTUSAN] (PRD FR-COR-06):
    -   Satu transaksi asal paling banyak memiliki satu `REVERSAL`.
    -   Transaksi bertipe `REVERSAL` tidak dapat di-reverse.
    -   Transaksi pengganti adalah transaksi biasa sehingga dapat dikoreksi kembali dengan pola yang sama.
    -   Transaksi asal, `REVERSAL`, dan transaksi pengganti tetap tersimpan tanpa diedit atau dihapus.

------------------------------------------------------------------------

## User Flow

    Staff memilih transaksi final yang salah

    ↓

    Input alasan koreksi dan nilai yang benar

    ↓

    Submit koreksi

    ↓

    Sistem mencatat REVERSAL + transaksi pengganti secara atomik

    ↓

    Stock disesuaikan; histori menampilkan relasi koreksi

------------------------------------------------------------------------

## Contoh

Stock In tercatat +200 pcs, seharusnya +20 pcs:

| Transaksi | Tipe | `quantity_delta` |
|---|---|---|
| Awal | `STOCK_IN` | +200 |
| Koreksi | `REVERSAL` (merujuk transaksi awal) | −200 |
| Pengganti | `STOCK_IN` | +20 |

Efek bersih: +20.

------------------------------------------------------------------------

## Validation

Koreksi ditolak jika:

-   Material terkait sedang dibekukan oleh sesi Stock Opname aktif. [DITURUNKAN] (PRD FR-COR-04)
-   Hasil koreksi membuat stok negatif. [DITURUNKAN] (PRD FR-COR-04)
-   Alasan koreksi kosong. [KEPUTUSAN]
-   Koreksi menulis transaksi pengubah stok, yaitu `REVERSAL` maupun transaksi pengganti, pada material yang diarsipkan. Material harus direaktivasi lebih dulu (PRD FR-MAT-08). Pemeriksaan berlaku untuk setiap material yang stoknya dimutasi oleh koreksi. [KEPUTUSAN] (PRD FR-COR-04)

Koreksi yang ditolak tidak meninggalkan transaksi `REVERSAL`, transaksi pengganti, maupun perubahan stok parsial. [DITURUNKAN dari PRD FR-COR-02] Histori transaksi material arsip tetap dapat dibaca. [KEPUTUSAN] (PRD FR-COR-04) Setelah reaktivasi, koreksi tetap harus memenuhi seluruh validasi di atas, termasuk pembekuan Stock Opname dan larangan stok negatif.

Penyesuaian dari sesi Stock Opname yang telah diposting (`ADJUSTMENT`) tidak dikoreksi dengan `REVERSAL`, tetapi melalui sesi Stock Opname baru. [KEPUTUSAN] (PRD FR-COR-03)

Belum diputuskan:

-   Transaksi duplikat yang seharusnya tidak ada, tanpa nilai pengganti. [OPEN DECISION OD-09]
-   Transaksi pengganti dengan material atau tipe berbeda. [OPEN DECISION OD-10]
-   Koreksi transaksi `OPENING_BALANCE`. [OPEN DECISION OD-17]

------------------------------------------------------------------------

# 9. Transaction History Feature

## Feature Name

Inventory Transaction History

## Purpose

Menyediakan histori perubahan inventory yang dapat diaudit.

------------------------------------------------------------------------

## Display Data

-   Material.
-   Transaction type: `OPENING_BALANCE`, `STOCK_IN`, `STOCK_OUT`, `ADJUSTMENT`, `REVERSAL`. [KEPUTUSAN]
-   `quantity_delta` beserta satuan material.
-   User.
-   Date.
-   Notes atau alasan.
-   Relasi koreksi (transaksi awal, `REVERSAL`, dan pengganti).
-   Sesi Stock Opname terkait untuk transaksi `ADJUSTMENT`.

(PRD FR-HIS-01)

------------------------------------------------------------------------

## Filter

User dapat melakukan filter:

-   Transaction type.
-   Date range.
-   Material.

(PRD FR-HIS-02)

------------------------------------------------------------------------

# 10. Stock Opname Feature

## Feature Name

Inventory Stock Opname (berbasis sesi)

## Actor

-   Staff Warehouse: melakukan penghitungan fisik dan menerapkan penyesuaian.
-   Owner: memantau proses dan hasil; tidak mengubah stok secara langsung. [KEPUTUSAN]

## Purpose

Membandingkan stok sistem dengan kondisi fisik warehouse dan memperbarui saldo stok sistem berdasarkan hasil hitung, dengan penyesuaian yang tercatat dan dapat diaudit.

------------------------------------------------------------------------

## Status Sesi

| Status | Arti |
|---|---|
| `ACTIVE` | Sesi sedang berjalan; material di dalamnya dibekukan |
| `POSTED` | Penyesuaian telah diterapkan |
| `CANCELLED` | Sesi dibatalkan; stok tidak berubah. Status terminal |

Tidak ada tahap persetujuan Owner. [DITURUNKAN] (PRD FR-OPN-02)

------------------------------------------------------------------------

## User Flow

    Staff Warehouse membuat sesi (status ACTIVE)                 [KEPUTUSAN] FR-OPN-01

    ↓

    Pembuat sesi menambahkan material ke sesinya                 [KEPUTUSAN] FR-OPN-01, FR-OPN-03
    → material dibekukan; stok sistem dicatat sebagai snapshot   [KEPUTUSAN] FR-OPN-04
      · oleh Staff lain selain pembuat sesi: [OPEN DECISION OD-02]

    ↓

    Pembuat sesi mengisi dan dapat mengedit hasil hitung         [KEPUTUSAN] FR-OPN-06, FR-OPN-07
    sebelum posting
      · oleh Staff lain selain pembuat sesi: [OPEN DECISION OD-02]

    ↓

    Pembuat sesi memposting sesinya jika validasi terpenuhi      [KEPUTUSAN] FR-OPN-10, FR-OPN-13
    → seluruh penyesuaian diterapkan atomik → POSTED, pembekuan dilepas
      · oleh Staff lain selain pembuat sesi: [OPEN DECISION OD-16]

      atau

    Batal oleh Staff Warehouse mana pun, termasuk sesi buatan    [KEPUTUSAN] FR-OPN-14
    Staff lain, dengan alasan wajib
    → stok tidak berubah → CANCELLED (terminal), pembekuan dilepas atomik

Hak pembuat sesi atas sesinya sendiri adalah penjabaran alur normal dari PRD FR-OPN-01, FR-OPN-03, FR-OPN-06, dan FR-OPN-13.

------------------------------------------------------------------------

## Input

-   Membuat sesi: tanpa input material wajib saat pembuatan.
-   Menambah item: material aktif (bukan arsip).
-   Mengisi hasil hitung: bilangan bulat ≥ 0 per item. [KEPUTUSAN] (PRD FR-OPN-06)
-   Membatalkan sesi: alasan pembatalan (wajib).

------------------------------------------------------------------------

## Business Rules

### Pembekuan material

1.  Stock In, Stock Out, dan operasi lain yang mengubah stok ditolak untuk material yang berada di sesi aktif. [KEPUTUSAN] (PRD FR-OPN-04)
2.  Material di luar sesi tidak ikut dibekukan. [KEPUTUSAN]
3.  Pembekuan ditegakkan di database dengan operasi atomik dan row locking, bukan hanya di UI. [KEPUTUSAN]
4.  Satu material hanya dapat berada di satu sesi aktif. Sesi aktif berbeda boleh berjalan bersamaan hanya jika materialnya tidak beririsan. [KEPUTUSAN] (PRD FR-OPN-05)

### Item dan hasil hitung

1.  Material dapat ditambahkan selama sesi masih aktif. Material arsip tidak dapat ditambahkan. [KEPUTUSAN] (PRD FR-OPN-03)
2.  Hasil hitung dapat diedit sebelum posting. [KEPUTUSAN] (PRD FR-OPN-06)
3.  Setiap item menyimpan hasil hitung terakhir beserta pelaku dan waktu pengisian atau perubahan terakhir. Ini bukan riwayat lengkap revisi nilai. [KEPUTUSAN] (PRD FR-OPN-07)
4.  Menghapus item dari sesi aktif belum diputuskan. [OPEN DECISION OD-01]

### Posting

1.  Posting ditolak jika masih ada item yang belum dihitung. [KEPUTUSAN] (PRD FR-OPN-08)
2.  Sesi tanpa item tidak dapat diposting dan hanya dapat dibatalkan. [KEPUTUSAN] (PRD FR-OPN-09)
3.  Posting bersifat atomik: seluruh penyesuaian sesi berhasil bersama atau gagal tanpa perubahan stok parsial, dan pembekuan dilepas dalam operasi yang sama. [KEPUTUSAN] (PRD FR-OPN-10)
4.  Item dengan selisih tidak nol menghasilkan transaksi `ADJUSTMENT` yang tertaut ke sesi dan item terkait. [KEPUTUSAN] (PRD FR-OPN-12)
5.  Item dengan selisih nol tetap disimpan, tetapi tidak menghasilkan transaksi `ADJUSTMENT`. [KEPUTUSAN] (PRD FR-OPN-11)

### Pembatalan

1.  Semua Staff Warehouse dapat membatalkan sesi aktif, termasuk sesi buatan Staff lain. [KEPUTUSAN] (PRD FR-OPN-14)
2.  Alasan wajib; pelaku, waktu, dan alasan dicatat.
3.  Pembatalan tidak mengubah stok, dan pembekuan dilepas secara atomik.
4.  `CANCELLED` bersifat terminal dan tidak dapat diaktifkan kembali.
5.  Sesi `POSTED` tidak dapat dibatalkan melalui mekanisme pembatalan sesi aktif. [KEPUTUSAN] (PRD FR-OPN-15) Koreksi atas hasil sesi yang telah diposting dilakukan melalui sesi Stock Opname baru. (PRD FR-COR-03)

### Lain-lain

1.  Sesi tidak kedaluwarsa secara otomatis pada MVP. [KEPUTUSAN] (PRD FR-OPN-16)
2.  Blind count tidak diwajibkan untuk MVP. [KEPUTUSAN] (PRD FR-OPN-17)

------------------------------------------------------------------------

## Calculation

Formula per item:

    quantity_delta (ADJUSTMENT) =
    Actual Stock (hasil hitung) - System Stock

------------------------------------------------------------------------

## Example

| Material | System Stock | Actual Stock | Hasil |
|---|---|---|---|
| Kardus Medium | 100 | 96 | Transaksi `ADJUSTMENT` dengan `quantity_delta` = −4 |
| Ribbon Merah | 40 | 40 | Hasil hitung tersimpan; tidak ada transaksi `ADJUSTMENT` |

------------------------------------------------------------------------

# 11. Status Stok Operasional dan Klasifikasi AI

## 11.1 Status Stok Operasional

## Purpose

Memberikan informasi kondisi stok secara deterministik dari data.

------------------------------------------------------------------------

## Business Rules

Status ditentukan dari `current_stock` dan `minimum_stock` [KEPUTUSAN] (PRD FR-STS-01):

| Status | Kondisi |
|---|---|
| `OUT_OF_STOCK` | `current_stock == 0` |
| `LOW_STOCK` | `current_stock > 0` dan `current_stock <= minimum_stock` |
| `NORMAL` | `current_stock > minimum_stock` |

-   Status dihitung dari data, tidak diinput manual. [KEPUTUSAN] (PRD FR-STS-02)
-   Status operasional tidak dicampur dengan klasifikasi AI. [KEPUTUSAN]
-   Status lama "Aman / Perlu Perhatian / Prioritas Restock" pada versi sebelumnya dokumen ini digantikan oleh tiga status di atas.

------------------------------------------------------------------------

## 11.2 Klasifikasi AI [Pending Confirmation]

-   Brief, sebagaimana dilaporkan pengguna [BRIEF-dilaporkan], menyebut kategori klasifikasi `Safe`, `Need Attention`, dan `Restock Priority`. Nama-nama ini dicatat sebagai **kandidat yang belum dikonfirmasi**, bukan label final, bukan requirement MVP, dan bukan fitur yang sudah disetujui.
-   Yang sudah final [KEPUTUSAN]: jika klasifikasi AI dikerjakan, ia menjadi fitur terpisah, tidak menentukan status stok operasional (§11.1), dan tidak menggantikan validasi transaksi.
-   Status, rencana, dan pertanyaan konfirmasi: lihat PRD, bagian Ruang Lingkup AI.

------------------------------------------------------------------------

# 12. Dashboard Feature

## Feature Name

Inventory Dashboard

## Actor

Owner dan Staff Warehouse.

## Purpose

Memberikan ringkasan kondisi warehouse yang membantu keputusan operasional.

------------------------------------------------------------------------

## Dashboard Component

### Urutan Area Utama

Desain dashboard yang sudah ada dipertahankan; dashboard tidak dirancang ulang dan isi komponen lain tidak berubah. Urutan area utama [KEPUTUSAN] (PRD Arah UI/UX):

1.  Summary Card (empat kartu ringkasan stok).
2.  Panel Catatan Owner (§12a).
3.  Grafik Pergerakan Stok dan Material per Kategori.
4.  Tabel Material yang Perlu Perhatian.

Sidebar memuat ringkasan Catatan Owner di ruang antara menu "06 Riwayat" dan kartu "Kondisi Gudang" (§12a). Urutan dan posisi ini mengacu pada gambar referensi dashboard di luar repository; widget Material per Kategori dan kartu Kondisi Gudang disebut sebagai patokan posisi, bukan requirement baru. Ukuran, koordinat, dan perilaku responsif ditentukan saat implementasi UI.

------------------------------------------------------------------------

### Summary Card

Menampilkan [KEPUTUSAN] (PRD FR-DASH-01):

-   Total Material.
-   Stok Normal (`NORMAL`).
-   Stok Rendah (`LOW_STOCK`).
-   Stok Habis (`OUT_OF_STOCK`).

Seluruh kartu ringkasan hanya menghitung material aktif; material arsip tidak dihitung. [DITURUNKAN]

------------------------------------------------------------------------

### Material yang Perlu Perhatian

Tabel material berstatus `OUT_OF_STOCK` lalu `LOW_STOCK`. [KEPUTUSAN] (PRD FR-DASH-02)

------------------------------------------------------------------------

### Pergerakan Stok

-   Menampilkan informasi pergerakan stok yang berguna bagi Owner. (PRD FR-DASH-03)
-   Kuantitas dengan satuan berbeda tidak dijumlahkan. [DITURUNKAN]
-   Bentuk widget ditentukan saat desain UI.

------------------------------------------------------------------------

### Data Contoh

Data contoh yang belum berasal dari database diberi label "DATA DUMMY". [KEPUTUSAN] (PRD FR-DASH-04)

------------------------------------------------------------------------

### Catatan Owner

Panel Catatan Owner dan ringkasan sidebar dijabarkan di §12a. (PRD FR-NOTE-12, FR-NOTE-13, FR-NOTE-20)

------------------------------------------------------------------------

# 12a. Catatan Owner

## Feature Name

Owner Notes

## Actor

-   Owner: membuat catatan, mengedit dan menghapus catatan miliknya, membaca feedback serta memantau kondisi dan waktu penyelesaian (PRD FR-NOTE-09), dan menandai catatan yang sudah selesai sebagai "Sudah Ditinjau".
-   Staff Warehouse: membaca catatan, menandai pekerjaan selesai, serta menulis dan memperbarui feedback.

Owner dan Staff Warehouse sama-sama dapat membaca catatan beserta kondisi penyelesaian, kondisi peninjauan, dan feedback-nya, sesuai hak akses masing-masing. [KEPUTUSAN] (PRD FR-NOTE-02)

## Purpose

Menyampaikan tugas, informasi operasional, atau reminder dari Owner kepada Staff Warehouse melalui dashboard, dan memantau penyelesaiannya. Fitur ini bukan chat, komentar bertingkat, notifikasi real-time, maupun penugasan ke banyak penerima. [KEPUTUSAN] (PRD FR-NOTE)

------------------------------------------------------------------------

## Lokasi dan Tata Letak

[KEPUTUSAN] (PRD Arah UI/UX)

-   Panel Catatan Owner berada di area utama dashboard, tepat di bawah empat kartu ringkasan stok dan sebelum grafik (§12).
-   Ringkasan Catatan Owner berada di sidebar, di ruang antara menu "06 Riwayat" dan kartu "Kondisi Gudang".
-   Ukuran, koordinat, dan perilaku responsif belum diverifikasi dan ditentukan saat implementasi UI berdasarkan gambar referensi dashboard.
-   Tampilan memakai token Forest & Linen, tanpa logo baru maupun aset gambar baru.

------------------------------------------------------------------------

## Kondisi Catatan

[KEPUTUSAN] (PRD FR-NOTE-05, FR-NOTE-17, FR-NOTE-19)

| Kondisi | Terjadi ketika | Tampilan | Label |
|---|---|---|---|
| Belum selesai | Catatan dibuat | Teks dan kartu normal | — |
| Selesai, menunggu tinjauan | Staff Warehouse mencentang "Selesai" | Teks dicoret; kartu redup dengan teks tetap terbaca | "Menunggu Tinjauan" |
| Selesai, sudah ditinjau | Owner mencentang "Sudah Ditinjau" | Teks dicoret; kartu redup dengan teks tetap terbaca; feedback terkunci | "Sudah Ditinjau" |

Transisi yang diizinkan:

| Dari | Ke | Pelaku | Syarat |
|---|---|---|---|
| — | Belum selesai | Owner | Isi catatan tidak kosong |
| Belum selesai | Selesai, menunggu tinjauan | Staff Warehouse | Catatan belum pernah diselesaikan |
| Selesai, menunggu tinjauan | Selesai, sudah ditinjau | Owner | Catatan sudah selesai |

Transisi lain belum diputuskan: pembatalan checklist "Selesai" [OPEN DECISION OD-26] dan pembatalan tinjauan [OPEN DECISION OD-23].

------------------------------------------------------------------------

## User Flow

### Owner

    Owner membuat catatan dari panel Catatan Owner

    ↓

    Catatan tampil dalam kondisi belum selesai bagi Owner dan Staff Warehouse

    ↓

    Owner memantau penyelesaian dan membaca feedback

    ↓

    Setelah catatan selesai, Owner mencentang "Sudah Ditinjau"

    ↓

    Feedback terkunci; catatan tetap tersedia di Riwayat Catatan

### Staff Warehouse

    Staff Warehouse membaca catatan di panel atau di "Lihat Semua Catatan"

    ↓

    Staff Warehouse mengerjakan tugas, lalu mencentang "Selesai"

    ↓

    Staff Warehouse menulis atau memperbarui feedback selama catatan belum ditinjau

Urutan antara menulis feedback dan mencentang "Selesai" belum ditetapkan. [OPEN DECISION OD-21]

------------------------------------------------------------------------

## Input

-   Membuat atau mengedit catatan: isi catatan berupa teks, tidak boleh kosong. (PRD FR-NOTE-01)
-   Membuat catatan: idempotency key, wajib. Satu key mewakili satu tindakan pembuatan; key yang sama dipakai kembali saat request tersebut dikirim ulang. [KEPUTUSAN] (PRD FR-NOTE-21)
-   Feedback: teks dari Staff Warehouse. Kewajiban dan strukturnya mengikuti OD-21 dan OD-22.
-   Checklist "Selesai" dan "Sudah Ditinjau": aksi tanpa input tambahan.
-   Identitas pelaku dan waktu bukan input dari pengguna; nilainya ditetapkan server atau database. [KEPUTUSAN] (PRD FR-NOTE-16)

------------------------------------------------------------------------

## Business Rules

### Pembuatan, perubahan, dan penghapusan

1.  Owner dapat membuat catatan tanpa batas jumlah per hari. [KEPUTUSAN] (PRD FR-NOTE-01)
2.  Owner dapat mengedit dan menghapus catatan miliknya. [KEPUTUSAN] (PRD FR-NOTE-03, FR-NOTE-04) Aturan setelah catatan selesai atau ditinjau belum diputuskan [OPEN DECISION OD-24], begitu pula metode penghapusan [OPEN DECISION OD-25].
3.  Catatan tidak dihapus otomatis, termasuk saat tanggal berganti. [KEPUTUSAN] (PRD FR-NOTE-14)

### Idempotency pembuatan catatan

[KEPUTUSAN] (PRD FR-NOTE-21)

1.  Request pembuatan catatan tanpa idempotency key ditolak.
2.  Request pertama dengan key baru membuat tepat satu catatan.
3.  Request ulang dengan pengguna, key, operasi, dan payload kanonik yang sama mengembalikan hasil pembuatan sebelumnya tanpa membuat catatan baru, termasuk bila respons request pertama tidak diterima browser.
4.  Key yang sama dengan payload atau operasi berbeda ditolak.
5.  Dua tindakan dengan key berbeda tetap menghasilkan dua catatan sah walaupun isinya identik.
6.  Request bersamaan dengan key yang sama menghasilkan tepat satu catatan.
7.  Pembuatan catatan dan pencatatan idempotency berlangsung atomik: keduanya tersimpan bersama atau tidak sama sekali.
8.  Identitas pengguna untuk idempotency diambil dari sesi autentikasi, bukan dari input browser (PRD FR-NOTE-16).
9.  Mekanisme idempotency dipakai bersama dengan mutasi inventori (§7, aturan 6), tetapi tidak memberi Staff Warehouse hak membuat Catatan Owner. Hak membuat catatan tetap hanya untuk Owner dengan profil valid (PRD FR-NOTE-01, FR-AUTH-05).
10. Hasil replay untuk catatan yang sudah dihapus belum diputuskan. [OPEN DECISION OD-25]

### Penyelesaian

1.  Hanya Staff Warehouse yang dapat mencentang "Selesai". [KEPUTUSAN] (PRD FR-NOTE-06, FR-NOTE-11)
2.  Satu catatan hanya memiliki satu penyelesai; identitas penyelesai dan waktu penyelesaian dicatat. [KEPUTUSAN] Catatan yang sudah selesai tidak dapat diselesaikan ulang oleh pengguna lain. [DITURUNKAN] (PRD FR-NOTE-06)
3.  Menandai selesai mencatat identitas penyelesai dan waktu penyelesaian di database, serta mengubah tampilan catatan menjadi dicoret dan lebih redup bagi Owner maupun Staff Warehouse. Isi asli catatan yang tersimpan tidak berubah. [KEPUTUSAN] (PRD FR-NOTE-06, FR-NOTE-17)

### Feedback

1.  Staff Warehouse dapat menulis feedback di bawah catatan; penulis dan waktu feedback dicatat. [KEPUTUSAN] (PRD FR-NOTE-07)
2.  Staff Warehouse dapat memperbarui feedback selama catatan belum ditinjau. [KEPUTUSAN] (PRD FR-NOTE-08)
3.  Setelah catatan ditandai "Sudah Ditinjau", pembaruan feedback ditolak oleh backend dan database, termasuk bila diminta di luar antarmuka aplikasi. Menonaktifkan kontrol di UI saja tidak cukup. [KEPUTUSAN] (PRD FR-NOTE-08)
4.  Feedback ditampilkan di bawah isi catatan, tidak dicoret, dan tetap jelas terbaca pada setiap kondisi. [KEPUTUSAN] (PRD FR-NOTE-18)

### Peninjauan

1.  Hanya Owner yang dapat mencentang "Sudah Ditinjau", dan hanya pada catatan yang sudah selesai. [KEPUTUSAN] (PRD FR-NOTE-10)
2.  Identitas peninjau dan waktu peninjauan dicatat, terpisah dari data penyelesaian. [KEPUTUSAN] (PRD FR-NOTE-10)
3.  Teks yang dicoret menandakan pekerjaan selesai, bukan bahwa catatan sudah ditinjau. Kondisi peninjauan ditunjukkan oleh label. [KEPUTUSAN] (PRD FR-NOTE-19)
4.  Pembatalan tinjauan dan peninjauan catatan selesai yang tidak memiliki feedback belum diputuskan. [OPEN DECISION OD-23]

### Daftar aktif dan tanggal WIB

Daftar aktif memakai tanggal kalender `Asia/Jakarta` (WIB). [KEPUTUSAN] (PRD FR-NOTE-13)

-   Catatan belum selesai selalu termasuk daftar aktif, tanpa batas pergantian tanggal.
-   Catatan selesai termasuk daftar aktif hanya sampai akhir tanggal WIB hari penyelesaiannya, baik sudah maupun belum ditinjau.
-   Aturan ini berbasis tanggal kalender, bukan 24 jam sejak penyelesaian.

Contoh:

| Diselesaikan (WIB) | Dilihat (WIB) | Termasuk daftar aktif |
|---|---|---|
| 30 Oktober 2026, 15.00 | 30 Oktober 2026, 23.59 | Ya |
| 30 Oktober 2026, 15.00 | 31 Oktober 2026, 00.00 | Tidak; tetap ada di Riwayat Catatan |
| 30 Oktober 2026, 23.59 | 31 Oktober 2026, 00.00 | Tidak; tetap ada di Riwayat Catatan |
| Belum selesai (dibuat 30 Oktober 2026) | 31 Oktober 2026, 08.00 | Ya |

### Panel dan ringkasan sidebar

1.  Panel menampilkan maksimal 3 catatan dari daftar aktif, dengan catatan belum selesai diprioritaskan. Batas 3 hanya untuk tampilan, bukan untuk jumlah data maupun jumlah catatan yang boleh dibuat. [KEPUTUSAN] (PRD FR-NOTE-12)
2.  Bila daftar aktif berisi lebih dari 3 catatan, tersedia "Lihat Semua Catatan" untuk daftar lengkap dan detail. [KEPUTUSAN] (PRD FR-NOTE-12)
3.  Feedback tetap dapat dibaca dari panel dashboard; detail panjang tersedia melalui "Lihat Semua Catatan". [KEPUTUSAN]
4.  Kontrol mengikuti role: Owner melihat tombol Buat Catatan dan checklist "Sudah Ditinjau" (hanya pada catatan selesai); Staff Warehouse melihat checklist "Selesai" dan kontrol feedback. [KEPUTUSAN]
5.  Ringkasan sidebar menampilkan jumlah catatan belum selesai dan jumlah catatan yang diselesaikan pada tanggal WIB hari ini, dihitung dari seluruh data yang memenuhi kriteria, serta shortcut ke panel atau daftar lengkap. Sidebar tidak memuat isi catatan panjang, feedback lengkap, maupun checklist. [KEPUTUSAN] (PRD FR-NOTE-20)
6.  Urutan catatan di dalam kelompok prioritas ditentukan saat desain UI.

### Riwayat Catatan

1.  Catatan selesai beserta feedback-nya tetap tersimpan dan dapat dibuka melalui Riwayat Catatan. Membuka riwayat tidak mengubah kondisi catatan maupun audit trail. [KEPUTUSAN] (PRD FR-NOTE-14)
2.  Owner dapat membuka Riwayat Catatan untuk tanggal berapa pun. [KEPUTUSAN] (PRD FR-NOTE-14)
3.  Owner dapat menemukan catatan yang selesai tetapi belum ditinjau setelah catatan tersebut keluar dari daftar aktif, lalu menandainya "Sudah Ditinjau". [KEPUTUSAN] (PRD FR-NOTE-15)
4.  Akses Staff Warehouse ke Riwayat Catatan belum diputuskan. [OPEN DECISION OD-27]

### Hak akses

[KEPUTUSAN] (PRD FR-NOTE-11; PRD Matriks Hak Akses)

-   Staff Warehouse tidak dapat membuat catatan, mengubah isi asli catatan Owner, menghapus catatan Owner, maupun mencentang "Sudah Ditinjau".
-   Owner tidak mencentang "Selesai" dan tidak menulis feedback atas nama Staff Warehouse. [DITURUNKAN]
-   Hak tulis Owner pada Catatan Owner tidak memberi hak menulis ke inventori.
-   Seluruh pembatasan ditegakkan di server dan database. Menyembunyikan tombol di UI bukan bentuk otorisasi.
-   Tampilan nama pembuat, penyelesai, atau peninjau bergantung pada hak baca profil pengguna lain. [OPEN DECISION OD-28]

------------------------------------------------------------------------

## Tampilan per Kondisi

| Elemen | Belum selesai | Selesai, menunggu tinjauan | Selesai, sudah ditinjau |
|---|---|---|---|
| Teks catatan | Normal | Dicoret | Dicoret |
| Kartu | Normal | Redup, teks tetap terbaca | Redup, teks tetap terbaca |
| Feedback | Ketersediaan feedback sebelum penyelesaian mengikuti OD-21; bila ada, tidak dicoret | Tampil di bawah isi; tidak dicoret | Tampil di bawah isi; tidak dicoret; tanpa kontrol edit |
| Label | — | "Menunggu Tinjauan" | "Sudah Ditinjau" |
| Kontrol Staff Warehouse | Checklist "Selesai"; kontrol feedback sebelum selesai mengikuti OD-21 | Tulis atau perbarui feedback | Tidak ada |
| Kontrol Owner | Edit dan hapus | Checklist "Sudah Ditinjau"; edit dan hapus mengikuti OD-24 | Edit dan hapus mengikuti OD-24 |

------------------------------------------------------------------------

## Acceptance Criteria

Belum ada kriteria yang terpenuhi atau teruji.

1.  Owner dapat membuat lebih dari 3 catatan dalam satu hari; seluruhnya tersimpan, dan panel hanya menampilkan 3 catatan.
2.  Catatan dengan isi kosong ditolak.
3.  Staff Warehouse yang mencoba membuat, mengubah isi, atau menghapus catatan Owner ditolak, termasuk bila diminta langsung ke backend.
4.  Setelah Staff Warehouse mencentang "Selesai", penyelesai dan waktu penyelesaian tercatat; teks dicoret dan kartu redup bagi Owner maupun Staff Warehouse; isi catatan yang tersimpan tidak berubah.
5.  Upaya menyelesaikan catatan yang sudah selesai ditolak.
6.  Owner yang mencentang "Sudah Ditinjau" pada catatan belum selesai ditolak.
7.  Staff Warehouse yang mencoba menandai "Sudah Ditinjau" ditolak.
8.  Setelah catatan ditinjau, pembaruan feedback ditolak di API dan database.
9.  Feedback tidak pernah ditampilkan dicoret.
10. Label "Menunggu Tinjauan" dan "Sudah Ditinjau" tampil sesuai kondisi.
11. Catatan yang diselesaikan pukul 23.59 WIB masih termasuk daftar aktif pada pukul 23.59, dan tidak lagi termasuk pada pukul 00.00 WIB hari berikutnya; catatan belum selesai tetap termasuk.
12. Jumlah catatan di database tidak berkurang setelah tanggal berganti.
13. Sehari setelah diselesaikan, catatan yang belum ditinjau dapat ditemukan Owner di Riwayat Catatan dan ditandai "Sudah Ditinjau".
14. Angka di ringkasan sidebar sama dengan hitungan dari seluruh data yang memenuhi kriteria, termasuk ketika daftar aktif berisi lebih dari 3 catatan.
15. Identitas pelaku dan waktu yang dikirim dari browser tidak dipakai; nilai yang tersimpan berasal dari server atau database.
16. Owner tetap ditolak saat mencoba menulis ke inventori.
17. Panel tampil tepat di bawah empat kartu ringkasan dan sebelum grafik, dan komponen dashboard lain tetap ada.
18. Pembuatan catatan dengan idempotency key baru menghasilkan tepat satu catatan.
19. Pembuatan catatan tanpa idempotency key ditolak, dan tidak ada catatan yang dibuat.
20. Request ulang dengan key dan payload yang sama mengembalikan catatan yang sama; jumlah catatan tidak bertambah.
21. Key yang sama dengan payload berbeda ditolak, dan tidak ada catatan baru.
22. Key yang sebelumnya dipakai untuk operasi lain ditolak saat dipakai untuk membuat catatan, dan tidak di-replay sebagai hasil operasi lama.
23. Dua pembuatan dengan key berbeda dan isi identik menghasilkan dua catatan.
24. Dua request bersamaan dengan key yang sama menghasilkan tepat satu catatan.
25. Bila request pertama tersimpan tetapi responsnya tidak diterima, retry dengan key yang sama tidak menggandakan catatan.
26. Staff Warehouse yang mencoba membuat catatan ditolak, walaupun menyertakan idempotency key yang valid.
27. Identitas pembuat yang dikirim dalam request tidak dipakai; pembuat yang tersimpan adalah pengguna dari sesi autentikasi.
28. Bila pembuatan catatan gagal, tidak ada catatan idempotency yang tertinggal, dan sebaliknya.

------------------------------------------------------------------------

# 13. Reporting Feature

## Feature Name

Inventory Reporting

## Purpose

Menyediakan informasi operasional dalam bentuk laporan.

------------------------------------------------------------------------

## Inventory Report

Menampilkan (PRD FR-RPT-01):

-   Nama material.
-   Kategori.
-   Satuan.
-   Current stock.
-   Minimum stock.
-   Status stok operasional.

------------------------------------------------------------------------

## Transaction Report

Menampilkan (PRD FR-RPT-02):

-   Jenis transaksi.
-   Material.
-   `quantity_delta` beserta satuan.
-   User.
-   Tanggal transaksi.

------------------------------------------------------------------------

# 14. Search and Filter Feature

## Feature Name

Inventory Search

## Purpose

Mempermudah pengguna menemukan data.

------------------------------------------------------------------------

## Search

Search berdasarkan:

-   Nama material.

------------------------------------------------------------------------

## Filter

Filter berdasarkan (PRD FR-SRCH-01):

-   Kategori.
-   Status stok operasional (`OUT_OF_STOCK`, `LOW_STOCK`, `NORMAL`).
-   Transaction type (`OPENING_BALANCE`, `STOCK_IN`, `STOCK_OUT`, `ADJUSTMENT`, `REVERSAL`).

------------------------------------------------------------------------

# 15. Feature Development Rule

Ketika melakukan implementasi:

AI harus:

1.  Mengikuti spesifikasi fitur ini, PRD kanonik, dan STACK-DECISION-LOG.
2.  Tidak menambah behavior baru tanpa persetujuan.
3.  Tidak memperlakukan OPEN DECISION sebagai keputusan final.
4.  Menjelaskan perubahan yang dilakukan.
5.  Memberikan langkah testing.

Jika terdapat konflik antara feature specification dan implementasi:

Dokumen harus direview terlebih dahulu.

------------------------------------------------------------------------

# 16. MVP Completion Criteria

Smart Warehouse Firaza dianggap memenuhi MVP apabila kriteria berikut terpenuhi. **Saat ini belum ada kriteria yang terpenuhi seluruhnya.**

Bukti parsial di Supabase lokal (1 November 2026, 7SUP.5A-2 dan 7SUP.5A-3):

-   Login dan logout, serta penolakan pengguna tanpa sesi atau tanpa role yang berwenang di server dan database, lulus uji HTTP dan database.
-   Stock In dan Stock Out lulus uji di level database. Stock In juga lulus melalui API Next.js.
    -   Pembaruan 7SUP.5B-2B dan 7SUP.5B-3A (2 November 2026, Supabase lokal). Butir di atas adalah potret 7SUP.5A-3.
        -   **Uji HTTP Stock Out** (7SUP.5B-2B, lokal): EXEC-R 48 dari 48 lulus, tanpa mutasi inventori; EXEC-C 63 dari 63 lulus, dengan satu transaksi database `STOCK_OUT` (−1) yang berhasil di-commit.
        -   **Uji browser Stock Out:** **NOT VERIFIED**. 7SUP.5B-3A FAIL prosedural karena pelanggaran batas mutasi nol (K3); B-01 sampai B-29 **NOT ASSESSED** (tidak dinilai dan tidak berstatus PASS). Uji browser yang memerlukan mutasi ditunda sampai stack test E2E terisolasi tersedia (K5).
        -   **Batas:** uji HTTP tidak membuktikan perilaku browser; uji SQL boundary Stock Out belum pernah dijalankan; implementasi Stock Out masih di working tree lokal dan belum di-commit ke Git. Karena itu, kriteria Inventory untuk Stock Out belum dinyatakan terpenuhi. Rinciannya di §8 "Status implementasi".
        -   Pembaruan 4 November 2026 (DOC-SYNC-01): implementasi Stock Out kini di-commit secara lokal (C-6 `b781551`) dan belum di-push ke GitHub. Butir "Batas" di atas adalah potret 2 November 2026. Kriteria Inventory untuk Stock Out tetap belum dinyatakan terpenuhi, karena uji browser dan uji SQL boundary belum dijalankan.
-   Kesesuaian saldo dengan histori transaksi lulus rekonsiliasi.

Kriteria lain belum dibangun. Uji penerimaan browser manual (7SUP.5A-3B) memverifikasi alur inti irisan Stock In dengan keterbatasan, tetapi pengiriman Stock In dengan jumlah valid belum diuji melalui browser, sehingga tidak ada kriteria MVP yang dinyatakan terpenuhi seluruhnya.

## Authentication

-   User dapat login dan logout melalui Supabase Auth.
-   Operasi terlindungi menolak pengguna tanpa sesi atau dengan role yang tidak berwenang, di server dan database.
-   Pengguna tanpa profil valid ditolak dari fitur bisnis aplikasi, dan pengguna tidak dapat mengubah role sendiri.

## Inventory

-   Kategori dan material dapat dikelola, termasuk penolakan hapus kategori yang masih digunakan, serta arsip dan reaktivasi material dengan alasan wajib.
-   Stock In dan Stock Out berjalan atomik, menolak stok negatif, menolak material beku atau arsip, dan tidak menggandakan transaksi saat request dikirim ulang.
-   Koreksi transaksi final berjalan melalui `REVERSAL` dan transaksi pengganti secara atomik.
-   Stock Opname berbasis sesi berjalan: pembekuan material, posting atomik, dan pembatalan dengan alasan wajib.

## Monitoring

-   Dashboard menampilkan data inventory dari database sesuai §12.
-   Report dapat menampilkan inventory dan histori transaksi.

## Catatan Owner

-   Catatan Owner berjalan sesuai §12a: pembuatan tanpa batas, checklist "Selesai" oleh Staff Warehouse, checklist "Sudah Ditinjau" oleh Owner, penguncian feedback setelah ditinjau di backend dan database, daftar aktif berbasis tanggal WIB, dan Riwayat Catatan tanpa penghapusan otomatis.
-   Panel Catatan Owner dan ringkasan sidebar tampil sesuai §12 dan §12a.

## Quality

-   Tidak ada critical error.
-   Database konsisten: saldo stok sesuai histori transaksi.
-   Aplikasi dapat digunakan.
