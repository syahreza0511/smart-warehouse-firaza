import { Button } from "@/components/ui/button";

// Shared loading / error / empty blocks for client pages.
export function LoadingState({ label = "Memuat data…" }) {
  return (
    <p role="status" aria-live="polite" className="py-8 text-center text-muted-foreground">
      {label}
    </p>
  );
}

export function ErrorState({ message, onRetry }) {
  return (
    <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm">
      <p className="text-destructive">{message}</p>
      {onRetry && (
        <Button variant="outline" size="sm" className="mt-3" onClick={onRetry}>
          Coba lagi
        </Button>
      )}
    </div>
  );
}
