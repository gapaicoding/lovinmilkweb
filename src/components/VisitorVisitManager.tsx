import { useEffect, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Loader2, Plus, Search, UserRoundCheck, Users } from "lucide-react";
import { toast } from "sonner";

import { Route } from "@/routes/_authenticated/kunjungan";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useBusinessStructure } from "@/hooks/useBusinessStructure";
import { useVisitorProfileOptions, visitorSalesQueryKeys } from "@/hooks/useVisitorSalesIntegration";
import {
  formatJakartaDateTime,
  formatJakartaTime,
  formatVisitDuration,
  jakartaToday,
  parseVisitPage,
  type VisitorVisitRow,
} from "@/lib/visitor";
import { formatDate, formatRupiah } from "@/lib/format";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { VisitorStatusBadge } from "@/components/visitor/VisitorStatusBadge";
import { VisitorDateFilter } from "@/components/visitor/VisitorDateFilter";
import {
  resolveVisitorDateRange,
  normalizeVisitorDateFilter,
  type VisitorDateFilterValue,
} from "@/lib/visitorDatePeriod";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";

const PAGE_SIZE = 15;

export function VisitorVisitManager() {
  const { canManageVisitorVisits } = useAuth();
  const { outlet } = useBusinessStructure();
  const queryClient = useQueryClient();
  const routeSearch = Route.useSearch();
  const dateFilter = normalizeVisitorDateFilter(routeSearch);
  const navigate = Route.useNavigate();

  const [tab, setTab] = useState<"active" | "history">("active");
  const [search, setSearch] = useState("");
  const [historyPage, setHistoryPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);
  const [checkoutVisit, setCheckoutVisit] = useState<VisitorVisitRow | null>(null);
  const [visitDate, setVisitDate] = useState(jakartaToday());
  const [adultCount, setAdultCount] = useState("1");
  const [childCount, setChildCount] = useState("0");
  const [notes, setNotes] = useState("");
  const [visitorSearch, setVisitorSearch] = useState("");
  const [selectedVisitorId, setSelectedVisitorId] = useState<string | null>(null);

  const summaryActiveQuery = useVisitQuery("active", "", 1, { period: "all" }, 100);
  const summaryHistoryQuery = useVisitQuery("history", "", 1, { period: "all" }, 100);
  const activeQuery = useVisitQuery("active", search, 1, dateFilter);
  const historyQuery = useVisitQuery("history", search, historyPage, dateFilter);
  const detailQuery = useVisitQuery(
    "all",
    routeSearch.visitId ?? "",
    1,
    { period: "all" },
    1,
    Boolean(routeSearch.visitId),
  );
  const visitorProfilesQuery = useVisitorProfileOptions(visitorSearch, formOpen);
  const detailVisit = detailQuery.data?.rows[0] ?? null;

  const invalidateVisitorData = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["visitor-visits"] }),
      queryClient.invalidateQueries({ queryKey: ["visitors"] }),
      queryClient.invalidateQueries({ queryKey: ["sales-transactions"] }),
      queryClient.invalidateQueries({ queryKey: visitorSalesQueryKeys.all }),
    ]);
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      const adults = Number(adultCount);
      const children = Number(childCount);
      if (!Number.isInteger(adults) || adults < 0) {
        throw new Error("Jumlah pengunjung dewasa harus berupa bilangan bulat minimal 0.");
      }
      if (!Number.isInteger(children) || children < 0) {
        throw new Error("Jumlah pengunjung anak harus berupa bilangan bulat minimal 0.");
      }
      if (adults + children < 1) throw new Error("Jumlah pengunjung minimal satu orang.");
      if (!outlet?.id) throw new Error("Outlet aktif tidak ditemukan.");

      const { data, error } = await supabase.rpc("create_operational_visitor_visit", {
        p_visit_date: visitDate,
        p_adult_count: adults,
        p_child_count: children,
        p_outlet_id: outlet.id,
        ...(selectedVisitorId ? { p_visitor_id: selectedVisitorId } : {}),
        ...(notes.trim() ? { p_notes: notes.trim() } : {}),
      });
      if (error) throw error;
      return data;
    },
    onSuccess: async () => {
      toast.success("Kunjungan berhasil dicatat.");
      closeForm();
      await invalidateVisitorData();
    },
    onError: (error: Error) =>
      toast.error("Kunjungan gagal disimpan.", { description: error.message }),
  });

  const checkoutMutation = useMutation({
    mutationFn: async (visitId: string) => {
      const { error } = await supabase.rpc("check_out_visitor", { p_visit_id: visitId });
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Pengunjung berhasil ditandai pulang.");
      setCheckoutVisit(null);
      await invalidateVisitorData();
    },
    onError: (error: Error) =>
      toast.error("Gagal menandai pulang.", { description: error.message }),
  });

  const updateDateFilter = (next: VisitorDateFilterValue) => {
    setHistoryPage(1);
    void navigate({ search: next });
  };
  const closeDetail = () => void navigate({ search: dateFilter.period === "all" ? {} : dateFilter });
  const closeForm = () => {
    setFormOpen(false);
    setVisitDate(jakartaToday());
    setAdultCount("1");
    setChildCount("0");
    setNotes("");
    setVisitorSearch("");
    setSelectedVisitorId(null);
  };

  useEffect(() => {
    if (routeSearch.visitId && detailVisit?.check_out_at) setTab("history");
  }, [detailVisit?.check_out_at, routeSearch.visitId]);

  if (!canManageVisitorVisits) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Akses ditolak</AlertTitle>
        <AlertDescription>Role Anda tidak dapat mengelola kunjungan.</AlertDescription>
      </Alert>
    );
  }

  const todayVisits = [
    ...(summaryActiveQuery.data?.rows ?? []),
    ...(summaryHistoryQuery.data?.rows ?? []),
  ].filter((row) => row.visit_date === jakartaToday());
  const todayPeople = todayVisits.reduce(
    (total, row) => total + (row.total_visitors ?? 1),
    0,
  );

  return (
    <div className="space-y-4">
      <PageHeader
        title="Kunjungan Pengunjung"
        description="Catat kehadiran pengunjung. Nilai pembelian berasal dari transaksi Data Penjualan yang terhubung."
        actions={
          <Button onClick={() => setFormOpen(true)}>
            <Plus className="mr-2 h-4 w-4" /> Catat Kunjungan
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryCard title="Kunjungan Aktif" value={summaryActiveQuery.data?.total ?? 0} />
        <SummaryCard title="Pengunjung Hari Ini" value={todayPeople} />
        <SummaryCard
          title="Sudah Pulang Hari Ini"
          value={(summaryHistoryQuery.data?.rows ?? []).filter(
            (row) => row.check_out_at && row.visit_date === jakartaToday(),
          ).length}
        />
      </div>

      <Card>
        <CardContent className="space-y-4 p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
            <div className="relative w-full lg:max-w-md">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Cari nama, kode, atau nomor telepon..."
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setHistoryPage(1);
                }}
              />
            </div>
            <VisitorDateFilter
              idPrefix="visit-list"
              value={dateFilter}
              onChange={updateDateFilter}
              disabled={activeQuery.isFetching || historyQuery.isFetching}
            />
          </div>
          <Tabs value={tab} onValueChange={(value) => setTab(value as "active" | "history")}>
            <TabsList>
              <TabsTrigger value="active">Sedang Berkunjung</TabsTrigger>
              <TabsTrigger value="history">Riwayat Kunjungan</TabsTrigger>
            </TabsList>
            <TabsContent value="active">
              <VisitTable
                rows={activeQuery.data?.rows ?? []}
                loading={activeQuery.isLoading}
                active
                filtered={dateFilter.period !== "all" || Boolean(search.trim())}
                onCheckout={setCheckoutVisit}
                onDetail={(row) => void navigate({ search: { ...dateFilter, visitId: row.id } })}
              />
            </TabsContent>
            <TabsContent value="history">
              <VisitTable
                rows={historyQuery.data?.rows ?? []}
                loading={historyQuery.isLoading}
                filtered={dateFilter.period !== "all" || Boolean(search.trim())}
                onDetail={(row) => void navigate({ search: { ...dateFilter, visitId: row.id } })}
              />
              <Pagination page={historyPage} total={historyQuery.data?.total ?? 0} onPage={setHistoryPage} />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <Dialog open={formOpen} onOpenChange={(open) => !open && closeForm()}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Catat Kunjungan</DialogTitle>
            <DialogDescription>
              Catat jumlah pengunjung tanpa nominal pembelian. Transaksi dapat ditambahkan sesudah kunjungan disimpan.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Field label="Tanggal kunjungan">
              <Input type="date" value={visitDate} onChange={(event) => setVisitDate(event.target.value)} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Dewasa">
                <Input type="number" min="0" step="1" value={adultCount} onChange={(event) => setAdultCount(event.target.value)} />
              </Field>
              <Field label="Anak">
                <Input type="number" min="0" step="1" value={childCount} onChange={(event) => setChildCount(event.target.value)} />
              </Field>
            </div>
            <Field label="Pengunjung (opsional)">
              <Input
                value={visitorSearch}
                placeholder="Cari profil; kosongkan untuk Tamu Umum"
                onChange={(event) => {
                  setVisitorSearch(event.target.value);
                  setSelectedVisitorId(null);
                }}
              />
            </Field>
            {selectedVisitorId ? (
              <div className="flex items-center justify-between rounded-md border bg-muted/30 px-3 py-2 text-sm">
                <span>{visitorProfilesQuery.data?.find((visitor) => visitor.id === selectedVisitorId)?.full_name ?? "Pengunjung dipilih"}</span>
                <Button type="button" variant="ghost" size="sm" onClick={() => setSelectedVisitorId(null)}>Gunakan Tamu Umum</Button>
              </div>
            ) : visitorSearch.trim() ? (
              <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border p-2">
                {visitorProfilesQuery.isLoading ? <Skeleton className="h-10" /> : null}
                {(visitorProfilesQuery.data ?? []).map((visitor) => (
                  <button type="button" key={visitor.id} className="w-full rounded-md p-2 text-left text-sm hover:bg-muted" onClick={() => setSelectedVisitorId(visitor.id)}>
                    <span className="font-medium">{visitor.full_name}</span>
                    <span className="ml-2 text-xs text-muted-foreground">{visitor.visitor_code} · {visitor.phone || "tanpa telepon"}</span>
                  </button>
                ))}
                {!visitorProfilesQuery.isLoading && !(visitorProfilesQuery.data ?? []).length ? (
                  <p className="p-2 text-sm text-muted-foreground">Profil tidak ditemukan. Gunakan Tamu Umum.</p>
                ) : null}
              </div>
            ) : null}
            <Field label="Catatan kunjungan (opsional)">
              <Textarea rows={3} maxLength={500} value={notes} onChange={(event) => setNotes(event.target.value)} />
            </Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeForm}>Batal</Button>
            <Button disabled={createMutation.isPending} onClick={() => createMutation.mutate()}>
              {createMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserRoundCheck className="mr-2 h-4 w-4" />}
              Simpan Kunjungan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(routeSearch.visitId)} onOpenChange={(open) => !open && closeDetail()}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detail Kunjungan</DialogTitle>
            <DialogDescription>Kehadiran, transaksi terhubung, dan data pembelian historis ditampilkan terpisah.</DialogDescription>
          </DialogHeader>
          {detailQuery.isLoading ? <Skeleton className="h-56" /> : detailVisit ? (
            <VisitDetail visit={detailVisit} />
          ) : (
            <EmptyState title="Kunjungan tidak ditemukan" description="Data mungkin telah diarsipkan atau tidak dapat diakses." />
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(checkoutVisit)} onOpenChange={(open) => !open && setCheckoutVisit(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Tandai pengunjung ini sudah pulang?</AlertDialogTitle>
            <AlertDialogDescription>
              {checkoutVisit?.visitor_code} · {checkoutVisit?.full_name}<br />
              Masuk {checkoutVisit ? formatJakartaDateTime(checkoutVisit.check_in_at) : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <Button disabled={checkoutMutation.isPending} onClick={() => checkoutVisit && checkoutMutation.mutate(checkoutVisit.id)}>
              {checkoutMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Tandai Pulang
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function useVisitQuery(
  status: "active" | "history" | "all",
  search: string,
  page: number,
  dateFilter: VisitorDateFilterValue,
  pageSize = PAGE_SIZE,
  enabled = true,
) {
  const range = resolveVisitorDateRange(dateFilter);
  return useQuery({
    queryKey: ["visitor-visits", status, search.trim(), dateFilter.period, dateFilter.from, dateFilter.to, page, pageSize],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("list_visitor_visits", {
        p_status: status,
        p_query: search.trim(),
        p_from: range.from ?? undefined,
        p_to: range.to ?? undefined,
        p_page: page,
        p_page_size: pageSize,
      });
      if (error) throw error;
      return parseVisitPage(data);
    },
  });
}

function VisitTable({
  rows,
  loading,
  active = false,
  filtered = false,
  onCheckout,
  onDetail,
}: {
  rows: VisitorVisitRow[];
  loading: boolean;
  active?: boolean;
  filtered?: boolean;
  onCheckout?: (row: VisitorVisitRow) => void;
  onDetail: (row: VisitorVisitRow) => void;
}) {
  if (loading) return <div className="space-y-2 py-4"><Skeleton className="h-12" /><Skeleton className="h-12" /></div>;
  if (!rows.length) return <EmptyState title={filtered ? "Tidak ada kunjungan pada periode ini" : active ? "Belum ada pengunjung aktif" : "Riwayat kunjungan belum tersedia"} description={filtered ? "Coba pilih periode lain atau ubah kata pencarian." : "Kunjungan akan tampil setelah kehadiran dicatat."} />;

  return (
    <div className="overflow-auto rounded-lg border">
      <Table>
        <TableHeader><TableRow>
          <TableHead>Tanggal</TableHead><TableHead>Pengunjung</TableHead><TableHead>Jumlah</TableHead>
          <TableHead>Transaksi Terhubung</TableHead><TableHead className="text-right">Total Pembelian</TableHead>
          <TableHead>Sumber</TableHead><TableHead className="text-right">Aksi</TableHead>
        </TableRow></TableHeader>
        <TableBody>{rows.map((row) => (
          <TableRow key={row.id}>
            <TableCell className="whitespace-nowrap"><div>{formatDate(row.visit_date)}</div><div className="text-xs text-muted-foreground">{formatJakartaTime(row.check_in_at)}{row.check_out_at ? ` – ${formatJakartaTime(row.check_out_at)}` : ""}</div></TableCell>
            <TableCell><div className="font-medium">{row.full_name}</div><div className="text-xs text-muted-foreground">{row.visitor_code} · {row.phone || "—"}</div></TableCell>
            <TableCell>{row.total_visitors === null ? <span className="text-xs text-muted-foreground">Data lama</span> : <div><span className="font-medium">{row.total_visitors}</span><div className="text-xs text-muted-foreground">{row.adult_count} dewasa · {row.child_count} anak</div></div>}</TableCell>
            <TableCell><div className="font-medium">{row.active_transaction_count} transaksi</div>{row.archived_transaction_count ? <div className="text-xs text-muted-foreground">{row.archived_transaction_count} diarsipkan</div> : null}</TableCell>
            <TableCell className="text-right"><div className="font-semibold">{formatRupiah(row.active_purchase_total)}</div>{row.legacy_manual_purchase_amount !== null ? <div className="text-xs text-muted-foreground">Manual lama: {formatRupiah(row.legacy_manual_purchase_amount)}</div> : null}</TableCell>
            <TableCell><Badge variant={row.record_source === "operational" ? "secondary" : "outline"}>{row.record_source === "operational" ? "Data Penjualan" : "Data Historis"}</Badge></TableCell>
            <TableCell><div className="flex justify-end gap-1"><Button size="sm" variant="outline" onClick={() => onDetail(row)}>Detail</Button>{active ? <Button size="sm" onClick={() => onCheckout?.(row)}>Tandai Pulang</Button> : <VisitorStatusBadge checkedOut />}</div></TableCell>
          </TableRow>
        ))}</TableBody>
      </Table>
    </div>
  );
}

function VisitDetail({ visit }: { visit: VisitorVisitRow }) {
  return (
    <div className="space-y-5">
      <div className="grid gap-3 rounded-lg border p-4 sm:grid-cols-3">
        <DetailValue label="Pengunjung" value={visit.full_name} />
        <DetailValue label="Tanggal" value={formatDate(visit.visit_date)} />
        <DetailValue label="Jumlah" value={visit.total_visitors === null ? "Data lama tidak tersedia" : `${visit.total_visitors} (${visit.adult_count} dewasa · ${visit.child_count} anak)`} />
      </div>
      {visit.notes ? <div className="rounded-lg border p-4"><p className="text-sm font-medium">Catatan kunjungan</p><p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{visit.notes}</p></div> : null}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div><h3 className="font-semibold">Transaksi Terhubung</h3><p className="text-sm text-muted-foreground">Total aktif: {formatRupiah(visit.active_purchase_total)}</p></div>
          {visit.record_source === "operational" ? <Button asChild size="sm"><Link to="/penjualan" search={{ visitId: visit.id, date: visit.visit_date }}><Plus className="mr-2 h-4 w-4" />Tambah Transaksi</Link></Button> : null}
        </div>
        {!visit.linked_transactions.length ? <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">Belum ada transaksi. Total pembelian: {formatRupiah(0)}</div> : (
          <div className="divide-y rounded-md border">{visit.linked_transactions.map((transaction) => (
            <div key={transaction.transaction_id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
              <div><p className="font-medium">{transaction.transaction_number}</p><p className="text-xs text-muted-foreground">{formatDate(transaction.transaction_date)} {transaction.deleted_at ? "· Diarsipkan" : "· Aktif"}</p></div>
              <div className="flex items-center gap-2"><span className="font-semibold">{formatRupiah(transaction.total_amount)}</span><Button asChild size="sm" variant="outline"><Link to="/penjualan" search={{ transactionId: transaction.transaction_id }}>Lihat Transaksi</Link></Button></div>
            </div>
          ))}</div>
        )}
      </section>
      {visit.legacy_manual_purchase_amount !== null ? (
        <section className="rounded-lg border border-amber-300 bg-amber-50/60 p-4 dark:bg-amber-950/20">
          <h3 className="font-semibold">Pembelian Manual Lama</h3>
          <p className="mt-2 text-xl font-bold">{formatRupiah(visit.legacy_manual_purchase_amount)}</p>
          <p className="mt-2 text-sm text-muted-foreground">Data pembelian historis ini disimpan hanya sebagai riwayat. Nilai pembelian dari transaksi menjadi sumber operasional dan kedua nilai tidak dijumlahkan.</p>
        </section>
      ) : null}
    </div>
  );
}

function SummaryCard({ title, value }: { title: string; value: number }) {
  return <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle></CardHeader><CardContent><div className="flex items-center gap-2 text-2xl font-semibold"><Users className="h-5 w-5 text-primary" />{value}</div></CardContent></Card>;
}
function DetailValue({ label, value }: { label: string; value: string }) {
  return <div><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 font-medium">{value}</p></div>;
}
function Field({ label, children }: { label: string; children: ReactNode }) {
  return <div className="space-y-2"><Label>{label}</Label>{children}</div>;
}
function Pagination({ page, total, onPage }: { page: number; total: number; onPage: (page: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  return <div className="mt-4 flex items-center justify-end gap-2"><Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>Sebelumnya</Button><span className="text-sm text-muted-foreground">{page} / {pages}</span><Button variant="outline" size="sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>Berikutnya</Button></div>;
}
