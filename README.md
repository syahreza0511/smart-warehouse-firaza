# Smart Warehouse Firaza

> **Status (11 November 2026):** Web MVP untuk capstone Dicoding (Full-Stack Web Developer, ID grup **DB15-I015**). Autentikasi dan peran, manajemen material, Stock In dan Stock Out, Stock Opname, dashboard, dan histori transaksi per material sudah diimplementasikan dan teruji di Supabase **lokal** yang terisolasi. Aplikasi **belum di-deploy**; migration 6 dan 7 belum diterapkan ke Supabase cloud, dan belum ada verifikasi produksi.

Smart Warehouse Firaza adalah aplikasi web untuk membantu bisnis hampers dan personalized gift Firaza mengelola persediaan bahan baku: memantau kondisi stok di dashboard, mengelola data material, mencatat barang masuk (Stock In) dan barang keluar (Stock Out), menjalankan Stock Opname, serta menelusuri histori transaksi. Akses dibagi untuk Owner dan Staff Warehouse.

## Fitur yang sudah diimplementasikan

| Fitur | Keterangan |
|---|---|
| Login dan logout | Melalui REST API aplikasi dengan Supabase Auth. Sesi disimpan di cookie `HttpOnly`. Tidak ada registrasi publik; akun disiapkan developer. |
| Pembagian peran | `STAFF_WAREHOUSE` mengelola material, mencatat Stock In dan Stock Out, dan menjalankan Stock Opname. `OWNER` hanya membaca. Peran dibaca dari database dan ditegakkan di API serta di database. |
| Dashboard | Empat ringkasan untuk material aktif (total, stok normal, stok rendah, stok habis), dihitung tepat oleh database, dan tabel material yang perlu perhatian (stok habis lalu stok rendah). Material arsip tidak dihitung. |
| Daftar dan detail material | Nama, kategori, satuan, stok saat ini, stok minimum, dan status stok (Normal, Stok Rendah, Stok Habis); tab material aktif dan arsip. Daftar ini juga menjadi gambaran lengkap kondisi inventori. |
| Manajemen material | Tambah dan ubah (nama, kategori, satuan, stok minimum), arsip dan aktifkan kembali dengan alasan, hapus permanen hanya untuk material tanpa riwayat. Satuan terkunci setelah ada transaksi atau item Stock Opname. Stok tidak dapat diubah dari form material. |
| Kategori | Hanya dibaca di MVP; kategori disiapkan pengelola sistem (OD-19). |
| Stock In dan Stock Out | Menambah atau mengurangi stok dengan jumlah bilangan bulat positif dan catatan opsional; Stock Out ditolak bila stok tidak mencukupi. Stok awal dicatat sebagai Stock In dengan catatan "Saldo awal" (OD-17). |
| Stock Opname | Sesi dengan material yang dipilih saat sesi dibuat (OD-01); material terpilih dibekukan sampai sesi diposting atau dibatalkan. Hanya pembuat sesi yang mengisi hasil hitung dan memposting; Staff Warehouse lain dapat membatalkan dengan alasan (OD-02/16). Posting atomik: transaksi Penyesuaian hanya untuk selisih tidak nol. |
| Histori | Histori transaksi terbaru dan riwayat arsip per material, dengan pelaku ditampilkan sebagai "Anda" atau "Pengguna lain" (OD-28). |
| Anti transaksi ganda | Stock In, Stock Out, dan pembuatan sesi Stock Opname (OD-20) memakai `Idempotency-Key`: pengiriman ulang dengan key dan data yang sama tidak mencatat ulang. Posting dan pembatalan sesi ditolak bila sesi sudah tidak aktif. Tidak ada pengiriman ulang otomatis; bila hasil tidak pasti, antarmuka meminta pengguna memeriksa atau mengirim ulang dengan key yang sama. |

Belum diimplementasikan (ditunda dari MVP): koreksi transaksi (`REVERSAL`), laporan transaksi dan ekspor, pencarian dan filter, histori transaksi global, Catatan Owner, manajemen kategori dari aplikasi, antarmuka manajemen akun, dan fitur AI. Rencana lengkapnya ada di [PRD](docs/PRD-Smart-Warehouse-Firaza-Dicoding.md).

## Teknologi

