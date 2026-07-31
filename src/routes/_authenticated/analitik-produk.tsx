import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Boxes, CircleDollarSign, PackageCheck, PackageX, Search, Trophy } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { BestSellingProducts } from "@/components/dashboard/BestSellingProducts";
import { CategoryRanking } from "@/components/dashboard/CategoryRanking";
import { ProductAnalyticsSummary, type ProductSummaryCard } from "@/components/dashboard/ProductAnalyticsSummary";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { jakartaMonthRange } from "@/lib/businessPeriod";
import { formatNumber, formatPercentage, formatRupiah } from "@/lib/format";
import {
  filterProductReportRows, groupProductRowsByCategory, productRowsToRankingItems, rankProductReportRows,
  type ProductAnalyticsSort,
} from "@/lib/productAnalytics";
import { fetchDefaultOutletId, fetchJulyActual, fetchProductReport, hasJulyOverlap, isFullJulyRange, sourceStatusLabel } from "@/lib/reporting";

export const Route = createFileRoute("/_authenticated/analitik-produk")({ component: ProductAnalyticsPage });

function ProductAnalyticsPage() {
  const initial = useMemo(() => jakartaMonthRange(), []);
  const [startDate, setStartDate] = useState(initial.startDate);
  const [endDate, setEndDate] = useState(initial.endDate);
  const [subunitId, setSubunitId] = useState("all");
  const [category, setCategory] = useState("all");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<ProductAnalyticsSort>("quantity-desc");
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);
  const validRange = startDate <= endDate;
  const outlet = useQuery({ queryKey: ["stage7-reporting", "default-outlet"], queryFn: fetchDefaultOutletId });
  const subunits = useQuery({
    queryKey: ["stage7-reporting", "analytics-subunits", outlet.data], enabled: Boolean(outlet.data),
    queryFn: async () => { const { data, error } = await supabase.from("business_subunits").select("id,name").eq("outlet_id", outlet.data!).eq("is_active", true).is("deleted_at", null).order("name"); if (error) throw error; return data; },
  });
  const report = useQuery({
    queryKey: ["stage7-reporting", "products", outlet.data, startDate, endDate, subunitId], enabled: Boolean(outlet.data) && validRange,
    queryFn: () => fetchProductReport(outlet.data!, startDate, endDate, subunitId === "all" ? undefined : subunitId),
  });
  const julyActual = useQuery({
    queryKey: ["july-2026-actual", "product-analytics", startDate, endDate], enabled: validRange && hasJulyOverlap(startDate, endDate),
    queryFn: () => fetchJulyActual(startDate < "2026-07-01" ? "2026-07-01" : startDate, endDate > "2026-07-31" ? "2026-07-31" : endDate),
  });
  const allRows = useMemo(() => [...(report.data?.legacy_rows ?? []), ...(report.data?.operational_rows ?? [])], [report.data]);
  const categories = useMemo(() => [...new Set(allRows.map((row) => row.category_name ?? "Tanpa Kategori"))].sort((a, b) => a.localeCompare(b, "id-ID")), [allRows]);
  const visibleRows = useMemo(() => filterProductReportRows(allRows, { search, category }), [allRows, search, category]);
  const rankedRows = useMemo(() => rankProductReportRows(visibleRows, sort), [visibleRows, sort]);
  const rankingItems = useMemo(() => productRowsToRankingItems(visibleRows), [visibleRows]);
  const categoryItems = useMemo(() => groupProductRowsByCategory(visibleRows), [visibleRows]);
  const totalQuantity = visibleRows.reduce((total, row) => total + row.quantity, 0);
  const totalRevenue = visibleRows.reduce((total, row) => total + (row.revenue ?? 0), 0);
  const totalGrossProfit = visibleRows.reduce((total, row) => total + (row.gross_profit ?? 0), 0);
  const operationalOnly = visibleRows.length > 0 && visibleRows.every((row) => row.source_status === "operational");
  const financialAvailable = operationalOnly && visibleRows.every((row) => row.financial_available);
  const mixed = visibleRows.some((row) => row.source_status === "legacy") && visibleRows.some((row) => row.source_status === "operational");
  const provisional = visibleRows.some((row) => row.has_provisional_hpp);
  const fullJuly = isFullJulyRange(startDate, endDate) && (julyActual.data?.rows.length ?? 0) > 0 && subunitId === "all";
  const summaryItems = useMemo<ProductSummaryCard[]>(() => {
    if (fullJuly && julyActual.data) return [
      { title: "Qty Tercatat", value: formatNumber(totalQuantity), helper: "Periode terpilih", icon: Boxes },
      { title: "Terpetakan", value: formatNumber(julyActual.data.mapped_quantity), helper: "Ringkasan cakupan Juli penuh", icon: PackageCheck },
      { title: "Item Gratis", value: formatNumber(julyActual.data.free_quantity), helper: "Tercatat sebagai item gratis", icon: PackageX },
      { title: "Belum Terpetakan", value: formatNumber(julyActual.data.unmatched_quantity), helper: "Tetap dipertahankan sebagai histori", icon: AlertTriangle },
    ];
    if (financialAvailable) return [
      { title: "Qty Terjual", value: formatNumber(totalQuantity), helper: "Berdasarkan filter aktif", icon: Boxes },
      { title: "Produk Terjual", value: formatNumber(visibleRows.length), helper: "Baris produk yang tampil", icon: PackageCheck },
      { title: "Omzet Produk", value: formatRupiah(totalRevenue), helper: "Data operasional", icon: CircleDollarSign },
      { title: "Laba Kotor", value: formatRupiah(totalGrossProfit), helper: provisional ? "Mengandung HPP provisional" : "Data operasional", icon: Trophy },
    ];
    return [
      { title: "Qty Tercatat", value: formatNumber(totalQuantity), helper: "Berdasarkan filter aktif", icon: Boxes },
      { title: "Produk Tercatat", value: formatNumber(visibleRows.length), helper: "Identitas sumber tetap dipertahankan", icon: PackageCheck },
      { title: "Kategori", value: formatNumber(categoryItems.length), helper: "Pada hasil yang tampil", icon: Trophy },
      { title: "Metrik Finansial", value: mixed ? "Cakupan sebagian" : "Tidak tersedia", helper: mixed ? "Hanya baris operasional" : "Sumber historis hanya menyediakan qty", icon: CircleDollarSign },
    ];
  }, [categoryItems.length, financialAvailable, fullJuly, julyActual.data, mixed, provisional, totalGrossProfit, totalQuantity, totalRevenue, visibleRows.length]);
  const pageCount = Math.max(1, Math.ceil(rankedRows.length / pageSize));
  const pageRows = rankedRows.slice((page - 1) * pageSize, page * pageSize);
  useEffect(() => setPage(1), [search, category, sort, pageSize, startDate, endDate, subunitId]);
  useEffect(() => { if (page > pageCount) setPage(pageCount); }, [page, pageCount]);

  return <div className="space-y-5">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><PageHeader title="Analitik Produk & Kategori" description="Pantau performa produk, kategori terlaris, kontribusi penjualan, dan metrik finansial yang tersedia." /><Badge variant="outline" className="w-fit shrink-0">{report.data ? sourceStatusLabel(report.data.source_status) : "Memuat sumber data"}</Badge></div>
    <Card><CardContent className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-5">
      <DateField id="analytics-start" label="Tanggal mulai" value={startDate} onChange={setStartDate} />
      <DateField id="analytics-end" label="Tanggal akhir" value={endDate} onChange={setEndDate} />
      <FilterSelect label="Subunit" id="analytics-subunit" value={subunitId} onChange={setSubunitId} options={subunits.data?.map((row) => ({ value: row.id, label: row.name })) ?? []} allLabel="Semua Subunit" />
      <FilterSelect label="Kategori" id="analytics-category" value={category} onChange={setCategory} options={categories.map((name) => ({ value: name, label: name }))} allLabel="Semua Kategori" />
      <div><label className="text-xs font-medium text-muted-foreground" htmlFor="analytics-search">Cari Produk</label><div className="relative mt-1"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input id="analytics-search" className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nama produk..." /></div></div>
    </CardContent></Card>
    {!validRange ? <Alert variant="destructive"><AlertTitle>Rentang tanggal tidak valid</AlertTitle><AlertDescription>Tanggal mulai tidak boleh melewati tanggal akhir.</AlertDescription></Alert> : null}
    {report.isError ? <Alert variant="destructive"><AlertTitle>Analitik gagal dimuat</AlertTitle><AlertDescription>Data produk belum dapat ditampilkan. Silakan coba lagi.</AlertDescription></Alert> : null}
    {subunitId !== "all" && hasJulyOverlap(startDate, endDate) ? <Alert><AlertTriangle className="h-4 w-4" /><AlertTitle>Cakupan filter Subunit</AlertTitle><AlertDescription>Data historis produk tidak memiliki atribusi Subunit. Filter Subunit hanya menampilkan data operasional yang tersedia.</AlertDescription></Alert> : null}
    {provisional ? <Alert><AlertTriangle className="h-4 w-4" /><AlertTitle>HPP provisional</AlertTitle><AlertDescription>Sebagian produk operasional belum memiliki basis biaya inventory yang lengkap.</AlertDescription></Alert> : null}

    <ProductAnalyticsSummary items={summaryItems} loading={report.isPending} periodLabel={`${formatDate(startDate)}–${formatDate(endDate)}`} />

    {mixed ? <Alert><AlertTriangle className="h-4 w-4" /><AlertTitle>Periode lintas sumber</AlertTitle><AlertDescription>Baris historis dan operasional dipertahankan terpisah. Metrik finansial hanya tersedia pada baris operasional dan tidak dianggap mewakili seluruh periode.</AlertDescription></Alert> : null}
    <div className="grid gap-4 xl:grid-cols-2">
      <BestSellingProducts items={rankingItems} loading={report.isPending} maxItems={5} revenueAvailable={financialAvailable} />
      <CategoryRanking title="Kategori Terlaris" description="Kontribusi kategori berdasarkan quantity hasil filter." items={categoryItems.map((item) => ({ id: item.id, name: item.name, amount: item.quantity, transactionCount: item.productCount }))} totalAmount={totalQuantity} maxItems={5} metric="quantity" valueLabel="produk" loading={report.isPending} />
    </div>

    <Card><CardContent className="p-0">
      <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-end sm:justify-between"><div><h2 className="font-semibold">Ranking Produk</h2><p className="text-sm text-muted-foreground">{formatNumber(rankedRows.length)} produk tercatat pada periode ini · {formatNumber(totalQuantity)} qty</p></div><div className="flex flex-wrap gap-2"><FilterSelect label="Urutkan" id="analytics-sort" value={sort} onChange={(value) => setSort(value as ProductAnalyticsSort)} allLabel="" options={[{ value: "quantity-desc", label: "Qty terbanyak" }, { value: "quantity-asc", label: "Qty paling sedikit" }, { value: "name-asc", label: "Produk A–Z" }, { value: "name-desc", label: "Produk Z–A" }, ...(financialAvailable ? [{ value: "revenue-desc", label: "Omzet terbesar" }, { value: "gross-profit-desc", label: "Laba Kotor terbesar" }] : [])]} includeAll={false} /><FilterSelect label="Baris" id="analytics-page-size" value={String(pageSize)} onChange={(value) => setPageSize(Number(value))} allLabel="" options={[10, 25, 50].map((value) => ({ value: String(value), label: String(value) }))} includeAll={false} /></div></div>
      {report.isPending ? <div className="p-4"><Skeleton className="h-72" /></div> : rankedRows.length === 0 ? <p className="py-16 text-center text-sm text-muted-foreground">Tidak ada produk yang sesuai dengan filter.</p> : <div className={mixed ? "overflow-x-auto" : "overflow-x-auto [&_th:last-child]:hidden [&_td:last-child]:hidden"}><Table>
        <TableHeader><TableRow><TableHead className="w-16">Rank</TableHead><TableHead>Produk</TableHead><TableHead>Kategori</TableHead>{(operationalOnly || mixed) ? <TableHead>Subunit</TableHead> : null}<TableHead className="text-right">Qty</TableHead><TableHead className="text-right">Kontribusi Qty</TableHead>{(financialAvailable || mixed) ? <><TableHead className="text-right">Omzet</TableHead><TableHead className="text-right">HPP</TableHead><TableHead className="text-right">Laba Kotor</TableHead><TableHead className="text-right">Margin</TableHead></> : null}<TableHead>Sumber</TableHead></TableRow></TableHeader>
        <TableBody>{pageRows.map((row) => <TableRow key={row.rowKey}><TableCell className="font-semibold">{row.rank}</TableCell><TableCell className="min-w-48 font-medium">{row.product_name}</TableCell><TableCell>{row.category_name ?? "Tanpa Kategori"}</TableCell>{(operationalOnly || mixed) ? <TableCell>{row.subunit_name ?? "—"}</TableCell> : null}<TableCell className="text-right tabular-nums">{formatNumber(row.quantity)}</TableCell><TableCell className="text-right tabular-nums">{formatPercentage(row.quantityContribution)}</TableCell>{(financialAvailable || mixed) ? <><MoneyCell value={row.revenue} /><MoneyCell value={row.hpp} /><MoneyCell value={row.gross_profit} /><TableCell className="text-right">{row.financial_available && row.margin_percent !== null && row.margin_percent !== undefined ? formatPercentage(row.margin_percent) : "—"}</TableCell></> : null}<TableCell><Badge variant="outline">{row.source_status === "legacy" ? "Historis · Qty saja" : row.has_provisional_hpp ? "HPP provisional" : "Operasional"}</Badge></TableCell></TableRow>)}</TableBody>
      </Table></div>}
      {rankedRows.length > 0 ? <div className="flex items-center justify-between border-t p-4"><p className="text-xs text-muted-foreground">Halaman {page} dari {pageCount}</p><div className="flex gap-2"><Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Sebelumnya</Button><Button variant="outline" size="sm" disabled={page === pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))}>Berikutnya</Button></div></div> : null}
    </CardContent></Card>

    {(julyActual.data?.rows.length ?? 0) > 0 ? <Alert><AlertTriangle className="h-4 w-4" /><AlertTitle>Kelengkapan Data Produk Juli</AlertTitle><AlertDescription>Data produk Juli berasal dari catatan jumlah item. Omzet dan HPP per produk tidak tersedia.{fullJuly ? ` ${formatNumber(julyActual.data!.mapped_quantity)} item terpetakan, ${formatNumber(julyActual.data!.unmatched_quantity)} belum terpetakan, dan ${formatNumber(julyActual.data!.free_quantity)} item gratis pada ringkasan Juli penuh.` : " Rincian pemetaan penuh tidak ditampilkan untuk rentang tanggal parsial."}</AlertDescription></Alert> : null}
  </div>;
}

function DateField({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (value: string) => void }) { return <div><label className="text-xs font-medium text-muted-foreground" htmlFor={id}>{label}</label><Input className="mt-1" id={id} type="date" value={value} onChange={(event) => onChange(event.target.value)} /></div>; }

function FilterSelect({ label, id, value, onChange, options, allLabel, includeAll = true }: { label: string; id: string; value: string; onChange: (value: string) => void; options: { value: string; label: string }[]; allLabel: string; includeAll?: boolean }) { return <div><label className="text-xs font-medium text-muted-foreground" htmlFor={id}>{label}</label><Select value={value} onValueChange={onChange}><SelectTrigger id={id} className="mt-1 min-w-36"><SelectValue /></SelectTrigger><SelectContent>{includeAll ? <SelectItem value="all">{allLabel}</SelectItem> : null}{options.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent></Select></div>; }
function MoneyCell({ value }: { value: number | null }) { return <TableCell className="text-right tabular-nums">{value === null ? <span className="text-muted-foreground">—</span> : formatRupiah(value)}</TableCell>; }
function formatDate(value: string) { return new Date(`${value}T00:00:00`).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" }); }
