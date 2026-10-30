# Stack Decision Log — Smart Warehouse Firaza

> **Status dokumen:** sumber utama keputusan teknologi Smart Warehouse Firaza.
> **Revisi:** Gelombang 2a, 29 Oktober 2026.
>
> - Jika dokumen lain bertentangan dengan log ini dalam hal teknologi, log ini yang berlaku sampai dokumen tersebut direvisi.
> - Kebutuhan produk dan aturan bisnis diatur di [PRD-Smart-Warehouse-Firaza-Dicoding.md](PRD-Smart-Warehouse-Firaza-Dicoding.md).
> - Seluruh keputusan di bawah berstatus **[RENCANA — belum diimplementasikan]**. Belum ada kode aplikasi.
> - Label sumber mengikuti legenda di PRD kanonik. Tidak ada label tambahan di dokumen ini.

## Sumber Keputusan

Lembar diskusi advisor mencatat sesi 1:1 tanggal 24 Oktober 2026. Menurut laporan pengguna, sesi berlangsung melalui Google Meet. Saran yang tercatat di bagian "Saran dari Advisor" [ADVISOR]:

- Next.js dibolehkan, dengan catatan harus menyesuaikan deadline capstone.
- Supabase dapat digunakan untuk integrasi back end, dengan catatan harus menyesuaikan jadwal deadline.
- Jika menggunakan Supabase, autentikasi lebih mudah dengan Supabase Auth sehingga tidak perlu JWT buatan sendiri.
- Langkah selanjutnya: mulai mengerjakan dari back end.

Lembar diskusi tidak mencatat pembahasan tentang Prisma, REST API, Route Handlers, maupun JavaScript vs TypeScript. Keputusan-keputusan tersebut adalah keputusan developer [KEPUTUSAN], bukan saran advisor.

## Keputusan Final (ADR)

Format setiap ADR (Architecture Decision Record): keputusan, sumber, alasan, trade-off, dan dampak.

### ADR-01 — Next.js dengan App Router

- **Keputusan:** Framework aplikasi adalah Next.js dengan App Router. Antarmuka dan API berada dalam satu aplikasi.
- **Sumber:** [ADVISOR] (dibolehkan, bersyarat deadline); [KEPUTUSAN].
- **Alasan:** Satu framework untuk frontend dan API mengurangi beban setup bagi developer individu. Route Handlers (ADR-05) hanya tersedia di App Router.
- **Trade-off:** Ada kurva belajar App Router. Advisor mengingatkan agar pilihan ini tidak membahayakan deadline.
- **Dampak:** Struktur `frontend/` + `backend/` terpisah di dokumen lama tidak berlaku.

### ADR-02 — JavaScript

- **Keputusan:** Bahasa implementasi adalah JavaScript (`.js` / `.jsx`). TypeScript tidak digunakan; `.ts`, `.tsx`, dan konfigurasi TypeScript bukan persyaratan proyek.
- **Sumber:** [KEPUTUSAN].
- **Alasan:** Mengurangi jumlah hal baru yang harus dipelajari bersamaan dengan Next.js, Supabase, dan PostgreSQL function, di tengah deadline yang ketat.
- **Trade-off:** Tanpa pemeriksaan tipe saat kompilasi, validasi input di server menjadi penjaga utama bentuk data.
- **Dampak:** `PRD-TYPESCRIPT-VARIANT-Smart-Warehouse-Firaza.md` dan `SMART-WAREHOUSE-FIRAZA-JAVASCRIPT-VS-TYPESCRIPT-COMPARISON.md` tidak berlaku sebagai spesifikasi aktif. Kedua file tetap di tempatnya; penandaan di dalam file dijadwalkan pada Gelombang 2b.

### ADR-03 — Supabase PostgreSQL

- **Keputusan:** Database adalah PostgreSQL yang dikelola Supabase.
- **Sumber:** [ADVISOR] (dapat digunakan, bersyarat deadline); [KEPUTUSAN].
- **Alasan:** PostgreSQL terkelola, autentikasi, dan kebijakan akses (Row Level Security) tersedia dalam satu layanan.
- **Trade-off:** Ketergantungan pada layanan Supabase dan batasan paket gratisnya.
- **Dampak:** Desain database mengikuti PostgreSQL; detail di [DATABASE-DESIGN-Smart-Warehouse-Firaza.md](DATABASE-DESIGN-Smart-Warehouse-Firaza.md).

