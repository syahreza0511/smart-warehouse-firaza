import "./globals.css";

export const metadata = {
  title: "Smart Warehouse Firaza",
  description:
    "Sistem manajemen gudang bahan baku untuk bisnis hampers dan personalized gift Firaza.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
