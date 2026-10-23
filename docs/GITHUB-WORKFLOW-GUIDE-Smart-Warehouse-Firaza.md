# GitHub Workflow Guide

# Smart Warehouse Firaza

## 1. Tujuan

Dokumen ini menjelaskan penggunaan Git dan GitHub untuk project Smart
Warehouse Firaza.

Target:

-   Mengerti version control.
-   Menyimpan project dengan aman.
-   Menggunakan workflow sederhana tetapi profesional.

------------------------------------------------------------------------

# 2. Konsep Dasar

## Git

Git adalah version control system yang menyimpan histori perubahan kode.

Contoh:

Developer membuat perubahan:

Code lama ↓ Commit ↓ Code baru

Git menyimpan setiap perubahan tersebut.

------------------------------------------------------------------------

## GitHub

GitHub adalah platform untuk menyimpan repository Git secara online.

Fungsi:

-   Backup kode.
-   Kolaborasi.
-   Portfolio.
-   Review kode.

------------------------------------------------------------------------

# 3. Repository Structure

Project:

smart-warehouse-firaza

    frontend/
    backend/
    docs/
    README.md

------------------------------------------------------------------------

# 4. Branch Strategy

Gunakan sederhana:

    main

    |

    feature/*

Main:

Versi stabil.

Feature:

Tempat mengembangkan fitur.

------------------------------------------------------------------------

# 5. Feature Branch

Contoh:

Membuat authentication:

``` bash
git checkout -b feature/authentication
```

Kerjakan fitur.

Setelah selesai:

``` bash
git add .
```

Commit:

``` bash
git commit -m "feat: implement JWT authentication"
```

Push:

``` bash
git push origin feature/authentication
```

------------------------------------------------------------------------

# 6. Commit Convention

Format:

type: description

Jenis:

feat: fitur baru

fix: perbaikan bug

docs: dokumentasi

refactor: perbaikan kode

Contoh:

    feat: add material CRUD API

    fix: fix stock validation

    docs: update README

------------------------------------------------------------------------

# 7. Pull Request

Walaupun project individu, biasakan menggunakan PR.

Flow:

feature branch

↓

Pull Request

↓

Review

↓

Merge main

------------------------------------------------------------------------

# 8. File yang Jangan Masuk Git

Tambahkan:

    .env

    node_modules/

    dist/

ke:

.gitignore

------------------------------------------------------------------------

# 9. Workflow Harian

Sebelum coding:

``` bash
git pull
```

Cek status:

``` bash
git status
```

Setelah coding:

``` bash
git add .
git commit -m "deskripsi"
git push
```

------------------------------------------------------------------------

# 10. Prinsip

Jangan:

-   commit semua perubahan besar sekaligus.
-   menggunakan commit message tidak jelas.
-   coding langsung di main.

Biasakan:

-   commit kecil.
-   branch berdasarkan fitur.
-   dokumentasi perubahan.
