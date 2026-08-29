import { useMemo, useState } from "react";
import { Archive, Loader2, Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { OperationalInputterCard } from "@/components/OperationalInputterCard";
import { useAuth } from "@/hooks/useAuth";
import { useBusinessStructure } from "@/hooks/useBusinessStructure";
import { useOperationalInputter } from "@/hooks/useOperationalInputter";
import { displayOperationalInputter } from "@/lib/operationalInputter";
import { type OperationalExpenseRow, useOperationalExpenses } from "@/hooks/useOperationalExpenses";
import { jakartaToday } from "@/lib/businessPeriod";
import {
  suggestedExpenseAmount,
  type OperationalExpenseInput,
  validateOperationalExpense,
} from "@/lib/operationalExpenses";
import { ExpenseExportDialog } from "@/components/expenses/ExpenseExportDialog";
import { formatDate, formatRupiah } from "@/lib/format";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";

const emptyForm = (): OperationalExpenseInput => ({
  expenseDate: jakartaToday(),
  itemName: "",
  quantity: 0,
  unit: "",
  unitPrice: 0,
  amount: 0,
  costCategoryId: "",
  receiptReference: "",
  vendorName: "",
  notes: "",
});

export function OperationalExpenseManager() {
  const permissions = useAuth();
  const { outlet } = useBusinessStructure();
  const expenseInputter = useOperationalInputter(outlet?.id ?? null, "expenses");
  const { expenses, categories, mutation } = useOperationalExpenses(permissions.canViewDeletedData);
  const [editing, setEditing] = useState<OperationalExpenseRow | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [totalEdited, setTotalEdited] = useState(false);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const defaultFilterDate = useMemo(() => jakartaToday(), []);
  const [startDate, setStartDate] = useState(defaultFilterDate);
  const [endDate, setEndDate] = useState(defaultFilterDate);
  const [confirm, setConfirm] = useState<{
    action: "archive" | "restore" | "delete";
    row: OperationalExpenseRow;
  } | null>(null);

  const filtered = useMemo(
    () =>
      (expenses.data ?? []).filter((row) => {
        const haystack = [
          row.item_name,
          row.category_name_snapshot,
          row.receipt_reference,
          row.vendor_name,
          row.inputter_name,
        ]
          .join(" ")
          .toLocaleLowerCase("id-ID");
        return (
          (!search || haystack.includes(search.toLocaleLowerCase("id-ID"))) &&
          (category === "all" || row.cost_category_id === category) &&
          (!startDate || row.expense_date >= startDate) &&
          (!endDate || row.expense_date <= endDate)
        );
      }),
    [expenses.data, search, category, startDate, endDate],
  );
  const active = filtered.filter((row) => !row.deleted_at);
  const total = active.reduce((sum, row) => sum + Number(row.amount), 0);

  const beginCreate = () => {
    if (!expenseInputter.name) {
      toast.error("Atur nama penginput sebelum mencatat transaksi.");
      return;
    }
    setEditing(null);
    setForm(emptyForm());
    setTotalEdited(false);
    setOpen(true);
  };
  const beginEdit = (row: OperationalExpenseRow) => {
    setEditing(row);
    setForm({
      expenseDate: row.expense_date,
      itemName: row.item_name ?? "",
      quantity: Number(row.quantity ?? 0),
      unit: row.unit ?? "",
      unitPrice: Number(row.unit_price ?? 0),
      amount: Number(row.amount),
      costCategoryId: row.cost_category_id,
      receiptReference: row.receipt_reference ?? "",
      vendorName: row.vendor_name ?? "",
      notes: row.notes ?? "",
    });
    setTotalEdited(true);
    setOpen(true);
  };
  const setNumeric = (field: "quantity" | "unitPrice", value: number) =>
    setForm((current) => {
      const next = { ...current, [field]: value };
      return totalEdited
        ? next
        : { ...next, amount: suggestedExpenseAmount(next.quantity, next.unitPrice) };
    });
  const save = async () => {
    const error = validateOperationalExpense(form);
    if (error) return toast.error(error);
    try {
      await mutation.mutateAsync(
        editing
          ? { action: "update", id: editing.id, input: form }
          : { action: "create", input: form },
      );
      toast.success(editing ? "Pengeluaran diperbarui." : "Pengeluaran dicatat.");
      setOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Pengeluaran gagal disimpan.");
    }
  };
  const lifecycle = async () => {
    if (!confirm) return;
    try {
      await mutation.mutateAsync({ action: confirm.action, id: confirm.row.id });
      toast.success("Lifecycle pengeluaran berhasil diperbarui.");
      setConfirm(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Aksi lifecycle gagal.");
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <div>
            <CardTitle>Data Pengeluaran</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Pencatatan biaya bersama Outlet Kadirojo.
            </p>
          </div>
          <div className="flex gap-2">
            <ExpenseExportDialog rows={expenses.data ?? []} categories={categories.data ?? []} />
            {permissions.canCreateExpenses ? (
              <Button disabled={!expenseInputter.name} title={!expenseInputter.name ? "Atur nama penginput sebelum mencatat transaksi." : undefined} onClick={beginCreate}>
                <Plus className="mr-2 h-4 w-4" />
                Catat Pengeluaran
              </Button>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-4">
          <Input
            aria-label="Cari pengeluaran"
            placeholder="Cari barang, kategori, nota, toko"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger aria-label="Filter kategori">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua Kategori</SelectItem>
              {categories.data?.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            aria-label="Tanggal mulai"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
          <Input
            aria-label="Tanggal akhir"
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </CardContent>
      </Card>
      <OperationalInputterCard outletId={outlet?.id ?? null} section="expenses" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Jumlah Pencatatan", active.length.toLocaleString("id-ID")],
          ["Total Pengeluaran", formatRupiah(total)],
          [
            "Kategori Digunakan",
            new Set(active.map((row) => row.cost_category_id)).size.toString(),
          ],
          ["Rata-rata", formatRupiah(active.length ? total / active.length : 0)],
        ].map(([label, value]) => (
          <Card key={label}>
            <CardContent className="pt-5">
              <p className="text-sm text-muted-foreground">{label}</p>
              <p className="mt-1 text-xl font-semibold">{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardContent className="pt-6">
          {expenses.isError ? (
            <Alert variant="destructive">
              <AlertTitle>Data gagal dimuat</AlertTitle>
              <AlertDescription>{expenses.error.message}</AlertDescription>
            </Alert>
          ) : null}
          {expenses.isPending ? (
            <div className="flex justify-center p-10">
              <Loader2 className="animate-spin" />
            </div>
          ) : null}
          {!expenses.isPending && filtered.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Belum ada data pengeluaran pada periode ini.
            </p>
          ) : null}
          {filtered.length ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tanggal</TableHead>
                    <TableHead>Penginput</TableHead>
                    <TableHead>Nama Barang</TableHead>
                    <TableHead>Kategori</TableHead>
                    <TableHead>Jumlah</TableHead>
                    <TableHead>Satuan</TableHead>
                    <TableHead>Nota</TableHead>
                    <TableHead>Toko</TableHead>
                    <TableHead className="text-right">Harga Total</TableHead>
                    <TableHead className="text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((row) => (
                    <TableRow key={row.id} className={row.deleted_at ? "opacity-60" : ""}>
                      <TableCell>{formatDate(row.expense_date)}</TableCell>
                      <TableCell>{displayOperationalInputter(row.inputter_name)}</TableCell>
                      <TableCell className="min-w-40 font-medium">
                        {row.item_name ?? (
                          <span className="text-muted-foreground">Data historis</span>
                        )}
                      </TableCell>
                      <TableCell className="min-w-48">{row.category_name_snapshot}</TableCell>
                      <TableCell>{row.quantity ?? "â€”"}</TableCell>
                      <TableCell>{row.unit ?? "â€”"}</TableCell>
                      <TableCell>{row.receipt_reference ?? "â€”"}</TableCell>
                      <TableCell>{row.vendor_name ?? "â€”"}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatRupiah(Number(row.amount))}
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          {row.deleted_at ? <Badge variant="secondary">Arsip</Badge> : null}
                          {!row.deleted_at && permissions.canEditExpenses ? (
                            <Button
                              size="icon"
                              variant="ghost"
                              aria-label="Edit pengeluaran"
                              onClick={() => beginEdit(row)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          ) : null}
                          {!row.deleted_at && permissions.canArchiveExpenses ? (
                            <Button
                              size="icon"
                              variant="ghost"
                              aria-label="Arsipkan pengeluaran"
                              onClick={() => setConfirm({ action: "archive", row })}
                            >
                              <Archive className="h-4 w-4" />
                            </Button>
                          ) : null}
                          {row.deleted_at && permissions.isSuperAdmin ? (
                            <>
                              <Button
                                size="icon"
                                variant="ghost"
                                aria-label="Pulihkan pengeluaran"
                                onClick={() => setConfirm({ action: "restore", row })}
                              >
                                <RotateCcw className="h-4 w-4" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                aria-label="Hapus permanen pengeluaran"
                                onClick={() => setConfirm({ action: "delete", row })}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </>
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : null}
        </CardContent>
      </Card>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Pengeluaran" : "Catat Pengeluaran"}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{editing ? "Penginput saat dicatat" : "Penginput"}: <span className="font-medium text-foreground">{displayOperationalInputter(editing?.inputter_name ?? expenseInputter.name)}</span></p>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Tanggal *" id="expense-date">
              <Input
                id="expense-date"
                type="date"
                value={form.expenseDate}
                onChange={(e) => setForm({ ...form, expenseDate: e.target.value })}
              />
            </Field>
            <Field label="Nama Barang *" id="expense-item" wide>
              <Input
                id="expense-item"
                maxLength={200}
                value={form.itemName}
                onChange={(e) => setForm({ ...form, itemName: e.target.value })}
              />
            </Field>
            <Field label="Jumlah / Ukuran *" id="expense-quantity">
              <Input
                id="expense-quantity"
                type="number"
                min="0.0001"
                step="any"
                value={form.quantity || ""}
                onChange={(e) => setNumeric("quantity", Number(e.target.value))}
              />
            </Field>
            <Field label="Satuan Ukuran *" id="expense-unit">
              <Input
                id="expense-unit"
                list="expense-units"
                maxLength={50}
                value={form.unit}
                onChange={(e) => setForm({ ...form, unit: e.target.value })}
              />
              <datalist id="expense-units">
                {["pcs", "kg", "pack", "ikat", "dus", "gr", "ons", "mtr"].map((unit) => (
                  <option key={unit} value={unit} />
                ))}
              </datalist>
            </Field>
            <Field label="Harga Satuan *" id="expense-unit-price">
              <Input
                id="expense-unit-price"
                type="number"
                min="0"
                step="0.01"
                value={form.unitPrice || ""}
                onChange={(e) => setNumeric("unitPrice", Number(e.target.value))}
              />
            </Field>
            <Field label="Harga Total *" id="expense-amount">
              <Input
                id="expense-amount"
                type="number"
                min="0.01"
                step="0.01"
                value={form.amount || ""}
                onChange={(e) => {
                  setTotalEdited(true);
                  setForm({ ...form, amount: Number(e.target.value) });
                }}
              />
            </Field>
            <Field label="Kategori *" id="expense-category" wide>
              <Select
                value={form.costCategoryId}
                onValueChange={(value) => setForm({ ...form, costCategoryId: value })}
              >
                <SelectTrigger id="expense-category">
                  <SelectValue placeholder="Pilih kategori pengeluaran" />
                </SelectTrigger>
                <SelectContent>
                  {categories.data?.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Nota" id="expense-receipt">
              <Input
                id="expense-receipt"
                maxLength={100}
                value={form.receiptReference}
                onChange={(e) => setForm({ ...form, receiptReference: e.target.value })}
              />
            </Field>
            <Field label="Toko" id="expense-vendor">
              <Input
                id="expense-vendor"
                maxLength={150}
                value={form.vendorName}
                onChange={(e) => setForm({ ...form, vendorName: e.target.value })}
              />
            </Field>
            <Field label="Catatan" id="expense-notes" wide>
              <Textarea
                id="expense-notes"
                maxLength={500}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Batal
            </Button>
            <Button disabled={mutation.isPending} onClick={() => void save()}>
              {mutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Simpan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <AlertDialog open={Boolean(confirm)} onOpenChange={(value) => !value && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Konfirmasi perubahan</AlertDialogTitle>
            <AlertDialogDescription>
              {confirm?.action === "delete"
                ? "Data terarsip akan dihapus permanen dan tidak dapat dipulihkan."
                : "Perubahan ini memengaruhi data pengeluaran aktif."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={() => void lifecycle()}>Lanjutkan</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Field({
  label,
  id,
  wide,
  children,
}: {
  label: string;
  id: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={wide ? "space-y-2 md:col-span-2" : "space-y-2"}>
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}
