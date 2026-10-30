# Stack Decision Log — Smart Warehouse Firaza

> **Status dokumen:** sumber utama keputusan teknologi Smart Warehouse Firaza.
> **Revisi:** Gelombang 2a, 29 Oktober 2026. Pembaruan 30 Oktober 2026: ADR-09 sampai ADR-11, serta ADR-12 yang menutup OD-15.
>
> - Jika dokumen lain bertentangan dengan log ini dalam hal teknologi, log ini yang berlaku sampai dokumen tersebut direvisi.
> - Kebutuhan produk dan aturan bisnis diatur di [PRD-Smart-Warehouse-Firaza-Dicoding.md](PRD-Smart-Warehouse-Firaza-Dicoding.md).
> - Kecuali status implementasinya dicatat lain di ADR terkait, keputusan di bawah berstatus **[RENCANA — belum diimplementasikan]**.
> - Fondasi aplikasi Next.js beserta integrasi dasar UI (ADR-12) telah dibuat dan lulus production build. Belum ada fitur bisnis, database, maupun autentikasi yang diimplementasikan.
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
- **Dampak:** Konfigurasi `JWT_SECRET` dan kolom password di tabel pengguna pada dokumen lama tidak berlaku. Otorisasi Owner/Staff Warehouse tetap ditegakkan di server dan database (PRD FR-AUTH-03). Provisioning akun, signup, dan offboarding diatur di ADR-11.

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
- **Dampak:** Perubahan skema langsung lewat dashboard tanpa file migration tidak diperbolehkan. Alat migration ditetapkan di ADR-10; langkah teknis menjalankannya dirinci di dokumentasi environment (Gelombang 2b).

### ADR-08 — Operasi Atomik melalui PostgreSQL Function dan Supabase RPC

- **Keputusan:** Operasi yang harus atomik — perubahan stok, koreksi transaksi, serta posting dan pembatalan Stock Opname — diimplementasikan sebagai PostgreSQL function yang dipanggil melalui Supabase RPC. Pembekuan Stock Opname ditegakkan di database dengan operasi atomik dan row locking.
- **Sumber:** [KEPUTUSAN].
- **Alasan:** Setiap request Supabase JS client yang terpisah berjalan dalam transaksi database sendiri. Beberapa request terpisah tidak otomatis menjadi satu transaksi, sehingga dapat meninggalkan data setengah tersimpan atau stok tidak konsisten saat diakses bersamaan.
- **Trade-off:** Sebagian logika bisnis inti ditulis dalam SQL/PL/pgSQL, yang lebih sulit di-debug dan perlu diuji terhadap database sungguhan.
- **Dampak:** Kontrak function dirinci di DATABASE-DESIGN. Pola keamanan function yang dipanggil melalui RPC diatur di ADR-09.

### ADR-09 — Pola Keamanan RPC: Wrapper `SECURITY INVOKER` dan Implementasi `SECURITY DEFINER` Privat

- **Tanggal:** 30 Oktober 2026.
- **Keputusan:** [KEPUTUSAN]
  - Function yang dipanggil melalui Supabase RPC berbentuk wrapper `SECURITY INVOKER` di schema yang diekspos Data API.
  - Implementasi bisnis yang membutuhkan hak lebih tinggi berbentuk function `SECURITY DEFINER` di schema privat yang tidak diekspos melalui Data API.
  - Implementasi privat memvalidasi identitas pengguna (`auth.uid()`), role dari `profiles`, kepemilikan resource bila relevan, dan seluruh invariant bisnis. Wrapper tidak menjadi satu-satunya pengendali keamanan.
  - Pemanggilan RPC langsung oleh pengguna terautentikasi, tanpa melewati Route Handlers, tidak boleh melewati aturan otorisasi. Route Handlers bukan satu-satunya lapisan pertahanan.
  - Operasi inventori tetap berjalan dalam satu transaksi database yang atomik (ADR-08).