| Lapisan | Teknologi |
|---|---|
| Framework | Next.js 16 (App Router, Route Handlers), React 19, JavaScript |
| UI | Tailwind CSS v4, shadcn/ui (Radix UI) |
| Validasi | Zod v4 (dipakai bersama di form dan API) |
| HTTP client | Axios |
| Database dan autentikasi | Supabase: PostgreSQL 17 dan Supabase Auth, melalui `@supabase/ssr` dan `@supabase/supabase-js` |
| Tooling | Supabase CLI (devDependency), GitHub Actions (unit test dan build pada setiap pull request ke `main`) |

## Arsitektur singkat

```
Browser (Client Component)
  └─ Axios ─▶ REST API Next.js  /api/v1/*   (Route Handlers, validasi Zod, cek origin)
                └─ Supabase client dengan sesi pengguna
                     └─ PostgreSQL: RLS + RPC (stock movement, material, Stock Opname: otorisasi, saldo, idempotency)
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
| `GET` | `/api/v1/dashboard` | Ringkasan stok material aktif dan material yang perlu perhatian (maksimal 50 baris, beserta totalnya) |
| `GET` | `/api/v1/categories` | Daftar kategori |
| `GET` | `/api/v1/materials?archived=true\|false` | Daftar material aktif (default) atau arsip |
| `POST` | `/api/v1/materials` | Body `{ categoryId, name, unit, minimumStock }`. Hanya Staff Warehouse |
| `GET` | `/api/v1/materials/{id}` | Detail material beserta petunjuk `unitLocked` dan `deletable` |
| `PUT` | `/api/v1/materials/{id}` | Body seperti `POST`. Hanya Staff Warehouse |
| `DELETE` | `/api/v1/materials/{id}` | Hapus permanen material tanpa riwayat. Hanya Staff Warehouse |
| `POST` | `/api/v1/materials/{id}/archive` | Body `{ reason }`. Hanya Staff Warehouse |
| `POST` | `/api/v1/materials/{id}/reactivate` | Body `{ reason }`. Hanya Staff Warehouse |
| `GET` | `/api/v1/materials/{id}/status-events?limit=20` | Riwayat arsip dan aktif kembali |
| `GET` | `/api/v1/materials/{id}/transactions?limit=20` | Histori transaksi terbaru (limit 1–100) |
| `POST` | `/api/v1/stock-movements` | Header `Idempotency-Key: <uuid>`. Body `{ materialId, type: "STOCK_IN" \| "STOCK_OUT", quantity, notes? }`. Hanya Staff Warehouse |
| `GET` | `/api/v1/stock-opnames?status=ACTIVE\|POSTED\|CANCELLED` | 100 sesi terbaru |
| `POST` | `/api/v1/stock-opnames` | Header `Idempotency-Key: <uuid>`. Body `{ materialIds }`. Hanya Staff Warehouse |
| `GET` | `/api/v1/stock-opnames/{id}` | Detail sesi, item, selisih, dan petunjuk hak akses |
| `PUT` | `/api/v1/stock-opnames/{id}/counts` | Body `{ counts: [{ itemId, countedStock }] }`; nilai menggantikan hitungan sebelumnya. Hanya pembuat sesi |
| `POST` | `/api/v1/stock-opnames/{id}/post` | Body `{}`. Hanya pembuat sesi |
| `POST` | `/api/v1/stock-opnames/{id}/cancel` | Body `{ reason }`. Staff Warehouse mana pun |

Respons error berbentuk `{ "error": { "code", "message", "fields"? } }`. Semua permintaan yang mengubah data hanya menerima body JSON (`Content-Type: application/json`) dari origin yang sama; `DELETE` dan logout juga hanya menerima permintaan dari origin yang sama.

Pengiriman ulang pembuatan sesi Stock Opname dengan key dan daftar material yang sama mengembalikan respons pembuatan pertama (termasuk status `ACTIVE` saat itu), walaupun sesi sudah diposting atau dibatalkan; status terkini selalu dibaca dari `GET /api/v1/stock-opnames/{id}`.

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

Perintah ini menjalankan Supabase di Docker dan menerapkan ketujuh migration di `supabase/migrations/`. Setelah selesai, `npx supabase status -o env` menampilkan URL API lokal (`API_URL`) dan kunci-kuncinya, antara lain `PUBLISHABLE_KEY` dan `SERVICE_ROLE_KEY`. Jangan bagikan atau commit output tersebut.

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

Registrasi publik dinonaktifkan dan aplikasi belum memiliki antarmuka admin, jadi akun dan kategori disiapkan developer di Supabase **lokal**. Material dapat dibuat Staff Warehouse melalui aplikasi. Gunakan data sintetis, bukan data pribadi.

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

3. Buat kategori demo di sesi SQL yang sama (kategori hanya dibaca oleh aplikasi, OD-19):

   ```sql
   insert into public.categories (name) values ('[DEMO] Kemasan');
   ```

   Material kemudian dibuat melalui halaman "Tambah material" (stok awal 0), dan stok awal dicatat sebagai Stock In dengan catatan "Saldo awal", sehingga saldo selalu sesuai dengan histori transaksi.

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

Unit test berjalan tanpa jaringan maupun database dan dijalankan CI di GitHub Actions sebelum build. Uji integrasi HTTP dan SQL ada di `tests/integration/`; uji tersebut mengubah state lokal (sesi Auth, akun demo, dan pada sebagian harness data inventori sintetis), sehingga hanya dijalankan dengan sengaja terhadap stack Supabase uji yang terisolasi dan tidak dijalankan CI. Petunjuknya ada di [tests/README.md](tests/README.md).

Hasil verifikasi (semuanya **lokal**, data sintetis):

- 4 November 2026, Stock In dan Stock Out (stack uji sekali pakai): kelima migration awal dari database kosong; unit test 30/30, uji API 46/46, harness HTTP 63/63, uji browser otomatis (Chrome) 34/34, probe hak akses database 14/14, uji batas SQL lulus; atribut cookie diverifikasi.
- 10–11 November 2026, stack Supabase lokal terisolasi (port loopback saja): migration 6 dan 7 diterapkan satu per satu dengan verifikasi skema dan hak akses; harness HTTP Material CRUD 144/144 dan Stock Opname 303/303 (termasuk uji konkurensi nyata); QA browser Chrome untuk tiga peran dan ukuran layar 390, 768, dan 1280 piksel; smoke test dashboard 36/36 dengan angka yang sama dengan database.
- Unit test saat ini: 163/163.

Rincian dan batasnya dicatat di [STACK-DECISION-LOG](docs/STACK-DECISION-LOG.md) (ADR-15, ADR-16, dan status 11 November 2026) dan [DATABASE-DESIGN §15](docs/DATABASE-DESIGN-Smart-Warehouse-Firaza.md).

## Keterbatasan saat ini

- Belum di-deploy; migration 6 dan 7 belum diterapkan ke Supabase cloud, dan belum ada verifikasi melalui HTTPS maupun di produksi.
- Responsivitas diverifikasi di Chrome (390, 768, 1280 piksel); browser lain belum diuji.
- Daftar material tidak memakai paginasi dan dibatasi `max_rows` PostgREST (1000 baris); dashboard tidak memakai daftar ini untuk total. Tabel perhatian di dashboard menampilkan maksimal 50 baris beserta totalnya, dan daftar sesi Stock Opname menampilkan 100 sesi terbaru.
- Draf hasil hitung Stock Opname yang belum disimpan dipulihkan hanya di tab yang sama (sessionStorage, berlaku 8 jam) dan tetap harus disimpan atau dibuang; tidak ada sinkronisasi antar tab.
- Kebijakan yang belum diputuskan: perubahan metadata material (nama, kategori, stok minimum) saat material sedang dibekukan Stock Opname saat ini diizinkan, dan perubahan metadata bersamaan oleh dua Staff memakai "perubahan terakhir menang".
- Alasan pembatalan sesi Stock Opname dirapikan (spasi di awal dan akhir dibuang) oleh API, tetapi tidak oleh fungsi database bila dipanggil langsung (L-7).
- Beberapa temuan keamanan berprioritas rendah masih terbuka, misalnya pembatasan percobaan login di tingkat aplikasi (STACK-DECISION-LOG ADR-15, F-02 sampai F-08).
- Fitur yang ditunda tercantum di bagian "Fitur yang sudah diimplementasikan".

## Struktur proyek

```
app/                 Halaman (/login, /dashboard, /materials, /stock-opnames) dan REST API (app/api/v1)
components/          Komponen antarmuka: form material, Stock In dan Stock Out, Stock Opname
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
