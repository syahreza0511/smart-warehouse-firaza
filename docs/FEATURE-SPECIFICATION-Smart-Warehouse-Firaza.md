# Feature Specification Document

# Smart Warehouse Firaza

> **Status dokumen:** penjabaran rinci kebutuhan dari PRD kanonik.
> **Revisi:** Gelombang 2a, 29 Oktober 2026.
>
> - Kebutuhan produk dan aturan bisnis mengacu pada PRD kanonik, [PRD-Smart-Warehouse-Firaza-Dicoding.md](PRD-Smart-Warehouse-Firaza-Dicoding.md). Keputusan teknologi mengacu pada [STACK-DECISION-LOG.md](STACK-DECISION-LOG.md). Jika terjadi konflik lintas dokumen, laporkan konflik tersebut untuk diputuskan; jangan menetapkan prioritas secara otomatis.
> - Seluruh fitur di dokumen ini berstatus **[RENCANA — belum diimplementasikan]**. Belum ada kode aplikasi dan belum ada fitur yang diuji.
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
-   [DATABASE-DESIGN-Smart-Warehouse-Firaza.md](DATABASE-DESIGN-Smart-Warehouse-Firaza.md) — skema dan penegakan aturan di database. Dokumen ini masih versi lama dan dijadwalkan direvisi pada Gelombang 2a.

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
3.  Belum ada registrasi publik; akun Owner dan Staff Warehouse diasumsikan dibuat oleh developer. [ASUMSI] (PRD FR-AUTH-02) Model pembuatan akun belum dikonfirmasi.

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

Restricted:

-   Mengubah stok secara langsung.
-   Mengedit atau menghapus transaksi final.
-   Mengelola kategori dan material.
-   Membuat, mengisi, memposting, atau membatalkan sesi Stock Opname.

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

Belum diputuskan:

-   Menambah item dan mengisi hasil hitung pada sesi buatan Staff lain. [OPEN DECISION OD-02]
-   Memposting sesi buatan Staff lain. [OPEN DECISION OD-16]
-   Mencatat saldo awal (`OPENING_BALANCE`). [OPEN DECISION OD-17]

Restricted:

-   Mengedit atau menghapus transaksi final.

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

------------------------------------------------------------------------

## Delete Material

Rule:

-   Material hanya dapat dihapus permanen jika belum memiliki riwayat transaksi. [KEPUTUSAN] (PRD FR-MAT-05)
-   Material yang pernah tercatat dalam sesi Stock Opname juga tidak dapat dihapus, karena direferensikan oleh catatan audit. [DITURUNKAN] (PRD FR-MAT-05)
-   Material yang tidak dapat dihapus dapat diarsipkan.

------------------------------------------------------------------------

## Archive Material

Rule:

1.  Material hanya dapat diarsipkan jika current stock = 0. Material yang masih memiliki stok ditolak. [KEPUTUSAN] (PRD FR-MAT-06)
2.  Alasan pengarsipan wajib diisi. Peristiwa dicatat di `material_status_events` beserta pelaku dan waktu. [KEPUTUSAN]
3.  Material arsip tidak dapat digunakan dalam Stock In, Stock Out, atau sesi Stock Opname baru. [KEPUTUSAN] (PRD FR-MAT-07)
4.  Histori transaksi material arsip tetap tersimpan dan dapat dilihat. [KEPUTUSAN]
5.  Material yang sedang dibekukan oleh sesi Stock Opname aktif: boleh tidaknya diarsipkan belum diputuskan. [OPEN DECISION OD-05]

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

Actor: Staff Warehouse. Owner hanya melihat.

Allowed:

-   Create category.
-   Read category.
-   Update category.
-   Delete category, dengan aturan di bawah.

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
6.  Tidak menggandakan perubahan stok jika request yang sama dikirim ulang (idempotency). Request dengan idempotency key yang sama tetapi payload berbeda ditolak. [KEPUTUSAN] (PRD FR-TRX-05)

------------------------------------------------------------------------

## Validation

Transaksi ditolak jika:

-   Quantity bukan bilangan bulat atau tidak lebih besar dari 0. [KEPUTUSAN] (PRD FR-TRX-07)
-   Material sedang dibekukan oleh sesi Stock Opname aktif. [KEPUTUSAN] (PRD FR-TRX-06)
-   Material sudah diarsipkan. [KEPUTUSAN] (PRD FR-TRX-06)

Validasi berlaku di API dan database, bukan hanya di UI. [KEPUTUSAN]

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

Smart Warehouse Firaza dianggap memenuhi MVP apabila kriteria berikut terpenuhi. **Saat ini belum ada kriteria yang terpenuhi atau teruji**, karena aplikasi belum diimplementasikan.

## Authentication

-   User dapat login dan logout melalui Supabase Auth.
-   Operasi terlindungi menolak pengguna tanpa sesi atau dengan role yang tidak berwenang, di server dan database.

## Inventory

-   Kategori dan material dapat dikelola, termasuk penolakan hapus kategori yang masih digunakan, serta arsip dan reaktivasi material dengan alasan wajib.
-   Stock In dan Stock Out berjalan atomik, menolak stok negatif, menolak material beku atau arsip, dan tidak menggandakan transaksi saat request dikirim ulang.
-   Koreksi transaksi final berjalan melalui `REVERSAL` dan transaksi pengganti secara atomik.
-   Stock Opname berbasis sesi berjalan: pembekuan material, posting atomik, dan pembatalan dengan alasan wajib.

## Monitoring

-   Dashboard menampilkan data inventory dari database sesuai §12.
-   Report dapat menampilkan inventory dan histori transaksi.

## Quality

-   Tidak ada critical error.
-   Database konsisten: saldo stok sesuai histori transaksi.
-   Aplikasi dapat digunakan.