- **Sumber:** [KEPUTUSAN], berdasarkan audit keamanan fondasi backend dan dokumentasi resmi Supabase serta PostgreSQL.²
- **Alasan:** Supabase JavaScript client dengan sesi pengguna (ADR-06) hanya dapat memanggil function di schema yang diekspos, sehingga function yang dipanggil Route Handler juga dapat dipanggil langsung melalui Data API. Dokumentasi resmi Supabase menyatakan function `SECURITY DEFINER` di schema yang diekspos dapat dipanggil melalui Data API dengan hak pembuatnya, dan menyarankan agar function seperti itu tidak ditempatkan di schema yang diekspos.²
- **Trade-off:** Dua function per operasi (wrapper dan implementasi) menambah jumlah kode dan pengujian; signature keduanya harus dijaga tetap sinkron.
- **Hubungan dengan ADR lain:** Menyempurnakan ADR-08 dalam hal cara function diamankan, tanpa mengubah kewajiban operasi atomik. Tidak mengubah ADR-05: request dari antarmuka tetap melewati Route Handlers, yang memanggil wrapper dengan sesi pengguna (ADR-06).
- **Persyaratan desain yang wajib diverifikasi saat implementasi** (rincian grant, nama function, dan schema yang diekspos belum ditetapkan):
  - Hak `USAGE` pada schema dan `EXECUTE` pada function diberikan seminimal mungkin, dengan memperhitungkan hak `EXECUTE` default untuk `PUBLIC` pada function baru.
  - Pemilik setiap function dan hak efektifnya didokumentasikan. Apakah function `SECURITY DEFINER` melewati RLS bergantung pada pemiliknya (superuser, atribut `BYPASSRLS`, atau pemilik tabel yang tidak memakai `FORCE ROW LEVEL SECURITY`), bukan terjadi otomatis.
  - `search_path` setiap function `SECURITY DEFINER` ditetapkan aman, dan objek dirujuk dengan nama schema lengkap.
  - RLS dan grant tabel tetap berlaku sebagai lapisan terpisah dari function.
  - Schema privat tidak dianggap aman hanya karena tidak diekspos; akses SQL dan hak atas schema tersebut tetap dibatasi dan diuji.
  - Pengujian mencakup pemanggilan RPC langsung oleh pengguna tanpa sesi, tanpa profil, dan dengan role yang tidak berwenang.
- **Dampak:** DATABASE-DESIGN §7.1 dan §12.3 saat ini masih menempatkan function `SECURITY DEFINER` di schema `public`. Bagian tersebut diselaraskan pada tahap dokumentasi berikutnya; sampai saat itu, ADR ini yang berlaku untuk pola keamanan function.
- **Tindak lanjut:** Rincian grant, schema yang diekspos, dan rekomendasi hardening lain dari audit keamanan diputuskan terpisah sebelum migration pertama.

² Supabase Docs, "Row Level Security", https://supabase.com/docs/guides/database/postgres/row-level-security; Supabase Docs, "Database Functions", https://supabase.com/docs/guides/database/functions; PostgreSQL Docs, "CREATE FUNCTION", subbagian "Writing SECURITY DEFINER Functions Safely", https://www.postgresql.org/docs/current/sql-createfunction.html (diakses 30 Oktober 2026).

### ADR-10 — Supabase CLI dan Docker Lokal untuk Migration

- **Tanggal:** 30 Oktober 2026.
- **Keputusan:** [KEPUTUSAN]
  - Workflow migration memakai Supabase CLI.
  - Lingkungan pengembangan Supabase berjalan di Docker lokal.
  - Perubahan skema dibuat sebagai SQL migration berversi yang disimpan dan dapat ditelusuri di repository (ADR-07).
  - Migration diuji di lingkungan lokal sebelum diterapkan ke project Supabase remote.
  - Mengubah skema langsung lewat dashboard tanpa file migration bukan workflow yang diperbolehkan.
