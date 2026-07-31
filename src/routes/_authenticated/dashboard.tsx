import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Boxes, CircleDollarSign, Info, PackageCheck, ReceiptText, Users } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { BestSellingProducts } from "@/components/dashboard/BestSellingProducts";
import { CategoryRanking } from "@/components/dashboard/CategoryRanking";
import { DashboardKpiCard } from "@/components/dashboard/DashboardKpiCard";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { jakartaMonthRange } from "@/lib/businessPeriod";
import { formatNumber, formatPercentage, formatRupiah } from "@/lib/format";
import { groupProductRowsByCategory, productRowsToRankingItems } from "@/lib/productAnalytics";
import {
  fetchCurrentInventory, fetchJulyActual, fetchOutletReport, fetchProductReport, fetchSubunitReport,
  getFinanceCoverage, hasJulyOverlap, safePercentage, sourceStatusLabel, summarizeJulyActual,
  type JulyActualDailyRow,
  type OutletReport,
} from "@/lib/reporting";

export const Route = createFileRoute("/_authenticated/dashboard")({ component: DashboardPage });

type TrendMode = "total_sales" | "lovin_sales" | "arayya_sales";

function DashboardPage() {
  const initial = useMemo(() => jakartaMonthRange(), []);
  const [startDate, setStartDate] = useState(initial.startDate);
  const [endDate, setEndDate] = useState(initial.endDate);
  const [trendMode, setTrendMode] = useState<TrendMode>("total_sales");
  const validRange = startDate <= endDate;
  const structure = useQuery({
    queryKey: ["stage7-reporting", "structure"],
    queryFn: async () => {
      const [outlets, subunits] = await Promise.all([
        supabase.from("outlets").select("id,name").eq("is_active", true).is("deleted_at", null).order("is_default", { ascending: false }),
        supabase.from("business_subunits").select("id,name,outlet_id").eq("is_active", true).is("deleted_at", null).order("name"),
      ]);
      if (outlets.error) throw outlets.error;
      if (subunits.error) throw subunits.error;
      if (!outlets.data[0]) throw new Error("Outlet aktif belum tersedia.");
      return { outlet: outlets.data[0], subunits: subunits.data.filter((row) => row.outlet_id === outlets.data[0].id) };
    },
  });
  const outletId = structure.data?.outlet.id;
  const report = useQuery({ queryKey: ["stage7-reporting", "outlet", outletId, startDate, endDate], enabled: Boolean(outletId) && validRange, queryFn: () => fetchOutletReport(outletId!, startDate, endDate) });
  const inventory = useQuery({ queryKey: ["stage7-reporting", "inventory-current", outletId], enabled: Boolean(outletId), queryFn: () => fetchCurrentInventory(outletId!) });
  const julyActual = useQuery({
    queryKey: ["july-2026-actual", "dashboard", startDate, endDate],
    enabled: validRange && hasJulyOverlap(startDate, endDate),
    queryFn: () => fetchJulyActual(startDate < "2026-07-01" ? "2026-07-01" : startDate, endDate > "2026-07-31" ? "2026-07-31" : endDate),
  });
  const productReport = useQuery({
    queryKey: ["stage7-reporting", "dashboard-products", outletId, startDate, endDate],
    enabled: Boolean(outletId) && validRange,
    queryFn: () => fetchProductReport(outletId!, startDate, endDate),
    retry: false,
  });
  const subunits = useQuery({
    queryKey: ["stage7-reporting", "subunits", outletId, startDate, endDate],
    enabled: Boolean(structure.data) && validRange,
    queryFn: () => Promise.all(structure.data!.subunits.map(async (subunit) => ({ id: subunit.id, name: subunit.name, report: await fetchSubunitReport(subunit.id, startDate, endDate) }))),
  });

  const july = useMemo(() => summarizeJulyActual(julyActual.data, startDate, endDate), [julyActual.data, startDate, endDate]);
  const financeCoverage = getFinanceCoverage(startDate, endDate, july !== null);
  const productRows = useMemo(() => [...(productReport.data?.legacy_rows ?? []), ...(productReport.data?.operational_rows ?? [])], [productReport.data]);
  const safeProductAggregation = productReport.data?.source_status !== "mixed";
  const rankingItems = useMemo(() => safeProductAggregation ? productRowsToRankingItems(productRows) : [], [productRows, safeProductAggregation]);
  const categoryItems = useMemo(() => safeProductAggregation ? groupProductRowsByCategory(productRows) : [], [productRows, safeProductAggregation]);
  const totalCategoryQuantity = categoryItems.reduce((total, item) => total + item.quantity, 0);
  const productRevenueAvailable = productRows.length > 0 && productRows.every((row) => row.financial_available && row.revenue !== null);
  const primary = report.data;

  return <div className="space-y-5">
    <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <PageHeader title="Dashboard" description="Pantau omzet, transaksi, produk, pengunjung, dan performa bisnis dalam satu tampilan." />
      <div className="flex flex-col gap-3 rounded-xl border bg-card p-3 sm:flex-row sm:items-end">
        <DateField id="dashboard-start" label="Tanggal mulai" value={startDate} onChange={setStartDate} />
        <DateField id="dashboard-end" label="Tanggal akhir" value={endDate} onChange={setEndDate} />
        <Badge variant="outline" className="mb-0.5 h-9 justify-center px-3">{report.data ? sourceStatusLabel(report.data.source_status) : "Memuat sumber data"}</Badge>
      </div>
    </div>
    {!validRange ? <Alert variant="destructive"><AlertTitle>Rentang tanggal tidak valid</AlertTitle><AlertDescription>Tanggal mulai tidak boleh melewati tanggal akhir.</AlertDescription></Alert> : null}
    {report.isError ? <Alert variant="destructive"><AlertTitle>Dashboard gagal dimuat</AlertTitle><AlertDescription>Data utama belum dapat ditampilkan. Silakan coba lagi.</AlertDescription></Alert> : null}

    <section aria-labelledby="primary-kpi" className="space-y-3">
      <h2 id="primary-kpi" className="sr-only">Ringkasan utama</h2>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <DashboardKpiCard title="Omzet" value={formatRupiah(primary?.revenue ?? 0)} helper={july?.isFullJulyRange ? "Juli 2026" : undefined} icon={CircleDollarSign} loading={report.isPending} iconBackground="bg-primary/10 text-primary" />
        <DashboardKpiCard title={july ? "Struk Tercatat" : "Transaksi"} value={formatNumber(primary?.bill_count ?? 0)} helper={july && !julyActual.data?.bill_coverage_complete ? "Sebagian data struk tidak tersedia" : "Jumlah transaksi yang tercatat"} icon={ReceiptText} loading={report.isPending} iconBackground="bg-blue-500/10 text-blue-600" />
        <DashboardKpiCard title="Qty Terjual" value={formatNumber(primary?.quantity ?? 0)} helper={july?.isFullJulyRange && julyActual.data ? `${formatNumber(julyActual.data.mapped_quantity)} item terpetakan` : undefined} icon={Boxes} loading={report.isPending} iconBackground="bg-emerald-500/10 text-emerald-600" />
        <DashboardKpiCard title="Pengunjung" value={formatNumber(primary?.visitor_count ?? 0)} helper={july ? `${formatNumber(july.adultVisitors)} dewasa · ${formatNumber(july.childVisitors)} anak` : undefined} icon={Users} loading={report.isPending} iconBackground="bg-amber-500/10 text-amber-700" />
      </div>
    </section>

    {july ? <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Ringkasan aktual Juli">
      <DashboardKpiCard compact title="Omzet Lovin Milk" value={formatRupiah(july.lovinRevenue)} helper={shareLabel(july.lovinRevenue, july.lovinRevenue + july.arayyaRevenue)} icon={CircleDollarSign} />
      <DashboardKpiCard compact title="Omzet Arayya" value={formatRupiah(july.arayyaRevenue)} helper={shareLabel(july.arayyaRevenue, july.lovinRevenue + july.arayyaRevenue)} icon={CircleDollarSign} />
      {july.isFullJulyRange && julyActual.data ? <>
        <DashboardKpiCard compact title="Produk Terpetakan" value={formatNumber(julyActual.data.mapped_quantity)} helper="Ringkasan cakupan Juli penuh" icon={PackageCheck} />
        <DashboardKpiCard compact title="Cakupan Item" value={`${formatNumber(julyActual.data.free_quantity)} gratis\n${formatNumber(julyActual.data.unmatched_quantity)} belum terpetakan`} valueClassName="whitespace-pre-line break-words leading-tight" helper="Ringkasan cakupan Juli penuh" icon={Boxes} />
      </> : <Card className="sm:col-span-2"><CardContent className="flex h-full items-center gap-3 p-5"><Info className="h-5 w-5 text-primary" /><p className="text-sm text-muted-foreground">Rincian item terpetakan, gratis, dan belum terpetakan tersedia sebagai ringkasan Juli penuh dan tidak ditampilkan untuk rentang parsial.</p></CardContent></Card>}
    </section> : null}

    {julyActual.data?.rows.length ? <RevenueTrend rows={julyActual.data.rows} mode={trendMode} onModeChange={setTrendMode} /> : null}

    {safeProductAggregation && !productReport.isError ? <section className="space-y-2"><div className="grid gap-4 xl:grid-cols-2">
      <BestSellingProducts items={rankingItems} loading={productReport.isPending} maxItems={5} revenueAvailable={productRevenueAvailable} />
      <CategoryRanking title="Kategori Terlaris" description="Kontribusi kategori berdasarkan quantity pada periode terpilih." items={categoryItems.map((item) => ({ id: item.id, name: item.name, amount: item.quantity, transactionCount: item.productCount }))} totalAmount={totalCategoryQuantity} maxItems={5} metric="quantity" valueLabel="produk" loading={productReport.isPending} />
    </div><div className="flex justify-end"><Link to="/analitik-produk" className="text-sm font-medium text-primary transition-colors hover:text-primary/80">Lihat analitik →</Link></div></section> : null}
    {!safeProductAggregation && !productReport.isError ? <CoverageCard title="Insight produk lintas sumber"><p>Ranking historis dan operasional tidak digabung karena identitas produk pada kedua sumber berbeda.</p></CoverageCard> : null}

    <Card><CardHeader><CardTitle>Performa Subunit</CardTitle></CardHeader><CardContent className="grid gap-3 md:grid-cols-2">
      {july ? <>
        <SubunitCard name="Lovin Milk" revenue={july.lovinRevenue} totalRevenue={july.lovinRevenue + july.arayyaRevenue} />
        <SubunitCard name="Arayya" revenue={july.arayyaRevenue} totalRevenue={july.lovinRevenue + july.arayyaRevenue} />
        {financeCoverage === "PARTIAL" ? <p className="text-xs text-muted-foreground md:col-span-2">Data biaya Juli tidak tersedia; rincian finansial Subunit hanya mencakup bagian periode yang memiliki data.</p> : null}
      </> : subunits.isPending ? <><Skeleton className="h-28" /><Skeleton className="h-28" /></> : subunits.data?.map(({ id, name, report: value }) => <div key={id} className="rounded-lg border p-4"><div className="flex items-start justify-between gap-3"><span className="font-semibold">{name}</span><Badge variant="outline">{sourceStatusLabel(value.source_status)}</Badge></div>{value.financial_available ? <div className="mt-3 grid grid-cols-2 gap-2 text-sm"><Metric label="Omzet" value={formatRupiah(value.revenue ?? 0)} /><Metric label="HPP" value={formatRupiah(value.hpp ?? 0)} /><Metric label="Laba Kotor" value={formatRupiah(value.gross_profit ?? 0)} /><Metric label="Biaya Langsung" value={formatRupiah(value.direct_operational_expense ?? 0)} /><Metric label="Depresiasi" value={formatRupiah(value.attributable_depreciation ?? 0)} /><Metric label="Hasil Kontribusi" value={formatRupiah(value.contribution_before_shared_outlet_cost ?? 0)} /></div> : <p className="mt-3 text-sm text-muted-foreground">{value.message ?? "Rincian finansial belum tersedia."}</p>}</div>)}
    </CardContent></Card>

    <div className="grid gap-4 xl:grid-cols-2">
      <VisitorComposition july={july} total={primary?.visitor_count ?? 0} />
      <FinanceSummary report={primary} coverage={financeCoverage} provisional={primary?.has_provisional_hpp ?? false} />
    </div>

    <Card><CardHeader><CardTitle>Posisi Operasional Saat Ini</CardTitle></CardHeader><CardContent>{inventory.isPending ? <Skeleton className="h-24" /> : inventory.data ? <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Metric label="Jumlah item" value={formatNumber(inventory.data.item_count)} /><Metric label="Quantity tercatat" value={`${formatNumber(inventory.data.quantity)} unit`} /><Metric label="Nilai persediaan" value={formatRupiah(inventory.data.inventory_value)} /><Metric label="Tanpa basis biaya" value={`${formatNumber(inventory.data.items_without_cost_basis)} item`} /><p className="text-xs text-muted-foreground sm:col-span-2 xl:col-span-4">Posisi saat ini per {new Date(inventory.data.as_of).toLocaleString("id-ID")}; bukan posisi pada periode terpilih.</p></div> : <p className="text-sm text-muted-foreground">Posisi persediaan belum tersedia.</p>}</CardContent></Card>

    {july ? <CoverageCard title="Kelengkapan Data Juli"><ul className="grid gap-1 sm:grid-cols-2"><li>Jumlah struk pada sebagian tanggal tidak tersedia.</li><li>Detail produk pada sebagian tanggal tidak tersedia.</li><li>Omzet dan biaya per produk historis tidak tersedia.</li><li>Komposisi transaksi per struk tidak tersedia.</li></ul></CoverageCard> : null}
  </div>;
}

