import { useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Pencil, RotateCcw, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { useAuth } from "@/hooks/useAuth";
import { formatJakartaDateTime } from "@/lib/visitor";
import { formatRupiah } from "@/lib/format";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { VisitorStatusBadge } from "@/components/visitor/VisitorStatusBadge";
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

export function VisitorManager() {
  const { canManageVisitors, canViewDeletedData } = useAuth();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<"active" | "deleted">("active");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<VisitorSummary | null>(null);
  const [deleting, setDeleting] = useState<VisitorSummary | null>(null);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");

  const query = useQuery({
    queryKey: ["visitors", tab, search.trim(), page],
    enabled: canManageVisitors,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("list_visitors_admin", {
        p_query: search.trim(),
        p_deleted: tab === "deleted",
        p_page: page,
        p_page_size: 20,
      });
      if (error) throw error;
      return parseVisitors(data);
    },
  });
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
          <div className="relative max-w-md">
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
          {query.isLoading ? (
            <>
              <Skeleton className="h-12" />
              <Skeleton className="h-12" />
            </>
          ) : query.data?.rows.length ? (
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
                  {query.data.rows.map((visitor) => (
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
              title="Data pengunjung belum tersedia"
              description="Pengunjung dibuat otomatis saat kunjungan pertama dicatat."
            />
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>
              Sebelumnya
            </Button>
            <Button
              variant="outline"
              disabled={page * 20 >= (query.data?.total ?? 0)}
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

function parseVisitors(value: Json): { rows: VisitorSummary[]; total: number } {
  const root = record(value);
  const rows = Array.isArray(root.rows)
    ? root.rows
        .map(record)
        .filter((row) => typeof row.id === "string")
        .map((row) => ({
          id: String(row.id),
          visitor_code: String(row.visitor_code ?? ""),
          full_name: String(row.full_name ?? ""),
          phone: typeof row.phone === "string" ? row.phone : null,
          notes: typeof row.notes === "string" ? row.notes : null,
          first_visit_at: typeof row.first_visit_at === "string" ? row.first_visit_at : null,
          last_visit_at: typeof row.last_visit_at === "string" ? row.last_visit_at : null,
          visit_count: Number(row.visit_count ?? 0),
          total_quantity: Number(row.total_quantity ?? 0),
          total_amount: Number(row.total_amount ?? 0),
          is_visiting: Boolean(row.is_visiting),
          updated_at: String(row.updated_at ?? ""),
          deleted_at: typeof row.deleted_at === "string" ? row.deleted_at : null,
        }))
    : [];
  return { rows, total: Number(root.total ?? 0) };
}
function record(value: Json | undefined): Record<string, Json | undefined> {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