- **Sumber:** [KEPUTUSAN].
- **Alasan:** Supabase mencatat migration yang sudah diterapkan di setiap database, sehingga database lokal dan remote dapat dibangun dari file yang sama.³ Database lokal memungkinkan pengujian RLS, function, dan constraint tanpa menyentuh data remote.
- **Trade-off:** Membutuhkan Docker dan Supabase CLI di mesin developer, serta sumber daya komputer untuk menjalankan stack lokal.
- **Batasan:**
  - Keputusan ini tidak berarti alat sudah tersedia. Supabase CLI belum terpasang pada mesin pengembangan saat keputusan dicatat; instalasi dilakukan pada checkpoint implementasi tersendiri.
  - Perilaku transaksi saat migration diterapkan harus diverifikasi sebelum implementasi. Tidak diasumsikan bahwa setiap file migration selalu berjalan sebagai satu transaksi.
- **Hubungan dengan ADR lain:** Menetapkan alat untuk ADR-07 tanpa mengubah keputusannya.
- **Dampak:** Langkah teknis (perintah, konfigurasi, alur dari lokal ke remote) dirinci di dokumentasi environment (Gelombang 2b).
- **Tindak lanjut:** Verifikasi atomicity migration dan prosedur penerapan ke remote sebelum migration pertama.

³ Supabase Docs, "Database Migrations", https://supabase.com/docs/guides/deployment/database-migrations (diakses 30 Oktober 2026).

### ADR-11 — Provisioning Akun dan Siklus Akses Pengguna

- **Tanggal:** 30 Oktober 2026.
- **Keputusan:** [KEPUTUSAN]
  - Akun Owner dan Staff Warehouse dibuat oleh developer melalui administrasi Supabase Auth yang terkontrol.
  - Public signup di Supabase Auth dinonaktifkan; tidak ada registrasi mandiri pada MVP.
  - Profil dan role disiapkan melalui proses admin yang terkontrol. Tidak ada trigger otomatis pada `auth.users` untuk membuat profil.
  - Pengguna tidak dapat menetapkan, mengubah, atau menaikkan role sendiri.
  - Pengguna tanpa profil valid tidak dapat mengakses fitur bisnis aplikasi, termasuk inventori dan Catatan Owner.
  - Offboarding dilakukan dengan menonaktifkan akses akun, tanpa menghapus profil maupun histori audit yang terkait.
- **Sumber:** [KEPUTUSAN].
- **Alasan:** Jumlah pengguna MVP kecil dan dikelola developer. Tanpa trigger provisioning, role tidak dapat terbentuk dari data yang dikirim pengguna saat pendaftaran. Mempertahankan profil menjaga audit trail yang dirujuk transaksi dan aktivitas lain.
- **Trade-off:** Setiap akun baru dan perubahan role membutuhkan tindakan manual developer.
- **Batas keputusan:**
  - Mekanisme teknis penonaktifan akun dan penanganan sesi aktif belum diputuskan dan dicatat sebagai OD-29 pada pembaruan PRD berikutnya. Penonaktifan akun tidak dianggap otomatis mencabut sesi atau token yang sudah terbit sebelum ada rancangan teknis dan pengujian.
  - Prosedur administrasi final (urutan langkah dan alat yang dipakai) belum ditetapkan.
  - Pengaturan Supabase Auth dan akun pengguna tidak diubah oleh pencatatan keputusan ini.
- **Hubungan dengan ADR lain:** Melengkapi ADR-04 tanpa mengubah keputusan Supabase Auth sebagai satu-satunya sistem autentikasi. Asumsi PRD FR-AUTH-02 bahwa akun dibuat developer menjadi keputusan melalui ADR ini; PRD diselaraskan pada tahap dokumentasi berikutnya.
- **Dampak:** PRD bagian autentikasi dan DATABASE-DESIGN §4.1 perlu diselaraskan.
- **Tindak lanjut:** Rancang dan uji mekanisme penonaktifan akun serta penanganan sesi aktif (OD-29).

### ADR-12 — Pilihan CSS Framework, UI Components, HTTP Client, Schema Validation, dan Deployment Platform

