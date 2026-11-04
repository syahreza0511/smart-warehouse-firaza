# Smart Warehouse Firaza

> **Status:** MVP dalam pengembangan untuk capstone Dicoding (Full-Stack Web Developer). Irisan autentikasi, material, Stock In, dan Stock Out sudah berjalan dan teruji di lingkungan **lokal**. Aplikasi **belum di-deploy**, dan belum ada verifikasi di Supabase cloud.

Smart Warehouse Firaza adalah aplikasi web untuk membantu bisnis hampers dan personalized gift Firaza mengelola persediaan bahan baku: melihat stok material, mencatat barang masuk (Stock In) dan barang keluar (Stock Out), serta menelusuri histori transaksi. Akses dibagi untuk Owner dan Staff Warehouse.

## Fitur yang sudah diimplementasikan

| Fitur | Keterangan |
|---|---|
| Login dan logout | Melalui REST API aplikasi dengan Supabase Auth. Sesi disimpan di cookie `HttpOnly`. Tidak ada registrasi publik; akun disiapkan developer. |
| Pembagian peran | `STAFF_WAREHOUSE` dapat melihat material dan mencatat Stock In dan Stock Out. `OWNER` hanya dapat melihat. Peran dibaca dari database dan ditegakkan di API serta di database. |
| Daftar material | Nama, kategori, satuan, stok saat ini, stok minimum, dan status stok (Normal, Stok Rendah, Stok Habis). |
| Detail material | Stok saat ini, status, dan 20 transaksi terbaru (jenis, jumlah, catatan, waktu, dan apakah dicatat oleh Anda). |
| Stock In | Menambah stok dengan validasi jumlah (bilangan bulat positif) dan catatan opsional. |
| Stock Out | Mengurangi stok; ditolak bila stok tidak mencukupi. |
| Anti transaksi ganda | Setiap transaksi memakai `Idempotency-Key`. Pengiriman ulang dengan key dan data yang sama tidak mencatat transaksi kedua. Bila hasil pengiriman tidak pasti (misalnya koneksi terputus), antarmuka hanya mengizinkan kirim ulang dengan key dan data yang sama. |

Belum diimplementasikan: manajemen kategori, CRUD material, koreksi transaksi, Stock Opname, dashboard, laporan, Catatan Owner, dan antarmuka manajemen akun. Rencana lengkapnya ada di [PRD](docs/PRD-Smart-Warehouse-Firaza-Dicoding.md).

## Teknologi

| Lapisan | Teknologi |
|---|---|
| Framework | Next.js 16 (App Router, Route Handlers), React 19, JavaScript |
| UI | Tailwind CSS v4, shadcn/ui (Radix UI) |
| Validasi | Zod v4 (dipakai bersama di form dan API) |
| HTTP client | Axios |
| Database dan autentikasi | Supabase: PostgreSQL 17 dan Supabase Auth, melalui `@supabase/ssr` dan `@supabase/supabase-js` |
| Tooling | Supabase CLI (devDependency), GitHub Actions (build pada setiap pull request ke `main`) |

## Arsitektur singkat

```
Browser (Client Component)
  └─ Axios ─▶ REST API Next.js  /api/v1/*   (Route Handlers, validasi Zod, cek origin)
                └─ Supabase client dengan sesi pengguna
                     └─ PostgreSQL: RLS + RPC post_stock_movement (otorisasi, saldo, idempotency)
```

- Browser tidak pernah memanggil Supabase langsung, dan kunci Supabase tidak dikirim ke browser.
- Saldo stok, penolakan stok tidak cukup, otorisasi peran, dan idempotency ditegakkan di PostgreSQL. Histori transaksi bersifat append-only.
- Role API tidak memiliki hak `INSERT`, `UPDATE`, atau `DELETE` langsung pada tabel bisnis; semua perubahan stok lewat RPC.

### REST API

| Method | Endpoint | Keterangan |
|---|---|---|
| `POST` | `/api/v1/auth/login` | Body `{ email, password }` |
| `POST` | `/api/v1/auth/logout` | Mengakhiri sesi saat ini |
| `GET` | `/api/v1/auth/session` | Pengguna yang sedang masuk beserta perannya |
| `GET` | `/api/v1/materials` | Daftar material aktif |
| `GET` | `/api/v1/materials/{id}` | Detail material |
| `GET` | `/api/v1/materials/{id}/transactions?limit=20` | Histori transaksi terbaru (limit 1–100) |
| `POST` | `/api/v1/stock-movements` | Header `Idempotency-Key: <uuid>`. Body `{ materialId, type: "STOCK_IN" \| "STOCK_OUT", quantity, notes? }`. Hanya Staff Warehouse |

