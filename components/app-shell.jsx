"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Dialog } from "radix-ui";
import { ROLE_LABEL } from "@/components/inventory-format";

// App shell for signed-in pages (Concept C, Forest & Linen): a Forest sidebar
// from 1024 px, and below that an Ivory top bar with a menu button that opens
// the same navigation in a drawer. Presentation only: it reads no data and
// changes nothing. Navigation entries are plain <Link> elements, so the
// Stock Opname leave guard (capture listener on window, "a[href]") still asks
// before an unsaved count is left. The drawer buttons are not marked
// data-leave-page: opening or closing the menu does not leave the page.
//
// Only destinations that have a route are listed (Owner decision D4).
export const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: "home" },
  { href: "/materials", label: "Material", icon: "cube" },
  { href: "/stock-opnames", label: "Pemeriksaan Stok", icon: "clipboard" },
];

export function isActivePath(href, pathname) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

const ICON_PATHS = {
  home: ["M3 10.5 12 3l9 7.5", "M5 9v12h5v-6h4v6h5V9"],
  cube: ["M12 2.5 3.5 7v10l8.5 4.5 8.5-4.5V7z", "M3.5 7 12 11.5 20.5 7", "M12 11.5v10"],
  clipboard: ["M9 3.5h6v3H9z", "M7.5 5H5v16h14V5h-2.5", "m8.5 13.5 2.5 2.5 4.5-5"],
  menu: ["M4 7h16", "M4 12h16", "M4 17h16"],
  close: ["M6 6l12 12", "M18 6 6 18"],
};

function Icon({ name, className = "size-5" }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {ICON_PATHS[name].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}

// Frozen R5 mark (dark) plus live HTML wordmark at the compact lockup metrics.
function SidebarBrand() {
  return (
    <Link href="/dashboard" className="flex items-center gap-3 rounded-lg px-2 py-1">
      <img src="/brand/firaza-app-mark-c-dark.svg" alt="" width={36} height={36} className="size-9 shrink-0" />
      <span className="grid leading-none">
        <span className="text-[18px] font-bold tracking-[2px] text-ivory">FIRAZA</span>
        <span className="mt-1.5 text-[10px] font-semibold tracking-[1.2px] text-sage">SMART WAREHOUSE</span>
      </span>
    </Link>
  );
}

function SidebarNav({ pathname }) {
  return (
    <nav aria-label="Navigasi utama">
      <p className="px-3 text-[11px] font-semibold tracking-[1.5px] text-sage">WORKSPACE</p>
      <ul className="mt-2 grid gap-1">
        {NAV_ITEMS.map((item) => {
          const active = isActivePath(item.href, pathname);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={
                  active
                    ? "flex min-h-11 items-center gap-3 rounded-[10px] bg-sage px-3 text-sm font-semibold text-forest"
                    : "flex min-h-11 items-center gap-3 rounded-[10px] px-3 text-sm font-medium text-ivory hover:bg-ivory/10"
                }
              >
                <Icon name={item.icon} />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function SidebarContent({ user, pathname, logoutControl, error }) {
  return (
    <div className="flex min-h-full flex-col gap-6 px-4 pt-7 pb-6">
      <SidebarBrand />
      <div className="border-t border-ivory/15" />
      <SidebarNav pathname={pathname} />
      <div className="mt-auto grid gap-3 border-t border-ivory/15 pt-5">
        {user && (
          <div className="grid gap-1.5 px-1 text-sm">
            <span className="truncate font-medium text-ivory">{user.name}</span>
            <span className="justify-self-start rounded-full bg-ivory/10 px-2.5 py-0.5 text-xs font-semibold text-sage">
              {ROLE_LABEL[user.role] ?? user.role}
            </span>
          </div>
        )}
        {logoutControl}
        {error && (
          <p role="alert" className="rounded-lg bg-ivory p-3 text-sm text-destructive">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

// `logoutControl(place)` renders the logout button owned by AppHeader, so the
// logout logic stays in one place.
export function AppShell({ user, logoutControl, error }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const current = NAV_ITEMS.find((item) => isActivePath(item.href, pathname));

  // A confirmed navigation from the drawer closes it on the new page.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <>
      <aside
        data-app-shell
        className="app-sidebar fixed inset-y-0 left-0 z-30 hidden w-68 overflow-y-auto bg-forest text-ivory lg:block"
      >
        <SidebarContent user={user} pathname={pathname} logoutControl={logoutControl("sidebar")} error={error} />
      </aside>

      <header className="sticky top-0 z-20 border-b bg-card lg:hidden">
        <div className="flex min-h-15 items-center gap-3 px-4 py-2">
          <Dialog.Root open={open} onOpenChange={setOpen}>
            <Dialog.Trigger asChild>
              <button
                type="button"
                className="-ml-1.5 inline-flex size-11 items-center justify-center rounded-lg text-forest hover:bg-muted"
                aria-label="Buka menu navigasi"
              >
                <Icon name="menu" className="size-6" />
              </button>
            </Dialog.Trigger>
            <Dialog.Portal>
              <Dialog.Overlay className="fixed inset-0 z-40 bg-forest/60" />
              <Dialog.Content
                aria-describedby={undefined}
                className="app-sidebar fixed inset-y-0 left-0 z-50 w-78 max-w-[85vw] overflow-y-auto bg-forest text-ivory shadow-xl focus:outline-none"
              >
                <Dialog.Title className="sr-only">Menu navigasi</Dialog.Title>
                <Dialog.Close asChild>
                  <button
                    type="button"
                    className="absolute top-3 right-3 inline-flex size-11 items-center justify-center rounded-lg text-ivory hover:bg-ivory/10"
                    aria-label="Tutup menu navigasi"
                  >
                    <Icon name="close" className="size-6" />
                  </button>
                </Dialog.Close>
                <SidebarContent user={user} pathname={pathname} logoutControl={logoutControl("drawer")} error={error} />
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
          <img src="/brand/firaza-app-icon-c.svg" alt="" width={32} height={32} className="size-8 shrink-0" />
          <p className="min-w-0 flex-1 truncate text-lg font-bold text-forest">{current?.label ?? "Smart Warehouse Firaza"}</p>
          {user && (
            <span className="shrink-0 rounded-full bg-sage px-2.5 py-0.5 text-xs font-semibold text-forest">
              {ROLE_LABEL[user.role] ?? user.role}
            </span>
          )}
        </div>
      </header>
    </>
  );
}