- **Tanggal:** 30 Oktober 2026.
- **Status keputusan:** Final, diterima (Accepted). Status implementasi dicatat terpisah di bawah dan tidak sama dengan status keputusan.
- **Konteks:** OD-15 mencatat lima pilihan teknologi yang belum diputuskan: framework CSS, komponen UI, HTTP client di antarmuka, library schema validation, dan platform deploy. Kelima topik ini berkaitan dengan Side Quest pada checklist tech stack [PDF hlm.1]. Pilihan, trade-off, dan rekomendasi awal tetap tercatat di bagian OD-15 sebagai jejak historis.
- **Alternatif utama yang dipertimbangkan:** CSS Modules bawaan Next.js atau Bootstrap (framework CSS); komponen buatan sendiri (komponen UI); `fetch` bawaan (HTTP client); Joi (schema validation); Netlify atau platform lain (deploy).
- **Keputusan:** [KEPUTUSAN]
  - Framework CSS: Tailwind CSS v4.
  - Komponen UI: shadcn/ui, berbasis Radix UI, dengan style `radix-nova`, dalam mode JavaScript (ADR-02).
  - HTTP client di antarmuka: Axios.
  - Schema validation: Zod v4.
  - Platform deploy: Vercel, khusus untuk demonstrasi capstone nonkomersial.
- **Sumber:** [KEPUTUSAN]; kelima topik berasal dari Side Quest [PDF hlm.1].
- **Alasan:**
  - Tailwind CSS v4 memenuhi Side Quest "CSS Framework", menjadi dasar shadcn/ui, dan memungkinkan token warna Forest & Linen dipetakan sebagai token tema.
  - shadcn/ui memenuhi Side Quest "Modern UI Components" dan memakai primitive Radix UI yang dirancang aksesibel. Source komponen disalin ke repository sehingga dapat disesuaikan dengan tema.
  - Axios disebut eksplisit pada Side Quest dan memudahkan penanganan error HTTP terpusat untuk pemanggilan Route Handlers.
  - Zod memungkinkan satu skema dipakai untuk validasi form di antarmuka dan validasi input di Route Handlers.
  - Vercel dikembangkan oleh pembuat Next.js sehingga konfigurasi deploy paling sedikit.
- **Trade-off:**
  - Kelas utilitas Tailwind membuat markup lebih panjang.
  - Komponen shadcn/ui menjadi source milik proyek: pembaruan dari upstream tidak otomatis dan harus ditinjau manual.
  - Axios dan Zod menambah dependency aplikasi dibanding `fetch` bawaan dan validasi manual.
  - Paket gratis Vercel memiliki batasan pemakaian. Project Supabase paket gratis dapat dijeda bila tidak aktif, sehingga perlu dicek menjelang demo.
- **Konsekuensi dependency dan maintenance:**
  - Versi dependency dikunci tepat (tanpa rentang) di `package.json` dan `package-lock.json`.
  - CLI `shadcn` dan `tw-animate-css` berada di `devDependencies`; komponen yang dihasilkan CLI disimpan di `components/ui/`.
  - Audit dependency per 30 Oktober 2026: 3 temuan berseverity low pada jalur dev/build (`shadcn` → `@shadcn/registry` → `deepmerge`); dependency produksi tanpa temuan. Risiko ini dipantau dan belum diperbaiki.
- **Batas keamanan dan arsitektur:**
  - Axios dipakai untuk komunikasi antarmuka dengan REST API `/api/v1` (ADR-05). Axios tidak menggantikan Supabase JavaScript client (`@supabase/supabase-js`) untuk akses autentikasi dan database (ADR-04, ADR-06).
  - Zod v4 dipakai untuk validasi input API dan form. Zod tidak menggantikan otorisasi, Row Level Security, constraint database, idempotency, maupun transaksi stok atomik (ADR-08, ADR-09).
  - Vercel belum dikonfigurasi dan belum dipakai untuk deployment. Jika proyek kemudian dioperasikan secara komersial oleh pihak lain, ketentuan hosting, pengelolaan secrets, dan tanggung jawab operasional harus dinilai ulang.