function DateField({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (value: string) => void }) {
  return <div><label className="text-xs font-medium text-muted-foreground" htmlFor={id}>{label}</label><Input className="mt-1 h-9" id={id} type="date" value={value} onChange={(event) => onChange(event.target.value)} /></div>;
}

function shareLabel(value: number, total: number) { const share = safePercentage(value, total); return share === null ? "Kontribusi belum tersedia" : `${formatPercentage(share)} omzet Outlet`; }

function RevenueTrend({ rows, mode, onModeChange }: { rows: JulyActualDailyRow[]; mode: TrendMode; onModeChange: (mode: TrendMode) => void }) {
  const data = useMemo(() => rows.map((row) => ({
    ...row,
    arayyaAvailable: row.arayya_sales !== null,
    arayya_sales: row.arayya_sales ?? 0,
    label: String(Number(row.date.slice(-2))),
    selected: mode === "arayya_sales" ? (row.arayya_sales ?? 0) : row[mode],
  })), [rows, mode]);
  return <Card><CardHeader className="flex flex-row items-start justify-between gap-3 pb-3"><div><CardTitle>Tren Omzet Harian</CardTitle><p className="mt-1 text-sm text-muted-foreground">Arahkan pointer ke grafik untuk melihat rincian harian.</p></div><Select value={mode} onValueChange={(value) => onModeChange(value as TrendMode)}><SelectTrigger className="w-36" aria-label="Pilih seri omzet"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="total_sales">Total</SelectItem><SelectItem value="lovin_sales">Lovin Milk</SelectItem><SelectItem value="arayya_sales">Arayya</SelectItem></SelectContent></Select></CardHeader><CardContent><div className="h-64 w-full"><ResponsiveContainer width="100%" height="100%"><BarChart data={data} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}><CartesianGrid stroke="hsl(var(--border))" strokeOpacity={0.55} strokeDasharray="3 3" vertical={false} /><XAxis dataKey="label" tickLine={false} axisLine={false} /><YAxis tickFormatter={(value: number) => `${Math.round(value / 1_000_000)} jt`} width={42} tickLine={false} axisLine={false} /><Tooltip cursor={{ fill: "#fdf2f8" }} content={({ active, payload }) => { const row = payload?.[0]?.payload as (typeof data)[number] | undefined; return active && row ? <div className="rounded-lg border border-pink-100 bg-white p-3 text-xs text-slate-900 shadow-lg"><p className="mb-2 font-semibold">{new Date(`${row.date}T00:00:00`).toLocaleDateString("id-ID", { dateStyle: "long" })}</p><Metric label="Omzet Total" value={row.total_sales === 0 && row.source_notes ? "Tidak tersedia" : formatRupiah(row.total_sales)} /><Metric label="Lovin Milk" value={row.lovin_sales_raw === null ? "Tidak tersedia" : formatRupiah(row.lovin_sales)} /><Metric label="Arayya" value={!row.arayyaAvailable ? "Tidak tersedia" : formatRupiah(row.arayya_sales)} /><Metric label="Struk Tercatat" value={row.bill_count === null ? "Tidak tersedia" : formatNumber(row.bill_count)} /><Metric label="Qty" value={formatNumber(row.product_quantity)} /><Metric label="Pengunjung" value={row.visitor_total === null ? "Tidak tersedia" : formatNumber(row.visitor_total)} /></div> : null; }} /><Bar dataKey="selected" name="Omzet" fill="#ec4899" activeBar={{ fill: "#db2777" }} radius={[6, 6, 0, 0]} maxBarSize={32} /></BarChart></ResponsiveContainer></div></CardContent></Card>;
}

