import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

const FEATURES = [
  "Dashboard ringkasan stok: total material aktif, stok normal, stok rendah, stok habis, dan material yang perlu perhatian.",
  "Pengelolaan material: tambah, ubah, arsip, aktifkan kembali, serta stok minimum per material.",
  "Pencatatan Stock In dan Stock Out dengan histori transaksi per material.",
  "Stock Opname berbasis sesi: pilih material, hitung fisik, posting penyesuaian, atau batalkan dengan alasan.",
  "Dua peran: Staff Warehouse mencatat dan mengelola, Owner memantau tanpa mengubah data.",
];

export default function HomePage() {
  return (
    <main className="page">
      <section className="w-full max-w-2xl" aria-labelledby="product-title">
        <Card className="border-t-6 border-t-primary text-base">
          <CardHeader>
            <h1 id="product-title" className="tracking-tight">
              Smart Warehouse Firaza
            </h1>
          </CardHeader>
          <CardContent>
            <p className="lead">
              Sistem manajemen gudang untuk mencatat bahan baku, transaksi stok, dan Stock Opname bisnis hampers dan
              personalized gift Firaza.
            </p>
            <ul className="mt-4 grid list-disc gap-2 pl-5 text-sm">
              {FEATURES.map((feature) => (
                <li key={feature}>{feature}</li>
              ))}
            </ul>
            <p className="note mt-4">Akun dibuat oleh pengelola sistem; tidak ada pendaftaran mandiri.</p>
            <div className="mt-4 flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link href="/login?next=%2Fdashboard">Masuk</Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/dashboard">Buka dashboard</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
