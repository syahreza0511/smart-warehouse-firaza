import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export default function HomePage() {
  return (
    <main className="page">
      <section className="w-full max-w-2xl" aria-labelledby="product-title">
        <Card className="border-t-6 border-t-primary text-base">
          <CardHeader>
            <p className="status bg-sage text-forest justify-self-start">
              Tahap pengembangan
            </p>
            <h1 id="product-title" className="tracking-tight">
              Smart Warehouse Firaza
            </h1>
          </CardHeader>
          <CardContent>
            <p className="lead">
              Sistem manajemen gudang untuk mencatat bahan baku, transaksi stok,
              dan Stock Opname bisnis hampers dan personalized gift Firaza.
            </p>
            <p className="note">
              Aplikasi ini masih dalam pengembangan. Fitur yang sudah tersedia:
              masuk ke aplikasi, daftar material, dan pencatatan Stock In.
            </p>
            <Button asChild size="lg" className="mt-4">
              <Link href="/login">Masuk</Link>
            </Button>
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
