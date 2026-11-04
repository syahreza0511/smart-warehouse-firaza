# Stack Decision Log — Smart Warehouse Firaza

> **Status dokumen:** sumber utama keputusan teknologi Smart Warehouse Firaza.
> **Revisi:** Gelombang 2a, 29 Oktober 2026. Pembaruan 30 Oktober 2026: ADR-09 sampai ADR-11, serta ADR-12 yang menutup OD-15. Pembaruan 31 Oktober 2026: ADR-13 (baseline keamanan database dan keamanan migration), beserta amandemen OD-29. Pembaruan lanjutan 31 Oktober 2026: status implementasi lokal ADR-13 dan ADR-14 (prosedur admin siklus akun), serta koreksi kontrak idempotency ADR-14 (pembaruan J5). Pembaruan 1 November 2026: sinkronisasi bukti keamanan lokal (migration ketiga dan uji 7SUP.4B-2C sampai 7SUP.4B-3D), temuan urutan ban, dan keputusan terbuka G1–G3 di ADR-14. Pembaruan lanjutan 1 November 2026: G1–G3 disetujui pemilik proyek sebagai kebijakan MVP lokal; G1 belum diimplementasikan, dan OD-29 tetap terbuka. Pembaruan 1 November 2026 (7SUP.4B-3I): G1 diimplementasikan melalui migration keempat dan lulus uji terarah di lokal, bersama uji #21, #27, dan #31; OD-29 tetap terbuka. Pembaruan 1 November 2026 (7SUP.5A-2): ADR-15 mencatat keputusan B1–B7 dan B5.3, menutup OD-18 dengan Pilihan C, serta mencatat migration kelima (fondasi inventori dan RPC `post_stock_movement`) yang lulus uji di lokal. Frontend belum dibuat. Pembaruan 1 November 2026 (7SUP.5A-3R): status implementasi B1, B2, B4, B5.2, dan B6 di ADR-15 disinkronkan dengan hasil 7SUP.5A-3 dan perbaikan 7SUP.5A-3R; verifikasi browser belum dilakukan. Pembaruan 1 November 2026 (7SUP.5A-3B): hasil uji penerimaan browser manual oleh pemilik proyek di lokal dicatat di ADR-15 (B1, B2, B5.2, B6), beserta keterbatasan uji dan satu sesi Auth tertinggal sebagai temuan terbuka. Pembaruan 2 November 2026 (7SUP.5B-2B dan 7SUP.5B-3A): bukti uji HTTP Stock Out, insiden 7SUP.5B-3A beserta keputusan K3, baseline lokal yang disahkan (K4), dan penundaan uji mutasi (K5) dicatat di DATABASE-DESIGN §15 dan ADR-15; skema tidak berubah. Pembaruan 2 November 2026 (7SUP.5B-3C): status Stock Out di ADR-15 disinkronkan (baris B5.2 dan butir "Implementasi aplikasi"), dan keputusan historis 7SUP.5B-1A didokumentasikan sebagai ADR-16 (SO-1 sampai SO-5). API dan antarmuka Stock Out berada di working tree lokal dan belum di-commit ke Git; uji HTTP lulus, sedangkan uji browser belum diverifikasi. Tidak ada keputusan baru, dan keputusan AUTH-01 tidak dicatat. Pembaruan 4 November 2026 (DOC-SYNC-01): status Git disinkronkan setelah commit lokal C-1 (`f132ad7`) sampai C-7 (`bb6865b`) di branch `feat/supabase-foundation`, yang belum di-push ke GitHub. Keputusan pemilik proyek mempertahankan devDependency Supabase CLI dicatat, dan temuan review keamanan F-01 sampai F-08 dicatat sebagai backlog di ADR-15 "Batas". Tidak ada keputusan arsitektur baru.
>
> - Jika dokumen lain bertentangan dengan log ini dalam hal teknologi, log ini yang berlaku sampai dokumen tersebut direvisi.
> - Kebutuhan produk dan aturan bisnis diatur di [PRD-Smart-Warehouse-Firaza-Dicoding.md](PRD-Smart-Warehouse-Firaza-Dicoding.md).
> - Kecuali status implementasinya dicatat lain di ADR terkait, keputusan di bawah berstatus **[RENCANA — belum diimplementasikan]**.
> - Fondasi aplikasi Next.js beserta integrasi dasar UI (ADR-12) telah dibuat dan lulus production build.
> - Fondasi keamanan database (default-deny, schema `app_private`, tabel `profiles`, dan helper role dengan validasi sesi) serta prosedur admin siklus akun (ADR-14: tabel audit `app_private.account_lifecycle_events` dan enam function admin) sudah diterapkan melalui empat SQL migration di Supabase **lokal** dan lulus uji integrasi lokal dengan Supabase Auth (ADR-13 dan ADR-14, "Status implementasi lokal"). Migration keempat menerapkan G1 (ADR-14). Migration kelima menambahkan tabel inventori dan RPC `post_stock_movement` di lokal (ADR-15). Irisan Stock In (login dan logout, daftar dan detail material, dan Stock In) dibangun dan lulus uji HTTP lokal; uji penerimaan browser manual di lokal memverifikasi alur inti dengan beberapa keterbatasan pengujian dan tanpa pengiriman Stock In yang valid (ADR-15, 7SUP.5A-3B). Stock Out (API dan antarmuka) diimplementasikan dan di-commit secara lokal (C-6 `b781551`; belum di-push ke GitHub); lulus uji HTTP lokal, tetapi belum diverifikasi di browser (ADR-15 B5.2, ADR-16). Selain Stock In dan Stock Out yang disebutkan di atas, belum ada fitur bisnis lain yang diimplementasikan; layanan orkestrasi admin permanen juga belum tersedia, dan belum ada perubahan di project Supabase cloud.
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
- **Dampak:** DATABASE-DESIGN §7.1 dan §12.3 sudah diselaraskan dengan ADR ini: implementasi `SECURITY DEFINER` ditempatkan di schema privat yang tidak diekspos. Nama schema privat, schema yang diekspos, dan rincian grant ditetapkan di ADR-13.
- **Tindak lanjut:** Rincian grant, schema yang diekspos, dan rekomendasi hardening lain dari audit keamanan diputuskan terpisah sebelum migration pertama.
- **Status implementasi lokal** (1 November 2026):
  - Implementasi privat `SECURITY DEFINER` diterapkan untuk helper role `app_private.current_app_role()` (ADR-13 D8). Wrapper RPC bisnis dan implementasi bisnisnya belum ada, karena tabel bisnis belum ada.
  - Function admin ADR-14 sengaja `SECURITY INVOKER`. Function ini bukan RPC aplikasi dan tidak dipanggil melalui Data API.
  - Schema privat tidak terjangkau melalui Data API lokal: `Accept-Profile: app_private` ditolak HTTP 406 `PGRST106` (uji DATABASE-DESIGN §14.5 #19).

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
- **Status lanjutan** (1 November 2026): mekanisme penonaktifan dan penanganan sesi ditetapkan di ADR-13 (amandemen OD-29), dan prosedur administrasinya di ADR-14. Keduanya diimplementasikan dan lulus uji integrasi di Supabase **lokal**. Provisioning profil dilakukan melalui `admin_provision_profile`, tanpa trigger pada `auth.users`. OD-29 tetap terbuka.
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

### ADR-13 — Baseline Keamanan Database, Eksposur Schema, dan Keamanan Migration

- **Tanggal:** 31 Oktober 2026.
- **Status keputusan:** Final, diterima (Accepted).
- **Status implementasi lokal** (diperbarui 31 Oktober 2026; Supabase **lokal** saja, belum ada perubahan di project cloud):
  - Diterapkan melalui dua SQL migration, masing-masing tercatat satu kali di riwayat migration lokal:
    - `20261031084000_security_baseline.sql`: default-deny (D3) untuk tabel, sequence, dan function di `public`, serta pencabutan `EXECUTE` global dari `PUBLIC`.
    - `20261031084100_profiles_authz_foundation.sql`: schema `app_private` (D2, D8), enum `user_role`, tabel `profiles` beserta RLS, policy baca profil sendiri, dan grant (D4, D7), serta helper `app_private.current_app_role()` dengan pemeriksaan `deactivated_at` dan validasi sesi (D9 dan amandemen OD-29).
  - Uji integrasi lokal dengan Supabase Auth asli, memakai akun uji sekali pakai yang dihapus setelah uji:
    - Akses `profiles` per role, akun tanpa profil, `anon`, penolakan tulis langsung, dan tidak terjangkaunya helper melalui Data API: 27 dari 27 assertion lulus.
    - Penonaktifan, ban dan pencabutan ban, cutoff sesi setelah reaktivasi, refresh token sesi lama, dan logout: 34 dari 34 assertion lulus. Perubahan status pada uji ini dilakukan dengan SQL langsung sebagai `postgres`, karena prosedur admin (ADR-14) saat itu belum diimplementasikan.
  - Migration ketiga, `20261031163955_account_lifecycle_admin.sql` (prosedur admin ADR-14), diterapkan di lokal pada 31 Oktober 2026 dan diuji. Rinciannya di ADR-14, "Status implementasi lokal".
  - Migration keempat, `20261101044858_admin_role_change_session_cutoff.sql` (G1 ADR-14), diterapkan di lokal pada 1 November 2026 dan diuji (7SUP.4B-3I). Rinciannya di ADR-14, "Keputusan G1–G3".
  - Belum diimplementasikan: tabel bisnis, view `security_invoker` (D5), `idempotency_requests` (D6), serta wrapper dan implementasi RPC bisnis.
  - Bukti uji hanya berlaku untuk versi lokal yang diuji (Supabase CLI 2.122.0, PostgreSQL 17.11, Supabase Auth v2.197.0).
- **Konteks:**
  - ADR-09 menetapkan pola wrapper `SECURITY INVOKER` dan implementasi `SECURITY DEFINER` privat, tetapi menunda schema yang diekspos, nama schema privat, dan rincian grant.
  - DATABASE-DESIGN §12.4 mencatat delapan rekomendasi keamanan yang harus diputuskan sebelum migration pertama.
  - ADR-10 mensyaratkan perilaku transaksi migration diverifikasi sebelum migration pertama.
  - ADR-11 menunda mekanisme penonaktifan akun (OD-29).
  - Audit katalog Supabase lokal pada 31 Oktober 2026 menunjukkan bahwa tanpa tindakan eksplisit, tabel, sequence, dan function baru di `public` otomatis dapat diakses `anon`, `authenticated`, dan `service_role` (rincian di bawah).
- **Alternatif utama yang dipertimbangkan:**
  - Schema `api` khusus yang diekspos, dengan tabel di schema tidak diekspos dan view `security_invoker` di `api`.
  - Mempertahankan default privileges Supabase dan hanya mengandalkan RLS.
  - Policy yang membaca `profiles` langsung lewat subquery, tanpa helper role `SECURITY DEFINER`.
  - Penonaktifan akun hanya melalui ban di Supabase Auth.
- **Keputusan:** [KEPUTUSAN]
  - **D1.** Schema yang diekspos Data API adalah `public`. Tabel bisnis, view baca, dan wrapper RPC berada di `public`. Aksesnya diatur dengan `GRANT` eksplisit dan RLS.
  - **D2.** Schema internal bernama `app_private` dan tidak dicantumkan dalam daftar schema Data API. Schema ini menampung implementasi `SECURITY DEFINER`, helper role, dan tabel internal.
  - **D3.** Default-deny untuk objek aplikasi yang dibuat role migration. Hak otomatis bagi `anon`, `authenticated`, dan `service_role` dicabut, dan hak `EXECUTE` default untuk `PUBLIC` pada function baru ditangani. Setiap hak diberikan secara eksplisit. SQL final disusun berdasarkan audit pemilik objek dan default ACL, lalu diverifikasi setelah migration diterapkan.
  - **D4.** Pembuatan tabel, pengaktifan RLS, policy, dan `GRANT` ditulis sebagai satu unit migration, yaitu dalam satu file.
  - **D5.** View status stok memakai `security_invoker = true`.
  - **D6.** `idempotency_requests` berada di `app_private`.
  - **D7.** `anon` tidak mendapat hak pada tabel, view, sequence, maupun function bisnis aplikasi.
  - **D8.** Helper role berada di `app_private` sebagai function `SECURITY DEFINER`, dengan `search_path` aman (kosong) dan nama objek ditulis lengkap dengan schema. Hak `EXECUTE` diberikan per function kepada role yang membutuhkannya, tanpa grant menyeluruh untuk seluruh function dalam schema. Pola wrapper `SECURITY INVOKER` dari ADR-09 tetap berlaku.
  - **D9.** Penonaktifan akun memakai kolom `profiles.deactivated_at` ditambah ban di Supabase Auth melalui prosedur admin terkontrol. Helper role tidak mengembalikan role untuk profil yang dinonaktifkan. Akibatnya, RLS dan function privat menolak akses bisnis berdasarkan status di database pada request berikutnya, tanpa menunggu JWT kedaluwarsa.
- **Sumber:** [KEPUTUSAN], berdasarkan tinjauan keamanan database 31 Oktober 2026, audit katalog PostgreSQL lokal, dan uji atomicity migration lokal.
- **Alasan:**
  - **`public` dan `app_private`:**
    - ADR-09 sudah memisahkan bagian yang paling berisiko, yaitu function berhak tinggi.
    - DATABASE-DESIGN §12.2 sudah merencanakan `SELECT` langsung untuk pengguna ber-profil, sehingga lapisan view di schema `api` tidak menambah perlindungan yang berarti.
    - Pilihan ini tidak memerlukan perubahan daftar schema yang diekspos di project cloud.
    - Supabase JavaScript client memakai `public` secara default.
  - **Default-deny:** grant yang terlupa menghasilkan penolakan, bukan kebocoran data.
  - **Helper `SECURITY DEFINER`:** satu titik pemeriksaan role dan status nonaktif, yang tidak bergantung pada policy `profiles` (OD-28).
  - **D9:** ban di Supabase Auth saja tidak mencabut access token yang sudah terbit; token tersebut tetap berlaku sampai kedaluwarsa (`jwt_expiry` lokal 3600 detik). Pemeriksaan `deactivated_at` di database berlaku pada request berikutnya.
- **Trade-off:**
  - Setiap tabel, view, dan function membutuhkan `GRANT` eksplisit. Grant yang terlupa menghasilkan error izin yang harus dilacak.
  - `authenticated` membutuhkan `USAGE` pada `app_private` dan `EXECUTE` pada function tertentu di dalamnya, karena wrapper dan policy RLS berjalan dengan hak pemanggil.
  - Penonaktifan akun terdiri dari dua langkah, di database dan di Supabase Auth, yang harus dijalankan developer secara konsisten.
- **Hasil audit privilege lokal** (31 Oktober 2026; read-only; Supabase CLI 2.122.0, PostgreSQL 17.11). Hasil ini tidak dianggap sama dengan project cloud:
  - Supabase CLI menjalankan migration sebagai role `postgres`. Di lokal, `postgres` bukan superuser, tetapi memiliki atribut `BYPASSRLS`. Akibatnya, function `SECURITY DEFINER` milik `postgres` melewati RLS, sehingga pemeriksaan di dalam function wajib (ADR-09).
  - **Default ACL milik `postgres` di schema `public`:**
    - Tabel baru: `anon`, `authenticated`, dan `service_role` mendapat seluruh hak (`arwdDxtm`).
    - Sequence baru: ketiga role mendapat `rwU`.
    - Function baru: ketiga role mendapat `EXECUTE`.
    - Entri serupa milik `supabase_admin` juga ada di `public`, tetapi hanya berlaku untuk objek yang dibuat `supabase_admin`, bukan objek yang dibuat migration aplikasi.
  - **`EXECUTE` untuk `PUBLIC`:** tidak ada entri default ACL global untuk function, sehingga berlaku default bawaan PostgreSQL. Default ini memberi `EXECUTE` kepada `PUBLIC` pada function baru. Default privileges per schema tidak dapat menghapus hak global ini, jadi pencabutannya memerlukan default privileges tanpa klausa `IN SCHEMA`.
  - **Schema `public`:** memberi `USAGE` kepada `PUBLIC`, `anon`, `authenticated`, dan `service_role`. ADR ini tidak mengubah `USAGE` pada schema `public`; D7 berlaku pada objek di dalamnya.
  - **Objek yang sudah ada:** schema `public` belum berisi objek dan `app_private` belum ada, sehingga di lokal tidak ada grant lama yang perlu dicabut. Grant pada objek yang sudah ada tidak terpengaruh oleh perubahan default privileges.
  - **Supabase Auth:** berjalan di schema `auth` dengan default ACL milik `supabase_auth_admin`. `auth.uid()` dimiliki `supabase_auth_admin` dan dapat dieksekusi `PUBLIC`. Tidak ditemukan ketergantungan Supabase Auth pada default ACL `postgres` di `public`, sehingga D3 dan D8 tidak bertentangan dengan fungsi Supabase yang wajib.
  - **Perbedaan dengan cloud:** di lokal tidak ada event trigger yang mengaktifkan RLS secara otomatis, sehingga pengaturan "automatic RLS" di project cloud tidak tereproduksi. Ekstensi `pg_graphql` juga tidak terpasang di lokal.
- **Persyaratan privilege dan RLS:**
  - Setiap tabel aplikasi: RLS diaktifkan di file pembuatannya, dan `GRANT` diberikan per role per operasi sesuai DATABASE-DESIGN §12.2. Pengaktifan RLS ditulis eksplisit di migration, tidak bergantung pada pengaturan dashboard.
  - Wrapper `SECURITY INVOKER` di `public`: `EXECUTE` hanya untuk `authenticated`, dan dicabut dari `PUBLIC` serta `anon`.
  - Karena wrapper berjalan dengan hak pemanggil, `authenticated` mendapat `USAGE` pada `app_private` dan `EXECUTE` hanya pada implementasi yang dipanggil wrapper.
  - Helper role: `EXECUTE` untuk `authenticated`, karena dipanggil dari policy RLS.
  - Tabel di `app_private`, termasuk `idempotency_requests`: tanpa grant kepada `anon` maupun `authenticated`, dan RLS tetap aktif.
  - `service_role`: tanpa hak otomatis. Grant eksplisit hanya untuk kebutuhan administrasi yang terdokumentasi.
  - Pemilik setiap function dicatat. Function `SECURITY DEFINER` memakai `search_path` kosong.
  - Peran aplikasi tetap `OWNER` dan `STAFF_WAREHOUSE`. Tidak ada penulisan saldo stok langsung; perubahan `current_stock` tetap hanya melalui function atomik (ADR-08).
- **Bukti atomicity migration** (uji lokal 31 Oktober 2026):
  - **Metode:** Supabase CLI 2.122.0, `supabase migration up --db-url`, diterapkan ke dua database PostgreSQL lokal sekali pakai pada instance Supabase lokal. Database `postgres` utama tidak dipakai sebagai target.
  - **Uji kegagalan:** satu file berisi tiga statement (membuat tabel uji, `INSERT` dengan input integer tidak valid, membuat tabel uji kedua).
    - Perintah gagal dengan SQLSTATE `22P02`.
    - Kedua tabel uji tidak ada setelah kegagalan.
    - Versi migration tidak tercatat di riwayat migration.
  - **Kontrol positif:** file setara tanpa statement yang gagal. Perintah berhasil, kedua tabel ada, dan versinya tercatat di riwayat.
  - **Pembersihan dan dampak:** kedua database uji dihapus setelah pengujian. Snapshot katalog database `postgres` utama sama sebelum dan sesudah pengujian.
  - **Kesimpulan:** satu file migration berisi DDL dan DML biasa yang diuji berjalan atomik bersama pencatatan versinya. Hasil ini sejalan dengan source Supabase CLI 2.122.0, yang mengirim seluruh statement satu file dalam satu pipeline batch.
  - **Batas bukti:**
    - Atomicity antar-file tidak berlaku. Bila sebuah file gagal, file sebelumnya tetap diterapkan.
    - Statement yang memecah batch tidak diuji. Menurut source CLI, statement ini adalah `CREATE INDEX CONCURRENTLY`, `DROP INDEX CONCURRENTLY`, `REINDEX … CONCURRENTLY`, `VACUUM`, `ALTER SYSTEM`, dan `CLUSTER`; bagian file sebelum statement tersebut ter-commit lebih dulu.
    - Perilaku `supabase db push` ke project cloud belum diuji.
    - Statement kontrol transaksi eksplisit di dalam file berada di luar pola yang diverifikasi.
    - Tidak setiap file migration dapat dianggap atomik.
- **Aturan migration biasa:**
  - DDL, RLS, policy, dan grant yang saling terkait ditulis bersama dalam satu file.
  - `BEGIN`, `COMMIT`, atau `ROLLBACK` eksplisit tidak dipakai tanpa tinjauan desain tersendiri.
  - `CREATE/DROP INDEX CONCURRENTLY`, `REINDEX … CONCURRENTLY`, `VACUUM`, `ALTER SYSTEM`, `CLUSTER`, dan operasi lain yang memecah batch tidak dicampur dengan migration bisnis biasa. Migration pengecualian seperti itu ditangani di file terpisah dan ditinjau tersendiri.
  - Setiap migration diuji di lokal sebelum diterapkan ke project remote (ADR-10).
- **Batas keputusan:**
  - Keamanan database produksi belum diimplementasikan maupun diverifikasi.
  - Default ACL, ekstensi, dan pengaturan RLS otomatis di project cloud belum diaudit dan harus diperiksa sebelum migration pertama diterapkan ke remote.
  - Prosedur admin penonaktifan dan reaktivasi akun belum ditetapkan, sehingga rincian OD-29 tetap terbuka. Prosedur ini mencakup urutan langkah, alat yang dipakai, durasi ban, dan penanganan sesi di Supabase Auth. Desain prosedur ini kemudian ditetapkan di ADR-14, lalu diimplementasikan dan diuji di Supabase lokal (status 1 November 2026); OD-29 tetap terbuka.
  - Pembatasan kolom tulis langsung pada `categories` (DATABASE-DESIGN §12.4) tidak termasuk ADR ini dan mengikuti OD-19.
- **Hubungan dengan ADR lain:**
  - Menetapkan rincian yang ditunda ADR-09 (schema dan grant), tanpa mengubah pola wrapper dan implementasi privat.
  - Memenuhi verifikasi atomicity yang disyaratkan ADR-10 untuk pola migration yang diuji.
  - Menetapkan arah teknis OD-29 dari ADR-11.
  - Tidak mengubah ADR-01 sampai ADR-12.
- **Dampak:**
  - DATABASE-DESIGN: §1.1, §4.1, §4.8, §6.1, §7.1, §12, §14, dan §15 diselaraskan.
  - PRD: OD-29 diperbarui dengan arah keputusan ini.
  - FEATURE-SPECIFICATION: kalimat tentang OD-29 belum diselaraskan.
- **Tindak lanjut:**
  - Susun migration baseline: default privileges, schema `app_private`, dan haknya. **Selesai di lokal** (lihat "Status implementasi lokal").
  - Verifikasi `pg_default_acl`, RLS, dan grant setelah setiap migration. Dilakukan untuk tiga migration lokal pertama. Untuk migration keempat, yang hanya mengganti satu function tanpa `ALTER DEFAULT PRIVILEGES`, ACL function, ACL objek, RLS, policy, dan trigger diverifikasi melalui diff katalog (7SUP.4B-3I). Tetap wajib untuk setiap migration berikutnya.
  - Audit default ACL project cloud sebelum `db push` pertama. Belum dilakukan.
  - Tetapkan prosedur admin penonaktifan akun. **Desain ditetapkan** di ADR-14, lalu **diimplementasikan dan diuji di lokal** (status 1 November 2026).
  - Jalankan pengujian otorisasi DATABASE-DESIGN §14.4. Sebagian, terbatas pada `profiles`; tabel bisnis belum ada.
- **Amandemen 31 Oktober 2026 — OD-29 (penonaktifan, reaktivasi, dan keamanan sesi):**
  - **Status:**
    - Desain ditetapkan untuk model otorisasi fail-closed, runbook, dan perlindungan OWNER aktif terakhir. Prosedur admin dirinci di ADR-14, lalu diimplementasikan dan diuji di Supabase lokal (status 1 November 2026).
    - Model otorisasi fail-closed dan validasi sesi untuk tabel `profiles` **diimplementasikan di Supabase lokal dan lulus uji integrasi lokal** (lihat "Status implementasi lokal" di atas). Status sebelumnya, "usulan yang wajib diuji integrasi", tidak berlaku lagi untuk lingkungan lokal yang diuji.
    - Diverifikasi di lokal (1 November 2026): function admin, perlindungan OWNER aktif terakhir termasuk dua transaksi bersamaan, urutan Auth/database dengan ban dan pencabutan ban nyata, serta state perantara yang terkendali. Rincian di ADR-14.
    - Belum terverifikasi: pemulihan dari gangguan jaringan atau proses yang nyata, otorisasi tabel bisnis dan RPC, serta perilaku di project cloud.
    - OD-29 tetap terbuka sampai seluruh uji penerimaan DATABASE-DESIGN §14.5 lulus.
    - Amandemen ini merinci D9 tanpa mengubah keputusan D1–D9. Butir "Batas keputusan" tentang OD-29 di atas dirinci oleh amandemen ini.
  - **Fakta Supabase Auth v2.197.0** (versi Auth lokal), awalnya diverifikasi dari source dan katalog lokal:
    - Ban admin hanya mengisi `banned_until` tanpa menghapus sesi. **Dikonfirmasi dengan request nyata di lokal.**
    - Login dan refresh ditolak selama ban aktif (HTTP 400 `user_banned`). **Dikonfirmasi dengan request nyata di lokal.**
    - Refresh memakai ulang `session_id` dengan `iat` baru, termasuk untuk sesi lama setelah ban dicabut. **Dikonfirmasi dengan request nyata di lokal.**
    - Logout dengan `scope=local` menghapus baris sesi yang bersangkutan dari `auth.sessions`. **Dikonfirmasi dengan request nyata di lokal.**
    - Tidak ada endpoint admin untuk mengakhiri sesi berdasarkan `user_id`. Hanya dari source; tidak diuji.
    - `auth.sessions` dapat dibaca `postgres`, tetapi tidak oleh `authenticated`. Dari katalog lokal.
    - Ban dan pencabutan ban sama-sama tercatat di `auth.audit_log_entries` sebagai `user_modified`, tanpa durasi ban, alasan, maupun identitas operator manusia. Dari katalog lokal.
    - Ban tidak mencabut access token yang sudah terbit. Akun yang di-ban dengan profil database masih aktif tetap dapat membaca profilnya memakai JWT lama; penonaktifan database kemudian menolak JWT yang sama. **Dikonfirmasi dengan request nyata di lokal** (1 November 2026; ADR-14, temuan urutan ban).
    - Request ban dengan `ban_duration` yang tidak valid ditolak HTTP 400 `validation_failed` tanpa mengubah `banned_until` maupun `updated_at`, dan tanpa entri audit Auth. **Dikonfirmasi dengan request nyata di lokal.**
    - Akun yang dibuat melalui Admin API tanpa `email_confirm` tetap belum terkonfirmasi, walaupun `GOTRUE_MAILER_AUTOCONFIRM=true` di lokal. **Dikonfirmasi dengan request nyata di lokal.**
  - **Model otorisasi** [KEPUTUSAN]:
    - Helper role menolak (fail-closed) bila `auth.uid()` kosong, profil tidak ada, atau `deactivated_at` terisi.
    - Role hanya dibaca dari `profiles.role`, tidak dari metadata JWT.
    - Setiap policy RLS bisnis dan setiap implementasi `SECURITY DEFINER` memakai helper ini.
    - Request pengguna biasa tidak pernah memakai secret key atau `service_role`.
    - Penolakan berlaku untuk statement yang dimulai setelah transaksi penonaktifan commit. Transaksi yang sudah berjalan tidak dibatalkan surut.
  - **Validasi sesi** (semula usulan; diimplementasikan dan lulus uji integrasi lokal, wajib diuji ulang setiap peningkatan versi Supabase):
    - Mekanisme: kolom `profiles.session_valid_after` diisi saat reaktivasi. Helper menerima akses hanya bila klaim `session_id` valid, sesi tersebut ada di `auth.sessions` dan milik pemanggil, `created_at` sesi tidak NULL dan lebih besar dari `session_valid_after`, serta `not_after` belum lewat.
    - Batas waktu berbasis `iat` ditolak, karena refresh sesi lama setelah ban dicabut menerbitkan `iat` baru.
    - Ketergantungan pada struktur internal schema `auth` diterima dengan syarat uji diulang setiap peningkatan versi Supabase, dan helper menolak bila data yang dibutuhkan tidak tersedia.
  - **Runbook** [KEPUTUSAN]:
    - Penonaktifan dimulai dari database, lalu ban Auth. Bila ban gagal, `deactivated_at` dipertahankan dan hanya langkah Auth yang diulang.
    - Reaktivasi dimulai dari pencabutan ban, lalu satu transaksi database yang mengisi `session_valid_after` dan mengosongkan `deactivated_at`. Bila langkah database gagal, akun tetap ditolak di database.
    - Status runbook (`ACTIVE`, `DEACTIVATION_PENDING_AUTH`, `DEACTIVATED`, `REACTIVATION_PENDING_DB`, `REACTIVATED`) bersifat operasional, bukan enum database.
  - **Kebijakan administratif** [KEPUTUSAN]:
    - Hanya developer tepercaya yang mengelola akun, tanpa antarmuka manajemen akun pada MVP.
    - Function admin tidak dapat dieksekusi `anon`, `authenticated`, maupun `service_role`.
    - Penonaktifan atau perubahan role yang menyisakan nol OWNER aktif ditolak, dengan penguncian baris OWNER aktif. Mekanisme penguncian dirinci di ADR-14 (J4).
    - Pemulihan darurat hanya melalui sesi SQL developer dan dicatat.
    - Penghapusan akun di luar scope.
    - Semula: "Tidak ada kolom audit tambahan. Pelaku dan alasan dicatat di catatan operasional dan di `auth.audit_log_entries`." **Diubah oleh ADR-14 (J1):** tetap tidak ada kolom audit tambahan di `profiles`, tetapi perubahan status dan role oleh function admin dicatat di tabel append-only `app_private.account_lifecycle_events`, ditambah catatan runbook dan `auth.audit_log_entries`.
  - **Rincian:** DATABASE-DESIGN §12.5 (desain dan runbook) dan §14.5 (uji penerimaan). Prosedur admin permanen: ADR-14.

### ADR-14 — Prosedur Admin Siklus Akun (OD-29)

- **Tanggal:** 31 Oktober 2026.
- **Status keputusan:** Diterima (Accepted) sebagai desain implementasi.
- **Status implementasi:** diimplementasikan dan diuji di Supabase **lokal** (status 1 November 2026; rincian di "Status implementasi lokal" di bawah). Semula, saat keputusan dicatat: belum diimplementasikan. Belum ada di project cloud. OD-29 tetap terbuka.
- **Konteks:**
  - ADR-13 dan amandemennya menetapkan model fail-closed, runbook, dan perlindungan OWNER aktif terakhir, tetapi belum menetapkan prosedur admin final.
  - Uji integrasi lokal (ADR-13, "Status implementasi lokal") membuktikan penolakan akses berbasis database dan cutoff sesi. Perubahan status pada uji tersebut dilakukan dengan SQL langsung, bukan dengan prosedur permanen.
  - Tinjauan arsitektur read-only pada 31 Oktober 2026 menemukan tiga celah:
    - Penghitungan OWNER aktif tanpa penguncian rentan *write skew*. Dua penonaktifan bersamaan dapat menyisakan nol OWNER aktif.
    - Lock transaksi database berakhir saat commit, sehingga tidak melindungi langkah Auth Admin API (HTTP) sesudahnya.
    - `auth.audit_log_entries` tidak mencatat perubahan PostgreSQL. Ban dan pencabutan ban sama-sama tercatat sebagai `user_modified`, tanpa alasan maupun identitas operator manusia.
- **Keputusan:** [KEPUTUSAN]

  | Ref | Keputusan | Status |
  |---|---|---|
  | J1 | Audit hibrida: tabel append-only `app_private.account_lifecycle_events` yang ditulis dalam transaksi yang sama dengan perubahan status atau role, ditambah catatan runbook dan `auth.audit_log_entries`. Ketiganya dihubungkan oleh `operation_id`. Tabel ini tidak menggantikan runbook maupun log audit Auth | Disetujui |
  | J2 | Trigger yang menolak `UPDATE` langsung yang menyisakan nol OWNER aktif | **Ditunda.** Tidak termasuk migration admin pertama. Dipertimbangkan ulang hanya setelah desain dan uji konkurensi tersendiri |
  | J3 | Function admin memakai `SECURITY INVOKER`, dimiliki `postgres`, `search_path` kosong, nama objek lengkap dengan schema, tanpa `EXECUTE` untuk `PUBLIC`, `anon`, `authenticated`, maupun `service_role`. Pemeriksaan konteks positif: `current_user = 'postgres'` pada implementasi lokal. Pemeriksaan lain hanya pertahanan tambahan; `request.jwt.claims` tidak diperlakukan sebagai kredensial identitas | Disetujui dengan hardening |
  | J4 | Satu advisory lock tingkat transaksi yang terdokumentasi untuk semua mutasi status dan role, diambil sebelum row lock. Profil target dikunci. Baris OWNER aktif dikunci berurutan `id`. Invariant OWNER aktif terakhir diperiksa ulang di dalam transaksi. `lock_timeout` 5 detik | Disetujui |
  | J5 | Pemeriksaan expected state (`p_expected_deactivated_at`, `p_expected_role`, `p_expected_session_valid_after`) dan semantik `operation_id`: satu operasi menghasilkan tepat satu event. Pengulangan dengan `operation_id` yang sama mengembalikan hasil tercatat tanpa menerapkan ulang. Rincian koreksi kontrak: lihat "Pembaruan J5" di bawah | Disetujui dengan persyaratan tambahan; dikoreksi 31 Oktober 2026 |
  | J6 | Reaktivasi membaca `auth.users.banned_until` target dan menolak dengan `AUTH_STILL_BANNED` bila ban aktif terlihat. Pemeriksaan ini hanya berlaku pada saat itu (point-in-time) | Disetujui |
  | J7 | Runbook MVP dengan satu operator: hanya satu operasi siklus akun yang berjalan pada satu waktu, untuk seluruh akun | **Disetujui bersyarat.** Ini asumsi organisasi, bukan penguncian terdistribusi |
  | J8 | Function provisioning profil terkontrol | Disetujui |
  | J9 | Kontrak error: SQLSTATE `P0001` dengan kode stabil di `MESSAGE` untuk error bisnis yang diharapkan, terpisah dari error infrastruktur | Disetujui |
  | J10 | Sinkronisasi empat dokumen kanonik | Disetujui; dilaksanakan pada pembaruan ini |
  | J11 | Event audit dari uji integrasi lokal dipertahankan. Cleanup uji hanya menghapus akun Auth dan profil uji yang diotorisasi | Disetujui |

- **Antarmuka admin** (schema `app_private`; rincian argumen dan perilaku di DATABASE-DESIGN §12.5.8):
  - `admin_assert_trusted_context()`: pemeriksaan konteks internal.
  - `admin_get_account_state(p_user_id, p_operation_id)`: baca status saja.
  - `admin_provision_profile(...)`, `admin_deactivate_account(...)`, `admin_reactivate_account(...)`, `admin_set_role(...)`: mutasi.
  - `app_private.current_app_role()` tidak diubah. Migration admin bersifat aditif dan tidak mengubah dua migration yang sudah diterapkan.
- **Klarifikasi implementasi yang disetujui** (31 Oktober 2026):
  - Provisioning profil mengisi `session_valid_after = clock_timestamp()` dalam transaksi yang sama, sehingga sesi Auth yang dibuat sebelum profil ada tidak memperoleh otorisasi aplikasi. Sesi baru sesudahnya dapat diterima helper role.
  - Kode error `OPERATION_ID_CONFLICT` ditambahkan ke kontrak J9.
- **Pembaruan J5 — koreksi kontrak idempotency** (31 Oktober 2026) [KEPUTUSAN]:
  - **Masalah:** kolom tabel event yang semula disetujui tidak menyimpan cukup informasi untuk membedakan pengulangan identik dari input yang berbeda. Nilai yang diharapkan pada `NOOP` reaktivasi dan perubahan role, serta email dan nama pada provisioning, tidak tersimpan. Selain itu, aturan `admin_set_role` bertentangan tentang urutan pemeriksaan expected role dan `ROLE_UNCHANGED`. Karena itu migration admin belum ditulis.
  - **Kolom baru:** `account_lifecycle_events.request_fingerprint text NOT NULL`, dengan constraint tepat 64 karakter heksadesimal huruf kecil. Isinya SHA-256 (`pg_catalog.sha256(bytea)`, bawaan PostgreSQL, tanpa extension) dari objek JSON kanonik berversi (`firaza.admin_lifecycle.v1`) berisi input material yang sudah divalidasi dan dinormalisasi:
    - Timestamp dalam UTC dengan presisi mikrodetik, tanpa cast yang bergantung pada zona waktu.
    - NULL ditulis eksplisit.
    - Email di-lowercase dan di-trim.
    - Nama, `actor`, dan `reason` di-trim.
    - Waktu dan sesi saat ini tidak disertakan.
    - Field per aksi: DATABASE-DESIGN §12.5.9.
  - **Urutan wajib:** validasi konteks, validasi dan normalisasi argumen, hitung fingerprint, advisory lock, lalu periksa `operation_id`.
    - Bila `operation_id` sudah ada dengan fingerprint berbeda: `OPERATION_ID_CONFLICT`.
    - Bila fingerprint sama: hasil historis dikembalikan dengan `replayed = true`, tanpa mengubah profil, tanpa event baru, dan tanpa memberi otorisasi untuk panggilan Auth API baru.
    - Bila `operation_id` belum ada: kunci target, periksa expected state, terapkan mutasi atau `NOOP` yang sah, lalu catat tepat satu event secara atomik.
  - **Expected state selalu diperiksa sebelum `NOOP`, dengan perbandingan NULL-safe:**
    - Penonaktifan memeriksa `p_expected_session_valid_after` sebelum `ALREADY_DEACTIVATED`.
    - Perubahan role memeriksa `p_expected_role` sebelum `ROLE_UNCHANGED`.
    - Reaktivasi memakai `p_expected_deactivated_at` yang boleh NULL; NULL berarti akun diharapkan sudah aktif. `ALREADY_ACTIVE` hanya dikembalikan untuk ekspektasi eksplisit tersebut, dan `session_valid_after` tidak dimajukan. Ekspektasi lain yang tidak cocok menghasilkan `STATE_CONFLICT`.
  - **Batas:** fingerprint tidak melindungi kerahasiaan, karena email dan input berentropi rendah dapat ditebak dengan mencoba kandidat. Atomicity antara PostgreSQL dan Supabase Auth tetap tidak ada.
- **Status implementasi lokal** (1 November 2026; Supabase CLI 2.122.0, PostgreSQL 17.11, Supabase Auth v2.197.0; hanya lingkungan **lokal**):
  - **Diterapkan:** `20261031163955_account_lifecycle_admin.sql`, migration ketiga, tercatat satu kali. Isinya tabel append-only `app_private.account_lifecycle_events`, enam function admin, dan function trigger append-only. Katalog dan privilege diverifikasi setelah penerapan.
  - **Diterapkan (G1):** `20261101044858_admin_role_change_session_cutoff.sql`, migration keempat, tercatat satu kali (7SUP.4B-3I). Isinya hanya `create or replace` untuk `admin_set_role()` ditambah blok pemeriksaan akhir yang hanya membaca katalog. Tiga migration sebelumnya tidak diubah.
  - **Bukti uji per checkpoint** (setiap run dilaporkan terpisah dan tidak digabung menjadi satu hasil):
    - 7SUP.4B-2C: migration diterapkan, katalog dan privilege efektif diverifikasi, 24 probe penolakan `SET ROLE` untuk `anon`, `authenticated`, dan `service_role` menghasilkan `42501`.
    - 7SUP.4B-3A: provisioning, penonaktifan, reaktivasi, perubahan role, expected state, replay dan fingerprint, OWNER aktif terakhir termasuk dua transaksi bersamaan, cutoff sesi dengan JWT asli, serta audit dan append-only. 84 dari 85 assertion dijalankan dan seluruhnya lulus; satu assertion (email belum terkonfirmasi) tidak dijalankan pada run itu.
    - 7SUP.4B-3B (run pertama): **INCONCLUSIVE** karena kesalahan pembanding di harness uji. 17 dari 45 assertion dijalankan, 16 lulus. Assertion provisioning akun belum terkonfirmasi lulus di run ini (`STATE_CONFLICT`, tanpa profil maupun event), tetapi run secara keseluruhan tetap INCONCLUSIVE.
    - 7SUP.4B-3B-R2: uji terarah urutan Auth/database dengan ban dan pencabutan ban nyata. 29 dari 29 assertion target, 11 dari 11 setup, dan 1 dari 1 cleanup lulus.
    - 7SUP.4B-3D: eksposur Data API dan penjaga konteks tepercaya (DATABASE-DESIGN §14.5 #19 dan #20), keduanya lulus dengan catatan.
    - 7SUP.4B-3I: penerapan migration G1, diff katalog, regresi G1 dengan JWT asli, serta uji `PROFILE_NOT_FOUND`, `AUTH_STILL_BANNED` saat provisioning, dan `OPERATION_ID_CONFLICT` untuk `p_expected_role` (DATABASE-DESIGN §14.5 #21, #27, #31, #40). Tiga akun uji sekali pakai; 6 dari 6 setup, 30 dari 30 target, dan 1 dari 1 cleanup lulus.
  - **Terbukti di lokal:** provisioning terkontrol beserta cutoff sesi; penonaktifan dan reaktivasi database; penegakan cutoff sesi; perubahan role dengan expected state; replay idempotent; perlindungan OWNER aktif terakhir; audit siklus akun yang atomik dan append-only; urutan ban dan pencabutan ban Auth lokal; batas eksposur schema privat; dan penjaga konteks SQL tepercaya.
  - **Belum diimplementasikan atau dibuktikan:** layanan orkestrasi operasional permanen; koordinasi terdistribusi atau multi-operator; pemulihan otomatis dari crash atau gangguan jaringan; RLS dan RPC tabel bisnis; konfigurasi produksi dan cloud; serta atribusi operator manusia yang diautentikasi.
  - Jejak audit uji dipertahankan: 27 event siklus akun dan entri `auth.audit_log_entries` dari akun uji tidak dihapus (J11). Setelah 7SUP.4B-3I: 32 event siklus akun (id 28–32 dari uji tersebut) dan 91 entri audit Auth, semuanya dipertahankan.
  - **Terbukti di lokal sejak 7SUP.4B-3I:** cutoff sesi setelah perubahan role (G1); `PROFILE_NOT_FOUND` untuk penonaktifan, reaktivasi, dan perubahan role; `AUTH_STILL_BANNED` saat provisioning; dan `OPERATION_ID_CONFLICT` untuk `p_expected_role` yang berbeda.
- **Temuan urutan ban** (uji lokal 7SUP.4B-3B-R2, INC-01 sampai INC-04):
  - **Fakta teramati:** setelah akun di-ban di Auth sementara profil database masih aktif, JWT yang terbit sebelumnya tetap dapat membaca profil milik akun tersebut. Login dan refresh baru ditolak (`user_banned`). Penonaktifan database kemudian langsung menolak JWT yang sama.
  - **Invariant operasional** [KEPUTUSAN, diturunkan dari runbook amandemen OD-29 dan dikonfirmasi uji]:
    - Penonaktifan: **database lebih dulu, lalu ban Auth.**
    - Reaktivasi: **pencabutan ban Auth lebih dulu, lalu reaktivasi database.**
  - **Batas:** invariant ini ditegakkan oleh runbook dan disiplin operator, **bukan** oleh mekanisme otomatis. Ban yang diberikan langsung melalui dashboard atau API di luar runbook tidak dicegat. State tersebut terdeteksi sebagai `INCONSISTENT_ACTIVE_BANNED` hanya bila operator memeriksanya (G3).
- **Keputusan G1–G3** [KEPUTUSAN]:
  - **Riwayat:** dicatat sebagai keputusan terbuka pada 1 November 2026 (sinkronisasi 7SUP.4B-3E), lalu dievaluasi dalam tinjauan keputusan read-only 7SUP.4B-3G.
  - **Persetujuan:** **disetujui pada 1 November 2026** melalui persetujuan eksplisit pemilik proyek dalam percakapan kerja dengan asisten AI. Persetujuan ini bukan dokumen bertanda tangan dan bukan bukti audit database yang diautentikasi.
  - **Lingkup persetujuan:** hanya kebijakan. Persetujuan ini tidak mengotorisasi migration, perubahan function SQL, akun uji, operasi ban, perubahan konfigurasi Auth, maupun perubahan di Supabase Cloud. Masing-masing memerlukan otorisasi terpisah.

  | Ref | Topik | Status keputusan | Status implementasi |
  |---|---|---|---|
  | G1 | Sesi setelah perubahan role | **APPROVED** — Opsi B | **APPROVED — IMPLEMENTED AND TARGETED-TESTED LOCALLY**: diimplementasikan dan lulus uji terarah di Supabase lokal (7SUP.4B-3I). Semula **APPROVED — NOT IMPLEMENTED** |
  | G2 | Durasi ban administratif | **APPROVED** — `876000h` untuk MVP lokal | **APPROVED — MANUAL OPERATIONAL POLICY**; kebijakan produksi **DEFERRED TO PRODUCTION** |
  | G3 | Deteksi state tidak konsisten dan runbook | **APPROVED** — runbook manual satu operator | **APPROVED — MANUAL OPERATIONAL POLICY**; otomasi tidak diimplementasikan |

  - **G1 — Sesi setelah perubahan role:**
    - **Kebijakan yang disetujui (Opsi B):** setiap perubahan role dengan outcome `APPLIED` wajib memajukan `profiles.session_valid_after`. Sesi Auth yang sudah ada kehilangan otorisasi aplikasi, dan pengguna wajib membuat sesi Auth baru sebelum memakai hak role baru. Berlaku untuk `STAFF_WAREHOUSE → OWNER` maupun `OWNER → STAFF_WAREHOUSE`, karena kedua role memiliki kemampuan yang berbeda, bukan bertingkat. `NOOP` tidak memajukan cutoff. Replay idempotent tidak memajukan cutoff dan tidak membuat event baru. Kebijakan ini harus tetap kompatibel dengan `request_fingerprint`, pemeriksaan expected state, dan audit append-only.
    - **Perilaku historis:** `admin_set_role()` dari migration `20261031163955_account_lifecycle_admin.sql` mengubah `profiles.role` tanpa memajukan `session_valid_after`, sehingga sesi yang sudah ada langsung memakai role baru (teramati di 7SUP.4B-3A). Perilaku ini masih berlaku di lingkungan yang belum menerapkan migration keempat.
    - **Implementasi** (1 November 2026, 7SUP.4B-3I; Supabase **lokal** saja): migration aditif `20261101044858_admin_role_change_session_cutoff.sql` mengganti `admin_set_role()` dengan signature, owner, ACL (`EXECUTE` hanya untuk `postgres`), `SECURITY INVOKER`, `search_path` kosong, dan `lock_timeout` 5 detik yang sama. Satu-satunya perubahan perilaku: pada outcome `APPLIED`, `role` dan `session_valid_after = clock_timestamp()` diubah dalam satu `UPDATE`. Fingerprint `firaza.admin_lifecycle.v1`, replay, pemeriksaan expected role, jalur `NOOP`, perlindungan OWNER aktif terakhir, kode error, dan bentuk kembalian tidak berubah. Diff katalog sebelum dan sesudah penerapan hanya menunjukkan source function ini dan satu baris migration baru.
    - **Bukti uji** (7SUP.4B-3I, dengan JWT asli dan Data API; 6 dari 6 setup, 30 dari 30 target, dan 1 dari 1 cleanup lulus):
      - `STAFF_WAREHOUSE → OWNER` dan `OWNER → STAFF_WAREHOUSE`: `ROLE_CHANGED`/`APPLIED`; cutoff maju melewati waktu pembuatan sesi sebelumnya.
      - JWT dari sesi sebelum cutoff ditolak (HTTP 200, nol baris profil).
      - Refresh sesi sebelum cutoff tetap berhasil di Supabase Auth (HTTP 200, `session_id` sama), tetapi JWT hasil refresh tidak dapat membaca profil.
      - Sesi Auth baru memperoleh otorisasi sesuai role baru.
      - `NOOP` dan replay tidak memajukan cutoff, dan replay tidak menulis event.
      - `STATE_CONFLICT` untuk expected state usang dan `LAST_ACTIVE_OWNER` tetap bekerja.
      - Event `SET_ROLE` mencatat role serta cutoff lama dan baru.
      - Akun OWNER lain tidak terpengaruh.
    - **Batas:**
      - G1 **tidak** mencabut sesi maupun refresh token Supabase Auth. Jaminannya ditegakkan oleh otorisasi database melalui `app_private.current_app_role()`. Karena itu setiap policy RLS dan RPC bisnis di masa depan wajib menegakkan batas otorisasi yang sama.
      - Belum ada antarmuka login aplikasi maupun penanganan logout paksa di aplikasi.
      - Belum diuji: login yang bersamaan dengan transaksi perubahan role, selisih jam dan konfigurasi di cloud, uji ulang setelah peningkatan versi, serta penerapan di cloud atau produksi.
  - **G2 — Durasi ban administratif:**
    - **Kebijakan yang disetujui:** durasi ban Auth untuk penonaktifan administratif di MVP **lokal** adalah `876000h`. Durasi ini terbatas, sekitar 100 tahun, dan bukan ban permanen.
    - **Peran kontrol:** `profiles.deactivated_at` tetap kontrol utama penolakan otorisasi aplikasi. Ban Auth adalah pertahanan tambahan yang membatasi login dan refresh, dan tidak langsung membatalkan access JWT yang sudah terbit. Urutan tetap: penonaktifan database sebelum ban Auth, dan pencabutan ban Auth sebelum reaktivasi database. Operator wajib memverifikasi status Auth dan database.
    - **Status implementasi:** tidak ada perubahan konfigurasi Auth. Kebijakan ini dipatuhi secara manual oleh operator.
    - **Bukti uji:** Supabase Auth lokal (v2.197.0) pernah menerima `876000h` (7SUP.4B-1). Uji urutan 7SUP.4B-3B-R2 memakai `720h`. Pada 7SUP.4B-3I, tepat satu ban `876000h` diterapkan pada akun uji tanpa profil: HTTP 200, `banned_until` sekitar 876.000 jam ke depan, tanpa event siklus akun. Akun dihapus saat cleanup tanpa unban. Ini bukti fixture uji, bukan otomasi kebijakan.
    - **Batas:** durasi ban produksi, pemantauan masa berlaku ban, kompatibilitas versi Auth di cloud, dan kebijakan retensi akun **DEFERRED TO PRODUCTION** dan ditinjau terpisah.
  - **G3 — Runbook manual satu operator:**
    - **Kebijakan yang disetujui:** runbook manual untuk satu operator tepercaya, dengan pemeriksaan sebelum dan sesudah operasi, urutan database-first untuk penonaktifan dan Auth-first untuk reaktivasi, deteksi `INCONSISTENT_ACTIVE_BANNED`, pencatatan `operation_id` dan bukti audit, kebijakan retry tanpa otomatisasi, dan kondisi STOP. Rincian prosedur: DATABASE-DESIGN §12.5.6.
    - **Status implementasi:** function admin dan `admin_get_account_state()` yang terpasang mendukung alur manual yang sudah diuji. Runbook diadopsi sebagai kebijakan operasional, bukan penegakan lintas sistem otomatis.
    - **Bukti uji:** urutan Auth/database dan deteksi `INCONSISTENT_ACTIVE_BANNED` teramati di 7SUP.4B-3B-R2 (`INC-01` sampai `INC-04`).
    - **Belum diimplementasikan:** layanan orkestrasi permanen, pemantauan latar, koordinasi terdistribusi, dan koordinasi multi-operator. Pemulihan dari crash dan gangguan jaringan nyata belum dibuktikan. Atribusi operator tidak dibuktikan secara kriptografis. Operasi multi-operator tidak disetujui.
    - **Batas:** PostgreSQL dan Auth Admin API tidak berbagi transaksi. Advisory lock database tidak membuat panggilan HTTP Auth atomik. Pengulangan permintaan ban Auth tidak idempotent secara transaksional, karena durasi relatif yang diterapkan ulang dapat menggeser `banned_until`.

- **Kategori penerimaan OD-29** (1 November 2026):
  - **Fondasi database dan Auth yang terverifikasi di lokal:** lihat "Status implementasi lokal".
  - **Keputusan kebijakan untuk MVP lokal:** G1, G2, dan G3 disetujui pada 1 November 2026, termasuk runbook satu operator.
  - **Pekerjaan penerimaan lokal yang tersisa:** implementasi dan uji G1; uji tiga cabang negatif yang belum dijalankan (DATABASE-DESIGN §14.5 #21 `PROFILE_NOT_FOUND`, #27 `AUTH_STILL_BANNED` saat provisioning, #31 `OPERATION_ID_CONFLICT` dengan `p_expected_role` berbeda); verifikasi kepatuhan terhadap G2 dan G3 bila relevan; serta tinjauan kondisi §14.5 lainnya. OD-29 tetap terbuka.
  - **Status 1 November 2026 (7SUP.4B-3I):** implementasi dan uji G1 serta ketiga cabang negatif tersebut selesai di lokal (DATABASE-DESIGN §14.5 #21, #27, #31, #40). Yang masih tersisa untuk penerimaan lokal: kondisi §14.5 yang belum lengkap, termasuk `STATE_CONFLICT` untuk email belum terkonfirmasi yang hanya punya bukti dari run INCONCLUSIVE (#21, #27); pemulihan dari gangguan proses atau jaringan yang nyata; login yang bersamaan dengan transaksi perubahan role; serta otorisasi tabel bisnis dan RPC. OD-29 tetap terbuka.
  - **Validasi khusus produksi:** role SQL dan pengaturan Auth di cloud, eksposur schema dan default ACL cloud, perilaku `db push`, uji ulang setelah peningkatan versi (DATABASE-DESIGN §14.5 #18), latihan pemulihan kegagalan nyata, dan penanganan secret key di script.
  - **Ditunda:** koordinasi multi-operator, trigger J2, antarmuka admin, serta otorisasi tabel bisnis dan RPC (menunggu fitur bisnis).
- **Sumber:** [KEPUTUSAN], berdasarkan tinjauan arsitektur read-only 31 Oktober 2026, uji integrasi lokal, dan katalog PostgreSQL lokal.
- **Alasan:**
  - `SECURITY INVOKER` sudah cukup karena `postgres` memiliki `profiles` dan atribut `BYPASSRLS`. `SECURITY DEFINER` tidak menambah kemampuan bagi pemanggil yang sah, tetapi menambah risiko bila hak `EXECUTE` keliru diberikan.
  - Advisory lock yang diambil lebih dulu membuat semua mutasi admin berjalan bergantian. Deadlock antar-function admin menjadi tidak mungkin, dan invariant OWNER aktif terakhir tidak perlu bergantung pada pemeriksaan ulang baris yang halus.
  - `operation_id` yang unik dan tersimpan bersama `request_fingerprint` adalah state persisten minimum yang memungkinkan retry setelah respons hilang tanpa menerapkan ulang operasi lama, sekaligus menolak `operation_id` yang dipakai ulang dengan input berbeda.
  - Opsi koordinasi tahan-lama lintas sistem (status pending dan versi per operasi) terlalu besar untuk MVP dengan satu developer.
- **Trade-off:**
  - Satu tabel privat dan enam function tambahan perlu dipelihara dan diuji.
  - Semua mutasi admin berjalan bergantian. Untuk jumlah akun MVP, dampaknya dapat diabaikan.
  - Ketergantungan baru pada schema internal `auth`: kolom `auth.users.banned_until` dan `email_confirmed_at`.
- **Risiko sisa yang diterima secara eksplisit:**
  - SQL berhak tinggi yang tidak melalui function admin (sebagai `postgres` atau superuser) dapat melewati perlindungan OWNER aktif terakhir dan pencatatan event. Runbook melarang mutasi langsung pada `role`, `deactivated_at`, dan `session_valid_after`, kecuali melalui prosedur pemulihan darurat yang diotorisasi terpisah.
  - Proteksi append-only tabel event dapat dilewati pemilik tabel maupun superuser.
  - Lock database tidak melindungi langkah Auth Admin API. Interleaving lintas sistem hanya dicegah oleh J7, yang merupakan asumsi organisasi, dan dideteksi oleh verifikasi status akhir. J7 tidak menghilangkan setiap race lintas sistem.
  - Teks `actor` dinyatakan sendiri oleh operator, bukan identitas yang diautentikasi.
  - `request_fingerprint` bergantung pada representasi teks `jsonb` PostgreSQL. Setelah peningkatan versi mayor, perubahan format hanya dapat menyebabkan `OPERATION_ID_CONFLICT` palsu (fail-closed), bukan penerapan ulang. Uji fingerprint wajib diulang.
  - PostgreSQL dan Auth Admin API tidak berbagi satu transaksi. Tidak ada atomicity lintas sistem.
- **Batas keputusan:**
  - Pemeriksaan `current_user = 'postgres'` berlaku untuk lingkungan lokal yang diverifikasi. Role yang dipakai SQL editor dashboard dan koneksi langsung di project cloud wajib diverifikasi tersendiri sebelum penerapan remote.
  - Status OWNER di aplikasi tidak memberi kewenangan SQL administratif.
  - Koordinasi operasi tahan-lama wajib dipertimbangkan ulang sebelum ada lebih dari satu operator atau antarmuka admin.
- **Hubungan dengan ADR lain:** Merinci prosedur admin yang ditunda ADR-11 dan ADR-13 (amandemen OD-29). Mengubah satu butir kebijakan administratif amandemen ADR-13 tentang pencatatan audit (J1). Tidak mengubah D1–D9 maupun ADR-01 sampai ADR-12.
- **Dampak:** DATABASE-DESIGN §4.1, §4.11 (baru), §12.2, §12.5, §14.2, §14.5, dan §15. PRD FR-AUTH-04 dan OD-29. FEATURE-SPECIFICATION aturan bisnis autentikasi.
- **Tindak lanjut:**
  - Tulis migration admin aditif dan terapkan di lokal pada checkpoint yang disetujui terpisah. **Selesai di lokal** (1 November 2026).
  - Jalankan uji penerimaan DATABASE-DESIGN §14.5 untuk prosedur admin, termasuk uji konkurensi dua transaksi. **Sebagian besar selesai di lokal**; status per uji di §14.5.
  - Putuskan G1, G2, dan G3, lalu setujui rincian runbook satu operator secara formal. **Disetujui** (1 November 2026).
  - Implementasikan G1 dengan migration aditif dan uji regresi terarah. **Selesai di lokal** (7SUP.4B-3I, migration `20261101044858_admin_role_change_session_cutoff.sql`).
  - Jalankan uji DATABASE-DESIGN §14.5 #21, #27, dan #31 yang belum dijalankan. **Dijalankan di lokal** (7SUP.4B-3I); status per uji di §14.5.
  - Sediakan script orkestrasi tepercaya dengan penjaga eksekusi eksklusif lokal bila memungkinkan secara teknis. Belum dilakukan.
  - Verifikasi role SQL di project cloud sebelum penerapan remote. Belum dilakukan.

### ADR-15 — Irisan Vertikal Pertama: Stock In, Pola Baca OD-18, dan Otorisasi Database Fail-Closed

- **Tanggal:** 1 November 2026.
- **Riwayat:** checkpoint read-only 7SUP.5A-1 berakhir `BLOCKED — OWNER DECISIONS REQUIRED` dan mengajukan keputusan B1–B7. Pemilik proyek memilih B1–B7. B5.3 disetujui terpisah melalui addendum otorisasi 7SUP.5A-2.
- **Persetujuan:** persetujuan eksplisit pemilik proyek dalam percakapan kerja dengan asisten AI. Persetujuan ini bukan dokumen bertanda tangan dan bukan bukti audit database yang diautentikasi.
- **Keputusan:** [KEPUTUSAN]

  | Ref | Keputusan | Status keputusan | Status implementasi (1 November 2026) |
  |---|---|---|---|
  | B1 | Opsi A: irisan vertikal pertama adalah Stock In end-to-end (login Staff → baca material seed → `STOCK_IN` → saldo dan histori terverifikasi) | **APPROVED** | Database: **IMPLEMENTED AND TESTED LOCALLY** (7SUP.5A-2). Route Handler dan antarmuka: **IMPLEMENTED AND HTTP-TESTED LOCALLY** (7SUP.5A-3, perbaikan 7SUP.5A-3R). Antarmuka: **VERIFIED IN BROWSER WITH LIMITATIONS** (manual oleh pemilik proyek, lokal, 7SUP.5A-3B): login Staff, daftar material, detail material, histori transaksi, serta validasi form untuk input kosong, nol, dan desimal berhasil diverifikasi. Pengiriman Stock In dengan jumlah valid tidak dijalankan melalui browser; transaksi Stock In committed baru terbukti melalui uji HTTP. |
  | B2 / OD-18 | Opsi C: seluruh pembacaan data bisnis pada irisan ini dilakukan Client Component melalui Route Handler REST API (`/api/v1/*`), yang memanggil Supabase dengan sesi pengguna. Server Component tidak membaca data bisnis langsung dari Supabase | **APPROVED** (menutup OD-18) | **IMPLEMENTED AND HTTP-TESTED LOCALLY** (7SUP.5A-3): halaman tidak membawa data di HTML, dan bundel browser tidak memuat library maupun kunci Supabase. Di browser (manual, lokal, 7SUP.5A-3B): daftar material, detail, dan histori dimuat tanpa error atau warning di console. Uji browser ini memverifikasi perilaku tampilan, bukan arsitektur REST API; bukti arsitektur tetap dari uji HTTP 7SUP.5A-3. |
  | B3 | Kombinasi uji SQL berbasis ROLLBACK dan fixture demo lokal yang dipertahankan secara terkontrol | **APPROVED** | **IMPLEMENTED LOCALLY** (7SUP.5A-2): dua akun demo, dua kategori, tiga material, dan sepuluh transaksi final dipertahankan |
  | B4 | `@supabase/supabase-js`, `@supabase/ssr`, Axios, dan Zod dengan versi kompatibel yang dikunci | **APPROVED** | **INSTALLED** (7SUP.5A-3), versi pasti: `@supabase/supabase-js` 2.118.0, `@supabase/ssr` 0.12.7, `axios` 1.20.0, `zod` 4.6.7. Semula **NOT INSTALLED**. DevDependency `supabase` 2.122.0 (Supabase CLI) sudah ada sebelum 7SUP.5A-3 dan bukan bagian dari B4; status keputusannya menunggu pemilik proyek |
  | B5.1 | Opsi B: fondasi inventori lebih lengkap dengan scope ketat sesuai kontrak kanonik | **APPROVED** | **IMPLEMENTED AND TESTED LOCALLY** (migration `20261101064015_inventory_stock_movement_foundation.sql`) |
  | B5.2 | Opsi B: RPC `STOCK_IN` dan `STOCK_OUT` diuji di level database; antarmuka `STOCK_IN` lebih dulu | **APPROVED** | RPC: **IMPLEMENTED AND TESTED LOCALLY**. Antarmuka `STOCK_IN`: **IMPLEMENTED AND HTTP-TESTED LOCALLY**. Di browser (manual, lokal, 7SUP.5A-3B) hanya diverifikasi tampilan form, validasi jumlah (kosong, nol, desimal), dan tidak tampilnya form untuk Owner; pengiriman dengan jumlah valid tidak dijalankan. Stock Out (7SUP.5B-2A dan 7SUP.5B-2B; Supabase lokal): API (`POST /api/v1/stock-movements` menerima `type: "STOCK_OUT"`) **IMPLEMENTED AND COMMITTED LOCALLY (C-6 `b781551`), NOT PUSHED** dan **HTTP-TESTED LOCALLY** (EXEC-R 48/48 tanpa mutasi; EXEC-C 63/63 dengan satu transaksi database `STOCK_OUT` (−1) yang berhasil di-commit). Antarmuka (kartu Stock Out terpisah) **IMPLEMENTED AND COMMITTED LOCALLY (C-6), NOT PUSHED**; build lulus dan unit test (mock) lulus. Browser: **NOT VERIFIED**; 7SUP.5B-3A FAIL prosedural dan B-01 sampai B-29 NOT ASSESSED. Uji HTTP dan unit test tidak membuktikan perilaku browser. Rincian keputusan historis 7SUP.5B-1A dicatat di ADR-16. |
  | B5.3 | Opsi B: otorisasi database fail-closed | **APPROVED** | **IMPLEMENTED AND TESTED LOCALLY** |
  | B6 | Opsi A: login dan logout melalui Route Handler Next.js | **APPROVED** | **IMPLEMENTED AND HTTP-TESTED LOCALLY** (7SUP.5A-3): `POST /api/v1/auth/login` dan `/logout`; cookie `HttpOnly`, `SameSite=Lax`, dan `Path=/` teramati dari header `Set-Cookie`. Validasi tujuan redirect setelah login diperketat di 7SUP.5A-3R. **VERIFIED IN BROWSER WITH LIMITATIONS** (manual oleh pemilik proyek, lokal, 7SUP.5A-3B): pesan kredensial salah, login Staff dan Owner, logout pada sesi yang diuji, perlindungan halaman, redirect `//evil.example` ke `/materials`, redirect ke detail material, serta cookie `HttpOnly` dan `SameSite=Lax` berhasil diverifikasi. Satu sesi Auth STAFF_WAREHOUSE dari login pertama masih tercatat aktif dan diterima sebagai residual risk lokal oleh pemilik proyek. Belum dilaporkan: fokus keyboard, atribut cookie `Path=/` di browser, serta input redirect `/\evil.example` dan `https://evil.example`. |
  | B7 | OD-17 dan aspek OD-19 yang tidak menghambat Stock In ditunda. Aturan yang sudah final tetap wajib | **APPROVED** | Diterapkan: `OPENING_BALANCE` tidak diekspos dan ditolak constraint; unique `lower(name)` berlaku; tidak ada jalur tulis kategori atau material untuk role API |

- **B5.3 — ketentuan otorisasi fail-closed:**
  - Implementasi RPC inventori memvalidasi identitas dan role efektif di PostgreSQL melalui `app_private.current_app_role()`, sebelum replay idempotency maupun mutasi apa pun.
  - Ditolak: pengguna anonim, Owner untuk operasi stok, akun nonaktif, akun tanpa profil, dan sesi yang dibuat sebelum cutoff G1.
  - Pola ADR-09 dipertahankan. `EXECUTE`, `USAGE` schema, grant, dan RLS diberikan seminimal mungkin.
  - Role API tidak mendapat hak `INSERT`, `UPDATE`, maupun `DELETE` langsung pada tabel bisnis.
  - Penegakan tetap berlaku bila RPC dipanggil langsung tanpa antarmuka Next.js. `SECURITY DEFINER`, schema privat, maupun validasi di Next.js tidak menggantikan pemeriksaan eksplisit di database.
- **Implementasi lokal** (7SUP.5A-2; Supabase **lokal** saja):
  - Migration aditif kelima `20261101064015_inventory_stock_movement_foundation.sql`, diterapkan sekali. Empat migration sebelumnya tidak berubah.
  - Objek: enum `transaction_type`, `opname_status`, dan `material_status_event_type`; tabel `categories`, `materials`, `material_status_events`, `stock_opname`, `stock_opname_items`, dan `inventory_transactions`; tabel `app_private.idempotency_requests`; implementasi `app_private.post_stock_movement` (`SECURITY DEFINER`, `search_path` kosong, `lock_timeout` 5 detik) beserta wrapper `public.post_stock_movement` (`SECURITY INVOKER`); view `material_stock_status` (`security_invoker = true`); trigger append-only pada `inventory_transactions` dan `material_status_events`.
  - `authenticated` hanya mendapat `SELECT` pada enam tabel `public` dan view, melalui policy yang mensyaratkan helper role tidak NULL. `EXECUTE` pada wrapper dan implementasi hanya untuk `authenticated`. `anon` dan `service_role` tidak mendapat hak apa pun. Blok pemeriksaan akhir migration memverifikasi semua ini.
  - `stock_opname` dan `stock_opname_items` hanya berupa skema, tanpa function penulis, karena kolom dan constraint-nya tidak bergantung pada OD-01, OD-02, OD-05, OD-16, maupun OD-20.
  - Kode error tambahan di luar daftar indikatif DATABASE-DESIGN §7.2: `UNAUTHORIZED` dan `FORBIDDEN` (SQLSTATE `42501`), serta `INVALID_TRANSACTION_TYPE`, `MATERIAL_NOT_FOUND`, `IDEMPOTENCY_KEY_REQUIRED`, `INVALID_IDEMPOTENCY_KEY`, `STOCK_LIMIT_EXCEEDED`, dan `IDEMPOTENCY_STATE_INVALID` (SQLSTATE `P0001`).
- **Bukti uji** (7SUP.5A-2, Auth lokal asli dan Data API):
  - Run pertama berhenti di uji `ACC-03` karena cacat parsing pada harness. Hasil keamanan yang teramati pada uji itu benar (nol baris). 27 uji sebelumnya lulus, termasuk seluruh uji fungsional, idempotency, konkurensi, dan penolakan tulis langsung melalui Data API.
  - Run lanjutan terpisah, dengan sesi baru, mengulang blok uji SQL rollback, uji sesi, dan rekonsiliasi: 35 dari 35 lulus. Kedua run dilaporkan terpisah dan tidak digabung.
  - Uji akun nonaktif dan cutoff G1 dijalankan di level SQL dengan klaim dari sesi Auth asli dalam transaksi yang di-ROLLBACK, bukan melalui HTTP dengan state yang di-commit.
- **Implementasi aplikasi** (7SUP.5A-3 dan 7SUP.5A-3R; lokal saja):
  - Route Handler `/api/v1/auth/*`, `/api/v1/materials*`, dan `/api/v1/stock-movements` (hanya `STOCK_IN`), serta halaman `/login`, `/materials`, dan `/materials/{id}`.
  - Uji HTTP 7SUP.5A-3: 29 dari 29 lulus dan 3 tidak dijalankan. Satu `STOCK_IN` di-commit melalui API; total menjadi 11 transaksi final.
  - Perbaikan 7SUP.5A-3R, diverifikasi dengan uji unit tanpa jaringan maupun database:
    - Stock In yang hasilnya tidak pasti tidak dapat dibuang dan tidak dapat diganti key baru; satu-satunya tindakan adalah kirim ulang dengan key dan payload yang sama.
    - Tujuan redirect setelah login dibatasi pada allowlist path aplikasi.
  - Pembaruan 7SUP.5B-2A (2 November 2026; working tree lokal, belum di-commit ke Git):
    - `POST /api/v1/stock-movements` menerima `type: "STOCK_IN"` dan `type: "STOCK_OUT"` (validasi Zod). Butir di atas yang menyebut "hanya `STOCK_IN`" adalah potret 7SUP.5A-3.
    - Halaman `/materials/{id}`: kartu Stock In dan Stock Out terpisah untuk Staff Warehouse; Owner melihat satu kartu baca-saja.
    - Attempt yang hasilnya belum pasti disimpan terpisah per tipe transaksi; kunci penyimpanan Stock In yang lama tetap dipakai.
    - Harness uji di `tests/`: unit test (mock) lulus 24 dari 24; harness HTTP dipakai di 7SUP.5B-2B (EXEC-R 48/48, EXEC-C 63/63); uji SQL boundary belum pernah dijalankan.
    - Uji HTTP dan unit test tidak membuktikan perilaku browser; status browser ada di baris B5.2.
  - Pembaruan 4 November 2026 (DOC-SYNC-01): kode aplikasi (C-4 `1683cc4` sampai C-6 `b781551`) dan harness `tests/` (C-7 `bb6865b`) kini di-commit secara lokal di branch `feat/supabase-foundation` dan belum di-push ke GitHub. Butir 7SUP.5B-2A di atas adalah potret 2 November 2026. Status uji tidak berubah.
- **Batas:**
  - Uji penerimaan browser manual (7SUP.5A-3B) memverifikasi alur inti dengan keterbatasan:
    - Pengiriman Stock In dengan jumlah valid tidak dijalankan melalui browser.
    - Fokus keyboard, atribut cookie `Path=/`, serta input redirect `/\evil.example` dan `https://evil.example` tidak dilaporkan.
  - Temuan terbuka (residual risk lokal, diterima pemilik proyek): satu sesi Auth STAFF_WAREHOUSE dari login 1 November 2026 pukul 09:58:54 UTC masih aktif, dan refresh token-nya belum dicabut. Sesi tidak dicabut melalui Auth Admin API maupun perubahan langsung pada tabel Auth.
  - Penolakan setelah penonaktifan atau cutoff G1 yang di-commit melalui API Next.js belum diuji.
  - Belum diuji di cloud. Fixture demo hanya ada di lokal.
  - Kode error final dan pemetaan HTTP tetap mengikuti dokumentasi API (Gelombang 2b).
  - Insiden 7SUP.5B-3A: uji browser manual menghasilkan 12 transaksi demo tambahan di luar batas mutasi nol. Keputusan pemilik proyek (K3): FAIL prosedural, bukan konfirmasi bug aplikasi. Seluruh transaksi dipertahankan tanpa kompensasi maupun penghapusan. Rincian insiden dan baseline yang disahkan (K4) ada di DATABASE-DESIGN §15.
  - Temuan review keamanan statis (4 November 2026; Security Reviewer read-only atas fondasi autentikasi C-4 serta migration `20261031084100` dan `20261101044858`): Critical 0, High 0. Temuan berikut adalah backlog untuk triase. Temuan ini **belum dibuktikan di runtime dan belum diperbaiki**:
    - F-01 (Medium): flag `Secure` pada cookie auth bergantung pada `AUTH_COOKIE_SECURE=true` (`lib/server/supabase.js:38`). Wajib ditangani sebelum deployment.
    - F-02 (Low): cutoff sesi membandingkan jam dari sistem yang berbeda.
    - F-03 (Low): sesi Supabase Auth lama dapat tetap aktif setelah perubahan role.
    - F-04 (Low): throttling login dan batas ukuran body di tingkat aplikasi perlu ditinjau.
    - F-05 (Low): respons 403 saat login dapat mengungkap status akun setelah password benar.
    - F-06 (Low): validasi origin bergantung pada header Host.
    - F-07 (Low): pemetaan SQLSTATE `42501` terlalu luas.
    - F-08 (Low): masa berlaku cookie mengikuti default library.
- **Sumber:** [KEPUTUSAN], berdasarkan tinjauan read-only 7SUP.5A-1 dan addendum otorisasi 7SUP.5A-2.
- **Hubungan dengan ADR lain:** menutup OD-18 dengan Opsi C. Rujukan OD-18 di ADR-05 adalah catatan historis saat keputusan itu masih terbuka. Tidak mengubah ADR-01 sampai ADR-14.
- **Dampak:** PRD, FEATURE-SPECIFICATION, dan DATABASE-DESIGN memerlukan sinkronisasi lanjutan pada checkpoint terpisah. Cakupannya: status OD-18, migration kelima, kode error tambahan, nama view, fixture demo, dan status §14.4.
- **Tindak lanjut:**
  - Pasang dependency B4 dengan versi yang dikunci, lalu implementasikan Route Handler autentikasi (B6) dan irisan Stock In (B1, B2). **Selesai di lokal** (7SUP.5A-3).
  - Sinkronisasi PRD, FEATURE-SPECIFICATION, dan DATABASE-DESIGN. **Selesai** (7SUP.5A-3).
  - Verifikasi interaksi antarmuka di browser. **Selesai dengan keterbatasan** (7SUP.5A-3B); rinciannya di "Batas" dan baris B1, B2, B5.2, serta B6.
  - Putuskan apakah devDependency `supabase` (Supabase CLI) dipertahankan. Menunggu pemilik proyek.
    - Pembaruan 4 November 2026: pemilik proyek memutuskan devDependency ini dipertahankan (KEEP, GIT-02). Versi 2.122.0 tercatat di commit lokal C-1 (`f132ad7`).
  - Uji browser yang memerlukan mutasi ditunda sampai stack test E2E terisolasi tersedia (keputusan K5). Desain dan implementasi stack test (P1/P2) belum diotorisasi.
  - Sinkronisasi status Stock Out ke ADR-15 B5.2, PRD, dan FEATURE-SPECIFICATION belum dilakukan (7SUP.5B-3C). Pengujian HTTP 7SUP.5B-2B mendukung implementasi API Stock Out; status implementasi dan pengujian antarmuka harus diverifikasi secara terpisah.
    - Pembaruan 2 November 2026 (7SUP.5B-3C): sinkronisasi dokumentasi status Stock Out ke ADR-15 B5.2, ADR-16, PRD, dan FEATURE-SPECIFICATION **Selesai**. Butir di atas merupakan potret sebelum sinkronisasi. Penyelesaian ini hanya mencakup dokumentasi; kode Stock Out tetap berada di working tree lokal dan belum di-commit ke Git, uji browser belum diverifikasi, dan uji SQL boundary belum dijalankan. Ini bukan pernyataan kesiapan deployment.

### ADR-16 — Irisan Stock Out: Keputusan Implementasi 7SUP.5B-1A

- **Tanggal:** keputusan diambil pada checkpoint 7SUP.5B-1A; didokumentasikan pada 2 November 2026 melalui 7SUP.5B-3C.
- **Riwayat:** checkpoint read-only 7SUP.5B-1 mengajukan empat syarat implementasi Stock Out. Definisinya dikonfirmasi pada 7SUP.5B-1A, lalu pemilik proyek memilih B1 = A, B2 = B, B3 = A, B4 = A, dan Strategi B. Keputusan tersebut dinyatakan sebagai keputusan desain, **bukan** izin implementasi. Implementasi dan pengujian memerlukan persetujuan terpisah per checkpoint (7SUP.5B-2A, 7SUP.5B-2B EXEC-R dan EXEC-C, 7SUP.5B-3A).
- **Persetujuan:** persetujuan eksplisit pemilik proyek dalam percakapan kerja dengan asisten AI. Persetujuan ini bukan dokumen bertanda tangan dan bukan bukti audit database yang diautentikasi.
- **Sifat catatan:** ADR ini **hanya mendokumentasikan keputusan historis** 7SUP.5B-1A. Tidak ada keputusan baru, dan tidak ada keputusan lama yang diubah.
- **Label:** B1–B4 di tabel berikut adalah label checkpoint 7SUP.5B-1A, **berbeda** dari ADR-15 B1–B4. Alias SO-1 sampai SO-5 dipakai untuk menghindari bentrok.
- **Keputusan:** [KEPUTUSAN historis 7SUP.5B-1A]

  | Ref | Label historis | Keputusan | Status keputusan | Status implementasi (2 November 2026) |
  |---|---|---|---|---|
  | SO-1 | B1 = A | Satu transaksi uji `STOCK_OUT` dengan quantity 1 pada [DEMO] Kardus Medium, sebagai batas maksimum mutasi yang dapat diajukan untuk persetujuan implementasi | **APPROVED** (keputusan desain) | Diterapkan di 7SUP.5B-2B EXEC-C: tepat satu transaksi database `STOCK_OUT` (−1) tersimpan; 63/63 lulus |
  | SO-2 | B2 = B | Harness uji disimpan di repository dalam struktur `tests/`, tanpa secret atau kredensial; CI tidak diubah | **APPROVED** (keputusan desain) | **IMPLEMENTED IN LOCAL WORKING TREE (NOT COMMITTED)**: `tests/unit`, `tests/integration/http`, `tests/integration/sql`. Uji SQL boundary belum pernah dijalankan. CI tetap hanya build |
  | SO-3 | B3 = A | Penyimpanan attempt dipisah menurut tipe transaksi; kompatibilitas Stock In dipertahankan | **APPROVED** (keputusan desain) | **IMPLEMENTED IN LOCAL WORKING TREE (NOT COMMITTED)**: `components/stock-in-attempt.js`, kunci penyimpanan Stock In lama tetap dipakai. Unit test (mock) lulus |
  | SO-4 | B4 = A | Stock In dan Stock Out ditampilkan sebagai dua kartu terpisah | **APPROVED** (keputusan desain) | **IMPLEMENTED IN LOCAL WORKING TREE (NOT COMMITTED)**: `app/materials/[id]/page.js`, `components/stock-out-form.jsx`. Browser: **NOT VERIFIED** |
  | SO-5 | Strategi B | Stock Out diselesaikan lebih dulu (7SUP.5B-2, 7SUP.5B-3); perubahan autentikasi dibahas sesudahnya melalui checkpoint terpisah (AUTH-02, AUTH-03, AUTH-04) | **APPROVED** (urutan pengembangan) | Stock Out sedang berjalan; checkpoint AUTH belum dimulai |

- **Alasan dan trade-off** (sebagaimana disampaikan saat keputusan diambil):
  - SO-1 membatasi mutasi permanen pada data demo. Transaksi inventori bersifat append-only, sehingga setiap uji yang menyimpan transaksi bersifat permanen.
  - SO-2 membuat uji dapat diulang dan diaudit. Risikonya, repository bersifat publik, sehingga kredensial hanya dibaca dari path privat melalui environment.
  - SO-3 mencegah attempt Stock In dan Stock Out saling memulihkan atau memblokir, dengan risiko regresi pada kode Stock In yang dimitigasi oleh unit test.
  - SO-4 mengurangi risiko salah memilih tipe transaksi.
  - SO-5 dipilih karena Stock Out tidak bergantung pada cara login.
- **Status Stock Out** (Supabase lokal; potret 2 November 2026):

  | Aspek | Status | Bukti | Batas |
  |---|---|---|---|
  | Implementasi API | **IMPLEMENTED IN LOCAL WORKING TREE (NOT COMMITTED)** | `POST /api/v1/stock-movements` menerima `type: "STOCK_OUT"`; build lulus (7SUP.5B-2A) | File implementasi API Stock Out belum di-commit ke Git |
  | Uji HTTP | **HTTP-TESTED LOCALLY** | 7SUP.5B-2B: EXEC-R 48/48 tanpa mutasi; EXEC-C 63/63. Replay dengan key dan payload identik tidak menghasilkan transaksi ganda; penggunaan ulang key dengan payload berbeda ditolak dengan HTTP 422 | Log run belum diarsipkan permanen |
  | Implementasi antarmuka | **IMPLEMENTED IN LOCAL WORKING TREE (NOT COMMITTED)** | Kartu Stock Out terpisah; build lulus; unit test (mock) 24/24 (7SUP.5B-2A) | Unit test memakai mock |
  | Uji browser | **NOT VERIFIED** | 7SUP.5B-3A FAIL prosedural (K3); B-01 sampai B-29 NOT ASSESSED; uji yang memerlukan mutasi ditunda ke stack E2E terisolasi (K5) | Uji HTTP dan unit test tidak membuktikan perilaku browser |

- **Batas:**
  - File implementasi Stock Out yang diperiksa (`lib/validation/schemas.js`, `app/api/v1/stock-movements/route.js`, `components/stock-out-form.jsx`, `components/stock-in-attempt.js`, `app/materials/[id]/page.js`) dan harness `tests/` terkait masih berstatus untracked di working tree lokal dan belum di-commit ke Git.
  - Uji browser Stock Out belum diverifikasi.
  - Uji SQL boundary (`tests/integration/sql/stock-out-boundary.sql`) belum pernah dijalankan.
  - Log EXEC-R dan EXEC-C belum diarsipkan permanen; ringkasannya ada di DATABASE-DESIGN §15.
  - Pembaruan 4 November 2026 (DOC-SYNC-01): butir pertama di atas dan tabel status adalah potret 2 November 2026. File-file tersebut dan harness `tests/` kini di-commit secara lokal (C-4 sampai C-7; Stock Out di C-6 `b781551`, harness di C-7 `bb6865b`) dan belum di-push ke GitHub. Status uji browser dan uji SQL boundary tidak berubah.
- **Sumber:** [KEPUTUSAN], berdasarkan keputusan pemilik proyek pada 7SUP.5B-1A dan 7SUP.5B-1A + AUTH-01.
- **Hubungan dengan ADR lain:**
  - Melanjutkan ADR-15 B5.2; status Stock Out yang ringkas dicatat juga di baris B5.2.
  - Tidak mengubah ADR-01 sampai ADR-15.
  - Kontrak autentikasi ADR-04, ADR-11, ADR-14, dan ADR-15 B6 tetap berlaku.
  - Stock Out tidak bergantung pada arah AUTH-01; ADR ini tidak mencatat maupun mengesahkan keputusan AUTH-01.
- **Dampak:** PRD dan FEATURE-SPECIFICATION memerlukan sinkronisasi status Stock Out (7SUP.5B-3C). DATABASE-DESIGN tidak berubah; skema tetap lima migration.
- **Tindak lanjut:**
  - Verifikasi browser Stock Out di stack test E2E terisolasi, setelah stack tersebut disetujui (P1/P2).
  - Uji SQL boundary, dengan persetujuan terpisah.
  - Keputusan arsip bukti EXEC (O5).

## Kepatuhan Checklist Tech Stack

Sumber: `List Tech Stack [Dicoding Bootcamp Batch 15] - Tipe Capstone_ Individu.pdf`, halaman 1, kolom Full-Stack Web Developer [PDF hlm.1]. Status "Direncanakan" berarti belum diimplementasikan maupun diuji.

### Main Quest

| Persyaratan | Rencana pemenuhan | Status |
|---|---|---|
| Menggunakan module bundler | Next.js membundel aplikasi dengan bundler bawaannya (ADR-01) | Diimplementasikan; build produksi lulus di lokal (4 November 2026); belum di-deploy |
| Opsi A: RESTful API dengan URL sesuai konvensi (`/api/v1/...`) | Route Handlers di bawah `/api/v1` (ADR-05) | Diimplementasikan dan di-commit lokal (C-4 sampai C-6); lulus uji HTTP lokal; belum di-deploy |
| Opsi A: Networking calls (Fetch/Axios) dari FE ke BE | Komponen antarmuka memanggil Route Handlers melalui HTTP untuk operasi tulis dan operasi bisnis (ADR-05), serta untuk pembacaan data bisnis (OD-18 Pilihan C, ADR-15) | Diimplementasikan dengan Axios (`lib/api-client.js`, C-4, lokal); diverifikasi terbatas melalui uji browser manual lokal 7SUP.5A-3B; alur Stock Out di browser belum diverifikasi; belum di-deploy |
| Opsi A: Menyimpan data ke database melalui API | Penulisan data melalui Route Handlers → Supabase (ADR-05, ADR-06, ADR-08) | Diimplementasikan untuk Stock In dan Stock Out (C-6, lokal); lulus uji HTTP lokal; belum di-deploy |

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
| Framework untuk One Man Developer (Next JS, dll.) | ADR-01 | Dipakai: Next.js 16 App Router (fondasi di `main` melalui PR #1; fitur di-commit lokal C-4 sampai C-6) |
| API dengan Express atau framework lain yang relevan (gaya FE & BE) | Route Handlers (ADR-05) | Belum terkonfirmasi apakah termasuk "framework lain yang relevan" |
| Git dan GitHub | Repository GitHub proyek | Dipakai: repository GitHub dengan PR #1 dan #2 di `main`; commit sejak C-1 (4 November 2026) masih lokal di branch `feat/supabase-foundation` dan belum di-push |
| CSS Framework dan Modern UI Components | Tailwind CSS v4 dan shadcn/ui (ADR-12) | Pilihan disetujui; dipakai pada antarmuka login, daftar dan detail material, serta Stock In dan Stock Out (C-4 sampai C-6, lokal); responsivitas belum diverifikasi |
| Schema Validation pada backend | Zod v4 (ADR-12) | Pilihan disetujui; diimplementasikan di `lib/validation/schemas.js` (C-4, lokal) |
| HTTP Library (Axios) | Axios (ADR-12) | Pilihan disetujui; diimplementasikan di `lib/api-client.js` (C-4, lokal) |
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

## Keputusan OD-18 — Pola Pembacaan Data Server-Side (ditutup melalui ADR-15)

**Status:** Diputuskan pada 1 November 2026 melalui ADR-15 (B2): **Pilihan C**. Pada irisan vertikal pertama, Client Component membaca seluruh data bisnis melalui Route Handler REST API. Belum diimplementasikan saat diputuskan; pembaruan 4 November 2026: diimplementasikan pada irisan Stock In dan Stock Out dan di-commit lokal (C-4 sampai C-6). Uraian di bawah dipertahankan sebagai jejak historis. Rekomendasi Pilihan B adalah rekomendasi saat OD-18 masih terbuka dan **tidak dipilih**.

**Yang sudah final (ADR-05, ADR-08):** REST API melalui Route Handlers; operasi tulis dan operasi bisnis dari antarmuka melewati Route Handlers; operasi atomik melalui PostgreSQL function dan Supabase RPC; Server Actions bukan pengganti REST API. OD-18 tidak membatalkan keputusan-keputusan tersebut.

**Pertanyaan:** Ketika halaman dirender di server (Server Component), bagaimana data dibaca?

| Pilihan | Cara kerja | Kelebihan | Kekurangan |
|---|---|---|---|
| A. Server Component memanggil Route Handler melalui HTTP | Server Component melakukan `fetch` ke `/api/v1/...` milik aplikasi | Satu jalur akses data; konsisten dengan dokumentasi API | Dokumentasi resmi Next.js menganjurkan Server Components membaca data langsung dari sumbernya, bukan melalui Route Handlers.¹ Untuk Server Component yang dirender on demand: ada tambahan satu lompatan HTTP antara proses render dan Route Handler sehingga lebih lambat,¹ dan cookie sesi pengguna perlu diteruskan dengan benar agar Route Handler mengenali pengguna. Untuk Server Component yang di-prerender saat build: build gagal, karena tidak ada server yang melayani request tersebut selama build.¹ Halaman yang bergantung pada sesi pengguna umumnya dirender on demand sehingga keterbatasan build ini tidak selalu berlaku, tetapi tetap perlu diwaspadai untuk halaman yang dapat di-prerender |
| B. Server Component dan Route Handler memakai data-access layer bersama | Modul khusus server berisi fungsi baca yang memakai Supabase client dengan sesi pengguna, sehingga Row Level Security tetap berlaku. Route Handler dan Server Component sama-sama memanggil modul ini | Tanpa lompatan HTTP tambahan; logika query dan otorisasi baca ditulis sekali | Ada dua pintu masuk ke data yang sama-sama harus memeriksa sesi dan role; perlu dipastikan penilai menerima pembacaan server-side ini bersama pemenuhan Opsi A |
| C. Seluruh pembacaan dari Client Component ke Route Handler | Halaman tidak membaca data di server; komponen di browser memanggil `/api/v1/...` | Penjelasan pemenuhan Opsi A paling sederhana; hanya satu pintu masuk data | Halaman tampil kosong atau loading sebelum data tiba; manfaat rendering di server tidak dipakai; lebih banyak state loading dan error di antarmuka |

**Rekomendasi historis (tidak dipilih): Pilihan B.**

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
- **Pembacaan data server-side (OD-18)** — tidak lagi relevan untuk irisan pertama, karena ADR-15 memilih Pilihan C (seluruh pembacaan melalui Route Handler).
- **Deadline** — progress report 1 November 2026 dan pengumpulan akhir 22 November 2026 dilaporkan pengguna dari pertemuan dengan tim Dicoding; belum terverifikasi dari dokumen tertulis.

## Status Dokumen Lain terhadap Keputusan Ini

| Dokumen | Status | Jadwal |
|---|---|---|
| `PRD-Smart-Warehouse-Firaza-Dicoding.md` | Selaras (PRD kanonik). Diperbarui 30 Oktober 2026: 83 FR termasuk Catatan Owner (FR-NOTE), FR-AUTH-04 dan FR-AUTH-05 sesuai ADR-11, serta OD-21 sampai OD-29. OD-15 ditandai diputuskan melalui ADR-12; OD-18 tercatat sebagai keputusan terbuka. Diperbarui 31 Oktober 2026: OD-29 sesuai ADR-13 dan amandemennya; desain ditetapkan, implementasi dan verifikasi keamanan tertunda. Pembaruan lanjutan: status fondasi otorisasi dan validasi sesi yang lulus uji lokal, serta prosedur admin sesuai ADR-14; OD-29 tetap terbuka. Pembaruan 1 November 2026: status implementasi dan uji lokal ADR-14 disinkronkan di header, FR-AUTH-02, FR-AUTH-04, catatan OD, dan baris OD-29; OD-29 dan G1–G3 tetap terbuka. Pembaruan lanjutan 1 November 2026: persetujuan G1–G3 dicatat di header, FR-AUTH-04, catatan OD, dan baris OD-29; G1 belum diimplementasikan; OD-29 tetap terbuka. Pembaruan 1 November 2026 (7SUP.4B-3I): status G1 terimplementasi dan teruji di lokal disinkronkan di header, ringkasan fondasi, FR-AUTH-02, FR-AUTH-04, catatan OD, dan baris OD-29; OD-29 tetap terbuka | Sinkronisasi dokumentasi selesai; uji penerimaan yang tersisa menunggu otorisasi terpisah |
| `PRD-Smart-Warehouse-Firaza-Professional.md` | Historis | Ditandai Gelombang 2a |
| `FEATURE-SPECIFICATION-Smart-Warehouse-Firaza.md` | Selaras. Diperbarui 30 Oktober 2026 beserta koreksi lanjutan: autentikasi Supabase Auth dan akun sesuai ADR-04 dan ADR-11, aturan inventori sesuai PRD, dan Catatan Owner (§12a). Seluruh fitur masih berstatus rencana; belum ada implementasi. Diperbarui 31 Oktober 2026: aturan bisnis autentikasi tentang OD-29 diselaraskan dengan ADR-13 dan amandemennya; pembaruan lanjutan: status fondasi otorisasi yang sudah diuji di lokal dan prosedur admin sesuai ADR-14. Pembaruan 1 November 2026: status implementasi dan uji lokal ADR-14 disinkronkan di header dan aturan bisnis autentikasi (butir 3 dan 5); OD-29 dan G1–G3 tetap terbuka. Pembaruan lanjutan 1 November 2026: persetujuan G1–G3 dicatat di header dan butir 5; G1 belum diimplementasikan; OD-29 tetap terbuka. Pembaruan 1 November 2026 (7SUP.4B-3I): status G1 terimplementasi dan teruji di lokal disinkronkan di header, ringkasan fondasi, dan butir 3 serta 5; OD-29 tetap terbuka | Sinkronisasi dokumentasi selesai; uji penerimaan yang tersisa menunggu otorisasi terpisah |
| `DATABASE-DESIGN-Smart-Warehouse-Firaza.md` | Selaras. Diperbarui 30 Oktober 2026 beserta koreksi lanjutan: Supabase PostgreSQL, SQL migration dengan Supabase CLI (ADR-07, ADR-10), pola keamanan RPC (ADR-09), dan konsep Catatan Owner (§4.10). OD-15 ditandai diputuskan melalui ADR-12 di §15, tanpa dampak pada skema. Diperbarui 31 Oktober 2026: baseline keamanan database, schema `app_private`, `profiles.deactivated_at`, dan aturan migration beserta bukti atomicity sesuai ADR-13; desain OD-29 (§12.5) dan uji penerimaannya (§14.5), termasuk usulan `profiles.session_valid_after` yang wajib diuji integrasi. Pembaruan lanjutan 31 Oktober 2026: langkah 0 dan 1 §14.2 diterapkan sebagai dua SQL migration di Supabase lokal dan diuji integrasi lokal; desain prosedur admin, tabel `app_private.account_lifecycle_events` (§4.11), dan status uji §14.5 sesuai ADR-14; koreksi kontrak idempotency (`request_fingerprint`, urutan replay, dan expected state sebelum `NOOP`; uji 28–39). Pembaruan 1 November 2026: migration admin diterapkan dan diuji di lokal; status uji §14.5, temuan urutan ban (§12.5.4), dan keputusan terbuka G1–G3 disinkronkan. Pembaruan lanjutan 1 November 2026: persetujuan G1–G3 dicatat; perilaku terpasang dan target G1 dibedakan (§12.5.6), G2 di §12.5.5, runbook G3 di §12.5.7, dan regresi G1 direncanakan (§14.5 #40, PLANNED). Pembaruan 1 November 2026 (7SUP.4B-3I): migration keempat (langkah 1b §14.2) dan perilaku G1 yang terpasang dicatat; status §14.5 #21, #27, #31, dan #40 disinkronkan. Tabel bisnis belum diimplementasikan; pembatasan kolom `categories` (§12.4) masih mengikuti OD-19; ERD belum memuat Catatan Owner | Sinkronisasi dokumentasi selesai; desain final menunggu keputusan terbuka |
| `PROJECT-CONTEXT-Smart-Warehouse-Firaza.md` | Masih memuat stack lama | Gelombang 2a |
| `API-DOCUMENTATION`, `CODING-GUIDELINE`, `DEVELOPMENT-TASK`, `ENVIRONMENT-CONFIGURATION`, `USER-FLOW`, `PROJECT-MEMORY`, `README-Smart-Warehouse-Firaza.md`, AI guides, GitHub workflow guide | Masih memuat stack lama (React + Vite, Express, Prisma, JWT) sebagian atau seluruhnya | Gelombang 2b |
| `PRD-TYPESCRIPT-VARIANT-Smart-Warehouse-Firaza.md`, `SMART-WAREHOUSE-FIRAZA-JAVASCRIPT-VS-TYPESCRIPT-COMPARISON.md` | Tidak aktif (ADR-02) | Penandaan di file: Gelombang 2b |

## Format Pencatatan Keputusan Baru

Setiap keputusan teknologi baru ditambahkan sebagai ADR baru dengan nomor berikutnya (ADR-15 dan seterusnya), berisi:

1. Tanggal keputusan.
2. Keputusan yang disetujui.
3. Sumber (label sesuai legenda PRD).
4. Alasan dan trade-off.
5. Dampak pada struktur proyek dan dokumentasi.
6. Tindak lanjut yang perlu dilakukan.

OPEN DECISION tidak boleh diperlakukan sebagai keputusan final sebelum disetujui dan dicatat sebagai ADR.
