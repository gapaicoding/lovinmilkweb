import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatNumber, formatRupiah } from "@/lib/format";
import type { SalesRecapDailyRow } from "@/lib/salesRecap";

export function SalesRecapSummaryCards({ row }: { row: SalesRecapDailyRow }) {
  const cards = [
    ["Jumlah Struk", formatNumber(row.bill_count)],
    ["Total Sales", formatRupiah(row.system_total_sales)],
    ["Lovin Milk", formatRupiah(row.lovin_sales)],
    ["Arayya", formatRupiah(row.arayya_sales)],
    ["Total Qty", formatNumber(row.quantity, 2)],
  ];
  return <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
    {cards.map(([label, value]) => <Card key={label}>
      <CardHeader className="space-y-1 pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle><Badge variant="secondary" className="w-fit">Otomatis dari transaksi</Badge></CardHeader>
      <CardContent><p className="text-2xl font-bold">{value}</p></CardContent>
    </Card>)}
  </div>;
}
