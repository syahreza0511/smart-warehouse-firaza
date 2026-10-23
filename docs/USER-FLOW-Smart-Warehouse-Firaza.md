# User Flow Document

# Smart Warehouse Firaza

## 1. Overview

User Flow Document menjelaskan perjalanan pengguna ketika menggunakan
aplikasi Smart Warehouse Firaza.

Dokumen ini digunakan sebagai acuan untuk: - Perancangan UI/UX. -
Penentuan halaman frontend React. - Pemahaman interaksi antara user
dengan sistem.

Smart Warehouse Firaza memiliki dua jenis pengguna utama:

1.  Owner
2.  Staff Warehouse/Admin

------------------------------------------------------------------------

# 2. User Role Overview

## Owner

Tujuan: Melakukan monitoring kondisi inventory dan membantu pengambilan
keputusan operasional.

Akses: - Login. - Melihat dashboard. - Melihat inventory. - Melihat
histori transaksi. - Melihat laporan.

------------------------------------------------------------------------

## Staff Warehouse/Admin

Tujuan: Melakukan aktivitas operasional inventory.

Akses: - Login. - Mengelola material. - Melakukan stock in. - Melakukan
stock out. - Melakukan stock opname. - Melihat data inventory.

------------------------------------------------------------------------

# 3. Authentication Flow

## Login Flow

    User membuka aplikasi

            |

    Halaman Login

            |

    Input email dan password

            |

    Backend melakukan validasi credential

            |

    Jika valid

            |

    Generate JWT Token

            |

    User masuk Dashboard

Jika gagal:

    Email/password salah

            |

    Tampilkan pesan error

            |

    User mencoba login kembali

------------------------------------------------------------------------

# 4. Owner User Flow

## 4.1 Owner Dashboard Flow

Tujuan: Owner melihat kondisi inventory secara cepat.

Flow:

    Login

     |

    Dashboard

     |

    Melihat:

    - Total Material
    - Total Stock
    - Kondisi Stock
    - Recent Transaction

     |

    Melakukan monitoring

------------------------------------------------------------------------

## 4.2 Owner Inventory Monitoring Flow

    Dashboard

     |

    Menu Inventory

     |

    Melihat daftar material

     |

    Search / Filter material

     |

    Melihat detail material

Informasi detail:

-   Nama material.
-   Kategori.
-   Stok tersedia.
-   Minimum stock.
-   Status inventory.

------------------------------------------------------------------------

## 4.3 Owner Report Flow

    Dashboard

     |

    Menu Report

     |

    Pilih jenis laporan

     |

    Inventory Report

    atau

    Transaction Report

     |

    Melihat data laporan

------------------------------------------------------------------------

# 5. Staff Warehouse User Flow

## 5.1 Material Management Flow

Tujuan: Mengelola data raw material.

Flow:

    Login

     |

    Dashboard

     |

    Menu Material

     |

    Melihat daftar material

     |

    Tambah/Edit Material

     |

    Validasi data

     |

    Simpan ke database

     |

    Data material diperbarui

------------------------------------------------------------------------

## 5.2 Stock In Flow

Tujuan: Mencatat material masuk.

Flow:

    Material datang

     |

    Staff login

     |

    Menu Transaction

     |

    Pilih Stock In

     |

    Pilih Material

     |

    Input jumlah masuk

     |

    Input catatan

     |

    Submit

     |

    Backend:

    Create transaction

    +

    Update current stock

     |

    Inventory bertambah

Business Rule:

    Current Stock + Quantity

------------------------------------------------------------------------

## 5.3 Stock Out Flow

Tujuan: Mencatat material yang digunakan.

Flow:

    Material digunakan

     |

    Staff login

     |

    Menu Transaction

     |

    Pilih Stock Out

     |

    Pilih Material

     |

    Input jumlah keluar

     |

    Input kebutuhan penggunaan

     |

    Submit

     |

    Backend:

    Create transaction

    +

    Update current stock

     |

    Inventory berkurang

Business Rule:

    Current Stock - Quantity

Validasi:

Jika jumlah keluar lebih besar dari stok:

    Transaksi ditolak

------------------------------------------------------------------------

## 5.4 Stock Opname Flow

Tujuan: Membandingkan stok sistem dengan stok fisik.

Flow:

    Staff melakukan pengecekan gudang

     |

    Menu Stock Opname

     |

    Pilih Material

     |

    Input Actual Stock

     |

    Submit

     |

    Backend mengambil System Stock

     |

    Menghitung Adjustment

     |

    Menyimpan histori opname

Formula:

    Adjustment =
    Actual Stock - System Stock

------------------------------------------------------------------------

# 6. Inventory Status Flow

Sistem menentukan kondisi stok secara otomatis.

Flow:

    Material Stock

     |

    Bandingkan dengan Minimum Stock

     |

    Status Inventory

Rules:

## Aman

    Current Stock > Minimum Stock

## Perlu Perhatian

    Current Stock <= Minimum Stock

## Prioritas Restock

    Current Stock <= Minimum Stock / 2

------------------------------------------------------------------------

# 7. Search and Filter Flow

Tujuan: Memudahkan pengguna menemukan data.

Flow:

    User membuka halaman Inventory

     |

    Input keyword

    atau

    Pilih filter

     |

    Frontend mengirim request API

     |

    Backend mengambil data sesuai parameter

     |

    Menampilkan hasil

Filter:

-   Nama material.
-   Kategori.
-   Status inventory.

------------------------------------------------------------------------

# 8. Error Handling Flow

## Authentication Error

    Login gagal

     |

    Tampilkan pesan:

    Email atau password salah

------------------------------------------------------------------------

## Transaction Error

    Stock Out melebihi stok

     |

    Sistem menolak transaksi

     |

    Menampilkan pesan:

    Stok tidak mencukupi

------------------------------------------------------------------------

## Validation Error

    Input tidak lengkap

     |

    Tampilkan pesan validasi

     |

    User memperbaiki data

------------------------------------------------------------------------

# 9. Frontend Page Mapping

Berdasarkan user flow, halaman aplikasi:

    src/pages/

    ├── Login.jsx

    ├── Dashboard.jsx

    ├── Materials.jsx

    ├── MaterialDetail.jsx

    ├── Transactions.jsx

    ├── StockOpname.jsx

    ├── Reports.jsx

    └── Profile.jsx

------------------------------------------------------------------------

# 10. Navigation Structure

    Sidebar

    |

    ├── Dashboard

    ├── Inventory

    │   └── Materials

    │

    ├── Transactions

    │   ├── Stock In

    │   └── Stock Out

    │

    ├── Stock Opname

    │

    ├── Reports

    │

    └── Profile

------------------------------------------------------------------------

# 11. Future User Flow Expansion

Tidak termasuk MVP:

-   Supplier management.
-   Finished product inventory.
-   AI recommendation.
-   Marketplace integration.
