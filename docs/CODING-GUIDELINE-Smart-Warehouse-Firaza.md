# Coding Guideline Document

# Smart Warehouse Firaza

## 1. Purpose

Dokumen ini berisi standar dan aturan pengembangan kode untuk aplikasi
Smart Warehouse Firaza.

Tujuan dokumen ini:

-   Menjaga konsistensi kode.
-   Memudahkan maintenance.
-   Membantu AI coding assistant menghasilkan kode sesuai standar
    project.
-   Menjaga kualitas implementasi Full Stack Application.

Dokumen ini digunakan bersama:

-   PROJECT-CONTEXT.md
-   PRD.md
-   DATABASE-DESIGN.md
-   API-DOCUMENTATION.md
-   FEATURE-SPECIFICATION.md

------------------------------------------------------------------------

# 2. General Development Principles

## 2.1 Prioritize Clean Code

Kode harus:

-   Mudah dibaca.
-   Mudah dipahami.
-   Memiliki tanggung jawab yang jelas.
-   Tidak memiliki duplikasi yang tidak diperlukan.

Prioritas:

    Readable Code
    >
    Maintainable Code
    >
    Short Code

------------------------------------------------------------------------

## 2.2 Avoid Over Engineering

Implementasi harus sesuai kebutuhan MVP.

Jangan membuat:

-   Abstraksi berlebihan.
-   Struktur folder yang terlalu kompleks.
-   Pattern enterprise yang tidak diperlukan.

Contoh:

Tidak perlu membuat banyak layer jika fitur sederhana.

------------------------------------------------------------------------

## 2.3 Follow Existing Architecture

AI atau developer tidak boleh mengubah struktur besar project tanpa
persetujuan.

Jika ingin mengubah:

-   Database structure.
-   API contract.
-   Folder architecture.

Harus memberikan alasan terlebih dahulu.

------------------------------------------------------------------------

# 3. Naming Convention

## 3.1 JavaScript Variables

Gunakan camelCase.

Contoh:

``` javascript
const materialName = "Kardus Medium";
const currentStock = 100;
```

Hindari:

``` javascript
const Material_Name = "";
```

------------------------------------------------------------------------

## 3.2 Functions

Gunakan nama yang menjelaskan aksi.

Contoh:

``` javascript
createMaterial()

getMaterials()

updateTransaction()
```

Hindari:

``` javascript
process()

handle()
```

tanpa konteks jelas.

------------------------------------------------------------------------

## 3.3 Database Naming

Gunakan snake_case.

Contoh:

Table:

    inventory_transactions

Column:

    created_at
    minimum_stock

------------------------------------------------------------------------

## 3.4 React Components

Gunakan PascalCase.

Contoh:

    MaterialTable.jsx

    DashboardCard.jsx

    LoginForm.jsx

------------------------------------------------------------------------

# 4. Backend Coding Guideline

## 4.1 Backend Structure

Gunakan struktur:

    src/

    ├── config
    ├── controllers
    ├── routes
    ├── services
    ├── middleware
    ├── prisma
    └── utils

------------------------------------------------------------------------

# 4.2 Controller Responsibility

Controller bertugas:

-   Menerima request.
-   Validasi input sederhana.
-   Memanggil service.
-   Mengirim response.

Controller tidak boleh berisi business logic panjang.

Contoh buruk:

``` javascript
// menghitung stok,
// update database,
// validasi role,
// semua dalam controller
```

------------------------------------------------------------------------

# 4.3 Service Responsibility

Service berisi:

-   Business logic.
-   Perhitungan.
-   Interaksi antar proses.

Contoh:

``` javascript
stockService.updateStock()
```

------------------------------------------------------------------------

# 4.4 Route Responsibility

Route hanya menentukan:

-   Endpoint.
-   Middleware.
-   Controller.

Contoh:

``` javascript
router.post(
 "/materials",
 authenticate,
 materialController.create
)
```

------------------------------------------------------------------------

# 5. API Response Standard

Semua response API harus memiliki format konsisten.

Success:

``` json
{
  "success": true,
  "message": "Material berhasil dibuat",
  "data": {}
}
```

Error:

``` json
{
  "success": false,
  "message": "Material tidak ditemukan"
}
```

------------------------------------------------------------------------

# 6. Error Handling

Error harus ditangani secara terstruktur.

