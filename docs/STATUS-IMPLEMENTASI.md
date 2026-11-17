# Status implementasi Smart Warehouse Firaza

Snapshot **17 November 2026**, ID capstone **DB15-I015**. Dokumen ini menjelaskan aplikasi yang sudah diimplementasikan serta batas bukti yang tersedia pada checkpoint tersebut. Tanggal dan hasil di sini merupakan catatan checkpoint, bukan pemeriksaan otomatis kondisi demo saat halaman ini dibuka.

## Source dan akses reviewer

| Hal | Acuan |
| --- | --- |
| Source aplikasi yang diuji dan di-deploy untuk demo reviewer | [`7f8d88c`](https://github.com/syahreza0511/smart-warehouse-firaza/commit/7f8d88ce4ad793d473daa92fc5b03a108075e89a) |
| Pembaruan README submission setelah source aplikasi tersebut | [PR #7](https://github.com/syahreza0511/smart-warehouse-firaza/pull/7), merge [`412fc96`](https://github.com/syahreza0511/smart-warehouse-firaza/commit/412fc9647ce0046059a46f3ee57cc40b5473cbd2) |
| Demo reviewer | https://firaza-reviewer.vercel.app |
| Data | Data sintetis berlabel `[DEMO]` dan `[QA-REVIEWER]` pada database reviewer yang terpisah dari deployment privat Owner |
| Akun | Owner dan Staff Warehouse, diberikan melalui informasi akses submission. Tidak ada registrasi publik |

Commit dokumentasi yang muncul setelah source aplikasi di atas tidak dengan sendirinya berarti aplikasi di-deploy ulang. Periksa bukti deployment bila memerlukan kepastian versi yang dilayani.

## Cakupan yang tersedia

| Area | Perilaku yang diimplementasikan |
| --- | --- |
| Autentikasi | Login, logout dan pembacaan sesi melalui API aplikasi dengan Supabase Auth dan cookie `HttpOnly` |
| Peran | Owner membaca. Staff Warehouse mengelola material dan transaksi. API dan database menegakkan hak akses |
| Dashboard | Total material aktif, stok normal, rendah dan habis, serta daftar material yang perlu perhatian |
| Material | Daftar aktif/arsip, detail, tambah, ubah, arsip, aktivasi ulang dan hapus permanen dengan syarat. Material baru dimulai dari stok 0 |
| Satuan dan stok minimum | Satuan terkunci setelah material memiliki transaksi atau item pemeriksaan. Stok minimum berupa bilangan bulat nonnegatif |
| Stock In/Out | Bilangan bulat positif, catatan opsional, penolakan stok tidak cukup dan perlindungan transaksi ganda dengan `Idempotency-Key` |
| Pemeriksaan Stok | Pembuatan sesi, pembekuan material, penyimpanan hitungan, finalisasi atomik dan pembatalan dengan alasan |
| Histori | Histori transaksi terbaru dan riwayat arsip per material. Pelaku ditampilkan sebagai “Anda” atau “Pengguna lain” |
| Kategori | Baca-saja di aplikasi, disiapkan oleh pengelola |
| Pemantauan persediaan | Dashboard, daftar material dan histori. Belum ada ekspor atau modul laporan terpisah |

### Aturan Pemeriksaan Stok

- Staff memilih material aktif yang tersedia ketika membuat sesi. Material terpilih dibekukan sampai sesi berakhir.
- Hanya Staff pembuat sesi yang dapat mengisi hasil hitung dan melakukan finalisasi. Staff lain dapat membatalkan sesi yang masih berlangsung dengan alasan. Owner hanya memantau.
- Simpan hasil hitung belum mengubah stok. Finalisasi menerapkan seluruh hitungan yang valid, mencatat transaksi Penyesuaian untuk selisih yang tidak nol dan melepas pembekuan.
- Pembatalan melepas pembekuan tanpa mengubah stok. Sesi yang sudah difinalisasi atau dibatalkan tidak dapat dilanjutkan melalui aplikasi.
- Pengiriman ulang pembuatan sesi dengan key dan payload yang sama memakai replay. Finalisasi atau pembatalan pada sesi yang sudah berakhir ditolak, bukan diperlakukan sebagai replay berhasil.

Antarmuka memakai istilah **Pemeriksaan Stok**. Source, route `/stock-opnames`, API `/api/v1/stock-opnames`, RPC dan tabel database tetap menggunakan istilah **Stock Opname**. Ini pemetaan istilah, bukan dua fitur terpisah.

## Teknologi implementasi

Antarmuka menggunakan JavaScript, React pada Next.js 16, Tailwind CSS v4, shadcn/ui dan Radix UI. Frontend memanggil REST API aplikasi melalui Axios. Next.js Route Handlers pada `/api/v1` melakukan validasi Zod dan pemeriksaan akses sebelum memanggil Supabase dengan sesi pengguna.

Supabase menyediakan PostgreSQL dan autentikasi. RLS serta RPC database menegakkan aturan bisnis. Struktur yang diterapkan berasal dari [tujuh migration SQL](../supabase/migrations/), bukan dari ERD PNG atau rancangan API lama dalam arsip. Environment dan langkah menjalankan aplikasi lokal dijelaskan pada [README utama](../README.md#menjalankan-secara-lokal).

## Perubahan terhadap arsip perencanaan

| Catatan lama yang mungkin ditemukan | Kedudukan pada checkpoint ini |
| --- | --- |
| ID proyek pada dokumentasi sebelumnya | ID proyek dan submission yang benar adalah **DB15-I015**, sesuai koreksi Owner |
| React Vite, Express, Prisma, atau varian TypeScript | Alternatif/perencanaan terdahulu. Implementasi memakai JavaScript, Next.js Route Handlers dan Supabase |
| Aplikasi belum di-deploy, dashboard atau Stock Opname belum tersedia | Status historis. Demo, dashboard dan Pemeriksaan Stok sudah tersedia pada checkpoint yang dirujuk |
| Catatan Owner atau `FR-NOTE` ditunda untuk MVP selanjutnya | **Dibatalkan oleh Owner.** Fitur ini bukan bagian aplikasi atau backlog aktif |
| Laporan, grafik atau ekspor khusus | Pemantauan tersedia melalui dashboard dan histori. Ekspor atau modul laporan terpisah belum tersedia |
| CRUD kategori atau manajemen akun melalui UI | Belum tersedia. Kategori dan akun disiapkan pengelola |
| Koreksi transaksi `REVERSAL`, pencarian, filter dan histori global | Belum tersedia. Histori transaksi tidak dapat dihapus dari aplikasi |
| AI, marketplace dan pembayaran | Tidak termasuk implementasi MVP ini |

Arsip tetap menyimpan teks aslinya, termasuk keputusan dan metadata terdahulu. Penanda pada pembuka arsip membatasi penggunaannya. Snapshot ini mencatat keputusan yang telah diberikan Owner dan fakta implementasi, bukan memperkenalkan requirement baru.

## Bukti pengujian

### CI

[Run CI untuk merge README `412fc96`](https://github.com/syahreza0511/smart-warehouse-firaza/actions/runs/43997118534) mencatat **191 unit test lulus dan build berhasil**. Pengujian unit ini tidak memerlukan jaringan atau database. Workflow tidak menjalankan harness integrasi.

### Smoke test demo reviewer G7F

Catatan pengujian browser **17 November 2026**, source aplikasi `7f8d88c`, mencatat **17 pemeriksaan lulus**: 14 skenario UI dan 3 pemeriksaan API melalui halaman aplikasi. Penjelasan skenario ada pada [bagian pengujian README](../README.md#qa-browser-di-demo-reviewer-17-november-2026).

Cakupan meliputi login/logout kedua peran, tampilan Owner, tambah/ubah material oleh Staff, Stock In/Out, pengisian hitungan, finalisasi, pembatalan, replay Stock In dan penolakan tulis Owner. Pemeriksaan akhir mencatat stok sesuai jumlah ledger, tanpa sesi pemeriksaan berlangsung atau material yang tetap dibekukan.

Screenshot README berasal dari awal run tersebut, ketika ada 6 material aktif dengan status 3 normal, 2 rendah dan 1 habis. Setelah material uji ditambahkan, kondisi akhir menjadi 7 material aktif: 4 normal, 2 rendah dan 1 habis. Reviewer dapat mengubah data demo sehingga angka tersebut bukan kondisi awal yang dijamin pada kunjungan berikutnya. Data tidak di-reset otomatis.

### Batas bukti

- Pengujian browser reviewer memakai Chrome headless, desktop 1280 px dan emulasi 390 px. Ini bukan pengujian pada perangkat mobile nyata atau seluruh browser.
- Safari, Firefox, penonaktifan akun saat sesi aktif dan kedaluwarsa sesi belum diverifikasi pada demo reviewer di checkpoint ini.
- Uji integrasi lokal mempunyai cakupan dan lingkungan tersendiri. Petunjuknya ada pada [panduan pengujian](../tests/README.md). Hasil lokal tidak otomatis membuktikan perilaku cloud.
- Penyusunan dan perapian dokumentasi tidak menjalankan ulang smoke test aplikasi. Hasil yang dirujuk tetap berasal dari run di atas.
- Hasil ini bukan audit keamanan menyeluruh atau pengukuran dampak bisnis dalam operasional nyata.

## Keterbatasan yang tetap berlaku

Tabel hasil hitung pada 390 px perlu digeser di dalam tabel. Daftar material tidak memakai paginasi. Draf hitungan dipulihkan di tab yang sama, tanpa sinkronisasi antar tab. Perubahan metadata material saat dibekukan masih diizinkan, dan perubahan bersamaan memakai hasil perubahan terakhir. Keterbatasan lain, termasuk temuan keamanan berprioritas rendah yang belum ditutup, dicatat pada [README utama](../README.md#keterbatasan-saat-ini).

## Materi submission

Project Brief PDF, slide PowerPoint dan pedoman penggunaan PDF disiapkan sebagai berkas submission terpisah. Video presentasi dan informasi akses reviewer mengikuti proses submission Owner. Ketersediaan materi tersebut tidak berarti form sudah dikirim. Password reviewer, token, credential database dan key tidak dimasukkan ke repository, screenshot publik atau ZIP source.
