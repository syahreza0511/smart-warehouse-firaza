import { cn } from "cn";
import { STOCK_STATUS } from "@/components/inventory-format";

export function StockStatusBadge({ status }) {
  const meta = STOCK_STATUS[status] ?? { label: status, className: "bg-muted text-foreground" };

  return (
    <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap", meta.className)}>
      {meta.label}
    </span>
  );
}
