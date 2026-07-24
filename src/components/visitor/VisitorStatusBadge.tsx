import { Badge } from "@/components/ui/badge";

export function VisitorStatusBadge({ checkedOut }: { checkedOut: boolean }) {
  return checkedOut ? (
    <Badge variant="secondary">Sudah Pulang</Badge>
  ) : (
    <Badge className="bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-300">
      Sedang Berkunjung
    </Badge>
  );
}