Respons error berbentuk `{ "error": { "code", "message", "fields"? } }`. Login dan transaksi stok hanya menerima body JSON (`Content-Type: application/json`) dari origin yang sama; logout juga hanya menerima permintaan dari origin yang sama.

## Menjalankan secara lokal

### Prasyarat

- Node.js 24 dan npm (versi yang dipakai CI).
- Docker Desktop yang sedang berjalan (untuk Supabase lokal).
- Git.

### 1. Instal dependency

```bash
git clone https://github.com/syahreza0511/smart-warehouse-firaza.git
cd smart-warehouse-firaza
npm ci
```

### 2. Jalankan Supabase lokal

```bash
npx supabase start
```

Perintah ini menjalankan Supabase di Docker dan menerapkan kelima migration di `supabase/migrations/`. Setelah selesai, `npx supabase status -o env` menampilkan URL API lokal (`API_URL`) dan kunci-kuncinya, antara lain `PUBLISHABLE_KEY` dan `SERVICE_ROLE_KEY`. Jangan bagikan atau commit output tersebut.

### 3. Atur environment variable

```bash
cp .env.example .env.local
```

Isi `.env.local`:

| Variable | Nilai lokal |
|---|---|
| `SUPABASE_URL` | `http://127.0.0.1:54321` |
| `SUPABASE_PUBLISHABLE_KEY` | Nilai `PUBLISHABLE_KEY` dari `npx supabase status -o env` |
| `AUTH_COOKIE_SECURE` | `false`, karena aplikasi lokal dilayani lewat HTTP |

- Jangan pernah memasukkan service role key atau secret key ke environment aplikasi.
- `.env.local` diabaikan Git. Jangan commit file environment yang berisi nilai asli.
- Di deployment HTTPS, biarkan `AUTH_COOKIE_SECURE` tidak di-set (atau `true`). Cookie autentikasi selalu memakai atribut `Secure` kecuali nilainya persis `false`.

### 4. Siapkan akun dan data demo

Registrasi publik dinonaktifkan dan aplikasi belum memiliki antarmuka admin, jadi akun dan material awal disiapkan developer di Supabase **lokal**. Gunakan data sintetis, bukan data pribadi.

1. Buat pengguna Auth melalui Auth Admin API lokal. Isi variabel shell `SERVICE_ROLE_KEY` dengan nilai `SERVICE_ROLE_KEY` dari `npx supabase status -o env`; kunci ini hanya untuk perintah admin di terminal Anda, bukan untuk aplikasi.

   ```bash
   curl -X POST http://127.0.0.1:54321/auth/v1/admin/users \
     -H "apikey: $SERVICE_ROLE_KEY" -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
     -H "Content-Type: application/json" \
     -d '{"email":"staff@example.test","password":"<password-anda>","email_confirm":true}'
   ```

   Catat `id` pengguna dari respons. Ulangi untuk akun Owner.

2. Buat profil dan peran melalui function admin, dari sesi SQL sebagai `postgres`:

   ```bash
   docker exec -it supabase_db_Smart-Warehouse-Firaza-GitHub-Ready psql -U postgres -d postgres
   ```

   ```sql
   select app_private.admin_provision_profile(
     '<user-id>'::uuid, 'staff@example.test', 'Staff Demo',
     'STAFF_WAREHOUSE', 'developer', 'Akun demo lokal', gen_random_uuid());
   ```

   Untuk Owner, gunakan peran `'OWNER'`.

3. Buat kategori dan material demo (stok awal 0) di sesi SQL yang sama:

   ```sql
   insert into public.categories (name) values ('[DEMO] Kemasan');
   insert into public.materials (category_id, name, unit, minimum_stock)
   select id, '[DEMO] Kardus Medium', 'pcs', 5 from public.categories where name = '[DEMO] Kemasan';
   ```

   Stok kemudian diisi melalui Stock In di aplikasi, sehingga saldo selalu sesuai dengan histori transaksi.

Rincian prosedur admin ada di [DATABASE-DESIGN §12.5](docs/DATABASE-DESIGN-Smart-Warehouse-Firaza.md).