### ADR-04 — Supabase Auth

- **Keputusan:** Autentikasi memakai Supabase Auth. Aplikasi tidak membuat sistem penerbitan token/JWT sendiri. Hanya ada satu sistem autentikasi.
- **Sumber:** [ADVISOR]; [KEPUTUSAN].
- **Alasan:** Mengurangi kode keamanan buatan sendiri (hashing password, penerbitan dan verifikasi token). Identitas pengguna tersedia di database untuk Row Level Security.
- **Trade-off:** Perlu mempelajari pengelolaan sesi Supabase di Next.js.
- **Dampak:** Konfigurasi `JWT_SECRET` dan kolom password di tabel pengguna pada dokumen lama tidak berlaku. Otorisasi Owner/Staff Warehouse tetap ditegakkan di server dan database (PRD FR-AUTH-03).

### ADR-05 — REST API melalui Next.js Route Handlers

- **Keputusan:**
  - API berbentuk REST dengan base URL `/api/v1`, diimplementasikan melalui Next.js Route Handlers. [KEPUTUSAN]
  - Route Handlers menangani request API: validasi input, autentikasi/otorisasi, dan pemanggilan operasi database. [KEPUTUSAN]
  - Server Actions tidak digunakan sebagai pengganti REST API. [KEPUTUSAN]
  - Operasi perubahan stok dan operasi lain yang membutuhkan atomicity dijalankan sebagai PostgreSQL function melalui Supabase RPC (ADR-08). [KEPUTUSAN]
- **Batas penggunaan Route Handlers:**
  - Request HTTP dari antarmuka ke server, termasuk seluruh operasi tulis dan operasi bisnis (Stock In/Out, koreksi, Stock Opname, CRUD kategori dan material, arsip/reaktivasi), melewati Route Handlers. [DITURUNKAN dari keputusan Route Handlers sebagai lapisan API dan larangan Server Actions sebagai pengganti REST API]
  - Pembacaan data secara langsung di server oleh Server Components, tanpa melewati Route Handlers, **belum diputuskan**. Lihat [OPEN DECISION OD-18].
- **Sumber:** [KEPUTUSAN].
- **Alasan:** Kontrak HTTP yang eksplisit mudah diuji dan didokumentasikan, serta mendukung Opsi A pada checklist (lihat bagian Kepatuhan).
- **Trade-off:** Setiap request HTTP dari antarmuka ke server membutuhkan kode perantara di Route Handler: parsing request, validasi, pemeriksaan sesi dan role, pemanggilan Supabase, dan pemetaan error ke respons HTTP. Ini menambah jumlah kode dibanding memanggil database langsung. Keputusan ini tidak mengatur pembacaan data oleh Server Components; pola tersebut belum diputuskan (OD-18).
- **Dampak:** Kontrak endpoint dicatat di dokumentasi API (direvisi pada Gelombang 2b).

### ADR-06 — Supabase JavaScript Client, Tanpa ORM

- **Keputusan:** Akses database memakai Supabase JavaScript client. Prisma tidak digunakan; ORM lain tidak ditambahkan tanpa persetujuan.
- **Sumber:** [KEPUTUSAN].
- **Alasan:** Satu klien untuk autentikasi dan data; Row Level Security tetap berlaku pada setiap query.
- **Trade-off:** Tidak ada model ORM dan migrasi otomatis; skema dikelola lewat SQL (ADR-07).
- **Dampak:** Seluruh rujukan Prisma di dokumen lama tidak berlaku.

### ADR-07 — SQL Migrations

- **Keputusan:** Skema dan perubahan struktur database dikelola melalui file SQL migration yang disimpan di repository dan dilacak versinya.
- **Sumber:** [KEPUTUSAN].
- **Alasan:** Database development dan production dapat dibangun ulang secara identik; setiap perubahan skema dapat ditinjau.
- **Trade-off:** Developer menulis SQL secara langsung.
- **Dampak:** Perubahan skema langsung lewat dashboard tanpa file migration tidak diperbolehkan. Alat dan langkah menjalankan migration dirinci di dokumentasi environment (Gelombang 2b).

