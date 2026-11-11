import { cn } from "cn";

export const OPNAME_STATUS = {
  ACTIVE: { label: "Aktif", className: "bg-amber-100 text-amber-900" },
  POSTED: { label: "Diposting", className: "bg-sage text-forest" },
  CANCELLED: { label: "Dibatalkan", className: "bg-muted text-muted-foreground" },
};

export function OpnameStatusBadge({ status }) {
  const meta = OPNAME_STATUS[status] ?? { label: status, className: "bg-muted text-foreground" };
  return (
    <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap", meta.className)}>
      {meta.label}
    </span>
  );
}

// OD-28: actors are shown only as "Anda" or "Pengguna lain".
export const actorLabel = (byMe) => (byMe ? "Anda" : "Pengguna lain");