function SubunitCard({ name, revenue, totalRevenue }: { name: string; revenue: number; totalRevenue: number }) { const share = safePercentage(revenue, totalRevenue); return <div className="rounded-lg border p-4"><div className="flex items-center justify-between gap-3"><p className="font-semibold">{name}</p><span className="text-xs font-medium text-primary">{share === null ? "—" : formatPercentage(share)}</span></div><p className="mt-2 text-xl font-bold">{formatRupiah(revenue)}</p><Progress className="mt-3 h-2" value={share ?? 0} aria-label={`${name}: ${share === null ? "kontribusi belum tersedia" : formatPercentage(share)}`} /><p className="mt-1.5 text-xs text-muted-foreground">Kontribusi terhadap omzet Outlet</p></div>; }
function Metric({ label, value }: { label: string; value: string }) { return <div className="flex justify-between gap-4 py-0.5"><span className="text-muted-foreground">{label}</span><span className="font-medium tabular-nums">{value}</span></div>; }

function VisitorComposition({ july, total }: { july: ReturnType<typeof summarizeJulyActual>; total: number }) {
  const adultShare = july ? safePercentage(july.adultVisitors, july.visitors) : null;
  const childShare = july ? safePercentage(july.childVisitors, july.visitors) : null;
  return <Card><CardHeader><CardTitle>Komposisi Pengunjung</CardTitle></CardHeader><CardContent>{july ? <div className="space-y-4"><VisitorRow label="Dewasa" value={july.adultVisitors} share={adultShare} /><VisitorRow label="Anak" value={july.childVisitors} share={childShare} /><div className="flex justify-between border-t pt-3"><span className="font-medium">Total</span><span className="font-bold">{formatNumber(july.visitors)}</span></div></div> : <div><p className="text-3xl font-bold">{formatNumber(total)}</p><p className="mt-2 text-sm text-muted-foreground">Rincian dewasa dan anak belum tersedia untuk sumber ini.</p></div>}</CardContent></Card>;
}
function VisitorRow({ label, value, share }: { label: string; value: number; share: number | null }) { return <div><div className="mb-2 flex justify-between text-sm"><span>{label}</span><span className="font-medium">{formatNumber(value)} · {share === null ? "—" : formatPercentage(share)}</span></div><Progress value={share ?? 0} aria-label={`${label}: ${share === null ? "tidak tersedia" : formatPercentage(share)}`} /></div>; }