### 5. Jalankan aplikasi

```bash
npm run dev
```

Buka `http://localhost:3000`, lalu masuk dengan akun yang sudah dibuat. Untuk production build: `npm run build` lalu `npm run start`.

## Pengujian

```bash
node --test 'tests/unit/*.test.mjs'
```

Unit test berjalan tanpa jaringan maupun database. Uji integrasi HTTP dan SQL ada di `tests/integration/`; uji tersebut mengubah state lokal (sesi Auth dan, pada fase tertentu, transaksi stok), sehingga hanya dijalankan dengan sengaja terhadap lingkungan uji. Petunjuknya ada di [tests/README.md](tests/README.md).

Hasil verifikasi terakhir (4 November 2026, semuanya **lokal**, pada stack Supabase uji sekali pakai dengan data sintetis):

- Kelima migration berhasil diterapkan dari database kosong.
- Unit test 30/30, uji API 46/46, harness HTTP 63/63, uji browser otomatis (Chrome) 34/34, probe hak akses database 14/14, dan uji batas SQL (SQL-01 sampai SQL-03) lulus.
- Atribut cookie (`Secure`, `HttpOnly`, `SameSite=Lax`) diverifikasi untuk konfigurasi lokal dan konfigurasi default.

Rincian dan batasnya dicatat di [STACK-DECISION-LOG](docs/STACK-DECISION-LOG.md) (ADR-15 dan ADR-16) dan [DATABASE-DESIGN §15](docs/DATABASE-DESIGN-Smart-Warehouse-Firaza.md). CI di GitHub Actions saat ini hanya menjalankan build.

## Keterbatasan saat ini

- Belum di-deploy; belum ada verifikasi di Supabase cloud maupun melalui HTTPS.
- Tampilan baru diuji pada satu ukuran layar desktop di Chrome; responsivitas di berbagai ukuran layar belum diverifikasi.
- Teks halaman beranda (`/`) masih hanya menyebut Stock In; Stock Out sudah tersedia di halaman detail material.
- Beberapa temuan keamanan berprioritas rendah masih terbuka, misalnya pembatasan percobaan login di tingkat aplikasi (STACK-DECISION-LOG ADR-15, F-02 sampai F-08).
- Fitur yang belum diimplementasikan tercantum di bagian "Fitur yang sudah diimplementasikan".

## Struktur proyek

```
app/                 Halaman (/login, /materials, /materials/[id]) dan REST API (app/api/v1)
components/          Komponen antarmuka, form Stock In dan Stock Out
lib/                 Klien API, validasi Zod, dan modul server (Supabase, auth, HTTP)
supabase/            Konfigurasi Supabase lokal dan migration SQL
tests/               Unit test dan harness uji integrasi
docs/                Dokumentasi produk, desain, dan keputusan teknis
```

## Dokumentasi

Dokumen acuan yang aktif:

- [PRD](docs/PRD-Smart-Warehouse-Firaza-Dicoding.md): kebutuhan produk dan aturan bisnis.
- [FEATURE-SPECIFICATION](docs/FEATURE-SPECIFICATION-Smart-Warehouse-Firaza.md): spesifikasi fitur.
- [STACK-DECISION-LOG](docs/STACK-DECISION-LOG.md): keputusan teknologi, status implementasi, dan pemenuhan checklist tech stack capstone (bagian "Kepatuhan Checklist Tech Stack").
- [DATABASE-DESIGN](docs/DATABASE-DESIGN-Smart-Warehouse-Firaza.md): desain database, keamanan, dan bukti uji.

Dokumen lain di `docs/` adalah bahan perencanaan awal. Sebagian masih menggambarkan rancangan sebelum keputusan teknologi (misalnya Express, Prisma, atau JWT). Bila berbeda, yang berlaku adalah STACK-DECISION-LOG.

## Keamanan

- Jangan commit `.env.local`, token, password, API key, credential database, atau file rahasia lainnya. `.env.example` hanya berisi placeholder.
- Service role key dan secret key Supabase tidak boleh dipakai oleh aplikasi; keduanya hanya untuk tugas admin developer.
- Gunakan data sintetis untuk pengembangan dan pengujian.

## Alur kerja Git

Pengembangan dilakukan di feature branch, lalu digabungkan ke `main` melalui pull request setelah CI build lulus dan pemilik proyek menyetujuinya.
