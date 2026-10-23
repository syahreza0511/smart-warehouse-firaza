# Database Design Document

# Smart Warehouse Firaza

## 1. Database Overview

Database Design Document ini menjelaskan rancangan struktur database
untuk aplikasi Smart Warehouse Firaza.

Database dirancang untuk mendukung proses utama aplikasi yaitu: -
Authentication pengguna. - Pengelolaan raw material inventory. -
Pencatatan stock in. - Pencatatan stock out. - Stock opname. -
Monitoring kondisi stok. - Audit history aktivitas pengguna.

Database menggunakan PostgreSQL sebagai database management system dan
Prisma ORM sebagai penghubung antara backend Express.js dengan database.

------------------------------------------------------------------------

# 2. Database Scope

Pada tahap MVP, database hanya berfokus pada pengelolaan Raw Material
Inventory.

Jenis data yang dikelola:

## Raw Material

### Packaging Material

Contoh: - Kardus. - Ribbon. - Bubble wrap. - Plastik packaging. -
Sticker. - Box.

### Product Supporting Material

Contoh: - Handuk polos. - Sajadah polos.

Finished product inventory, supplier management, dan integrasi
marketplace tidak termasuk MVP.

------------------------------------------------------------------------

# 3. Entity Relationship Overview

Relasi utama database:

    Users
      |
      |
      |---- Transactions
                  |
                  |
              Materials
                  |
                  |
              Categories


    Materials
        |
        |
     Stock Opname

------------------------------------------------------------------------

# 4. Database Entities

## 4.1 Users Table

Digunakan untuk menyimpan data pengguna aplikasi.

Tujuan: - Authentication. - Role management. - Audit aktivitas pengguna.

Fields:

  Field        Type        Constraint    Description
  ------------ ----------- ------------- ----------------------
  id           UUID        Primary Key   Identitas user
  name         VARCHAR     NOT NULL      Nama pengguna
  email        VARCHAR     UNIQUE        Email login
  password     VARCHAR     NOT NULL      Password terenkripsi
  role         ENUM        NOT NULL      OWNER atau STAFF
  created_at   TIMESTAMP   DEFAULT NOW   Waktu pembuatan data
  updated_at   TIMESTAMP   AUTO UPDATE   Waktu perubahan data

Role:

-   OWNER
-   STAFF_WAREHOUSE

------------------------------------------------------------------------

# 4.2 Categories Table

Menyimpan kategori material.

Contoh:

-   Packaging Material
-   Product Supporting Material

Fields:

  Field        Type        Constraint    Description
  ------------ ----------- ------------- ------------------
  id           UUID        Primary Key   ID kategori
  name         VARCHAR     NOT NULL      Nama kategori
  created_at   TIMESTAMP   DEFAULT NOW   Waktu dibuat
  updated_at   TIMESTAMP   AUTO UPDATE   Waktu diperbarui

------------------------------------------------------------------------

# 4.3 Materials Table

Tabel utama inventory.

Digunakan untuk menyimpan informasi setiap raw material.

Fields:

  Field           Type        Constraint    Description
  --------------- ----------- ------------- ----------------------
  id              UUID        Primary Key   ID material
  category_id     UUID        Foreign Key   Relasi kategori
  name            VARCHAR     NOT NULL      Nama material
  unit            VARCHAR     NOT NULL      Satuan material
  current_stock   INTEGER     DEFAULT 0     Jumlah stok saat ini
  minimum_stock   INTEGER     NOT NULL      Batas minimum stok
  created_at      TIMESTAMP   DEFAULT NOW   Waktu dibuat
  updated_at      TIMESTAMP   AUTO UPDATE   Waktu diperbarui

Contoh:

Kardus Medium: - Unit: pcs - Current Stock: 200 - Minimum Stock: 50

------------------------------------------------------------------------

# 4.4 Inventory Transactions Table

Menyimpan seluruh aktivitas perubahan stok.

Jenis transaksi:

-   STOCK_IN
-   STOCK_OUT

Fields:

  Field              Type        Constraint    Description
  ------------------ ----------- ------------- -------------------------------
  id                 UUID        Primary Key   ID transaksi
  material_id        UUID        Foreign Key   Material terkait
  user_id            UUID        Foreign Key   User yang melakukan transaksi
  type               ENUM        NOT NULL      Jenis transaksi
  quantity           INTEGER     NOT NULL      Jumlah perubahan stok
  notes              TEXT        NULL          Catatan transaksi
  transaction_date   TIMESTAMP   DEFAULT NOW   Waktu transaksi

Contoh:

Stock In: - Kardus Medium - +200 pcs

Stock Out: - Kardus Medium - -50 pcs

------------------------------------------------------------------------

# 4.5 Stock Opname Table

Menyimpan aktivitas pengecekan stok fisik.

Tujuan: Membandingkan stok sistem dengan kondisi aktual.

Fields:

  Field          Type        Constraint    Description
  -------------- ----------- ------------- ----------------------------
  id             UUID        Primary Key   ID opname
  material_id    UUID        Foreign Key   Material yang dicek
  user_id        UUID        Foreign Key   User yang melakukan opname
  system_stock   INTEGER     NOT NULL      Stok berdasarkan sistem
  actual_stock   INTEGER     NOT NULL      Stok fisik
  adjustment     INTEGER     NOT NULL      Selisih stok
  notes          TEXT        NULL          Catatan
  opname_date    TIMESTAMP   DEFAULT NOW   Waktu opname

Formula:

    Adjustment = Actual Stock - System Stock

------------------------------------------------------------------------

# 5. Database Relationship

## Users - Transactions

Relationship:

One User → Many Transactions

Penjelasan:

Satu user dapat melakukan banyak transaksi inventory.

------------------------------------------------------------------------

## Categories - Materials

Relationship:

One Category → Many Materials

Penjelasan:

Satu kategori dapat memiliki banyak material.

------------------------------------------------------------------------

## Materials - Transactions

Relationship:

One Material → Many Transactions

Penjelasan:

Satu material dapat memiliki banyak histori transaksi.

------------------------------------------------------------------------

## Materials - Stock Opname

Relationship:

One Material → Many Stock Opname

Penjelasan:

Satu material dapat memiliki histori pengecekan stok.

------------------------------------------------------------------------

# 6. Business Rules

## Stock Update Rule

Ketika Stock In:

    Current Stock + Quantity

Ketika Stock Out:

    Current Stock - Quantity

------------------------------------------------------------------------

## Stock Status Rule

### Aman

Jika:

    Current Stock > Minimum Stock

------------------------------------------------------------------------

### Perlu Perhatian

Jika:

    Current Stock <= Minimum Stock

------------------------------------------------------------------------

### Prioritas Restock

Jika:

    Current Stock <= Minimum Stock / 2

------------------------------------------------------------------------

# 7. Prisma ORM Model Mapping

Database ini nantinya akan diterjemahkan menjadi Prisma Schema.

Contoh struktur:

    prisma/
     |
     └── schema.prisma

Model utama:

-   User
-   Category
-   Material
-   Transaction
-   StockOpname

------------------------------------------------------------------------

# 8. Future Database Expansion

Pengembangan berikutnya dapat menambahkan:

## Supplier Management

Table: - suppliers - purchase_orders

## Finished Product Inventory

Table: - products - product_materials

## AI Inventory Recommendation

Table: - inventory_predictions

Namun tidak termasuk dalam MVP.
