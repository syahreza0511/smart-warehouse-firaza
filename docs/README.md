# Dokumentasi Smart Warehouse Firaza

ID capstone **B26B15J014**. Peta dokumen ini membedakan penjelasan aplikasi yang tersedia saat ini dari arsip perencanaan dan riwayat pengembangan.

## Mulai dari sini

| Kebutuhan pembaca | Acuan |
| --- | --- |
| Membuka demo, memahami fitur, menjalankan aplikasi lokal, atau melihat kontrak REST API | [README utama](../README.md) |
| Melihat cakupan implementasi, keputusan yang sudah berubah, bukti pengujian dan batasnya | [Status implementasi per 17 November 2026](STATUS-IMPLEMENTASI.md) |
| Menjalankan harness pengujian integrasi lokal | [Panduan pengujian](../tests/README.md) |
| Memeriksa struktur database yang diimplementasikan | [Migration SQL](../supabase/migrations/) |
| Memeriksa konfigurasi environment aplikasi | [Contoh environment](../.env.example) dan [petunjuk lokal di README](../README.md#menjalankan-secara-lokal) |

Demo reviewer tersedia di **https://firaza-reviewer.vercel.app**. Akun Owner dan Staff diserahkan melalui informasi akses submission. Repositori tidak memuat password reviewer. Pedoman penggunaan PDF disertakan pada submission capstone.

## Cara membaca arsip

Dokumen di bawah berasal dari tahap perencanaan dan pembaruan pengembangan sebelumnya. Isinya dipertahankan agar alasan keputusan dan perubahan arah tetap dapat ditelusuri. Penanda arsip di awal setiap dokumen menjelaskan kedudukannya.

Istilah seperti *kanonik*, *keputusan final*, atau *belum di-deploy* di dalam arsip berlaku pada periode catatan tersebut. Sebagian rancangan belum diimplementasikan, sebagian sudah berubah, dan sebagian fitur dibatalkan. Arsip tidak menjadi bukti bahwa semua fitur yang disebut sudah tersedia. Untuk kondisi aplikasi per checkpoint terbaru, baca [status implementasi](STATUS-IMPLEMENTASI.md) dan periksa source code yang dirujuk.

ID proyek yang digunakan untuk submission adalah **B26B15J014**. ID lain yang masih muncul pada arsip merupakan metadata lama. Nama **Stock Opname** tetap benar untuk route, API dan database, sedangkan antarmuka pengguna memakai **Pemeriksaan Stok**.

### Kebutuhan dan desain

| Dokumen arsip | Isi dan batas pemakaian |
| --- | --- |
| [PRD Dicoding](PRD-Smart-Warehouse-Firaza-Dicoding.md) | Kebutuhan dan keputusan produk pada tahap perencanaan serta catatan implementasi terdahulu |
| [Spesifikasi fitur](FEATURE-SPECIFICATION-Smart-Warehouse-Firaza.md) | Rincian perilaku yang dirancang, termasuk fitur yang akhirnya ditunda atau dibatalkan |
| [Desain database](DATABASE-DESIGN-Smart-Warehouse-Firaza.md) | Rancangan entitas dan aturan database. Struktur yang diterapkan diperiksa melalui migration SQL |
| [ERD PNG](ERD-Smart-Warehouse-Firaza.png) | Gambar rancangan lama, bukan diagram terverifikasi untuk skema demo terkini |
| [Alur pengguna](USER-FLOW-Smart-Warehouse-Firaza.md) | Alur yang direncanakan. Untuk langkah penggunaan versi sekarang, gunakan pedoman PDF submission |
| [Dokumentasi API lama](API-DOCUMENTATION-Smart-Warehouse-Firaza.md) | Rancangan endpoint terdahulu. Kontrak endpoint yang tersedia tercantum pada README utama |
| [Task pengembangan](DEVELOPMENT-TASK-Smart-Warehouse-Firaza.md) | Urutan pekerjaan awal, bukan checklist penyelesaian submission terkini |

### Keputusan teknologi dan konteks awal

| Dokumen arsip | Isi dan batas pemakaian |
| --- | --- |
| [Log keputusan stack](STACK-DECISION-LOG.md) | Riwayat keputusan dan bukti pada checkpoint terdahulu |
| [Konteks proyek](PROJECT-CONTEXT-Smart-Warehouse-Firaza.md) | Konteks awal, termasuk pilihan stack sebelum implementasi final |
| [Memori proyek](PROJECT-MEMORY-SMART-WAREHOUSE-FIRAZA.md) | Catatan konteks dan status terdahulu |
| [README awal](README-Smart-Warehouse-Firaza.md) | Gambaran dan setup rancangan awal. Gunakan README utama untuk menjalankan aplikasi |
| [Konfigurasi environment lama](ENVIRONMENT-CONFIGURATION-Smart-Warehouse-Firaza.md) | Contoh konfigurasi dari rancangan awal. Gunakan `.env.example` pada root untuk konfigurasi aplikasi saat ini |
| [PRD Professional](PRD-Smart-Warehouse-Firaza-Professional.md) | Rancangan produk terdahulu |
| [Varian TypeScript](PRD-TYPESCRIPT-VARIANT-Smart-Warehouse-Firaza.md) | Alternatif yang pernah dipertimbangkan, bukan bahasa implementasi aplikasi ini |
| [Perbandingan JavaScript dan TypeScript](SMART-WAREHOUSE-FIRAZA-JAVASCRIPT-VS-TYPESCRIPT-COMPARISON.md) | Pertimbangan pemilihan bahasa pada tahap perencanaan |

### Panduan proses pengembangan awal

| Dokumen arsip | Isi dan batas pemakaian |
| --- | --- |
| [Coding guideline](CODING-GUIDELINE-Smart-Warehouse-Firaza.md) | Panduan proses dan struktur yang disusun saat perencanaan |
| [GitHub workflow](GITHUB-WORKFLOW-GUIDE-Smart-Warehouse-Firaza.md) | Panduan Git awal. Workflow CI yang berjalan ada di `.github/workflows/ci.yml` |
| [Checklist setup repository](GITHUB-REPOSITORY-SETUP-CHECKLIST.md) | Checklist pembuatan repository awal, bukan checklist submission |
| [AI development workflow](AI-DEVELOPMENT-WORKFLOW-Smart-Warehouse-Firaza.md) | Catatan proses penggunaan asisten selama pengembangan |
| [AI assistant guide](AI-ASSISTANT-GUIDE-Smart-Warehouse-Firaza.md) | Panduan konteks awal untuk asisten pengembangan |

## Memperbarui dokumentasi

Tuliskan perubahan status dengan tanggal dan bukti commit, CI, atau pengujian yang relevan. Bedakan bukti lokal dari bukti demo reviewer. Perubahan dokumentasi tidak membuktikan bahwa deployment atau pengujian aplikasi baru telah dilakukan. Simpan credential dan informasi akses privat di luar repository.
