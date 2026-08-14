import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate, formatNumber, formatRupiah } from "@/lib/format";
import type { SalesRecapDailyRow, SalesRecapStatus } from "@/lib/salesRecap";

const statusLabels: Record<SalesRecapStatus, string> = {
  DRAFT: "Draft", READY_TO_VALIDATE: "Siap Divalidasi", NEEDS_REVIEW: "Perlu Ditinjau", VALIDATED: "Validated",
};

export function SalesRecapStatusBadge({ status }: { status: SalesRecapStatus }) {
  return <Badge variant={status === "VALIDATED" ? "default" : status === "NEEDS_REVIEW" ? "destructive" : "secondary"}>{statusLabels[status]}</Badge>;
}

export function SalesRecapPeriodTable({ rows, onOpenDate }: { rows: SalesRecapDailyRow[]; onOpenDate: (date: string) => void }) {
  if (!rows.length) return <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">Belum ada cakupan data untuk periode ini.</div>;
  return <div className="overflow-x-auto rounded-lg border"><Table>
    <TableHeader><TableRow>
      <TableHead>Tanggal</TableHead><TableHead className="text-right">Struk</TableHead><TableHead className="text-right">Membership</TableHead>
      <TableHead className="text-right">Promo</TableHead><TableHead className="text-right">Dewasa</TableHead><TableHead className="text-right">Anak</TableHead>
      <TableHead className="text-right">Total Sales</TableHead><TableHead className="text-right">Arayya</TableHead><TableHead className="text-right">Lovin</TableHead><TableHead>Status</TableHead><TableHead />
    </TableRow></TableHeader>
    <TableBody>{rows.map((row) => <TableRow key={row.business_date}>
      <TableCell className="font-medium">{formatDate(row.business_date)}</TableCell><TableCell className="text-right">{formatNumber(row.bill_count)}</TableCell>
      <TableCell className="text-right">{row.membership_transaction_count ?? "—"}</TableCell><TableCell className="text-right">{row.promo_transaction_count ?? "—"}</TableCell>
      <TableCell className="text-right">{row.adult_visitors ?? "—"}</TableCell><TableCell className="text-right">{row.child_visitors ?? "—"}</TableCell>
      <TableCell className="text-right font-medium">{formatRupiah(row.system_total_sales)}</TableCell><TableCell className="text-right">{formatRupiah(row.arayya_sales)}</TableCell>
      <TableCell className="text-right">{formatRupiah(row.lovin_sales)}</TableCell><TableCell><SalesRecapStatusBadge status={row.overall_status} /></TableCell>
      <TableCell><Button size="sm" variant="ghost" onClick={() => onOpenDate(row.business_date)}>Buka</Button></TableCell>
    </TableRow>)}</TableBody>
  </Table></div>;
}