function FinanceSummary({ report, coverage, provisional }: { report: OutletReport | undefined; coverage: ReturnType<typeof getFinanceCoverage>; provisional: boolean }) {
  const unavailable = coverage === "FULLY_UNAVAILABLE";
  return <Card><CardHeader className="flex flex-row items-center justify-between"><CardTitle>Ringkasan Keuangan</CardTitle><Badge variant="outline">{coverage === "AVAILABLE" ? "Tersedia" : coverage === "PARTIAL" ? "Cakupan sebagian" : "Tidak tersedia"}</Badge></CardHeader><CardContent className="space-y-2"><Metric label="HPP" value={unavailable ? "—" : formatRupiah(report?.hpp ?? 0)} /><Metric label="Laba Kotor" value={unavailable ? "—" : formatRupiah(report?.gross_profit ?? 0)} /><Metric label="Pengeluaran Operasional" value={unavailable ? "—" : formatRupiah(report?.operational_expense ?? 0)} /><Metric label="Depresiasi" value={unavailable ? "—" : formatRupiah(report?.depreciation ?? 0)} /><Metric label="Laba Operasional" value={unavailable ? "—" : formatRupiah(report?.operating_profit ?? 0)} /><p className="border-t pt-3 text-xs text-muted-foreground">{unavailable ? "Data biaya tidak tersedia pada sumber aktual Juli." : coverage === "PARTIAL" ? "Data biaya Juli tidak tersedia; nilai keuangan hanya mencakup periode yang memiliki data." : provisional ? "Sebagian HPP masih provisional karena basis biaya inventory belum lengkap." : "Nilai berasal dari laporan keuangan operasional."}</p></CardContent></Card>;
}
function CoverageCard({ title, children }: { title: string; children: React.ReactNode }) { return <Alert><Info className="h-4 w-4" /><AlertTitle>{title}</AlertTitle><AlertDescription className="mt-1 text-xs leading-5">{children}</AlertDescription></Alert>; }
