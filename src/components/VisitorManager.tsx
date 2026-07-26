import { useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Pencil, RotateCcw, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Route } from "@/routes/_authenticated/pengunjung";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { formatJakartaDateTime } from "@/lib/visitor";
import { formatRupiah } from "@/lib/format";
import { rangeFromDates } from "@/lib/reportExport";
import { PageHeader } from "@/components/PageHeader";
import { ExportExcelDialog } from "@/components/reports/ExportExcelDialog";
import { EmptyState } from "@/components/EmptyState";
import { VisitorStatusBadge } from "@/components/visitor/VisitorStatusBadge";
import { VisitorDateFilter } from "@/components/visitor/VisitorDateFilter";
import {
  resolveVisitorDateRange,
  normalizeVisitorDateFilter,
  type VisitorDateFilterValue,
} from "@/lib/visitorDatePeriod";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";

interface VisitorSummary {
  id: string;
  visitor_code: string;
  full_name: string;
  phone: string | null;
  notes: string | null;
  first_visit_at: string | null;
  last_visit_at: string | null;
  visit_count: number;
  total_quantity: number;
  total_amount: number;
  is_visiting: boolean;
  updated_at: string;
  deleted_at: string | null;
}

interface RawVisitorSale {
  quantity: number;
  amount: number;
  deleted_at: string | null;
}

interface RawVisitorVisit {
  check_in_at: string;
  check_out_at: string | null;
  deleted_at: string | null;
  sales: RawVisitorSale[];
}

interface RawVisitor {
  id: string;
  visitor_code: string;
  full_name: string;
  phone: string | null;
  notes: string | null;
  updated_at: string;
  deleted_at: string | null;
  visitor_visits: RawVisitorVisit[];
}

const MASTER_PAGE_SIZE = 20;
const FETCH_BATCH_SIZE = 500;

