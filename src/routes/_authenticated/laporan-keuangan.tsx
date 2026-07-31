import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { ExportExcelDialog } from "@/components/reports/ExportExcelDialog";
import { PageHeader } from "@/components/PageHeader";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { jakartaMonthRange } from "@/lib/businessPeriod";
import { fetchDefaultOutletId, fetchJulyActual, fetchOutletReport, sourceStatusLabel } from "@/lib/reporting";
import { formatRupiah } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/laporan-keuangan")({ component: FinancialReportPage });

function FinancialReportPage() {
  const initial = useMemo(() => jakartaMonthRange(), []);
  const [startDate, setStartDate] = useState(initial.startDate);
  const [endDate, setEndDate] = useState(initial.endDate);
  const outlet = useQuery({ queryKey: ["stage7-reporting", "default-outlet"], queryFn: fetchDefaultOutletId });
  const report = useQuery({
    queryKey: ["stage7-reporting", "finance", outlet.data, startDate, endDate],
    enabled: Boolean(outlet.data) && startDate <= endDate,
    queryFn: () => fetchOutletReport(outlet.data!, startDate, endDate),
  });
  const julyActual = useQuery({
    queryKey: ["july-2026-actual", "finance", startDate, endDate],
    enabled: startDate <= "2026-07-31" && endDate >= "2026-07-01",
    queryFn: () => fetchJulyActual(
      startDate < "2026-07-01" ? "2026-07-01" : startDate,
      endDate > "2026-07-31" ? "2026-07-31" : endDate,
    ),
  });
  const hasJulyActual = (julyActual.data?.rows.length ?? 0) > 0;
  return <div className="space-y-6">
    <PageHeader title="Laporan Keuangan" description="Laporan kinerja operasional Outlet; tidak mengklaim Laba Bersih." actions={<ExportExcelDialog reportType="financial" currentRange={{ from: new Date(`${startDate}T00:00:00`), to: new Date(`${endDate}T00:00:00`), preset: "custom" }} />} />
    <Card><CardContent className="grid gap-4 p-4 sm:grid-cols-3"><div><label className="text-sm font-medium" htmlFor="finance-start">Tanggal mulai</label><Input id="finance-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></div><div><label className="text-sm font-medium" htmlFor="finance-end">Tanggal akhir</label><Input id="finance-end" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} /></div><div className="flex items-end"><Badge variant="outline">{report.data ? sourceStatusLabel(report.data.source_status) : "Memuat sumber"}</Badge></div></CardContent></Card>
    {report.data?.has_provisional_hpp ? <Alert><AlertTriangle className="h-4 w-4" /><AlertTitle>Angka mengandung HPP provisional</AlertTitle><AlertDescription>{report.data.provisional_hpp_item_count} item penjualan belum memiliki basis biaya. Laba Kotor dan Laba Operasional tetap menggunakan HPP tersimpan, tetapi belum sepenuhnya final.</AlertDescription></Alert> : null}
    {hasJulyActual ? <Alert><AlertTriangle className="h-4 w-4" /><AlertTitle>Biaya dan laba Juli tidak tersedia</AlertTitle><AlertDescription>Sumber aktual Juli hanya membuktikan omzet, pengunjung, struk tercatat, dan qty produk. HPP, OPEX, depresiasi, Laba Kotor, dan Laba Operasional tidak dihitung dari asumsi.</AlertDescription></Alert> : null}
    {report.isError ? <Alert variant="destructive"><AlertTitle>Laporan gagal dimuat</AlertTitle><AlertDescription>{report.error.message}</AlertDescription></Alert> : null}
    {report.isPending ? <Skeleton className="h-96" /> : report.data ? <Card><CardHeader><CardTitle>Laporan Kinerja Operasional Outlet</CardTitle></CardHeader><CardContent className="space-y-1">
      <Line label="Omzet" value={report.data.revenue} />
      <Line operator="−" label="HPP" value={hasJulyActual ? null : report.data.hpp} />
      <Line operator="=" label="Laba Kotor" value={hasJulyActual ? null : report.data.gross_profit} result />
      <Line operator="−" label="Pengeluaran Operasional" value={hasJulyActual ? null : report.data.operational_expense} />
      <Line operator="−" label="Depresiasi" value={hasJulyActual ? null : report.data.depreciation} />
      <Line operator="=" label="Laba Operasional" value={hasJulyActual ? null : report.data.operating_profit} result />
      <p className="pt-4 text-xs text-muted-foreground">Cutover operasional: {report.data.operational_cutover_date}. Laba Operasional bukan Laba Bersih; pajak, distribusi pemilik, dan penutupan periode berada di luar Stage 7.</p>
    </CardContent></Card> : null}
  </div>;
}

function Line({ operator = "", label, value, result = false }: { operator?: string; label: string; value: number | null; result?: boolean }) {
  return <div className={`grid grid-cols-[1.5rem_1fr_auto] gap-2 rounded-md px-4 py-3 ${result ? "bg-muted font-semibold" : ""}`}><span>{operator}</span><span>{label}</span><span className="tabular-nums">{value === null ? "Tidak tersedia" : formatRupiah(value)}</span></div>;
}
