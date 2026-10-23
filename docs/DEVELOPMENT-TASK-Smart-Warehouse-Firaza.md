# Development Task Document

# Smart Warehouse Firaza

## 1. Overview

Development Task Document berisi daftar pekerjaan yang diperlukan untuk
membangun aplikasi Smart Warehouse Firaza.

Dokumen ini digunakan sebagai: - Development roadmap. - Checklist
pengerjaan capstone project. - Panduan implementasi frontend, backend,
dan database. - Referensi task ketika menggunakan AI coding assistant.

Metode pengerjaan menggunakan pendekatan bertahap agar pengembangan
dapat selesai dalam batas waktu capstone individu.

------------------------------------------------------------------------

# 2. Development Strategy

## Phase 1 - Project Foundation

Tujuan: Mempersiapkan struktur project dan environment development.

Status:

\[ \] Not Started

Task:

### TASK-001 Setup Repository

Deskripsi: Membuat struktur repository project.

Output:

    smart-warehouse-firaza/

    ├── frontend/
    ├── backend/
    ├── docs/
    └── README.md

------------------------------------------------------------------------

### TASK-002 Setup Frontend Project

Technology:

-   React.js
-   Vite
-   Tailwind CSS

Output:

-   React project berjalan.
-   Basic folder structure tersedia.

------------------------------------------------------------------------

### TASK-003 Setup Backend Project

Technology:

-   Express.js

Output:

-   Express server berjalan.
-   Basic API structure tersedia.

------------------------------------------------------------------------

### TASK-004 Setup Database

Technology:

-   PostgreSQL
-   Prisma ORM

Output:

-   Database terkoneksi.
-   Prisma berhasil melakukan migration.

------------------------------------------------------------------------

# Phase 2 - Backend Development

Tujuan: Membangun REST API dan business logic.

Status:

\[ \] Not Started

------------------------------------------------------------------------

## Authentication Module

### TASK-005 Implement User Model

Requirement:

Membuat model:

-   User
-   Role

Role:

    OWNER
    STAFF_WAREHOUSE

------------------------------------------------------------------------

### TASK-006 Implement JWT Authentication

Deskripsi:

Membuat sistem:

-   Login.
-   Generate JWT token.
-   Middleware authentication.

Output:

API:

    POST /api/v1/auth/login

------------------------------------------------------------------------

### TASK-007 Implement Role Authorization

Deskripsi:

Membatasi akses berdasarkan role.

Contoh:

Owner:

-   Dashboard.
-   Reports.

Staff:

-   Material management.
-   Transactions.

------------------------------------------------------------------------

# Material Management Module

## TASK-008 Create Category API

Endpoint:

    GET /categories

    POST /categories

    PUT /categories/:id

    DELETE /categories/:id

------------------------------------------------------------------------

## TASK-009 Create Material API

Endpoint:

    GET /materials

    POST /materials

    PUT /materials/:id

    DELETE /materials/:id

Requirement:

-   CRUD material.
-   Search.
-   Filter category.

------------------------------------------------------------------------

# Inventory Transaction Module

## TASK-010 Create Stock In API

Requirement:

Ketika transaksi STOCK_IN:

    Current Stock + Quantity

Output:

-   Transaction tersimpan.
-   Stock bertambah.

------------------------------------------------------------------------

## TASK-011 Create Stock Out API

Requirement:

Ketika transaksi STOCK_OUT:

    Current Stock - Quantity

Validation:

Stock tidak boleh kurang dari nol.

------------------------------------------------------------------------

## TASK-012 Create Transaction History API

Endpoint:

    GET /transactions

Requirement:

Menampilkan:

-   Material.
-   Type transaksi.
-   Quantity.
-   User.
-   Date.

------------------------------------------------------------------------

# Stock Opname Module

## TASK-013 Create Stock Opname API

Requirement:

Input:

-   Actual stock.

Backend menghitung:

    Adjustment =
    Actual Stock - System Stock

Output:

-   History stock opname tersimpan.

------------------------------------------------------------------------

# Dashboard Module

## TASK-014 Create Dashboard API

Endpoint:

    GET /dashboard

Data:

-   Total material.
-   Total stock.
-   Low stock.
-   Recent transaction.