export function VisitorManager() {
  const { canManageVisitors, canViewDeletedData } = useAuth();
  const queryClient = useQueryClient();
  const dateFilter = normalizeVisitorDateFilter(Route.useSearch());
  const navigate = Route.useNavigate();
  const [tab, setTab] = useState<"active" | "deleted">("active");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<VisitorSummary | null>(null);
  const [deleting, setDeleting] = useState<VisitorSummary | null>(null);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");

  const resolvedRange = useMemo(() => resolveVisitorDateRange(dateFilter), [dateFilter]);
  const query = useQuery({
    queryKey: ["visitors", tab, search.trim(), dateFilter.period, dateFilter.from, dateFilter.to],
    enabled: canManageVisitors,
    queryFn: async () => {
      const allRows: RawVisitor[] = [];
      let offset = 0;

      while (true) {
        let request = supabase
          .from("visitors")
          .select(
            "id, visitor_code, full_name, phone, notes, updated_at, deleted_at, visitor_visits(check_in_at, check_out_at, deleted_at, sales(quantity, amount, deleted_at))",
          )
          .order("updated_at", { ascending: false })
          .range(offset, offset + FETCH_BATCH_SIZE - 1);

        request =
          tab === "deleted"
            ? request.not("deleted_at", "is", null)
            : request.is("deleted_at", null);

        const { data, error } = await request;
        if (error) throw error;
        const batch = (data ?? []) as unknown as RawVisitor[];
        allRows.push(...batch);
        if (batch.length < FETCH_BATCH_SIZE) break;
        offset += FETCH_BATCH_SIZE;
      }

      const keyword = search.trim().toLocaleLowerCase("id-ID");
      const rows = allRows
        .map(summarizeVisitor)
        .filter(
          (visitor) =>
            !keyword ||
            visitor.visitor_code.toLocaleLowerCase("id-ID").includes(keyword) ||
            visitor.full_name.toLocaleLowerCase("id-ID").includes(keyword) ||
            visitor.phone?.toLocaleLowerCase("id-ID").includes(keyword),
        )
        .filter((visitor) => {
          if (!resolvedRange.startIso || !resolvedRange.endExclusiveIso) return true;
          return (
            visitor.last_visit_at !== null &&
            visitor.last_visit_at >= resolvedRange.startIso &&
            visitor.last_visit_at < resolvedRange.endExclusiveIso
          );
        });
      return { rows, total: rows.length };
    },
  });
  const pagedRows = useMemo(
    () => (query.data?.rows ?? []).slice((page - 1) * MASTER_PAGE_SIZE, page * MASTER_PAGE_SIZE),
    [page, query.data?.rows],
  );
  const updateDateFilter = (next: VisitorDateFilterValue) => {
    setPage(1);
    void navigate({ search: next });
  };
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["visitors"] });
  const editMutation = useMutation({
    mutationFn: async () => {
      if (!editing) return;
      const { error } = await supabase.rpc("update_visitor_identity", {
        p_visitor_id: editing.id,
        p_full_name: fullName.trim(),
        p_phone: phone.trim(),
        p_notes: notes.trim(),
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Identitas pengunjung diperbarui.");
      setEditing(null);
      await invalidate();
    },
    onError: (error: Error) =>
      toast.error("Gagal memperbarui pengunjung.", { description: error.message }),
  });
  const actionMutation = useMutation({
    mutationFn: async ({ action, id }: { action: "soft" | "restore" | "hard"; id: string }) => {
      const rpc =
        action === "soft"
          ? "soft_delete_visitor"
          : action === "restore"
            ? "restore_visitor"
            : "hard_delete_visitor";
      const { error } = await supabase.rpc(rpc, { p_visitor_id: id });
      if (error) throw error;
    },
    onSuccess: async (_data, variables) => {
      toast.success(
        variables.action === "restore" ? "Pengunjung dipulihkan." : "Pengunjung berhasil dihapus.",
      );
      setDeleting(null);
      await invalidate();
    },
    onError: (error: Error) => toast.error("Operasi gagal.", { description: error.message }),
  });
  const openEdit = (visitor: VisitorSummary) => {
    setEditing(visitor);
    setFullName(visitor.full_name);
    setPhone(visitor.phone ?? "");
    setNotes(visitor.notes ?? "");
  };

  if (!canManageVisitors) return null;
  return (
    <div className="space-y-4">
      <PageHeader
        title="Master Pengunjung"
        description="Lihat, koreksi identitas, dan pantau riwayat pengunjung yang terbentuk dari proses operasional."
        actions={
          <ExportExcelDialog
            reportType="visitors"
            currentRange={rangeFromDates(
              resolvedRange.from ?? "2000-01-01",
              resolvedRange.to ?? new Intl.DateTimeFormat("en-CA", {
                timeZone: "Asia/Jakarta",
                year: "numeric",
                month: "2-digit",
                day: "2-digit",
              }).format(new Date()),
            )}
          />
        }
      />
      {canViewDeletedData ? (
        <Tabs
          value={tab}
          onValueChange={(value) => {
            setTab(value as "active" | "deleted");
            setPage(1);
          }}
        >
          <TabsList>
            <TabsTrigger value="active">Data Aktif</TabsTrigger>
            <TabsTrigger value="deleted">Data Terhapus</TabsTrigger>
          </TabsList>
        </Tabs>
      ) : null}
      <Card>
        <CardContent className="space-y-4 p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
            <div className="relative w-full lg:max-w-md">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Cari kode, nama, atau telepon..."
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
              />
            </div>
            <VisitorDateFilter
              idPrefix="visitor-master"
              value={dateFilter}
              onChange={updateDateFilter}
              disabled={query.isFetching}
            />
          </div>
          {query.isLoading ? (
            <>
              <Skeleton className="h-12" />
              <Skeleton className="h-12" />
            </>
          ) : pagedRows.length ? (
            <div className="overflow-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Pengunjung</TableHead>
                    <TableHead>Kunjungan</TableHead>
                    <TableHead>Terakhir</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagedRows.map((visitor) => (
                    <TableRow key={visitor.id}>
                      <TableCell>
                        <div className="font-medium">{visitor.full_name}</div>
                        <div className="text-xs text-muted-foreground">
                          {visitor.visitor_code} · {visitor.phone || "—"}
                        </div>
                      </TableCell>
                      <TableCell>{visitor.visit_count}</TableCell>
                      <TableCell className="whitespace-nowrap text-xs">
                        {visitor.last_visit_at ? formatJakartaDateTime(visitor.last_visit_at) : "—"}
                      </TableCell>
                      <TableCell className="text-right">{visitor.total_quantity}</TableCell>
                      <TableCell className="text-right">
                        {formatRupiah(visitor.total_amount)}
                      </TableCell>
                      <TableCell>
                        <VisitorStatusBadge checkedOut={!visitor.is_visiting} />
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          {tab === "active" ? (
                            <>
                              <Button size="icon" variant="ghost" onClick={() => openEdit(visitor)}>
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="text-destructive"
                                onClick={() => setDeleting(visitor)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </>
                          ) : (
                            <>
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() =>
                                  actionMutation.mutate({ action: "restore", id: visitor.id })
                                }
                              >
                                <RotateCcw className="h-4 w-4" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="text-destructive"
                                onClick={() =>
                                  actionMutation.mutate({ action: "hard", id: visitor.id })
                                }
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <EmptyState
              title={
                dateFilter.period === "all" && !search.trim()
                  ? "Data pengunjung belum tersedia"
                  : "Tidak ada pengunjung pada periode ini"
              }
              description={
                dateFilter.period === "all" && !search.trim()
                  ? "Pengunjung dibuat otomatis saat kunjungan pertama dicatat."
                  : "Coba pilih periode lain atau ubah kata pencarian."
              }
            />
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>
              Sebelumnya
            </Button>
            <Button
              variant="outline"
              disabled={page * MASTER_PAGE_SIZE >= (query.data?.total ?? 0)}
              onClick={() => setPage(page + 1)}
            >
              Berikutnya
            </Button>
          </div>
        </CardContent>
      </Card>

      <Dialog
        open={Boolean(editing)}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Identitas Pengunjung</DialogTitle>
            <DialogDescription>Kode pengunjung tidak berubah.</DialogDescription>
          </DialogHeader>
          <Field label="Nama">
            <Input value={fullName} onChange={(event) => setFullName(event.target.value)} />
          </Field>
          <Field label="Nomor telepon">
            <Input value={phone} onChange={(event) => setPhone(event.target.value)} />
          </Field>
          <Field label="Catatan">
            <Textarea value={notes} onChange={(event) => setNotes(event.target.value)} />
          </Field>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>
              Batal
            </Button>
            <Button disabled={editMutation.isPending} onClick={() => editMutation.mutate()}>
              {editMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Simpan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <AlertDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus pengunjung?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting?.visitor_code} · {deleting?.full_name}. Pengunjung dengan kunjungan aktif
              tidak dapat dihapus.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <Button
              variant="destructive"
              onClick={() => deleting && actionMutation.mutate({ action: "soft", id: deleting.id })}
            >
              Hapus
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function summarizeVisitor(visitor: RawVisitor): VisitorSummary {
  const visits = visitor.visitor_visits.filter((visit) => visit.deleted_at === null);
  const checkIns = visits.map((visit) => visit.check_in_at).sort();
  let totalQuantity = 0;
  let totalAmount = 0;

  for (const visit of visits) {
    for (const sale of visit.sales) {
      if (sale.deleted_at === null) {
        totalQuantity += Number(sale.quantity);
        totalAmount += Number(sale.amount);
      }
    }
  }

  return {
    id: visitor.id,
    visitor_code: visitor.visitor_code,
    full_name: visitor.full_name,
    phone: visitor.phone,
    notes: visitor.notes,
    first_visit_at: checkIns.at(0) ?? null,
    last_visit_at: checkIns.at(-1) ?? null,
    visit_count: visits.length,
    total_quantity: totalQuantity,
    total_amount: totalAmount,
    is_visiting: visits.some((visit) => visit.check_out_at === null),
    updated_at: visitor.updated_at,
    deleted_at: visitor.deleted_at,
  };
}
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
