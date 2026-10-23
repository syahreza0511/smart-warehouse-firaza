# Feature Specification Document

# Smart Warehouse Firaza

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

------------------------------------------------------------------------

# 2. Feature Priority

## MVP Features

Fitur yang wajib selesai:

1.  Authentication.
2.  Role Management.
3.  Material Management.
4.  Stock In.
5.  Stock Out.
6.  Stock Opname.
7.  Dashboard.
8.  Reporting.
9.  Search and Filter.

## Future Features

Tidak termasuk MVP:

-   Supplier Management.
-   Finished Product Inventory.
-   AI Recommendation.
-   Forecasting.
-   Marketplace Integration.

------------------------------------------------------------------------

# 3. Authentication Feature

## Feature Name

User Authentication

## Actor

-   Owner.
-   Staff Warehouse/Admin.

## Purpose

Memberikan akses aman kepada pengguna berdasarkan akun dan role.

------------------------------------------------------------------------

## User Flow

    User membuka aplikasi

    ↓

    Input email dan password

    ↓

    Sistem melakukan validasi

    ↓

    Generate JWT Token

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

1.  Email harus terdaftar pada database.
2.  Password harus sesuai dengan password terenkripsi.
3.  User yang berhasil login mendapatkan JWT token.
4.  Token digunakan untuk mengakses protected API.

------------------------------------------------------------------------

## Output

Success:

-   JWT Token.
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

------------------------------------------------------------------------

## Role Owner

Permission:

Allowed:

-   Melihat dashboard.
-   Melihat inventory.
-   Melihat laporan.
-   Melihat histori transaksi.

Restricted:

-   Mengubah stok secara langsung.
-   Menghapus histori transaksi.

------------------------------------------------------------------------

## Role Staff Warehouse/Admin

Permission:

Allowed:

-   Mengelola material.
-   Membuat stock in.
-   Membuat stock out.
-   Melakukan stock opname.

------------------------------------------------------------------------

# 5. Material Management Feature

## Feature Name

Raw Material Management

## Actor

Staff Warehouse/Admin.

## Purpose

Mengelola data raw material yang digunakan dalam operasional warehouse.

------------------------------------------------------------------------

## Data Entity

Material memiliki:

-   Name.
-   Category.
-   Unit.
-   Current Stock.
-   Minimum Stock.

------------------------------------------------------------------------

## Create Material

### Input

-   Nama material.
-   Kategori.
-   Satuan.
-   Minimum stock.

------------------------------------------------------------------------

## Validation

1.  Nama material wajib diisi.
2.  Kategori wajib dipilih.
3.  Minimum stock harus lebih besar atau sama dengan nol.

------------------------------------------------------------------------

## Output

Material berhasil tersimpan.

------------------------------------------------------------------------

## Update Material

User dapat mengubah:

-   Nama material.
-   Kategori.
-   Unit.
-   Minimum stock.

Current stock tidak diubah melalui fitur ini.

------------------------------------------------------------------------

## Delete Material

Rule:

Material tidak boleh dihapus apabila sudah memiliki histori transaksi.

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

Allowed:

-   Create category.
-   Read category.
-   Update category.
-   Delete category.

------------------------------------------------------------------------

# 7. Stock In Feature

## Feature Name

Incoming Stock Transaction

## Actor

Staff Warehouse/Admin.

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
-   Quantity.
-   Notes.

------------------------------------------------------------------------

## Business Rules

Ketika transaksi berhasil:

    Current Stock =
    Current Stock + Quantity

Sistem harus:

1.  Membuat transaction record.
2.  Menambahkan stok material.
3.  Menyimpan user yang melakukan transaksi.

------------------------------------------------------------------------

## Validation

Quantity:

-   Harus lebih besar dari 0.

------------------------------------------------------------------------

# 8. Stock Out Feature

## Feature Name

Outgoing Stock Transaction

## Actor

Staff Warehouse/Admin.

## Purpose

Mencatat material yang digunakan atau keluar dari warehouse.

------------------------------------------------------------------------

## Input

-   Material.
-   Quantity.
-   Notes.

------------------------------------------------------------------------

## Business Rules

Ketika transaksi berhasil:

    Current Stock =
    Current Stock - Quantity

------------------------------------------------------------------------

