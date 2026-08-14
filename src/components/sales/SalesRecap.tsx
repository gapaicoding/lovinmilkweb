import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, FileSpreadsheet, LoaderCircle, RefreshCcw } from "lucide-react";
import { toast } from "sonner";
import { SalesRecapDailyClosing } from "@/components/sales/SalesRecapDailyClosing";
import { SalesRecapPeriodTable } from "@/components/sales/SalesRecapPeriodTable";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/useAuth";
import { useBusinessStructure } from "@/hooks/useBusinessStructure";
import { computeRange, type RangePreset } from "@/components/DateRangeFilter";
import { toDateInput } from "@/lib/format";
import { jakartaToday } from "@/lib/reportExport";
import { exportSalesRecapWorkbook } from "@/lib/salesRecapWorkbook";
import { fetchSalesRecapDaily, saveSalesDailyClosing, validateCashDailyClosing, validateSalesDailyClosing, type SalesDailyClosingDraft } from "@/lib/salesRecap";

type PeriodPreset = "today" | "yesterday" | "this_week" | "last_7_days" | "this_month" | "last_month" | "selected_month" | "custom";
const recapKeys = { all: ["sales-recap"] as const, range: (outlet: string | null, from: string, to: string) => ["sales-recap", outlet, from, to] as const };

