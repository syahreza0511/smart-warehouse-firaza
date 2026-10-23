# API Documentation

# Smart Warehouse Firaza

## 1. API Overview

Dokumen ini menjelaskan rancangan REST API untuk aplikasi Smart
Warehouse Firaza.

API digunakan sebagai penghubung antara: - Frontend React.js + Vite -
Backend Express.js - Database PostgreSQL melalui Prisma ORM

Arsitektur komunikasi:

Frontend → Axios → REST API → Express.js → Prisma ORM → PostgreSQL

Base URL:

    /api/v1

------------------------------------------------------------------------

# 2. Authentication

Smart Warehouse Firaza menggunakan JWT Authentication untuk mengamankan
akses API.

Flow:

    User Login
        |
    Backend validasi credential
        |
    Generate JWT Token
        |
    Frontend menyimpan token
        |
    Token digunakan untuk mengakses protected API

------------------------------------------------------------------------

# 3. Authentication API

## 3.1 Login

Endpoint:

    POST /api/v1/auth/login

Description:

Melakukan autentikasi pengguna dan menghasilkan JWT token.

Authorization:

    Public

Request Body:

``` json
{
  "email": "staff@firaza.com",
  "password": "password123"
}
```

Response Success:

``` json
{
  "message": "Login berhasil",
  "token": "jwt_token",
  "user": {
    "id": "uuid",
    "name": "Staff Warehouse",
    "role": "STAFF_WAREHOUSE"
  }
}
```

------------------------------------------------------------------------

## 3.2 Logout

Endpoint:

    POST /api/v1/auth/logout

Description:

Melakukan logout pengguna.

Authorization:

    Bearer Token

------------------------------------------------------------------------

# 4. User API

## 4.1 Get Profile

Endpoint:

    GET /api/v1/users/profile

Description:

Mengambil informasi pengguna yang sedang login.

Authorization:

    Bearer Token

Response:

``` json
{
  "id": "uuid",
  "name": "Muhammad",
  "email": "user@email.com",
  "role": "OWNER"
}
```

------------------------------------------------------------------------

# 5. Category API

Category digunakan untuk mengelompokkan raw material.

Contoh:

-   Packaging Material
-   Product Supporting Material

------------------------------------------------------------------------

## 5.1 Get All Categories

Endpoint:

    GET /api/v1/categories

Authorization:

    Bearer Token

------------------------------------------------------------------------

## 5.2 Create Category

Endpoint:

    POST /api/v1/categories

Authorization:

    STAFF_WAREHOUSE

Request:

``` json
{
  "name": "Packaging Material"
}
```

------------------------------------------------------------------------

## 5.3 Update Category

Endpoint:

    PUT /api/v1/categories/:id

------------------------------------------------------------------------

## 5.4 Delete Category

Endpoint:

    DELETE /api/v1/categories/:id

------------------------------------------------------------------------

# 6. Material API

Material merupakan data utama raw material inventory.

------------------------------------------------------------------------

## 6.1 Get All Materials

Endpoint:

    GET /api/v1/materials

Authorization:

    Bearer Token

Query Parameter:

Search:

    ?search=kardus

Filter:

    ?category=packaging

Filter Status:

    ?status=low_stock

Response:

``` json
[
  {
    "id": "uuid",
    "name": "Kardus Medium",
    "category": "Packaging Material",
    "unit": "pcs",
    "currentStock": 200,
    "minimumStock": 50,
    "status": "AMAN"
  }
]
```

------------------------------------------------------------------------

## 6.2 Create Material

Endpoint:

    POST /api/v1/materials

Authorization:

    STAFF_WAREHOUSE

Request:

``` json
{
  "name": "Kardus Medium",
  "categoryId": "uuid",
  "unit": "pcs",
  "minimumStock": 50
}
```

------------------------------------------------------------------------

## 6.3 Update Material

Endpoint:

    PUT /api/v1/materials/:id

------------------------------------------------------------------------

## 6.4 Delete Material

Endpoint:

    DELETE /api/v1/materials/:id

Catatan:

Material yang sudah memiliki histori transaksi tidak disarankan untuk
dihapus.

------------------------------------------------------------------------

# 7. Inventory Transaction API

Digunakan untuk mencatat perubahan stok.

Transaction Type:

    STOCK_IN
    STOCK_OUT

------------------------------------------------------------------------

## 7.1 Get Transactions

Endpoint:

    GET /api/v1/transactions

Query:

    ?type=STOCK_IN

Response:

``` json
[
 {
  "material": "Kardus Medium",
  "type": "STOCK_OUT",
  "quantity": 50,
  "date": "2026-10-12"
 }
]
```

------------------------------------------------------------------------

## 7.2 Create Transaction

Endpoint:

    POST /api/v1/transactions

Authorization:

    STAFF_WAREHOUSE

------------------------------------------------------------------------

### Stock In Request

``` json
{
  "materialId": "uuid",
  "type": "STOCK_IN",
  "quantity": 200,
  "notes": "Material datang dari supplier"
}
```

Logic:

    Current Stock + Quantity

------------------------------------------------------------------------

### Stock Out Request

``` json
{
  "materialId": "uuid",
  "type": "STOCK_OUT",
  "quantity": 50,
  "notes": "Produksi hampers wedding"
}
```

Logic:

    Current Stock - Quantity

------------------------------------------------------------------------

# 8. Stock Opname API

Digunakan untuk mencatat pengecekan stok fisik.

------------------------------------------------------------------------

## 8.1 Get Stock Opname History

Endpoint:

    GET /api/v1/stock-opname

------------------------------------------------------------------------

## 8.2 Create Stock Opname

Endpoint:

    POST /api/v1/stock-opname

Authorization:

    STAFF_WAREHOUSE

Request:

``` json
{
  "materialId": "uuid",
  "actualStock": 195,
  "notes": "Pengecekan gudang"
}
```

Backend mengambil:

    systemStock

dari database.

Perhitungan:

    Adjustment =
    Actual Stock - System Stock

------------------------------------------------------------------------

# 9. Dashboard API

Dashboard memberikan ringkasan kondisi inventory.

Endpoint:

    GET /api/v1/dashboard

Authorization:

    OWNER
    STAFF_WAREHOUSE

Response:

``` json
{
  "totalMaterials": 50,
  "lowStockMaterials": 7,
  "recentTransactions": []
}
```

------------------------------------------------------------------------

# 10. Report API

## 10.1 Inventory Report

Endpoint:

    GET /api/v1/reports/inventory

Menampilkan:

-   Nama material
-   Kategori
-   Stok
-   Status inventory

------------------------------------------------------------------------

## 10.2 Transaction Report

Endpoint:

    GET /api/v1/reports/transactions

Menampilkan:

-   Jenis transaksi
-   Material
-   Jumlah
-   User
-   Tanggal

------------------------------------------------------------------------

# 11. Authorization Rules

## Owner

Allowed:

-   Dashboard
-   Inventory view
-   Report
-   Transaction history

Restricted:

-   Mengubah histori transaksi
-   Menghapus data penting

## Staff Warehouse

Allowed:

-   Material management
-   Stock in
-   Stock out
-   Stock opname

------------------------------------------------------------------------

# 12. Error Response Standard

Format:

``` json
{
  "success": false,
  "message": "Material tidak ditemukan"
}
```

HTTP Status:

400: Bad Request

401: Unauthorized

403: Forbidden

404: Not Found

500: Internal Server Error

------------------------------------------------------------------------

# 13. Future API Expansion

Future development:

-   Supplier API
-   Finished Product API
-   AI Inventory Recommendation API
-   Marketplace Integration API

Tidak termasuk MVP.