## Validation

1.  Quantity harus lebih besar dari 0.
2.  Quantity tidak boleh melebihi current stock.

Contoh:

Stock:

100 pcs

Request:

150 pcs

Result:

Transaction rejected.

------------------------------------------------------------------------

# 9. Transaction History Feature

## Feature Name

Inventory Transaction History

## Purpose

Menyediakan histori perubahan inventory.

------------------------------------------------------------------------

## Display Data

-   Material.
-   Transaction type.
-   Quantity.
-   User.
-   Date.
-   Notes.

------------------------------------------------------------------------

## Filter

User dapat melakukan filter:

-   Stock In.
-   Stock Out.
-   Date range.
-   Material.

------------------------------------------------------------------------

# 10. Stock Opname Feature

## Feature Name

Inventory Stock Opname

## Actor

Staff Warehouse/Admin.

## Purpose

Membandingkan stok sistem dengan kondisi fisik warehouse.

------------------------------------------------------------------------

## User Flow

    Pengecekan fisik

    ↓

    Input actual stock

    ↓

    Sistem mengambil system stock

    ↓

    Hitung adjustment

    ↓

    Simpan history

------------------------------------------------------------------------

## Input

-   Material.
-   Actual stock.
-   Notes.

------------------------------------------------------------------------

## Calculation

Formula:

    Adjustment =
    Actual Stock - System Stock

------------------------------------------------------------------------

## Example

System Stock:

200

Actual Stock:

195

Adjustment:

-5

------------------------------------------------------------------------

# 11. Inventory Intelligence Feature

## Feature Name

Stock Status Classification

## Purpose

Memberikan informasi kondisi stok tanpa menggunakan AI.

------------------------------------------------------------------------

## Business Rules

### Aman

    Current Stock > Minimum Stock

------------------------------------------------------------------------

### Perlu Perhatian

    Current Stock <= Minimum Stock

------------------------------------------------------------------------

### Prioritas Restock

    Current Stock <= Minimum Stock / 2

------------------------------------------------------------------------

# 12. Dashboard Feature

## Feature Name

Inventory Dashboard

## Actor

Owner dan Staff Warehouse.

## Purpose

Memberikan ringkasan kondisi warehouse.

------------------------------------------------------------------------

## Dashboard Component

### Summary Card

Menampilkan:

-   Total material.
-   Total inventory.
-   Low stock material.

------------------------------------------------------------------------

### Inventory Status

Menampilkan:

-   Aman.
-   Perlu Perhatian.
-   Prioritas Restock.

------------------------------------------------------------------------

### Recent Transaction

Menampilkan transaksi terbaru.

------------------------------------------------------------------------

# 13. Reporting Feature

## Feature Name

Inventory Reporting

## Purpose

Menyediakan informasi operasional dalam bentuk laporan.

------------------------------------------------------------------------

## Inventory Report

Menampilkan:

-   Nama material.
-   Kategori.
-   Current stock.
-   Minimum stock.
-   Status inventory.

------------------------------------------------------------------------

## Transaction Report

Menampilkan:

-   Jenis transaksi.
-   Material.
-   Quantity.
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

Filter berdasarkan:

-   Kategori.
-   Status inventory.
-   Transaction type.

------------------------------------------------------------------------

# 15. Feature Development Rule

Ketika melakukan implementasi:

AI harus:

1.  Mengikuti spesifikasi fitur ini.
2.  Tidak menambah behavior baru tanpa persetujuan.
3.  Menjelaskan perubahan yang dilakukan.
4.  Memberikan langkah testing.

Jika terdapat konflik antara feature specification dan implementasi:

Dokumen harus direview terlebih dahulu.

------------------------------------------------------------------------

# 16. MVP Completion Criteria

Smart Warehouse Firaza dianggap memenuhi MVP apabila:

## Authentication

-   User dapat login.
-   JWT berjalan.
-   Role berjalan.

## Inventory

-   Material dapat dikelola.
-   Stock In berjalan.
-   Stock Out berjalan.
-   Stock Opname berjalan.

## Monitoring

-   Dashboard menampilkan data inventory.
-   Report dapat menampilkan histori.

## Quality

-   Tidak ada critical error.
-   Database konsisten.
-   Aplikasi dapat digunakan.
