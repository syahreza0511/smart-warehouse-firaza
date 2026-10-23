# GitHub Repository Setup Checklist

## Sebelum membuat repository

- [ ] Pastikan nama repository, misalnya `smart-warehouse-firaza`.
- [ ] Pastikan repository dibuat **Private** terlebih dahulu jika kamu belum ingin mempublikasikan dokumentasi capstone.
- [ ] Periksa bahwa ZIP hanya berisi dokumentasi proyek, bukan `.env`, token, password, backup database, atau data bisnis sensitif.
- [ ] Pertahankan dokumentasi perencanaan; jangan membuat framework/backend skeleton final sebelum keputusan advisor.

## Buat repository di GitHub

1. Buka GitHub dan pilih **New repository**.
2. Isi nama `smart-warehouse-firaza`.
3. Pilih Private atau Public sesuai kebutuhan.
4. Karena repository lokal akan memiliki commit awal sendiri, buat repository kosong di GitHub (jangan otomatis menambahkan README, `.gitignore`, atau license) untuk menghindari konflik awal.
5. Salin URL HTTPS repository yang dibuat.

## Push repository dari Mac

Buka Terminal pada folder hasil ekstrak `Smart-Warehouse-Firaza-GitHub-Ready`, lalu jalankan:

```bash
git init
git branch -M main
git add README.md .gitignore .editorconfig docs
git diff --cached --check
git status --short
git commit -m "docs: prepare initial project repository"
git remote add origin https://github.com/USERNAME/smart-warehouse-firaza.git
git push -u origin main
```

Ganti `USERNAME` dengan username GitHub kamu dan pastikan URL cocok dengan repository yang benar-benar dibuat.

Jika Git meminta identitas, atur identitas khusus repository (gunakan nama dan email yang memang ingin ditampilkan pada histori commit):

```bash
git config user.name "Nama Kamu"
git config user.email "email-github-kamu"
```

Jangan menaruh password atau token GitHub langsung dalam command, file project, atau chat.

## Setelah push

- [ ] Buka halaman repository di browser dan pastikan README tampil.
- [ ] Pastikan folder `docs/` dan gambar ERD tersedia.
- [ ] Periksa bahwa `.env`, `node_modules/`, `.DS_Store`, dan file rahasia tidak terunggah.
- [ ] Jangan menambahkan source code placeholder yang mengunci pilihan teknologi.
- [ ] Setelah advisor memberi keputusan, perbarui `docs/STACK-DECISION-LOG.md`, README, dan struktur project.
