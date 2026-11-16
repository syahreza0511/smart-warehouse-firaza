// Static tests for the Concept C UI shell and wording (P0-DEADLINE-02A,
// Owner decisions D1-D5). Source text only: no browser, network, or database.
// They pin the navigation to routes that exist, the leave-guard and logout
// invariants, the frozen logo bytes, and the "Pemeriksaan Stok" wording.
//
// Run: node --test 'tests/unit/*.test.mjs'
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
const sha256 = (path) => createHash("sha256").update(readFileSync(new URL(`../../${path}`, import.meta.url))).digest("hex");
const withoutComments = (source) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");

const { LEAVE_SELECTOR } = await import(new URL("../../lib/leave-guard.js", import.meta.url));

test("navigation lists exactly Dashboard, Material, and Pemeriksaan Stok (D4)", () => {
  const shell = read("components/app-shell.jsx");
  const entries = [...shell.matchAll(/\{ href: "([^"]+)", label: "([^"]+)", icon: "[a-z]+" \}/g)].map((m) => [m[1], m[2]]);
  assert.deepEqual(entries, [
    ["/dashboard", "Dashboard"],
    ["/materials", "Material"],
    ["/stock-opnames", "Pemeriksaan Stok"],
  ]);
  for (const missing of ["Stok Masuk", "Stok Keluar", "Riwayat", "Catatan", "/notes", "/history"]) {
    assert.ok(!shell.includes(missing), missing);
  }
  assert.match(shell, /aria-current=\{active \? "page" : undefined\}/);
  assert.match(shell, /<Link\s+href=\{item\.href\}/);
});

test("drawer: Radix Dialog with title, close button and trigger; menu buttons never leave the page", () => {
  const shell = read("components/app-shell.jsx");
  for (const part of ["<Dialog.Root open={open} onOpenChange={setOpen}>", "<Dialog.Trigger asChild>", "<Dialog.Overlay", "<Dialog.Title", "<Dialog.Close asChild>"]) {
    assert.ok(shell.includes(part), part);
  }
  assert.ok(shell.includes('aria-label="Buka menu navigasi"') && shell.includes('aria-label="Tutup menu navigasi"'));
  assert.doesNotMatch(withoutComments(shell), /data-leave-page/);
  assert.equal(LEAVE_SELECTOR, "a[href], [data-leave-page]");
  assert.match(shell, /useEffect\(\(\) => \{\s+setOpen\(false\);\s+\}, \[pathname\]\);/);
  // From 1024 px the sidebar shows and the drawer trigger bar hides.
  assert.match(shell, /data-app-shell\s+className="app-sidebar fixed[^"]*hidden[^"]*lg:block"/);
  assert.match(shell, /<header className="sticky top-0 z-20 border-b bg-card lg:hidden">/);
});

test("logout: one handler, rendered in sidebar and drawer, keeps draft cleanup and the leave marker", () => {
  const header = read("components/app-header.jsx");
  assert.equal((header.match(/onClick=\{logout\} disabled=\{pending\} data-leave-page/g) ?? []).length, 1);
  assert.equal((header.match(/clearTabCountDrafts\(\);/g) ?? []).length, 2);
  assert.equal((header.match(/async function logout\(\)/g) ?? []).length, 1);
  const shell = read("components/app-shell.jsx");
  assert.ok(shell.includes('logoutControl("sidebar")') && shell.includes('logoutControl("drawer")'));
});

test("logo assets are the frozen R5 bytes", () => {
  const frozen = {
    "public/brand/firaza-app-mark-c-light.svg": "89a99f411789c442d6d2e2cf5efb4858d0187eda46ba9c9f3daf6327b3f0445e",
    "public/brand/firaza-app-mark-c-dark.svg": "cb1ee8e2cf6d997e5a8155229126d46a2fe2e1d73c0341700b0f0f290aaa77d1",
    "public/brand/firaza-app-icon-c.svg": "606cf7b1bec5c86c2efd3da500ff7b1eeb7c45735ead21e31f44d1cb6c48ed83",
    "app/icon.svg": "a9b7be1d95eea061101ab8beba471bb1e853bc9211570a9405f202149c22c930",
  };
  for (const [path, hash] of Object.entries(frozen)) assert.equal(sha256(path), hash, path);
  // Marks next to the live wordmark are decorative.
  for (const path of ["components/app-shell.jsx", "components/brand-mark.jsx"]) {
    for (const img of read(path).match(/<img[\s\S]*?\/>/g)) assert.match(img, /alt=""/, path);
  }
});

test("dashboard (D1): KPI and attention list only; no notes, chart or category widget; mobile cards", () => {
  const page = read("app/dashboard/page.js");
  for (const absent of ["Catatan", "chart", "Grafik", "Pergerakan", "Kondisi Gudang", "Material per Kategori"]) {
    assert.ok(!page.includes(absent), absent);
  }
  assert.match(page, /<ul className="grid gap-3 md:hidden"/);
  assert.match(page, /className="hidden overflow-x-auto rounded-xl border bg-card md:block"/);
  assert.match(page, /\{isStaff && \(\s+<Button asChild>\s+<Link href="\/stock-opnames\/new">Mulai Pemeriksaan Stok<\/Link>/);
});

test("wording (D2): status labels and no visible 'Stock Opname' in pages and components", () => {
  const badge = read("components/opname-status-badge.jsx");
  assert.match(badge, /ACTIVE: \{ label: "Berlangsung"/);
  assert.match(badge, /POSTED: \{ label: "Difinalisasi"/);
  assert.match(badge, /CANCELLED: \{ label: "Dibatalkan"/);
  const files = [
    "app/page.js",
    "app/dashboard/page.js",
    "app/materials/page.js",
    "app/materials/new/page.js",
    "app/materials/[id]/page.js",
    "app/materials/[id]/edit/page.js",
    "app/stock-opnames/page.js",
    "app/stock-opnames/new/page.js",
    "app/stock-opnames/[id]/page.js",
    "components/app-shell.jsx",
    "components/opname-actions.jsx",
    "components/opname-count-form.jsx",
    "components/material-form.jsx",
    "components/material-status-panel.jsx",
  ];
  for (const file of files) {
    const code = withoutComments(read(file));
    assert.doesNotMatch(code, /Stock Opname/, file);
    assert.doesNotMatch(code, /[Dd]iposting|[Mm]emposting|Posting sesi/, file);
  }
  const actions = read("components/opname-actions.jsx");
  assert.match(actions, /Penyesuaian stok bersifat permanen dan tidak dapat dibatalkan melalui aplikasi\./);
  assert.match(actions, /Stok resmi akan disesuaikan secara permanen dan tidak dapat dibatalkan melalui aplikasi\./);
});

test("touch targets below 1024 px and content offset for the sidebar (D5)", () => {
  const css = read("app/globals.css");
  assert.match(css, /@media \(max-width: 63\.999rem\) \{\s+\[data-slot="button"\],\s+\[data-slot="input"\],\s+main select \{\s+min-height: 2\.75rem;/);
  assert.match(css, /@media \(min-width: 64rem\) \{\s+body:has\(\[data-app-shell\]\) \{\s+padding-left: 17rem;/);
  // Forest & Linen tokens unchanged.
  for (const token of ["--color-forest: #183d32;", "--color-linen: #f4f1e8;", "--color-sage: #c8dd9a;", "--color-ivory: #fffefa;"]) {
    assert.ok(css.includes(token), token);
  }
});