- **Status implementasi per 30 Oktober 2026:**

  | Pilihan | Status |
  |---|---|
  | Tailwind CSS v4 | Terpasang dan diuji dengan production build |
  | shadcn/ui (`radix-nova`) | Terkonfigurasi; komponen Button dan Card tersedia; Card dipakai di halaman awal dan diuji dengan production build |
  | Axios | Belum dipasang |
  | Zod v4 | Belum dipasang sebagai dependency langsung aplikasi |
  | Vercel | Belum dikonfigurasi maupun di-deploy |

  Konfigurasi UI saat ini hanya memuat tema terang Forest & Linen. Variant `dark:` dibatasi pada class `.dark` sehingga tidak aktif dari preferensi tema sistem operasi; dukungan dark mode belum diputuskan. Belum ada antarmuka fitur bisnis.
- **Hubungan dengan ADR lain:** Menutup OD-15. Tidak mengubah ADR-01 sampai ADR-11. Tidak ada ADR sebelumnya yang menetapkan CSS tanpa framework; CSS biasa hanya dipakai pada scaffold awal sebelum keputusan ini.
- **Dampak:** Bagian Side Quest di bawah diperbarui. PRD (Inventaris Keputusan) dan DATABASE-DESIGN (§15) menandai OD-15 sebagai diputuskan. Keputusan ini tidak berdampak pada skema database.
- **Tindak lanjut:** Pasang Axios dan Zod pada checkpoint implementasi lapisan API; konfigurasi deploy Vercel pada checkpoint tersendiri setelah fitur inti dan pengelolaan secrets siap.

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
| CSS Framework dan Modern UI Components | Tailwind CSS v4 dan shadcn/ui (ADR-12) | Pilihan disetujui; integrasi dasar sudah dilakukan (belum ada antarmuka fitur) |
| Schema Validation pada backend | Zod v4 (ADR-12) | Pilihan disetujui; implementasi belum dilakukan |
| HTTP Library (Axios) | Axios (ADR-12) | Pilihan disetujui; implementasi belum dilakukan |
| Deploy ke server atau layanan cloud | Vercel, untuk demonstrasi capstone nonkomersial (ADR-12) | Pilihan disetujui; deployment belum dilakukan |

## Keputusan OD-15 — Ditutup melalui ADR-12

**Status:** Diputuskan pada 30 Oktober 2026 melalui ADR-12. Tabel di bawah dipertahankan sebagai jejak historis pilihan dan trade-off yang dipertimbangkan sebelum keputusan; kolom Rekomendasi berisi rekomendasi saat OD-15 masih terbuka. Keputusan yang berlaku tercatat di ADR-12.

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
| `PRD-Smart-Warehouse-Firaza-Dicoding.md` | Selaras (PRD kanonik). Diperbarui 30 Oktober 2026: 83 FR termasuk Catatan Owner (FR-NOTE), FR-AUTH-04 dan FR-AUTH-05 sesuai ADR-11, serta OD-21 sampai OD-29. OD-15 ditandai diputuskan melalui ADR-12; OD-18 tercatat sebagai keputusan terbuka | Sinkronisasi dokumentasi selesai; keputusan terbuka masih menunggu persetujuan |
| `PRD-Smart-Warehouse-Firaza-Professional.md` | Historis | Ditandai Gelombang 2a |
| `FEATURE-SPECIFICATION-Smart-Warehouse-Firaza.md` | Selaras. Diperbarui 30 Oktober 2026 beserta koreksi lanjutan: autentikasi Supabase Auth dan akun sesuai ADR-04 dan ADR-11, aturan inventori sesuai PRD, dan Catatan Owner (§12a). Seluruh fitur masih berstatus rencana; belum ada implementasi | Sinkronisasi dokumentasi selesai; keputusan terbuka masih menunggu persetujuan |
| `DATABASE-DESIGN-Smart-Warehouse-Firaza.md` | Selaras. Diperbarui 30 Oktober 2026 beserta koreksi lanjutan: Supabase PostgreSQL, SQL migration dengan Supabase CLI (ADR-07, ADR-10), pola keamanan RPC (ADR-09), dan konsep Catatan Owner (§4.10). OD-15 ditandai diputuskan melalui ADR-12 di §15, tanpa dampak pada skema. Schema final, grant, SQL migration, dan sejumlah rekomendasi keamanan (§12.4) belum diputuskan; ERD belum memuat Catatan Owner | Sinkronisasi dokumentasi selesai; desain final menunggu keputusan terbuka |
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