Jangan:

``` javascript
console.log(error)
```

saja.

Gunakan:

-   Error middleware.
-   HTTP status code yang sesuai.

Status:

    200 OK
    201 Created
    400 Bad Request
    401 Unauthorized
    403 Forbidden
    404 Not Found
    500 Internal Server Error

------------------------------------------------------------------------

# 7. Authentication Guideline

Authentication menggunakan:

    JWT Authentication

Rules:

-   Password harus di-hash.
-   Token harus diverifikasi middleware.
-   Protected route harus menggunakan authentication middleware.

Contoh:

    authenticateUser
            |
            |
    checkRole
            |
            |
    controller

------------------------------------------------------------------------

# 8. Authorization Guideline

Role:

    OWNER

    STAFF_WAREHOUSE

Permission harus jelas.

Owner:

-   Dashboard.
-   Reports.
-   Monitoring inventory.

Staff:

-   Material management.
-   Stock transaction.
-   Stock opname.

------------------------------------------------------------------------

# 9. Database Guideline

Database:

    PostgreSQL

ORM:

    Prisma ORM

Rules:

-   Database schema harus mengikuti DATABASE-DESIGN.md.
-   Migration harus melalui Prisma.
-   Jangan melakukan perubahan database manual tanpa dokumentasi.

------------------------------------------------------------------------

# 10. Prisma Guideline

Gunakan migration:

``` bash
npx prisma migrate dev
```

Jangan:

-   Mengubah database langsung tanpa migration.
-   Menghapus data production sembarangan.

------------------------------------------------------------------------

# 11. Frontend Coding Guideline

## 11.1 Component Structure

Gunakan reusable component.

Contoh:

    components/

    Button.jsx

    Table.jsx

    Modal.jsx

    Card.jsx

------------------------------------------------------------------------

## 11.2 Page Responsibility

Page bertanggung jawab untuk:

-   Menggabungkan component.
-   Mengatur tampilan halaman.

Contoh:

    pages/Materials.jsx

------------------------------------------------------------------------

## 11.3 API Communication

Jangan memanggil API langsung di component.

Gunakan service layer.

Contoh:

    services/

    materialService.js

    transactionService.js

------------------------------------------------------------------------

# 12. State Management

Gunakan solusi sederhana terlebih dahulu.

Prioritas:

1.  React Hooks.
2.  Context API jika diperlukan.

Jangan menggunakan state management kompleks tanpa kebutuhan.

------------------------------------------------------------------------

# 13. Styling Guideline

Gunakan:

    Tailwind CSS

Prinsip:

-   Responsive design.
-   Consistent spacing.
-   Clean dashboard interface.

Target UI:

Modern SaaS Dashboard.

------------------------------------------------------------------------

# 14. Git Convention

Gunakan commit message yang jelas.

Format:

    type: description

Contoh:

    feat: add material CRUD API

    fix: fix stock calculation bug

    docs: update API documentation

------------------------------------------------------------------------

# 15. AI Coding Assistant Rules

Ketika menggunakan AI:

AI harus:

1.  Membaca dokumentasi project.
2.  Menjelaskan rencana perubahan.
3.  Mengimplementasikan sesuai task.
4.  Menjelaskan file yang berubah.
5.  Memberikan cara testing.

AI tidak boleh:

-   Menambah fitur tanpa persetujuan.
-   Mengubah architecture tanpa alasan.
-   Menghapus kode penting tanpa konfirmasi.

------------------------------------------------------------------------

# 16. Code Review Checklist

Sebelum fitur dianggap selesai:

Check:

## Functionality

-   Fitur berjalan sesuai requirement.
-   Tidak ada error utama.

## Code Quality

-   Struktur sesuai guideline.
-   Tidak ada kode duplikat.

## Security

-   Authentication berjalan.
-   Input tervalidasi.

## Documentation

-   Dokumentasi diperbarui jika ada perubahan besar.

------------------------------------------------------------------------

# 17. Development Philosophy

Smart Warehouse Firaza dibangun dengan prinsip:

    Simple
    +
    Professional
    +
    Maintainable
    +
    Understandable

Tujuan utama bukan membuat sistem terbesar, tetapi membuat aplikasi Full
Stack yang memiliki kualitas portfolio dan dapat dikembangkan lebih
lanjut.
