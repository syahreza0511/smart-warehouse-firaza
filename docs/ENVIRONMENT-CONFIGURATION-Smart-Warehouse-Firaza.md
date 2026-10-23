# Environment Configuration Document

# Smart Warehouse Firaza

## 1. Purpose

Dokumen ini menjelaskan konfigurasi environment yang dibutuhkan untuk
menjalankan aplikasi Smart Warehouse Firaza.

Dokumen ini digunakan sebagai referensi untuk:

-   Setup local development.
-   Konfigurasi backend.
-   Konfigurasi frontend.
-   Deployment environment.
-   AI coding assistant agar memahami variable konfigurasi yang
    digunakan.

------------------------------------------------------------------------

# 2. Environment Overview

Smart Warehouse Firaza menggunakan beberapa environment:

## Development Environment

Digunakan untuk:

-   Pengembangan fitur.
-   Testing lokal.
-   Debugging.

## Production Environment

Digunakan untuk:

-   Aplikasi yang sudah deployment.
-   Penggunaan oleh end user.

------------------------------------------------------------------------

# 3. Backend Environment Configuration

Backend menggunakan:

-   Express.js.
-   PostgreSQL.
-   Prisma ORM.
-   JWT Authentication.

Lokasi file:

    backend/.env

------------------------------------------------------------------------

# 4. Backend Environment Variables

## DATABASE_URL

Purpose:

Connection string untuk PostgreSQL database.

Example:

``` env
DATABASE_URL="postgresql://username:password@localhost:5432/smart_warehouse"
```

Format:

    postgresql://
    username:
    password@
    host:
    port/
    database_name

------------------------------------------------------------------------

## JWT_SECRET

Purpose:

Secret key untuk melakukan generate dan validasi JWT token.

Example:

``` env
JWT_SECRET="your_secure_secret_key"
```

Rules:

-   Tidak boleh disimpan di repository.
-   Gunakan value yang berbeda antara development dan production.
-   Gunakan string yang sulit ditebak.

------------------------------------------------------------------------

## PORT

Purpose:

Menentukan port backend server.

Example:

``` env
PORT=5000
```

Default:

    5000

------------------------------------------------------------------------

## NODE_ENV

Purpose:

Menentukan mode aplikasi.

Development:

``` env
NODE_ENV="development"
```

Production:

``` env
NODE_ENV="production"
```

------------------------------------------------------------------------

# 5. Frontend Environment Configuration

Frontend menggunakan:

-   React.js.
-   Vite.
-   Axios.

Lokasi file:

    frontend/.env

------------------------------------------------------------------------

# 6. Frontend Environment Variables

## VITE_API_URL

Purpose:

URL backend API yang digunakan frontend.

Development:

``` env
VITE_API_URL="http://localhost:5000/api/v1"
```

Production:

``` env
VITE_API_URL="https://api-domain.com/api/v1"
```

------------------------------------------------------------------------

# 7. Example Environment Files

## Backend .env.example

``` env
DATABASE_URL=""

JWT_SECRET=""

PORT=5000

NODE_ENV="development"
```

------------------------------------------------------------------------

## Frontend .env.example

``` env
VITE_API_URL=""
```

------------------------------------------------------------------------

# 8. Environment Security Rules

Environment file:

    .env

Tidak boleh masuk repository.

Tambahkan ke:

    .gitignore

Example:

    .env
    .env.local
    .env.production

------------------------------------------------------------------------

# 9. Local Development Setup

## Backend

Create environment file:

    backend/.env

Isi:

``` env
DATABASE_URL="postgresql://username:password@localhost:5432/smart_warehouse"

JWT_SECRET="development_secret"

PORT=5000

NODE_ENV="development"
```

Run migration:

``` bash
npx prisma migrate dev
```

Start server:

``` bash
npm run dev
```

------------------------------------------------------------------------

## Frontend

Create environment file:

    frontend/.env

Isi:

``` env
VITE_API_URL="http://localhost:5000/api/v1"
```

Run:

``` bash
npm run dev
```

------------------------------------------------------------------------

# 10. Production Configuration

Production environment harus memiliki:

-   Production database.
-   Secure JWT secret.
-   Production API URL.
-   Environment variable pada hosting platform.

Contoh:

Frontend:

    VITE_API_URL=https://api.smartwarehouse.com/api/v1

Backend:

    DATABASE_URL=production_database_url

    JWT_SECRET=production_secret

    NODE_ENV=production

------------------------------------------------------------------------

# 11. AI Development Rules

Ketika membuat atau mengubah konfigurasi:

AI harus:

1.  Tidak menuliskan secret asli.
2.  Menggunakan placeholder.
3.  Tidak menghapus environment variable yang sudah digunakan.
4.  Menjelaskan jika membutuhkan variable baru.

Contoh:

Benar:

``` env
JWT_SECRET="your_secret"
```

Salah:

``` env
JWT_SECRET="my_real_password"
```

------------------------------------------------------------------------

# 12. Future Environment Expansion

Jika project berkembang, kemungkinan variable tambahan:

## Email Service

Contoh:

    SMTP_HOST
    SMTP_USER
    SMTP_PASSWORD

## File Storage

Contoh:

    CLOUD_STORAGE_KEY
    CLOUD_STORAGE_SECRET

## External API

Contoh:

    EXTERNAL_API_KEY

Variable tersebut tidak termasuk MVP.
