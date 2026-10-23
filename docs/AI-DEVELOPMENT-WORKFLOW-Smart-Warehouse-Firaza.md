# AI Development Workflow Document

# Smart Warehouse Firaza

## 1. Purpose

Dokumen ini menjelaskan cara menggunakan AI coding assistant dalam
proses pengembangan Smart Warehouse Firaza.

Dokumen ini dibuat agar AI digunakan sebagai partner development yang
membantu:

-   Memahami requirement.
-   Membuat rancangan implementasi.
-   Membantu penulisan kode.
-   Melakukan review.
-   Membantu debugging.

Tujuan utama:

AI membantu mempercepat development tanpa menggantikan proses pemahaman
developer.

------------------------------------------------------------------------

# 2. AI Working Mode

## Hybrid Pair Programming

Smart Warehouse Firaza menggunakan pendekatan:

    Developer
    +
    AI Assistant

AI tidak sepenuhnya mengambil alih development.

Pembagian tanggung jawab:

------------------------------------------------------------------------

## Developer Responsibility

Developer bertanggung jawab untuk:

-   Memahami requirement.
-   Menentukan keputusan produk.
-   Menyetujui perubahan besar.
-   Melakukan review kode.
-   Melakukan testing.

------------------------------------------------------------------------

## AI Responsibility

AI membantu:

-   Membuat draft implementasi.
-   Menjelaskan konsep teknis.
-   Memberikan alternatif solusi.
-   Membantu debugging.
-   Melakukan code review.

------------------------------------------------------------------------

# 3. Development Workflow

Setiap fitur mengikuti alur:

    Feature Requirement

    ↓

    Development Task

    ↓

    AI Planning

    ↓

    Implementation

    ↓

    Testing

    ↓

    Review

    ↓

    Git Commit

    ↓

    Merge

------------------------------------------------------------------------

# 4. AI Prompt Workflow

## Step 1 - Provide Context

Sebelum meminta AI membuat kode, berikan dokumen yang relevan.

Tidak perlu memberikan seluruh dokumentasi setiap saat.

------------------------------------------------------------------------

Contoh membuat Authentication:

Berikan:

    PROJECT-CONTEXT.md

    API-DOCUMENTATION.md

    FEATURE-SPECIFICATION.md

    CODING-GUIDELINE.md

------------------------------------------------------------------------

Contoh membuat Database:

Berikan:

    DATABASE-DESIGN.md

    FEATURE-SPECIFICATION.md

------------------------------------------------------------------------

# 5. Planning Before Coding

Jangan langsung meminta AI membuat kode.

Gunakan workflow:

    Explain first

    ↓

    Review plan

    ↓

    Approve

    ↓

    Implement

------------------------------------------------------------------------

Contoh prompt:

    Berdasarkan dokumentasi project, jelaskan rencana implementasi JWT Authentication.

    Jangan membuat kode terlebih dahulu.

    Jelaskan:
    - file yang akan dibuat,
    - dependency yang diperlukan,
    - flow authentication,
    - risiko implementasi.

------------------------------------------------------------------------

# 6. Implementation Workflow

Setelah rencana disetujui:

Berikan instruksi:

    Implementasikan rencana tersebut.

    Ikuti:
    - Coding Guideline.
    - API Documentation.
    - Feature Specification.

    Jangan mengubah scope.

------------------------------------------------------------------------

# 7. Feature Priority AI Usage

## Fitur Kompleks

AI dan developer bekerja bersama.

Contoh:

### Authentication

Developer harus memahami:

-   JWT.
-   Middleware.
-   Role authorization.

AI membantu:

-   Struktur kode.
-   Debugging.
-   Review.

------------------------------------------------------------------------

### Database Design

Developer harus memahami:

-   Relationship.
-   Migration.
-   Query logic.

AI membantu:

-   Prisma schema.
-   Query optimization.

------------------------------------------------------------------------

## Fitur Sederhana

AI dapat membantu lebih banyak.

Contoh:

-   CRUD category.
-   Table component.
-   Form validation.

Developer tetap melakukan review.

------------------------------------------------------------------------

# 8. Debugging Workflow

Ketika terjadi error:

Jangan hanya memberikan:

    error terjadi

Berikan:

    1. Error message

    2. File terkait

    3. Expected behavior

    4. Actual behavior

    5. Langkah yang sudah dilakukan

------------------------------------------------------------------------

Contoh:

    Saya mendapatkan error saat login.

    Expected:
    User mendapatkan JWT token.

    Actual:
    401 Unauthorized.

    File:
    auth.controller.ts

    Bantu analisis penyebabnya.

------------------------------------------------------------------------

# 9. Token Optimization Strategy

Gunakan prinsip:

    Relevant Context

    +

    Clear Task

    +

    Specific Goal

------------------------------------------------------------------------

Jangan:

    Buatkan seluruh aplikasi.

------------------------------------------------------------------------

Gunakan:

    Implementasikan TASK-008 Material API.

    Gunakan:
    - API Documentation.
    - Database Design.
    - Feature Specification.

------------------------------------------------------------------------

# 10. AI Code Review Workflow

Setelah fitur selesai:

Minta AI melakukan review.

Contoh:

    Review kode ini berdasarkan:

    - Clean Code.
    - Security.
    - Project Architecture.
    - Feature Specification.

    Jelaskan masalah dan rekomendasi perbaikan.

------------------------------------------------------------------------

# 11. Git Workflow Integration

Setiap fitur:

    Create branch

    ↓

    Development

    ↓

    Testing

    ↓

    Review

    ↓

    Commit

    ↓

    Merge

------------------------------------------------------------------------

Contoh:

Branch:

    feature/authentication

Commit:

    feat: implement JWT authentication

------------------------------------------------------------------------

# 12. Rules for AI Assistant

AI harus:

-   Mengikuti dokumentasi project.
-   Menjelaskan keputusan teknis.
-   Tidak menambah fitur tanpa izin.
-   Tidak mengubah architecture tanpa persetujuan.
-   Menggunakan coding guideline.

AI tidak boleh:

-   Membuat asumsi bisnis baru.
-   Menghapus fitur tanpa alasan.
-   Mengubah database schema sembarangan.

------------------------------------------------------------------------

# 13. Final Goal

Penggunaan AI dalam Smart Warehouse Firaza bertujuan untuk:

-   Menyelesaikan capstone project.
-   Memahami software development workflow.
-   Meningkatkan kemampuan Full Stack Development.
-   Membiasakan penggunaan AI secara profesional.