------------------------------------------------------------------------

# Reporting Module

## TASK-015 Create Inventory Report API

Menampilkan:

-   Material.
-   Category.
-   Stock.
-   Inventory status.

------------------------------------------------------------------------

## TASK-016 Create Transaction Report API

Menampilkan:

-   Transaction history.
-   User activity.
-   Date.

------------------------------------------------------------------------

# Phase 3 - Frontend Development

Tujuan: Membangun user interface menggunakan React.

Status:

\[ \] Not Started

------------------------------------------------------------------------

# Authentication UI

## TASK-017 Create Login Page

Requirement:

-   Email input.
-   Password input.
-   Validation.
-   JWT handling.

------------------------------------------------------------------------

## TASK-018 Create Protected Route

Requirement:

-   User tanpa token tidak dapat mengakses dashboard.
-   Role based navigation.

------------------------------------------------------------------------

# Layout Development

## TASK-019 Create Dashboard Layout

Components:

-   Sidebar.
-   Navbar.
-   Content area.

------------------------------------------------------------------------

# Dashboard UI

## TASK-020 Create Dashboard Page

Display:

-   Summary cards.
-   Inventory status.
-   Recent transactions.

------------------------------------------------------------------------

# Material UI

## TASK-021 Create Material Management Page

Features:

-   Table material.
-   Search.
-   Filter.
-   Add material.
-   Edit material.

------------------------------------------------------------------------

# Transaction UI

## TASK-022 Create Stock Transaction Page

Features:

-   Stock In form.
-   Stock Out form.
-   Transaction history.

------------------------------------------------------------------------

# Stock Opname UI

## TASK-023 Create Stock Opname Page

Features:

-   Select material.
-   Input actual stock.
-   Display adjustment.

------------------------------------------------------------------------

# Report UI

## TASK-024 Create Report Page

Features:

-   Inventory report.
-   Transaction report.

------------------------------------------------------------------------

# Phase 4 - Integration & Testing

Status:

\[ \] Not Started

------------------------------------------------------------------------

## TASK-025 Frontend Backend Integration

Requirement:

Menghubungkan:

React:

↓

Axios:

↓

Express API

------------------------------------------------------------------------

## TASK-026 Authentication Testing

Testing:

-   Login berhasil.
-   Login gagal.
-   Token validation.
-   Role restriction.

------------------------------------------------------------------------

## TASK-027 Inventory Testing

Testing:

-   Material CRUD.
-   Stock in.
-   Stock out.
-   Stock calculation.

------------------------------------------------------------------------

## TASK-028 Database Testing

Testing:

-   Relationship.
-   Migration.
-   Data consistency.

------------------------------------------------------------------------

# Phase 5 - Deployment & Documentation

Status:

\[ \] Not Started

------------------------------------------------------------------------

## TASK-029 Prepare Production Environment

Requirement:

-   Environment variable.
-   Database production.
-   API configuration.

------------------------------------------------------------------------

## TASK-030 Deploy Application

Output:

-   Frontend deployed.
-   Backend deployed.
-   Database connected.

------------------------------------------------------------------------

## TASK-031 Update Documentation

Dokumen:

-   README.md
-   API Documentation.
-   Database Design.
-   User Flow.

------------------------------------------------------------------------

# Recommended Development Order

Urutan pengerjaan:

    1. Setup Project

    2. Database + Prisma

    3. Authentication JWT

    4. Material CRUD

    5. Stock Transaction

    6. Stock Opname

    7. Dashboard

    8. Reporting

    9. Frontend Integration

    10. Testing

    11. Deployment

------------------------------------------------------------------------

# AI Development Workflow

Ketika menggunakan AI coding assistant, gunakan task secara bertahap.

Contoh:

Jangan:

"buatkan aplikasi Smart Warehouse Firaza"

Gunakan:

"Berdasarkan PRD.md, DATABASE-DESIGN.md, dan TASK-006, implementasikan
JWT Authentication menggunakan Express.js."

Setiap task harus memiliki: - Tujuan. - Input. - Output. - Batasan.

Dengan pendekatan ini AI dapat bekerja sesuai requirement tanpa
memperluas scope.