### ADR-08 — Operasi Atomik melalui PostgreSQL Function dan Supabase RPC

- **Keputusan:** Operasi yang harus atomik — perubahan stok, koreksi transaksi, serta posting dan pembatalan Stock Opname — diimplementasikan sebagai PostgreSQL function yang dipanggil melalui Supabase RPC. Pembekuan Stock Opname ditegakkan di database dengan operasi atomik dan row locking.
- **Sumber:** [KEPUTUSAN].
- **Alasan:** Setiap request Supabase JS client yang terpisah berjalan dalam transaksi database sendiri. Beberapa request terpisah tidak otomatis menjadi satu transaksi, sehingga dapat meninggalkan data setengah tersimpan atau stok tidak konsisten saat diakses bersamaan.
- **Trade-off:** Sebagian logika bisnis inti ditulis dalam SQL/PL/pgSQL, yang lebih sulit di-debug dan perlu diuji terhadap database sungguhan.
- **Dampak:** Kontrak function dirinci di DATABASE-DESIGN.

## Kepatuhan Checklist Tech Stack

Sumber: `List Tech Stack [Dicoding Bootcamp Batch 15] - Tipe Capstone_ Individu.pdf`, halaman 1, kolom Full-Stack Web Developer [PDF hlm.1]. Status "Direncanakan" berarti belum diimplementasikan maupun diuji.

### Main Quest

| Persyaratan | Rencana pemenuhan | Status |
|---|---|---|
| Menggunakan module bundler | Next.js membundel aplikasi dengan bundler bawaannya (ADR-01) | Direncanakan |
| Opsi A: RESTful API dengan URL sesuai konvensi (`/api/v1/...`) | Route Handlers di bawah `/api/v1` (ADR-05) | Direncanakan |
| Opsi A: Networking calls (Fetch/Axios) dari FE ke BE | Komponen antarmuka memanggil Route Handlers melalui HTTP untuk operasi tulis dan operasi bisnis (ADR-05). Pola pembacaan data server-side: OD-18 | Direncanakan |
| Opsi A: Menyimpan data ke database melalui API | Penulisan data melalui Route Handlers → Supabase (ADR-05, ADR-06, ADR-08) | Direncanakan |

### Tindakan yang Dilarang

| Larangan | Cara menghindari |
|---|---|
| Mengumpulkan website statis | Aplikasi memiliki API dan database (ADR-03, ADR-05) |
| Website tidak mampu menyimpan data ke database | Seluruh transaksi disimpan ke PostgreSQL |
| Hardcode data dummy permanen sebagai pengganti koneksi API | Data sintetis disimpan di database melalui seed (PRD NFR-04) |

### Side Quest yang Ditargetkan

| Side Quest | Rencana | Status |
|---|---|---|
| Antarmuka responsif | PRD NFR-05 | Direncanakan |
| Framework untuk One Man Developer (Next JS, dll.) | ADR-01 | Direncanakan |
| API dengan Express atau framework lain yang relevan (gaya FE & BE) | Route Handlers (ADR-05) | Belum terkonfirmasi apakah termasuk "framework lain yang relevan" |
| Git dan GitHub | Repository GitHub proyek | Direncanakan |
| CSS Framework dan Modern UI Components | Framework CSS dan komponen UI: OD-15 (kandidat: Tailwind CSS, shadcn/ui) | Terbuka |
| Schema Validation pada backend | Library: OD-15 | Terbuka |
| HTTP Library (Axios) | OD-15 | Terbuka |
| Deploy ke server atau layanan cloud | Platform: OD-15 | Terbuka |

## Keputusan Terbuka — OD-15

**Status:** [OPEN DECISION OD-15]. Rekomendasi di bawah **belum disetujui**.

