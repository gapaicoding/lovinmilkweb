import { Archive, Eye, Loader2, Pencil, Plus, RotateCcw, Search, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { EmptyState } from "@/components/EmptyState";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import {
  type PurchaseTransaction, type PurchaseTransactionItem, usePurchases,
} from "@/hooks/usePurchases";
import { formatDate, formatRupiah } from "@/lib/format";
import {
  calculatePurchaseSubtotal, calculatePurchaseTotal, summarizePurchaseSubunits,
  validatePurchaseLines, type PurchaseLineInput,
} from "@/lib/purchases";

interface FormState {
  id?: string;
  purchaseDate: string;
  supplierId: string;
  externalInvoiceNumber: string;
  notes: string;
  lines: PurchaseLineInput[];
}

const emptyForm = (): FormState => ({
  purchaseDate: new Date().toISOString().slice(0, 10),
  supplierId: "",
  externalInvoiceNumber: "",
  notes: "",
  lines: [{ inventoryItemId: "", quantity: 1, unitCost: 0 }],
});

export function OperationalPurchaseManager() {
  const { isAdmin, isSuperAdmin } = useAuth();
  const data = usePurchases();
  const [query, setQuery] = useState("");
  const [subunitFilter, setSubunitFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("active");
  const [form, setForm] = useState<FormState | null>(null);
  const [detail, setDetail] = useState<PurchaseTransaction | null>(null);
  const currentItems = useMemo(
    () => data.items.filter((item) => item.is_current),
    [data.items],
  );
  const itemsByTransaction = useMemo(() => {
    const map = new Map<string, PurchaseTransactionItem[]>();
    for (const item of currentItems) {
      map.set(item.purchase_transaction_id, [...(map.get(item.purchase_transaction_id) ?? []), item]);
    }
    return map;
  }, [currentItems]);
  const subunitNames = useMemo(
    () => new Map(data.subunits.map((subunit) => [subunit.id, subunit.name])),
    [data.subunits],
  );
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("id-ID");
    return data.transactions.filter((transaction) => {
      const items = itemsByTransaction.get(transaction.id) ?? [];
      const archived = Boolean(transaction.deleted_at);
      if (statusFilter === "active" && archived) return false;
      if (statusFilter === "archived" && !archived) return false;
      if (subunitFilter !== "all" && !items.some((item) => item.subunit_id === subunitFilter)) return false;
      if (!needle) return true;
      return [
        transaction.transaction_number, transaction.external_invoice_number,
        transaction.supplier_name_snapshot,
        ...items.flatMap((item) => [item.item_name_snapshot, item.item_code_snapshot]),
      ].some((value) => value?.toLocaleLowerCase("id-ID").includes(needle));
    });
  }, [data.transactions, itemsByTransaction, query, statusFilter, subunitFilter]);

  const save = async () => {
    if (!form) return;
    const error = validatePurchaseLines(form.lines);
    if (error) return toast.error(error);
    try {
      await data.saveMutation.mutateAsync({
        id: form.id, purchaseDate: form.purchaseDate,
        supplierId: form.supplierId || null,
        externalInvoiceNumber: form.externalInvoiceNumber.trim() || null,
        notes: form.notes.trim() || null, lines: form.lines,
      });
      toast.success(form.id ? "Pembelian diperbarui." : "Pembelian berhasil dicatat.");
      setForm(null);
    } catch (error) {
      toast.error("Pembelian gagal diproses.", { description: purchaseError(error) });
    }
  };
  const lifecycle = async (
    transaction: PurchaseTransaction,
    action: "archive" | "restore" | "hard-delete",
  ) => {
    const message =
      action === "archive" ? "Arsipkan pembelian dan batalkan efek stoknya?"
        : action === "restore" ? "Pulihkan pembelian dan efek stoknya?"
          : "Hapus pembelian permanen?";
    if (!window.confirm(message)) return;
    try {
      await data.lifecycleMutation.mutateAsync({ id: transaction.id, action });
      toast.success("Lifecycle pembelian berhasil diproses.");
    } catch (error) {
      toast.error("Lifecycle pembelian ditolak.", { description: purchaseError(error) });
    }
  };
  const openEdit = (transaction: PurchaseTransaction) => {
    setForm({
      id: transaction.id, purchaseDate: transaction.purchase_date,
      supplierId: transaction.supplier_id ?? "",
      externalInvoiceNumber: transaction.external_invoice_number ?? "",
      notes: transaction.notes ?? "",
      lines: (itemsByTransaction.get(transaction.id) ?? []).map((item) => ({
        inventoryItemId: item.inventory_item_id,
        subunitId: item.subunit_id,
        quantity: Number(item.quantity), unitCost: Number(item.unit_cost),
        notes: item.notes ?? undefined,
      })),
    });
  };

  if (data.isLoading) {
    return <div className="flex min-h-48 items-center justify-center gap-2 text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" /> Memuat pembelian operasional…
    </div>;
  }
  if (data.error) {
    return <Alert variant="destructive"><AlertTitle>Pembelian gagal dimuat</AlertTitle>
      <AlertDescription>{purchaseError(data.error)}</AlertDescription></Alert>;
  }
  return <div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 className="text-lg font-semibold">Pembelian Operasional Inventory</h2>
        <p className="text-sm text-muted-foreground">
          Transaksi baru terhubung ke Inventory Item, ledger stok, dan Moving WAC.
        </p>
      </div>
      {isAdmin ? <Button onClick={() => setForm(emptyForm())}><Plus className="mr-2 h-4 w-4" />
        Tambah Pembelian</Button> : <Badge variant="outline">Read only</Badge>}
    </div>
    <Card><CardContent className="grid gap-3 pt-6 md:grid-cols-3">
      <div className="relative"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input value={query} onChange={(event) => setQuery(event.target.value)}
          placeholder="Cari nomor, supplier, atau item" className="pl-9" /></div>
      <Select value={subunitFilter} onValueChange={setSubunitFilter}>
        <SelectTrigger><SelectValue placeholder="Semua Subunit" /></SelectTrigger>
        <SelectContent><SelectItem value="all">Semua Subunit</SelectItem>
          {data.subunits.filter((s) => s.inventory_enabled).map((s) =>
            <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
      </Select>
      {isSuperAdmin ? <Select value={statusFilter} onValueChange={setStatusFilter}>
        <SelectTrigger><SelectValue /></SelectTrigger><SelectContent>
          <SelectItem value="active">Aktif</SelectItem><SelectItem value="archived">Diarsipkan</SelectItem>
          <SelectItem value="all">Semua Status</SelectItem>
        </SelectContent></Select> : null}
    </CardContent></Card>
    {!filtered.length ? <EmptyState title="Belum ada pembelian operasional"
      description="Invoice legacy tetap tersedia pada tab Riwayat Legacy." />
      : <Card><CardContent className="overflow-x-auto p-0"><Table>
        <TableHeader><TableRow><TableHead>Nomor</TableHead><TableHead>Tanggal</TableHead>
          <TableHead>Supplier</TableHead><TableHead>Subunit</TableHead><TableHead>Item</TableHead>
          <TableHead className="text-right">Total</TableHead><TableHead>Status</TableHead>
          <TableHead className="text-right">Aksi</TableHead></TableRow></TableHeader>
        <TableBody>{filtered.map((transaction) => {
          const items = itemsByTransaction.get(transaction.id) ?? [];
          const archived = Boolean(transaction.deleted_at);
          return <TableRow key={transaction.id}>
            <TableCell className="font-medium">{transaction.transaction_number}</TableCell>
            <TableCell>{formatDate(transaction.purchase_date)}</TableCell>
            <TableCell>{transaction.supplier_name_snapshot ?? "Tanpa supplier"}</TableCell>
            <TableCell>{summarizePurchaseSubunits(items.map((i) => i.subunit_name_snapshot))}</TableCell>
            <TableCell>{items.length}</TableCell><TableCell className="text-right">
              {formatRupiah(Number(transaction.total_amount))}</TableCell>
            <TableCell><Badge variant={archived ? "secondary" : "default"}>
              {archived ? "Diarsipkan" : "Aktif"}</Badge></TableCell>
            <TableCell><div className="flex justify-end gap-1">
              <Button size="icon" variant="ghost" onClick={() => setDetail(transaction)} title="Detail">
                <Eye className="h-4 w-4" /></Button>
              {isAdmin && !archived ? <><Button size="icon" variant="ghost"
                onClick={() => openEdit(transaction)} title="Edit"><Pencil className="h-4 w-4" /></Button>
                <Button size="icon" variant="ghost" onClick={() => void lifecycle(transaction, "archive")}
                  title="Arsipkan"><Archive className="h-4 w-4" /></Button></> : null}
              {isSuperAdmin && archived ? <><Button size="icon" variant="ghost"
                onClick={() => void lifecycle(transaction, "restore")} title="Pulihkan">
                <RotateCcw className="h-4 w-4" /></Button><Button size="icon" variant="ghost"
                onClick={() => void lifecycle(transaction, "hard-delete")} title="Hapus permanen">
                <Trash2 className="h-4 w-4 text-destructive" /></Button></> : null}
            </div></TableCell>
          </TableRow>;
        })}</TableBody>
      </Table></CardContent></Card>}
    <PurchaseFormDialog form={form} setForm={setForm} inventoryItems={data.inventoryItems}
      suppliers={data.suppliers} subunitNames={subunitNames}
      pending={data.saveMutation.isPending} onSave={() => void save()} />
    <PurchaseDetail transaction={detail} items={detail ? itemsByTransaction.get(detail.id) ?? [] : []}
      onClose={() => setDetail(null)} />
  </div>;
}

function PurchaseFormDialog({ form, setForm, inventoryItems, suppliers, subunitNames, pending, onSave }: {
  form: FormState | null; setForm: (form: FormState | null) => void;
  inventoryItems: ReturnType<typeof usePurchases>["inventoryItems"];
  suppliers: ReturnType<typeof usePurchases>["suppliers"]; subunitNames: Map<string, string>;
  pending: boolean; onSave: () => void;
}) {
  if (!form) return null;
  const updateLine = (index: number, patch: Partial<PurchaseLineInput>) => {
    setForm({ ...form, lines: form.lines.map((line, i) => i === index ? { ...line, ...patch } : line) });
  };
  return <Dialog open onOpenChange={(open) => !open && !pending && setForm(null)}>
    <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
      <DialogHeader><DialogTitle>{form.id ? "Edit" : "Tambah"} Pembelian Operasional</DialogTitle>
        <DialogDescription>Total frontend hanya preview; database menghitung nilai canonical.</DialogDescription>
      </DialogHeader>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Tanggal"><Input type="date" value={form.purchaseDate}
          onChange={(e) => setForm({ ...form, purchaseDate: e.target.value })} /></Field>
        <Field label="Supplier"><Select value={form.supplierId || "none"}
          onValueChange={(value) => setForm({ ...form, supplierId: value === "none" ? "" : value })}>
          <SelectTrigger><SelectValue /></SelectTrigger><SelectContent>
            <SelectItem value="none">Tanpa supplier</SelectItem>
            {suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.supplier_name}</SelectItem>)}
          </SelectContent></Select></Field>
        <Field label="Nomor invoice eksternal"><Input value={form.externalInvoiceNumber}
          onChange={(e) => setForm({ ...form, externalInvoiceNumber: e.target.value })} /></Field>
        <Field label="Catatan"><Textarea value={form.notes}
          onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
      </div>
      <div className="space-y-3">{form.lines.map((line, index) =>
        <Card key={index}><CardHeader className="flex-row items-center justify-between py-3">
          <CardTitle className="text-sm">Item {index + 1}</CardTitle>
          {form.lines.length > 1 ? <Button size="icon" variant="ghost"
            onClick={() => setForm({ ...form, lines: form.lines.filter((_, i) => i !== index) })}>
            <X className="h-4 w-4" /></Button> : null}</CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-4">
            <Field label="Inventory Item"><Select value={line.inventoryItemId}
              onValueChange={(id) => {
                const item = inventoryItems.find((candidate) => candidate.id === id);
                updateLine(index, { inventoryItemId: id, subunitId: item?.subunit_id });
              }}><SelectTrigger><SelectValue placeholder="Pilih item" /></SelectTrigger>
              <SelectContent>{inventoryItems.map((item) => <SelectItem key={item.id} value={item.id}>
                {item.name} · {subunitNames.get(item.subunit_id) ?? "Subunit"}</SelectItem>)}</SelectContent>
            </Select></Field>
            <Field label="Subunit"><Input readOnly value={subunitNames.get(line.subunitId ?? "") ?? "Otomatis"} /></Field>
            <Field label="Quantity"><Input type="number" min="0" step="0.0001" value={line.quantity}
              onChange={(e) => updateLine(index, { quantity: Number(e.target.value) })} /></Field>
            <Field label="Unit Cost"><Input type="number" min="0" step="0.0001" value={line.unitCost}
              onChange={(e) => updateLine(index, { unitCost: Number(e.target.value) })} /></Field>
            <div className="md:col-span-4 text-right text-sm font-medium">
              Subtotal: {formatRupiah(calculatePurchaseSubtotal(line.quantity, line.unitCost))}
            </div>
          </CardContent></Card>)}</div>
      <Button type="button" variant="outline" onClick={() => setForm({
        ...form, lines: [...form.lines, { inventoryItemId: "", quantity: 1, unitCost: 0 }],
      })}><Plus className="mr-2 h-4 w-4" />Tambah Item</Button>
      <DialogFooter className="items-center"><span className="mr-auto font-semibold">
        Total preview: {formatRupiah(calculatePurchaseTotal(form.lines))}</span>
        <Button variant="outline" onClick={() => setForm(null)} disabled={pending}>Batal</Button>
        <Button onClick={onSave} disabled={pending}>{pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Simpan</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}

function PurchaseDetail({ transaction, items, onClose }: {
  transaction: PurchaseTransaction | null; items: PurchaseTransactionItem[]; onClose: () => void;
}) {
  if (!transaction) return null;
  return <Dialog open onOpenChange={(open) => !open && onClose()}><DialogContent className="max-w-3xl">
    <DialogHeader><DialogTitle>{transaction.transaction_number}</DialogTitle>
      <DialogDescription>Snapshot transaksi operasional dan efek stock-in.</DialogDescription></DialogHeader>
    <div className="grid gap-2 text-sm md:grid-cols-2">
      <p><strong>Tanggal:</strong> {formatDate(transaction.purchase_date)}</p>
      <p><strong>Supplier:</strong> {transaction.supplier_name_snapshot ?? "Tanpa supplier"}</p>
      <p><strong>Subunit:</strong> {summarizePurchaseSubunits(items.map((i) => i.subunit_name_snapshot))}</p>
      <p><strong>Status:</strong> {transaction.deleted_at ? "Diarsipkan" : "Aktif"}</p>
    </div>
    <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Item</TableHead>
      <TableHead>Subunit</TableHead><TableHead>Qty</TableHead><TableHead>Unit Cost</TableHead>
      <TableHead>Subtotal</TableHead></TableRow></TableHeader><TableBody>{items.map((item) =>
        <TableRow key={item.id}><TableCell>{item.item_name_snapshot}<div className="text-xs text-muted-foreground">
          {item.item_code_snapshot} · {item.unit_snapshot}</div></TableCell>
          <TableCell>{item.subunit_name_snapshot}</TableCell><TableCell>{Number(item.quantity)}</TableCell>
          <TableCell>{formatRupiah(Number(item.unit_cost))}</TableCell>
          <TableCell>{formatRupiah(Number(item.amount))}</TableCell></TableRow>)}</TableBody></Table></div>
    <div className="text-right text-lg font-semibold">Total {formatRupiah(Number(transaction.total_amount))}</div>
  </DialogContent></Dialog>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>;
}

function purchaseError(error: unknown): string {
  const message = error instanceof Error ? error.message
    : typeof error === "object" && error && "message" in error ? String(error.message)
      : "Kesalahan database tidak diketahui.";
  if (message.includes("aktivitas stok/HPP yang lebih baru")) {
    return "Transaksi tidak dapat diubah karena sudah terdapat aktivitas stok/HPP yang lebih baru.";
  }
  if (message.includes("histori inventory/costing")) {
    return "Pembelian memiliki histori inventory/costing dan tidak dapat dihapus permanen.";
  }
  return message;
}
