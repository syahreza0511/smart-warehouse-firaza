# Stack Decision Log — Smart Warehouse Firaza

Dokumen ini mencatat keputusan arsitektur yang perlu dikonfirmasi sebelum implementasi. Status di bawah merefleksikan kondisi saat repository awal disiapkan, bukan keputusan final.

## Keputusan yang masih terbuka

| Topik | Opsi yang sedang dipertimbangkan | Status |
|---|---|---|
| Framework frontend/full-stack | Next.js atau React + Vite | Menunggu diskusi advisor |
| Backend | Next.js server capabilities atau Express.js terpisah | Menunggu diskusi advisor |
| Database hosting | PostgreSQL lokal/managed PostgreSQL, termasuk Supabase | Menunggu diskusi advisor |
| ORM / akses data | Prisma atau Supabase client sesuai arsitektur | Menunggu diskusi advisor |
| Authentication | JWT yang diimplementasikan aplikasi atau Supabase Auth | Menunggu diskusi advisor |
| Bahasa | JavaScript atau TypeScript | Menunggu diskusi advisor |
| Deployment | Platform aplikasi dan database yang sesuai kriteria capstone | Menunggu diskusi advisor |

## Catatan penting

- PostgreSQL adalah database relasional; Supabase menyediakan PostgreSQL terkelola beserta layanan tambahan.
- Memilih Supabase untuk database tidak otomatis mengharuskan penggunaan Supabase Auth.
- Jangan menerapkan dua sistem autentikasi sekaligus tanpa kebutuhan dan desain yang jelas.
- Jika menggunakan Supabase client untuk akses data dari browser, kebijakan RLS dan hak akses harus dirancang dengan benar.
- Jika memakai Prisma, koneksi database dan kredensial tetap dikelola di sisi server.
- Keputusan akhir perlu mempertimbangkan kriteria capstone, kemampuan developer, keamanan, biaya, deployment, dan waktu pengerjaan.

## Format pencatatan keputusan

Untuk setiap keputusan final, tambahkan:
1. Tanggal keputusan.
2. Keputusan yang disetujui.
3. Alasan dan trade-off.
4. Dampak pada struktur project dan dokumentasi.
5. Tindak lanjut yang perlu dilakukan.

Jangan menganggap opsi sebagai keputusan final sebelum dikonfirmasi dengan advisor.