| Topik | Pilihan | Trade-off | Rekomendasi |
|---|---|---|---|
| Framework CSS | Tailwind CSS / CSS Modules bawaan Next.js / Bootstrap | Tailwind tercantum di dokumentasi sebelumnya, disebut sebagai contoh Side Quest, dan menjadi dasar shadcn/ui, tetapi kelas utilitasnya membuat markup panjang. CSS Modules tanpa dependency tambahan, tetapi tidak memenuhi Side Quest "CSS Framework". Bootstrap memenuhi Side Quest, tetapi lebih sulit disesuaikan dengan tema Forest & Linen | Tailwind CSS, dengan token warna Forest & Linen sebagai konfigurasi tema |
| HTTP client di antarmuka | `fetch` bawaan / Axios | `fetch` tanpa dependency tambahan; Axios disebut eksplisit sebagai Side Quest dan memudahkan penanganan error terpusat, tetapi menambah dependency | Axios, karena menambah nilai Side Quest dengan biaya kecil |
| Komponen UI | shadcn/ui (berbasis Radix UI) / komponen buatan sendiri | shadcn/ui memenuhi "Modern UI Components", aksesibel, dan berbasis Tailwind, tetapi perlu setup awal, mode JavaScript, dan penyesuaian tema; bergantung pada pilihan framework CSS. Buatan sendiri lebih ringan tetapi tidak memenuhi Side Quest tersebut | shadcn/ui dalam mode JavaScript, jika Tailwind disetujui |
| Schema validation | Joi / Zod | Joi disebut sebagai contoh di checklist dan matang untuk Node.js; Zod dapat dipakai bersama di form dan Route Handler dengan API yang ringkas. Keduanya mendukung JavaScript | Zod, karena satu skema dapat dipakai di sisi antarmuka dan server |
| Platform deploy | Vercel / platform lain (Netlify, dll.) | Vercel dibuat oleh pengembang Next.js sehingga konfigurasinya paling sedikit; batasan paket gratis berlaku. Project Supabase paket gratis dapat dijeda bila tidak aktif, sehingga perlu dicek menjelang demo | Vercel |

## Keputusan Terbuka — OD-18: Pola Pembacaan Data Server-Side

**Status:** [OPEN DECISION OD-18]. Rekomendasi di bawah **belum disetujui**.

**Yang sudah final (ADR-05, ADR-08):** REST API melalui Route Handlers; operasi tulis dan operasi bisnis dari antarmuka melewati Route Handlers; operasi atomik melalui PostgreSQL function dan Supabase RPC; Server Actions bukan pengganti REST API. OD-18 tidak membatalkan keputusan-keputusan tersebut.

**Pertanyaan:** Ketika halaman dirender di server (Server Component), bagaimana data dibaca?

| Pilihan | Cara kerja | Kelebihan | Kekurangan |
|---|---|---|---|
| A. Server Component memanggil Route Handler melalui HTTP | Server Component melakukan `fetch` ke `/api/v1/...` milik aplikasi | Satu jalur akses data; konsisten dengan dokumentasi API | Dokumentasi resmi Next.js menganjurkan Server Components membaca data langsung dari sumbernya, bukan melalui Route Handlers.¹ Untuk Server Component yang dirender on demand: ada tambahan satu lompatan HTTP antara proses render dan Route Handler sehingga lebih lambat,¹ dan cookie sesi pengguna perlu diteruskan dengan benar agar Route Handler mengenali pengguna. Untuk Server Component yang di-prerender saat build: build gagal, karena tidak ada server yang melayani request tersebut selama build.¹ Halaman yang bergantung pada sesi pengguna umumnya dirender on demand sehingga keterbatasan build ini tidak selalu berlaku, tetapi tetap perlu diwaspadai untuk halaman yang dapat di-prerender |
| B. Server Component dan Route Handler memakai data-access layer bersama | Modul khusus server berisi fungsi baca yang memakai Supabase client dengan sesi pengguna, sehingga Row Level Security tetap berlaku. Route Handler dan Server Component sama-sama memanggil modul ini | Tanpa lompatan HTTP tambahan; logika query dan otorisasi baca ditulis sekali | Ada dua pintu masuk ke data yang sama-sama harus memeriksa sesi dan role; perlu dipastikan penilai menerima pembacaan server-side ini bersama pemenuhan Opsi A |
| C. Seluruh pembacaan dari Client Component ke Route Handler | Halaman tidak membaca data di server; komponen di browser memanggil `/api/v1/...` | Penjelasan pemenuhan Opsi A paling sederhana; hanya satu pintu masuk data | Halaman tampil kosong atau loading sebelum data tiba; manfaat rendering di server tidak dipakai; lebih banyak state loading dan error di antarmuka |

