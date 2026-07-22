import type { LucideIcon } from "lucide-react";
import { Inbox } from "lucide-react";

export function EmptyState({
  icon: Icon = Inbox,
  title = "Belum ada data",
  description = "Data akan tampil di sini setelah tersedia.",
}: {
  icon?: LucideIcon;
  title?: string;
  description?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-12 px-4 text-center bg-muted/30">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted mb-3">
        <Icon className="h-6 w-6 text-muted-foreground" />
      </div>
      <div className="text-sm font-medium">{title}</div>
      <div className="text-xs text-muted-foreground mt-1 max-w-sm">{description}</div>
    </div>
  );
}
