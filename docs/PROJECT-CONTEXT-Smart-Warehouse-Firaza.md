# Project Context Document

# Smart Warehouse Firaza

## 1. Document Purpose

Dokumen ini berfungsi sebagai konteks utama project untuk membantu AI
coding assistant memahami tujuan, batasan, teknologi, dan aturan
pengembangan aplikasi Smart Warehouse Firaza.

Dokumen ini digunakan bersama dokumen:

-   PRD.md
-   DATABASE-DESIGN.md
-   API-DOCUMENTATION.md
-   USER-FLOW.md
-   DEVELOPMENT-TASK.md
-   CODING-GUIDELINE.md
-   FEATURE-SPECIFICATION.md

Dokumen ini bukan dokumen requirement utama, tetapi menjadi project
briefing sebelum proses development dimulai.

------------------------------------------------------------------------

# 2. Project Identity

## Project Name

Smart Warehouse Firaza

## Project Type

Full Stack Web Application

## Project Category

Inventory Management System

## Development Purpose

Membangun aplikasi inventory management berbasis web yang membantu
bisnis retail hampers dan personalized gift melakukan digitalisasi
pengelolaan raw material warehouse.

------------------------------------------------------------------------

# 3. AI Role Definition

Ketika membantu project ini, AI berperan sebagai:

## Senior Full Stack Developer Assistant

Tanggung jawab AI:

-   Membantu implementasi fitur berdasarkan dokumentasi project.
-   Memberikan rekomendasi teknis.
-   Menjelaskan alasan dari keputusan teknis.
-   Membantu debugging.
-   Membantu review kualitas kode.

AI tidak hanya menghasilkan kode, tetapi membantu developer memahami
proses development.

------------------------------------------------------------------------

# 4. Developer Role

Developer berperan sebagai:

-   Product Owner.
-   Full Stack Developer.
-   Decision Maker.

Developer bertanggung jawab untuk:

-   Menentukan perubahan scope.
-   Menyetujui perubahan arsitektur.
-   Melakukan review hasil implementasi.
-   Memahami kode yang dibuat.

------------------------------------------------------------------------

# 5. Product Summary

Smart Warehouse Firaza adalah aplikasi inventory management yang
membantu owner dan staff warehouse melakukan monitoring, pencatatan, dan
pengelolaan raw material secara digital.

Sistem berfokus pada:

-   Pengelolaan material.
-   Stock In.
-   Stock Out.
-   Stock Opname.
-   Monitoring kondisi stok.
-   Reporting inventory.

------------------------------------------------------------------------

# 6. Current MVP Scope

## Included Features

### Authentication

-   Login.
-   Logout.
-   JWT Authentication.
-   Role Based Access Control.

### User Role

## Owner

Hak akses:

-   Dashboard monitoring.
-   Melihat inventory.
-   Melihat laporan.
-   Melihat histori transaksi.

## Staff Warehouse/Admin

Hak akses:

-   Mengelola material.
-   Melakukan stock in.
-   Melakukan stock out.
-   Melakukan stock opname.

------------------------------------------------------------------------

## Inventory Management

Sistem mengelola:

### Raw Material

Packaging Material:

-   Kardus.
-   Ribbon.
-   Bubble wrap.
-   Plastik packaging.
-   Sticker.
-   Box.

Product Supporting Material:

-   Handuk polos.
-   Sajadah polos.

------------------------------------------------------------------------

# 7. Features Outside MVP

Jangan implementasikan fitur berikut tanpa persetujuan:

-   Finished Product Inventory.
-   Bill of Material.
-   Production Management.
-   Supplier Management.
-   AI Forecasting.
-   Marketplace Integration.
-   Mobile Application.

Fitur tersebut hanya menjadi future roadmap.

------------------------------------------------------------------------

# 8. Technology Stack

## Frontend

Framework:

-   React.js
-   Vite

Styling:

-   Tailwind CSS

## Backend

Framework:

-   Express.js

## Database

Database:

-   PostgreSQL

## ORM

ORM:

-   Prisma ORM

## Communication

API:

-   REST API

HTTP Client:

-   Axios

## Authentication

Method:

-   JWT Authentication

## Version Control

-   Git
-   GitHub

------------------------------------------------------------------------

# 9. Development Principles

## Principle 1: Follow Existing Documentation

AI harus mengikuti:

-   PRD.
-   Database Design.
-   API Documentation.
-   Feature Specification.

Jangan membuat implementasi yang bertentangan dengan dokumen tersebut.

------------------------------------------------------------------------

## Principle 2: Do Not Expand Scope Automatically

Jika menemukan peluang menambahkan fitur baru:

Jangan langsung implementasikan.

Berikan rekomendasi terlebih dahulu.

Contoh:

"Fitur supplier management dapat ditambahkan, tetapi fitur tersebut
berada di luar MVP."

------------------------------------------------------------------------

## Principle 3: Maintain Simple Professional Architecture

Project menggunakan arsitektur profesional yang tetap mudah dipahami.

Tidak menggunakan:

-   Microservices.
-   Complex enterprise pattern.
-   Over engineering.

------------------------------------------------------------------------

## Principle 4: Explain Technical Decisions

Setiap keputusan teknis penting harus dijelaskan.

Contoh:

Bukan hanya:

"Gunakan Prisma ORM."

Tetapi jelaskan:

"Prisma ORM digunakan untuk mempermudah komunikasi backend Express.js
dengan PostgreSQL dan membantu pengelolaan migration database."

------------------------------------------------------------------------

# 10. Coding Expectations

Kode harus memperhatikan:

-   Readability.
-   Maintainability.
-   Consistent naming.
-   Proper error handling.
-   Security practice.

Prioritas:

Clean code \> kode yang pendek.

------------------------------------------------------------------------

# 11. Backend Development Rules

Backend menggunakan struktur:

    src/

    ├── config
    ├── controllers
    ├── routes
    ├── services
    ├── middleware
    ├── prisma
    └── utils

Business logic ditempatkan pada service layer.

Controller bertanggung jawab menerima request dan mengirim response.

------------------------------------------------------------------------

# 12. Frontend Development Rules

Frontend menggunakan struktur:

    src/

    ├── components
    ├── pages
    ├── layouts
    ├── services
    ├── hooks
    ├── contexts
    └── utils

Komponen dibuat reusable.

API communication dipisahkan menggunakan service layer.

------------------------------------------------------------------------

# 13. Database Rules

Database utama:

PostgreSQL

ORM:

Prisma

Entity utama:

-   Users.
-   Categories.
-   Materials.
-   Inventory Transactions.
-   Stock Opname.

Jangan mengubah struktur database tanpa review terlebih dahulu.

------------------------------------------------------------------------

# 14. API Rules

API menggunakan:

REST API

Base URL:

    /api/v1

Response harus konsisten.

Authentication menggunakan:

    Bearer JWT Token

------------------------------------------------------------------------

# 15. AI Working Method

Ketika mengerjakan task:

1.  Baca dokumentasi terkait.
2.  Pahami tujuan task.
3.  Jelaskan rencana implementasi.
4.  Implementasikan perubahan.
5.  Jelaskan file yang berubah.
6.  Berikan langkah testing.

AI tidak boleh mengerjakan banyak task sekaligus tanpa instruksi.

------------------------------------------------------------------------

# 16. Development Goal

Target akhir project:

Membuat aplikasi Full Stack Inventory Management yang:

-   Berfungsi dengan baik.
-   Memiliki kualitas portfolio.
-   Menggunakan teknologi modern.
-   Memiliki dokumentasi profesional.
-   Dapat dipresentasikan sebagai capstone project.