**Rekomendasi (belum disetujui): Pilihan B.**

- Route Handlers menjadi pembungkus tipis di atas data-access layer yang sama.
- Operasi tulis tetap hanya melalui Route Handlers dan RPC.
- Alasan: mengikuti anjuran dokumentasi resmi Next.js agar Server Components membaca data langsung dari sumbernya (catatan kaki ¹), tanpa mengorbankan pengalaman pengguna seperti pada pilihan C. Logika otorisasi baca cukup ditulis sekali.
- Risiko interpretasi checklist dapat ditanyakan ke advisor bersama pertanyaan tentang Route Handlers sebagai "framework lain yang relevan".

¹ Next.js Docs, "How to use Next.js as a backend for your frontend", subbagian "Caveats → Server Components". https://nextjs.org/docs/app/guides/backend-for-frontend (halaman tercatat diperbarui 25 Juni 2026; diakses 29 Oktober 2026).

## Belum Terkonfirmasi

Hal berikut perlu dikonfirmasi ke advisor atau tim Dicoding dan tidak boleh dianggap final:

- **Scope AI** — status [Pending Confirmation]; rincian di PRD, bagian Ruang Lingkup AI.
- **Progress report 1 November 2026** — bentuk dan kriteria minimalnya belum diketahui.
- **Route Handlers sebagai "framework lain yang relevan"** — untuk Side Quest gaya FE & BE.
- **Pembacaan data server-side (OD-18)** — apakah diterima penilai sebagai bagian dari pemenuhan Opsi A.
- **Deadline** — progress report 1 November 2026 dan pengumpulan akhir 22 November 2026 dilaporkan pengguna dari pertemuan dengan tim Dicoding; belum terverifikasi dari dokumen tertulis.

## Status Dokumen Lain terhadap Keputusan Ini

| Dokumen | Status | Jadwal |
|---|---|---|
| `PRD-Smart-Warehouse-Firaza-Dicoding.md` | Selaras (PRD kanonik); daftar topik OD-15 dan OD-18 perlu disinkronkan | Sinkronisasi diajukan terpisah |
| `PRD-Smart-Warehouse-Firaza-Professional.md` | Historis | Ditandai Gelombang 2a |
| `FEATURE-SPECIFICATION-Smart-Warehouse-Firaza.md` | Masih memuat JWT dan aturan lama | Gelombang 2a |
| `DATABASE-DESIGN-Smart-Warehouse-Firaza.md` | Masih memuat Prisma dan Express | Gelombang 2a |
| `PROJECT-CONTEXT-Smart-Warehouse-Firaza.md` | Masih memuat stack lama | Gelombang 2a |
| `API-DOCUMENTATION`, `CODING-GUIDELINE`, `DEVELOPMENT-TASK`, `ENVIRONMENT-CONFIGURATION`, `USER-FLOW`, `PROJECT-MEMORY`, `README-Smart-Warehouse-Firaza.md`, AI guides, GitHub workflow guide | Masih memuat stack lama (React + Vite, Express, Prisma, JWT) sebagian atau seluruhnya | Gelombang 2b |
| `PRD-TYPESCRIPT-VARIANT-Smart-Warehouse-Firaza.md`, `SMART-WAREHOUSE-FIRAZA-JAVASCRIPT-VS-TYPESCRIPT-COMPARISON.md` | Tidak aktif (ADR-02) | Penandaan di file: Gelombang 2b |

## Format Pencatatan Keputusan Baru

Setiap keputusan teknologi baru ditambahkan sebagai ADR baru dengan nomor berikutnya (ADR-09 dan seterusnya), berisi:

1. Tanggal keputusan.
2. Keputusan yang disetujui.
3. Sumber (label sesuai legenda PRD).
4. Alasan dan trade-off.
5. Dampak pada struktur proyek dan dokumentasi.
6. Tindak lanjut yang perlu dilakukan.

OPEN DECISION tidak boleh diperlakukan sebagai keputusan final sebelum disetujui dan dicatat sebagai ADR.
