# Smart Warehouse Firaza

> **Status:** Perencanaan — keputusan arsitektur dan framework masih menunggu konfirmasi advisor.

Smart Warehouse Firaza adalah rencana aplikasi web untuk membantu bisnis hampers dan personalized gift mengelola persediaan bahan baku secara digital. Repository ini menjadi tempat utama untuk dokumentasi, keputusan teknis, source code, pengujian, dan catatan perkembangan capstone.

## Tujuan proyek

- Mengelola data material dan kategori.
- Mencatat transaksi stok masuk dan stok keluar.
- Melakukan stock opname dan mencatat penyesuaian stok.
- Memantau kondisi persediaan melalui dashboard.
- Menyediakan laporan inventori dan riwayat transaksi.
- Menerapkan pembagian akses Owner dan Staff Warehouse.

Scope akhir fitur MVP akan dikonfirmasi bersama advisor sebelum implementasi.

## Status saat ini

- [x] Dokumentasi awal proyek dikumpulkan.
- [x] Rancangan fitur, alur pengguna, database, dan API tersedia sebagai bahan awal.
- [ ] Konfirmasi scope MVP dan kriteria penilaian dengan advisor.
- [ ] Konfirmasi framework dan arsitektur backend.
- [ ] Konfirmasi penggunaan PostgreSQL lokal atau Supabase sebagai layanan PostgreSQL terkelola.
- [ ] Konfirmasi JavaScript atau TypeScript.
- [ ] Buat skeleton aplikasi setelah keputusan teknologi disepakati.
- [ ] Implementasi, pengujian, dan deployment.

## Keputusan teknologi

**Stack final belum ditetapkan.** Dokumen perencanaan di folder `docs/` memuat rancangan awal React + Vite, Express.js, PostgreSQL, Prisma, REST API, dan JWT. Opsi Next.js serta Supabase juga sedang dipertimbangkan dan akan dibahas dengan advisor.

Supabase menggunakan PostgreSQL sebagai database inti. Memilih Supabase sebagai layanan database tidak dengan sendirinya mengharuskan aplikasi memakai Supabase Auth atau meninggalkan Prisma.

## Dokumentasi

Folder [`docs/`](./docs/) berisi dokumen perencanaan awal, antara lain:

- Project context dan project memory.
- PRD dan spesifikasi fitur.
- Database design dan ERD.
- API documentation dan user flow.
- Development tasks dan coding guidelines.
- Panduan penggunaan AI coding assistant.
- Panduan workflow GitHub.
- Dokumen perbandingan JavaScript dan TypeScript.

Beberapa dokumen mencerminkan keputusan awal sebelum diskusi advisor. Jika terjadi perbedaan, catat keputusan final di [`docs/STACK-DECISION-LOG.md`](./docs/STACK-DECISION-LOG.md) dan perbarui dokumen terkait setelah keputusan disetujui.

## Keamanan

- Jangan commit `.env`, token, password, API key, credential database, atau file rahasia lainnya.
- Simpan daftar variabel yang diperlukan di `.env.example` menggunakan placeholder, bukan nilai rahasia.
- Jangan commit `node_modules/`, build output, cache, log, atau file database lokal.
- Periksa `git status` dan `git diff` sebelum commit.
- Jangan masukkan data operasional pribadi atau data bisnis nyata tanpa izin; gunakan data sintetis untuk development awal.

## Git workflow

Gunakan `main` untuk versi stabil dan branch pendek untuk pekerjaan tertentu, misalnya `docs/initial-project-setup` atau `feature/material-management`.

Contoh commit:

```bash
git add README.md docs/
git commit -m "docs: prepare initial project repository"
```

Lakukan perubahan dalam bagian kecil, uji sebelum merge, dan jangan push secret ke repository.
