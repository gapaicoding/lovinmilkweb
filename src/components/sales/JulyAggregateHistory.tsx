import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Info } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fetchJulyActual } from "@/lib/reporting";
import { formatDate, formatNumber, formatRupiah } from "@/lib/format";

export function JulyAggregateHistory() {
  const defaults = useMemo(() => ({ start: "2026-07-01", end: "2026-07-31" }), []);
  const [startDate, setStartDate] = useState(defaults.start);
  const [endDate, setEndDate] = useState(defaults.end);
  const report = useQuery({
    queryKey: ["july-2026-actual", startDate, endDate],
    enabled: startDate <= endDate,
    queryFn: () => fetchJulyActual(startDate, endDate),
  });

  return <div className="space-y-4">
    <Alert><Info className="h-4 w-4" /><AlertTitle>Riwayat aktual agregat</AlertTitle><AlertDescription>Data Juli berasal dari rekap harian aktual, bukan transaksi POS individual. Komposisi item per struk dan omzet per produk tidak tersedia.</AlertDescription></Alert>
    <Card><CardContent className="grid gap-4 p-4 sm:grid-cols-2">
      <div><label className="text-sm font-medium" htmlFor="aggregate-start">Tanggal mulai</label><Input id="aggregate-start" type="date" min="2026-07-01" max="2026-07-31" value={startDate} onChange={(event) => setStartDate(event.target.value)} /></div>
      <div><label className="text-sm font-medium" htmlFor="aggregate-end">Tanggal akhir</label><Input id="aggregate-end" type="date" min="2026-07-01" max="2026-07-31" value={endDate} onChange={(event) => setEndDate(event.target.value)} /></div>
    </CardContent></Card>
    {report.isError ? <Alert variant="destructive"><AlertTitle>Riwayat agregat gagal dimuat</AlertTitle><AlertDescription>{report.error.message}</AlertDescription></Alert> : null}
    {report.data && (!report.data.bill_coverage_complete || !report.data.product_detail_coverage_complete) ? <Alert><AlertTriangle className="h-4 w-4" /><AlertTitle>Cakupan sumber tidak lengkap</AlertTitle><AlertDescription>Jumlah struk 9 Juli tidak tersedia; 318 adalah jumlah struk yang tercatat. Detail qty produk 30 Juli tidak tersedia. Enam qty menu lama tetap ditampilkan sebagai historis/tidak terpetakan.</AlertDescription></Alert> : null}
    {report.isPending ? <Skeleton className="h-72" /> : <Card><CardContent className="overflow-x-auto p-0"><Table>
      <TableHeader><TableRow><TableHead>Tanggal</TableHead><TableHead className="text-right">Total Sales</TableHead><TableHead className="text-right">Lovin</TableHead><TableHead className="text-right">Arayya</TableHead><TableHead className="text-right">Struk Tercatat</TableHead><TableHead className="text-right">Pengunjung</TableHead><TableHead className="text-right">Qty Tercatat</TableHead><TableHead>Data Coverage</TableHead></TableRow></TableHeader>
      <TableBody>{report.data?.rows.map((row) => <TableRow key={row.date}><TableCell>{formatDate(row.date)}</TableCell><TableCell className="text-right">{formatRupiah(row.total_sales)}</TableCell><TableCell className="text-right">{formatRupiah(row.lovin_sales)}</TableCell><TableCell className="text-right">{formatRupiah(row.arayya_sales ?? 0)}</TableCell><TableCell className="text-right">{row.bill_count === null ? "Tidak tersedia" : formatNumber(row.bill_count)}</TableCell><TableCell className="text-right">{row.visitor_total === null ? "Tidak tersedia" : formatNumber(row.visitor_total)}</TableCell><TableCell className="text-right">{row.product_detail_available ? formatNumber(row.product_quantity) : "Tidak tersedia"}</TableCell><TableCell className="max-w-64 text-xs text-muted-foreground">{row.source_notes || (row.product_detail_available ? "Tercatat" : "Detail produk tidak tersedia")}</TableCell></TableRow>)}</TableBody>
    </Table>{report.data?.rows.length === 0 ? <p className="py-12 text-center text-sm text-muted-foreground">Tidak ada data agregat pada periode ini.</p> : null}</CardContent></Card>}
  </div>;
}
