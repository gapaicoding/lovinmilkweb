import { useMemo, useState } from "react";
import { Archive, Loader2, Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import {
  type OperationalExpenseRow,
  useOperationalExpenses,
} from "@/hooks/useOperationalExpenses";
import { jakartaToday } from "@/lib/businessPeriod";
import {
  expenseScopeLabel,
  type OperationalExpenseInput,
  validateOperationalExpense,
} from "@/lib/operationalExpenses";
import { formatDate, formatRupiah } from "@/lib/format";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";

const EMPTY: OperationalExpenseInput = {
  expenseDate: jakartaToday(),
  amount: 0,
  costCategoryId: "",
  notes: "",
};

export function OperationalExpenseManager() {
  const permissions = useAuth();
  const showArchived = permissions.canViewDeletedData;
  const { expenses, categories, mutation } = useOperationalExpenses(showArchived);
  const [editing, setEditing] = useState<OperationalExpenseRow | null>(null);
  const [form, setForm] = useState<OperationalExpenseInput>(EMPTY);
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState<{ action: "archive" | "restore" | "delete"; row: OperationalExpenseRow } | null>(null);

  const categoryMap = useMemo(
    () => new Map((categories.data ?? []).map((category) => [category.id, category])),
    [categories.data],
  );

  const beginCreate = () => {
    setEditing(null);
    setForm({ ...EMPTY, expenseDate: jakartaToday() });
    setOpen(true);
  };
  const beginEdit = (row: OperationalExpenseRow) => {
    setEditing(row);
    setForm({
      expenseDate: row.expense_date,
      amount: Number(row.amount),
      costCategoryId: row.cost_category_id,
      notes: row.notes ?? "",
    });
    setOpen(true);
  };
  const save = async () => {
    const validation = validateOperationalExpense(form);
    if (validation) return toast.error(validation);
    try {
      await mutation.mutateAsync(
        editing ? { action: "update", id: editing.id, input: form } : { action: "create", input: form },
      );
      toast.success(editing ? "Pengeluaran diperbarui." : "Pengeluaran dicatat.");
      setOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Pengeluaran gagal disimpan.");
    }
  };
  const runLifecycle = async () => {
    if (!confirm) return;
    try {
      await mutation.mutateAsync({ action: confirm.action, id: confirm.row.id });
      toast.success(confirm.action === "archive" ? "Pengeluaran diarsipkan." : confirm.action === "restore" ? "Pengeluaran dipulihkan." : "Pengeluaran dihapus permanen.");
      setConfirm(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Aksi lifecycle gagal.");
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <div>
          <CardTitle>Pengeluaran Operasional</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            Biaya langsung Subunit dan biaya bersama Outlet berdasarkan kategori biaya.
          </p>
        </div>
        {permissions.canManageExpenses ? <Button onClick={beginCreate}><Plus className="mr-2 h-4 w-4" />Catat</Button> : null}
      </CardHeader>
      <CardContent>
        {expenses.isError ? <Alert variant="destructive"><AlertTitle>Data gagal dimuat</AlertTitle><AlertDescription>{expenses.error.message}</AlertDescription></Alert> : null}
        {expenses.isPending ? <div className="flex justify-center p-10"><Loader2 className="animate-spin" /></div> : null}
        {!expenses.isPending && (expenses.data?.length ?? 0) === 0 ? <p className="py-10 text-center text-sm text-muted-foreground">Belum ada pengeluaran operasional.</p> : null}
        {(expenses.data?.length ?? 0) > 0 ? (
          <div className="overflow-x-auto"><Table>
            <TableHeader><TableRow><TableHead>Tanggal</TableHead><TableHead>Kategori</TableHead><TableHead>Cakupan</TableHead><TableHead>Catatan</TableHead><TableHead className="text-right">Nominal</TableHead><TableHead className="text-right">Aksi</TableHead></TableRow></TableHeader>
            <TableBody>{expenses.data?.map((row) => (
              <TableRow key={row.id} className={row.deleted_at ? "opacity-60" : ""}>
                <TableCell>{formatDate(row.expense_date)}</TableCell>
                <TableCell className="font-medium">{row.category_name_snapshot}</TableCell>
                <TableCell><Badge variant="outline">{expenseScopeLabel(row.scope_snapshot, row.subunit_name_snapshot)}</Badge></TableCell>
                <TableCell>{row.notes || "—"}</TableCell>
                <TableCell className="text-right tabular-nums">{formatRupiah(Number(row.amount))}</TableCell>
                <TableCell><div className="flex justify-end gap-1">
                  {!row.deleted_at && permissions.canManageExpenses ? <><Button size="icon" variant="ghost" aria-label="Edit" onClick={() => beginEdit(row)}><Pencil className="h-4 w-4" /></Button><Button size="icon" variant="ghost" aria-label="Arsipkan" onClick={() => setConfirm({ action: "archive", row })}><Archive className="h-4 w-4" /></Button></> : null}
                  {row.deleted_at && permissions.isSuperAdmin ? <><Button size="icon" variant="ghost" aria-label="Pulihkan" onClick={() => setConfirm({ action: "restore", row })}><RotateCcw className="h-4 w-4" /></Button><Button size="icon" variant="ghost" aria-label="Hapus permanen" onClick={() => setConfirm({ action: "delete", row })}><Trash2 className="h-4 w-4" /></Button></> : null}
                </div></TableCell>
              </TableRow>
            ))}</TableBody>
          </Table></div>
        ) : null}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}><DialogContent><DialogHeader><DialogTitle>{editing ? "Edit Pengeluaran" : "Catat Pengeluaran"}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div><Label htmlFor="expense-date">Tanggal</Label><Input id="expense-date" type="date" value={form.expenseDate} onChange={(e) => setForm({ ...form, expenseDate: e.target.value })} /></div>
          <div><Label htmlFor="expense-category">Kategori biaya</Label><Select value={form.costCategoryId} onValueChange={(value) => setForm({ ...form, costCategoryId: value })}><SelectTrigger id="expense-category"><SelectValue placeholder="Pilih kategori" /></SelectTrigger><SelectContent>{categories.data?.map((category) => {
            const subunit = Array.isArray(category.business_subunits) ? category.business_subunits[0] : category.business_subunits;
            return <SelectItem key={category.id} value={category.id}>{category.name} · {expenseScopeLabel(category.scope, subunit?.name)}</SelectItem>;
          })}</SelectContent></Select></div>
          <div><Label htmlFor="expense-amount">Nominal</Label><Input id="expense-amount" type="number" min="0.01" step="0.01" value={form.amount || ""} onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })} /></div>
          <div><Label htmlFor="expense-notes">Catatan</Label><Textarea id="expense-notes" maxLength={500} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
          {form.costCategoryId && categoryMap.get(form.costCategoryId) ? <p className="text-xs text-muted-foreground">Ownership ditentukan server dari kategori biaya; tidak dapat diubah manual.</p> : null}
        </div>
        <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Batal</Button><Button disabled={mutation.isPending} onClick={() => void save()}>{mutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Simpan</Button></DialogFooter>
      </DialogContent></Dialog>

      <AlertDialog open={Boolean(confirm)} onOpenChange={(value) => !value && setConfirm(null)}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Konfirmasi lifecycle</AlertDialogTitle><AlertDialogDescription>{confirm?.action === "delete" ? "Penghapusan permanen hanya berlaku untuk data yang sudah diarsipkan dan tidak dapat dibatalkan." : "Perubahan ini akan langsung memengaruhi laporan operasional aktif."}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Batal</AlertDialogCancel><AlertDialogAction disabled={mutation.isPending} onClick={() => void runLifecycle()}>Lanjutkan</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    </Card>
  );
}
