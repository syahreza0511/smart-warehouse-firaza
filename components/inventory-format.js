// Display helpers for inventory values. Labels follow FEATURE-SPECIFICATION
// (Stok Habis, Stok Rendah) and PRD FR-STS-01.

export const STOCK_STATUS = {
  OUT_OF_STOCK: { label: "Stok Habis", className: "bg-destructive/10 text-destructive" },
  LOW_STOCK: { label: "Stok Rendah", className: "bg-amber-100 text-amber-900" },
  NORMAL: { label: "Normal", className: "bg-sage text-forest" },
};

export const ROLE_LABEL = {
  OWNER: "Owner",
  STAFF_WAREHOUSE: "Staff Warehouse",
};

export const TRANSACTION_LABEL = {
  STOCK_IN: "Stock In",
  STOCK_OUT: "Stock Out",
  ADJUSTMENT: "Penyesuaian",
  REVERSAL: "Reversal",
  OPENING_BALANCE: "Saldo Awal",
};

const numberFormat = new Intl.NumberFormat("id-ID");
const dateFormat = new Intl.DateTimeFormat("id-ID", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Jakarta",
});

export const formatNumber = (value) => numberFormat.format(value);
export const formatDateTime = (value) => `${dateFormat.format(new Date(value))} WIB`;
export const formatDelta = (value) => (value > 0 ? `+${formatNumber(value)}` : `−${formatNumber(Math.abs(value))}`);