export function SalesRecap() {
  const { isAdmin } = useAuth();
  const { outlet, isLoading: outletLoading, error: outletError } = useBusinessStructure();
  const queryClient = useQueryClient();
  const today = useMemo(() => toDateInput(jakartaToday()), []);
  const [view, setView] = useState("daily");
  const [dailyDate, setDailyDate] = useState(today);
  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>("this_month");
  const initialPeriod = useMemo(() => toIsoRange("this_month"), []);
  const [periodFrom, setPeriodFrom] = useState(initialPeriod.from);
  const [periodTo, setPeriodTo] = useState(initialPeriod.to);
  const [selectedMonth, setSelectedMonth] = useState(today.slice(0, 7));
  const outletId = outlet?.id ?? null;

  const dailyQuery = useQuery({
    queryKey: recapKeys.range(outletId, dailyDate, dailyDate), enabled: Boolean(outletId),
    queryFn: () => fetchSalesRecapDaily(outletId!, dailyDate, dailyDate),
  });
  const periodQuery = useQuery({
    queryKey: recapKeys.range(outletId, periodFrom, periodTo), enabled: Boolean(outletId) && periodFrom <= periodTo && periodTo <= today,
    queryFn: () => fetchSalesRecapDaily(outletId!, periodFrom, periodTo),
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: recapKeys.all });
  const mutation = useMutation({
    mutationFn: async (task: () => Promise<void>) => task(),
    onSuccess: async () => { await refresh(); },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Aksi Rekap Sales gagal."),
  });
  const dailyRow = dailyQuery.data?.rows[0] ?? null;
  const isFuture = dailyDate > today;

  const save = async (draft: SalesDailyClosingDraft) => {
    if (!outletId) return;
    await mutation.mutateAsync(() => saveSalesDailyClosing(outletId, dailyDate, draft));
    toast.success("Draft closing berhasil disimpan.");
  };
  const validateSales = async () => {
    if (!outletId || !dailyRow) return;
    await mutation.mutateAsync(() => validateSalesDailyClosing(outletId, dailyDate, dailyRow.current_revision));
    toast.success("Validasi Sales berhasil.");
  };
  const validateCash = async () => {
    if (!outletId || !dailyRow) return;
    await mutation.mutateAsync(() => validateCashDailyClosing(outletId, dailyDate, dailyRow.current_revision));
    toast.success("Validasi Cash Akhir berhasil.");
  };
  const applyPreset = (preset: PeriodPreset) => {
    setPeriodPreset(preset);
    if (preset === "selected_month") { const range = monthRange(selectedMonth); setPeriodFrom(range.from); setPeriodTo(range.to); return; }
    if (preset === "custom") return;
    const range = toIsoRange(preset); setPeriodFrom(range.from); setPeriodTo(range.to);
  };
  const exportCurrent = async () => {
    const data = view === "daily" ? dailyQuery.data : periodQuery.data;
    const from = view === "daily" ? dailyDate : periodFrom;
    const to = view === "daily" ? dailyDate : periodTo;
    if (!data) return;
    try { await exportSalesRecapWorkbook(data.rows, from, to); toast.success("Excel Rekap Sales berhasil dibuat."); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Export Excel gagal."); }
  };

  if (outletLoading) return <div className="flex min-h-64 items-center justify-center"><LoaderCircle className="h-7 w-7 animate-spin" /></div>;
  if (outletError || !outlet) return <Alert variant="destructive"><AlertDescription>Outlet aktif gagal dimuat. {errorMessage(outletError)}</AlertDescription></Alert>;

  return <div className="space-y-5">
    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between"><div><div className="flex items-center gap-2"><CalendarDays className="h-6 w-6" /><h1 className="text-2xl font-bold tracking-tight">Rekap Sales</h1></div><p className="mt-2 text-sm text-muted-foreground">Closing harian dan rekonsiliasi berbasis transaksi aktif. Satu transaksi aktif dihitung sebagai satu struk.</p></div><div className="flex gap-2"><Button variant="outline" onClick={() => void refresh()}><RefreshCcw className="mr-2 h-4 w-4" />Refresh</Button><Button variant="outline" disabled={(view === "daily" ? dailyQuery : periodQuery).isLoading} onClick={() => void exportCurrent()}><FileSpreadsheet className="mr-2 h-4 w-4" />Export Rekap</Button></div></div>
    <Tabs value={view} onValueChange={setView}><TabsList><TabsTrigger value="daily">Closing Harian</TabsTrigger><TabsTrigger value="period">Rekap Periode</TabsTrigger></TabsList>
      <TabsContent value="daily" className="space-y-5"><Card><CardContent className="pt-6"><div className="max-w-xs space-y-2"><Label htmlFor="closing-date">Tanggal Closing</Label><Input id="closing-date" type="date" max={today} value={dailyDate} onChange={(event) => setDailyDate(event.target.value)} /></div>{isFuture ? <p className="mt-2 text-sm text-destructive">Tanggal masa depan tidak dapat ditutup.</p> : null}</CardContent></Card>
        {dailyQuery.isLoading ? <Loading /> : dailyQuery.error ? <ErrorAlert error={dailyQuery.error} /> : dailyRow ? <SalesRecapDailyClosing row={dailyRow} canValidate={isAdmin && !isFuture} isMutating={mutation.isPending} onSave={save} onValidateSales={validateSales} onValidateCash={validateCash} /> : <ErrorAlert error={new Error("Data harian tidak tersedia.")} />}
      </TabsContent>
      <TabsContent value="period" className="space-y-5"><Card><CardHeader><CardTitle>Periode Rekap</CardTitle></CardHeader><CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"><div className="space-y-2"><Label>Preset</Label><Select value={periodPreset} onValueChange={(value) => applyPreset(value as PeriodPreset)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{[
        ["today","Hari Ini"],["yesterday","Kemarin"],["this_week","Minggu Ini"],["last_7_days","7 Hari Terakhir"],["this_month","Bulan Ini"],["last_month","Bulan Sebelumnya"],["selected_month","Pilih Bulan"],["custom","Custom Range"],
      ].map(([value,label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>
        {periodPreset === "selected_month" ? <div className="space-y-2"><Label>Pilih Bulan</Label><Input type="month" max={today.slice(0, 7)} value={selectedMonth} onChange={(event) => { setSelectedMonth(event.target.value); const range=monthRange(event.target.value); setPeriodFrom(range.from); setPeriodTo(range.to); }} /></div> : null}
        <div className="space-y-2"><Label>Dari tanggal</Label><Input type="date" max={today} disabled={periodPreset !== "custom"} value={periodFrom} onChange={(event) => setPeriodFrom(event.target.value)} /></div><div className="space-y-2"><Label>Sampai tanggal</Label><Input type="date" max={today} disabled={periodPreset !== "custom"} value={periodTo} onChange={(event) => setPeriodTo(event.target.value)} /></div>
      </CardContent></Card>{periodFrom > periodTo ? <Alert variant="destructive"><AlertDescription>Tanggal awal tidak boleh melewati tanggal akhir.</AlertDescription></Alert> : periodQuery.isLoading ? <Loading /> : periodQuery.error ? <ErrorAlert error={periodQuery.error} /> : <SalesRecapPeriodTable rows={periodQuery.data?.rows ?? []} onOpenDate={(date) => { setDailyDate(date); setView("daily"); }} />}</TabsContent>
    </Tabs>
  </div>;
}

function toIsoRange(preset: Exclude<PeriodPreset, "selected_month" | "custom">) { const range = computeRange(preset as RangePreset, undefined, undefined, jakartaToday()); return { from: toDateInput(range.from), to: toDateInput(range.to) }; }
function monthRange(month: string) { const [year, monthNumber] = month.split("-").map(Number); const lastDay = new Date(year, monthNumber, 0).getDate(); const from = `${year}-${String(monthNumber).padStart(2,"0")}-01`; const monthEnd = `${year}-${String(monthNumber).padStart(2,"0")}-${String(lastDay).padStart(2,"0")}`; const today = toDateInput(jakartaToday()); return { from, to: monthEnd > today ? today : monthEnd }; }
function Loading() { return <div className="flex min-h-48 items-center justify-center"><LoaderCircle className="h-7 w-7 animate-spin" /></div>; }
function ErrorAlert({ error }: { error: unknown }) { return <Alert variant="destructive"><AlertDescription>Rekap Sales gagal dimuat: {errorMessage(error)}</AlertDescription></Alert>; }
function errorMessage(error: unknown) { return error instanceof Error ? error.message : "Periksa koneksi lalu coba lagi."; }
