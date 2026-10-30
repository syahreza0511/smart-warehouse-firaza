# Product Requirement Document - Smart Warehouse Firaza

> **Status dokumen: historis — tidak berlaku sebagai spesifikasi aktif.**
>
> - PRD kanonik adalah [PRD-Smart-Warehouse-Firaza-Dicoding.md](PRD-Smart-Warehouse-Firaza-Dicoding.md). Kebutuhan yang masih valid dari dokumen ini (persona, pain point, pola Functional dan Non-Functional Requirement) sudah dikonsolidasikan ke sana.
> - Bagian "Database Draft" tidak berlaku. Nama field di dalamnya (`stock`, `category`) bertentangan dengan desain database; acuan yang berlaku adalah [DATABASE-DESIGN-Smart-Warehouse-Firaza.md](DATABASE-DESIGN-Smart-Warehouse-Firaza.md).
> - Bagian "API Draft" pada dokumen ini tidak berlaku. Dokumentasi API terpisah tersedia di `API-DOCUMENTATION-Smart-Warehouse-Firaza.md`, tetapi masih dijadwalkan untuk direvisi pada Gelombang 2b. Jangan menganggapnya sebagai kontrak API final sebelum revisi tersebut selesai.
> - Isi di bawah ini dipertahankan tanpa perubahan sebagai catatan historis.
>
> Ditandai historis pada Gelombang 2a, 29 Oktober 2026.

## Product Vision

Membangun sistem inventory management berbasis web yang membantu bisnis
retail hampers dan personalized gift melakukan transformasi digital pada
pengelolaan warehouse melalui monitoring stok, pencatatan transaksi, dan
informasi inventory berbasis data.

## Value Proposition

Smart Warehouse Firaza membantu owner mendapatkan visibilitas kondisi
inventory dan membantu staff warehouse melakukan pengelolaan stok secara
lebih terstruktur.

## User Persona

### Owner

Pain point: - Membutuhkan informasi inventory secara cepat. -
Membutuhkan monitoring tanpa pengecekan manual.

Goal: - Memahami kondisi stok. - Mendukung keputusan operasional.

### Staff Warehouse/Admin

Pain point: - Membutuhkan pencatatan transaksi yang konsisten. -
Membutuhkan histori aktivitas inventory.

Goal: - Mengelola stok dengan mudah.

## User Flow

Stock In: Supplier mengirim material -\> Staff input stock in -\> Sistem
memperbarui inventory.

Stock Out: Material digunakan -\> Staff input stock out -\> Sistem
mengurangi inventory.

Monitoring: Owner login -\> Dashboard -\> Melihat kondisi inventory.

## Functional Requirement

FR-001 Authentication: Sistem menyediakan login dan logout.

FR-002 Role: Sistem membedakan akses Owner dan Staff Warehouse/Admin.

FR-003 Material Management: Sistem dapat mengelola data raw material.

FR-004 Stock Transaction: Sistem mencatat stock in dan stock out.

FR-005 Stock Opname: Sistem mencatat hasil pengecekan fisik.

FR-006 Inventory Status: Sistem memberikan status stok berdasarkan
minimum stock.

## Non Functional Requirement

-   Responsive interface.
-   Secure authentication.
-   Database consistency.
-   Usability untuk pengguna non-teknis.

## Database Draft

Users: - id - name - email - password - role

Materials: - id - name - category - unit - stock - minimum_stock

Transactions: - id - material_id - type - quantity - date - user_id

Stock Opname: - id - material_id - system_stock - actual_stock -
adjustment

## API Draft

GET /api/v1/materials

POST /api/v1/materials

PUT /api/v1/materials/:id

DELETE /api/v1/materials/:id

GET /api/v1/transactions

POST /api/v1/transactions
