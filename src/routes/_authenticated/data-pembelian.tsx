import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  Eye,
  FileText,
  Loader2,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/PageHeader";
import {
  BackgroundRefresh,
  ConfirmActionDialog,
  FormField,
  IconAction,
  ModuleError,
  ModuleInitialLoading,
  type ConfirmActionState,
} from "@/components/actual/ActualModuleUi";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
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
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import {
  actualClient,
  getActualDataErrorMessage,
  parseIsoDate,
  parsePositivePage,
  type QueryErrorLike,
  toFiniteNumber,
  toNullableText,
} from "@/lib/actualData";
import { formatDate, formatNumber, formatRupiah } from "@/lib/format";

const PAGE_SIZE = 15;
type FinancialClass = "hpp" | "operating_expense" | "asset" | "other";
type PurchaseClassFilter = FinancialClass | "all";
type PurchaseStateFilter = "recorded" | "voided" | "deleted" | "all";

interface PurchaseSearch {
  q?: string;
  from?: string;
  to?: string;
  supplier?: string;
  class?: PurchaseClassFilter;
  state?: PurchaseStateFilter;
  page?: number;
}

interface SupplierOption {
  id: string;
  supplier_name: string;
  is_active: boolean;
  deleted_at: string | null;
}

interface BatchOption {
  id: string;
  batch_key: string;
  description: string;
  status: string;
}

interface PurchaseItemRow {
  id: string;
  line_source_key: string;
  item_name_raw: string;
  item_name_normalized: string;
  quantity: number | string;
  unit: string | null;
  unit_price: number | string;
  amount: number | string;
  calculated_total: number | string | null;
  amount_difference: number | string | null;
  source_category: string | null;
  financial_class: FinancialClass;
  classification_policy: string | null;
  asset_tracking: boolean;
  data_origin: string;
  deleted_at: string | null;
}

interface PurchaseDatabaseRow {
  id: string;
  import_batch_id: string;
  invoice_source_key: string;
  purchase_date: string;
  supplier_id: string | null;
  supplier_name_raw: string | null;
  receipt_reference: string | null;
  data_origin: string;
  status: "recorded" | "voided";
  notes: string | null;
  deleted_at: string | null;
  supplier: {
    id: string;
    supplier_name: string;
  } | null;
  import_batch: {
    batch_key: string;
    description: string;
  } | null;
  purchase_items: PurchaseItemRow[] | null;
}

interface PurchaseRecord extends PurchaseDatabaseRow {
  activeItems: PurchaseItemRow[];
  itemCount: number;
  total: number;
  classes: FinancialClass[];
  supplierLabel: string;
}

interface PurchaseItemForm {
  id?: string;
  lineSourceKey?: string;
  itemName: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  amount: number;
  sourceCategory: string;
  financialClass: FinancialClass;
  classificationPolicy: string;
  assetTracking: boolean;
}

interface PurchaseFormValue {
  importBatchId: string;
  purchaseDate: string;
  supplierId: string;
  supplierNameRaw: string;
  receiptReference: string;
  notes: string;
  items: PurchaseItemForm[];
}

interface PurchaseWriteRpcClient {
  rpc(
    functionName: "admin_write_purchase_invoice_atomic",
    args: {
      p_import_batch_id: string;
      p_purchase_date: string;
      p_items: Array<Record<string, unknown>>;
      p_invoice_id: string | null;
      p_supplier_id: string | null;
      p_supplier_name_raw: string | null;
      p_receipt_reference: string | null;
      p_notes: string | null;
    },
  ): PromiseLike<{
    data: string | null;
    error: QueryErrorLike | null;
  }>;
}

// Regenerated database types will include this RPC after its migration is
// deployed. Keep the temporary cast local so the generated file stays pure.
const purchaseWriteRpcClient = supabase as unknown as PurchaseWriteRpcClient;

const EMPTY_ITEM: PurchaseItemForm = {
  itemName: "",
  quantity: 1,
  unit: "",
  unitPrice: 0,
  amount: 0,
  sourceCategory: "",
  financialClass: "hpp",
  classificationPolicy: "manual_admin_entry",
  assetTracking: false,
};

const EMPTY_PURCHASE_FORM: PurchaseFormValue = {
  importBatchId: "",
  purchaseDate: "",
  supplierId: "",
  supplierNameRaw: "",
  receiptReference: "",
  notes: "",
  items: [{ ...EMPTY_ITEM }],
};

export const Route = createFileRoute("/_authenticated/data-pembelian")({
  validateSearch: (search: Record<string, unknown>): PurchaseSearch => ({
    q: typeof search.q === "string" && search.q.trim() ? search.q : undefined,
    from: parseIsoDate(search.from),
    to: parseIsoDate(search.to),
    supplier:
      typeof search.supplier === "string" && search.supplier.trim() ? search.supplier : undefined,
    class: parseClassFilter(search.class),
    state: parseStateFilter(search.state),
    page: parsePositivePage(search.page),
  }),
  component: PurchasePage,
});

function PurchasePage() {
  const { isAdmin, isSuperAdmin, loading: authLoading, user } = useAuth();
  const queryClient = useQueryClient();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const filters = {
    q: search.q ?? "",
    from: search.from ?? "",
    to: search.to ?? "",
    supplier: search.supplier ?? "all",
    financialClass: search.class ?? "all",
    state: search.state ?? "recorded",
    page: search.page ?? 1,
  };
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<PurchaseRecord | null>(null);
  const [detail, setDetail] = useState<PurchaseRecord | null>(null);
  const [form, setForm] = useState<PurchaseFormValue>(EMPTY_PURCHASE_FORM);
  const [confirmAction, setConfirmAction] = useState<ConfirmActionState | null>(null);

  const suppliersQuery = useQuery({
    queryKey: ["actual-purchase-options", "suppliers"],
    enabled: isAdmin,
    staleTime: 60_000,
    queryFn: async (): Promise<SupplierOption[]> => {
      const { data, error } = await actualClient
        .from<SupplierOption>("suppliers")
        .select("id,supplier_name,is_active,deleted_at")
        .order("supplier_name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const batchesQuery = useQuery({
    queryKey: ["actual-purchase-options", "batches"],
    enabled: isAdmin && formOpen,
    staleTime: 60_000,
    queryFn: async (): Promise<BatchOption[]> => {
      const { data, error } = await actualClient
        .from<BatchOption>("data_import_batches")
        .select("id,batch_key,description,status")
        .in("status", ["imported", "reconciled", "staged"])
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const purchasesQuery = useQuery({
    queryKey: [
      "actual-purchases",
      {
        q: filters.q.trim(),
        from: filters.from,
        to: filters.to,
        supplier: filters.supplier,
        class: filters.financialClass,
        state: filters.state,
        page: filters.page,
      },
    ],
    enabled: isAdmin,
    staleTime: 30_000,
    queryFn: async (): Promise<{ rows: PurchaseRecord[]; total: number; value: number }> => {
      const start = (filters.page - 1) * PAGE_SIZE;
      let query = actualClient
        .from<PurchaseDatabaseRow>("v_purchase_invoice_index")
        .select(
          [
            "id,import_batch_id,invoice_source_key,purchase_date,supplier_id,",
            "supplier_name_raw,receipt_reference,data_origin,status,notes,deleted_at,",
            "supplier,import_batch,purchase_items",
          ].join(""),
          { count: "exact" },
        )
        .order("purchase_date", { ascending: false })
        .order("created_at", { ascending: false })
        .order("id", { ascending: false });

      if (filters.from) query = query.gte("purchase_date", filters.from);
      if (filters.to) query = query.lte("purchase_date", filters.to);
      if (filters.supplier !== "all") query = query.eq("supplier_id", filters.supplier);
      if (filters.financialClass !== "all") {
        query = query.eq(`has_${filters.financialClass}`, true);
      }
      if (filters.state !== "all") query = query.eq("record_state", filters.state);

      const normalizedSearch = filters.q.trim().toLocaleLowerCase("id-ID");
      if (normalizedSearch) {
        query = query.ilike("search_text", `%${escapeLikePattern(normalizedSearch)}%`);
      }

      const { data, error, count } = await query.range(start, start + PAGE_SIZE - 1);
      if (error) throw error;

      const rows = (data ?? []).map(normalizePurchase);

      return {
        rows,
        total: count ?? 0,
        value: rows.reduce((total, row) => total + row.total, 0),
      };
    },
  });

  const mutation = useMutation({
    mutationFn: async ({
      type,
      invoice,
    }: {
      type: "save" | "soft-delete" | "restore" | "hard-delete";
      invoice?: PurchaseRecord;
    }) => {
      if (type === "save") {
        const validated = validatePurchaseForm(form);

        if (editing && editing.import_batch_id !== validated.importBatchId) {
          throw new Error("Paket data invoice yang sudah tersimpan tidak dapat dipindahkan.");
        }

        const { error } = await purchaseWriteRpcClient.rpc("admin_write_purchase_invoice_atomic", {
          p_import_batch_id: validated.importBatchId,
          p_purchase_date: validated.purchaseDate,
          p_items: validated.items.map((item) => ({
            id: item.id ?? null,
            item_name: item.itemName,
            quantity: item.quantity,
            unit: toNullableText(item.unit),
            unit_price: item.unitPrice,
            amount: item.amount,
            source_category: toNullableText(item.sourceCategory),
            financial_class: item.financialClass,
            classification_policy: toNullableText(item.classificationPolicy),
            asset_tracking: item.assetTracking,
          })),
          p_invoice_id: editing?.id ?? null,
          p_supplier_id: validated.supplierId || null,
          p_supplier_name_raw: toNullableText(validated.supplierNameRaw),
          p_receipt_reference: toNullableText(validated.receiptReference),
          p_notes: toNullableText(validated.notes),
        });
        if (error) {
          throw error;
        }
        return;
      }

      if (!invoice) throw new Error("Invoice tidak ditemukan.");

      if (type === "soft-delete" || type === "restore") {
        const restoring = type === "restore";
        const { error } = await actualClient
          .from("purchase_invoices")
          .update({
            status: restoring ? "recorded" : "voided",
            deleted_at: restoring ? null : new Date().toISOString(),
            deleted_by: restoring ? null : (user?.id ?? null),
            updated_by: user?.id ?? null,
          })
          .eq("id", invoice.id);
        if (error) throw error;
        return;
      }

      if (!isSuperAdmin) {
        throw new Error("Hanya Super Admin yang dapat menghapus permanen.");
      }

      const { error } = await actualClient.from("purchase_invoices").delete().eq("id", invoice.id);
      if (error) throw error;
    },
    onSuccess: async (_, variables) => {
      toast.success(
        variables.type === "save"
          ? editing
            ? "Invoice pembelian berhasil diperbarui."
            : "Invoice pembelian berhasil ditambahkan."
          : variables.type === "restore"
            ? "Invoice berhasil dipulihkan."
            : variables.type === "soft-delete"
              ? "Invoice dibatalkan tanpa menyentuh data pengeluaran lama."
              : "Invoice berhasil dihapus permanen.",
      );
      closeForm();
      setDetail(null);
      setConfirmAction(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["actual-purchases"] }),
        queryClient.invalidateQueries({ queryKey: ["actual-suppliers"] }),
        queryClient.invalidateQueries({ queryKey: ["actual-finance"] }),
      ]);
    },
    onError: (error: unknown) => {
      toast.error("Invoice pembelian gagal diproses.", {
        description: getActualDataErrorMessage(error),
      });
    },
  });

  const updateFilters = (patch: Partial<PurchaseSearch>) => {
    const hasFilterChange = Object.keys(patch).some((key) => key !== "page");
    void navigate({
      search: {
        q: "q" in patch ? patch.q : search.q,
        from: "from" in patch ? patch.from : search.from,
        to: "to" in patch ? patch.to : search.to,
        supplier: "supplier" in patch ? patch.supplier : search.supplier,
        class: "class" in patch ? patch.class : search.class,
        state: "state" in patch ? patch.state : search.state,
        page: hasFilterChange ? 1 : (patch.page ?? search.page ?? 1),
      },
      replace: true,
    });
  };

  const openCreate = () => {
    setEditing(null);
    setForm({
      ...EMPTY_PURCHASE_FORM,
      items: [{ ...EMPTY_ITEM }],
      importBatchId: batchesQuery.data?.[0]?.id ?? "",
    });
    setFormOpen(true);
  };

  const openEdit = (invoice: PurchaseRecord) => {
    setEditing(invoice);
    setForm({
      importBatchId: invoice.import_batch_id,
      purchaseDate: invoice.purchase_date,
      supplierId: invoice.supplier_id ?? "",
      supplierNameRaw: invoice.supplier_name_raw ?? "",
      receiptReference: invoice.receipt_reference ?? "",
      notes: invoice.notes ?? "",
      items: invoice.activeItems.map((item) => ({
        id: item.id,
        lineSourceKey: item.line_source_key,
        itemName: item.item_name_raw,
        quantity: toFiniteNumber(item.quantity),
        unit: item.unit ?? "",
        unitPrice: toFiniteNumber(item.unit_price),
        amount: toFiniteNumber(item.amount),
        sourceCategory: item.source_category ?? "",
        financialClass: item.financial_class,
        classificationPolicy: item.classification_policy ?? "",
        assetTracking: item.asset_tracking,
      })),
    });
    setFormOpen(true);
  };

  const closeForm = () => {
    setFormOpen(false);
    setEditing(null);
    setForm({ ...EMPTY_PURCHASE_FORM, items: [{ ...EMPTY_ITEM }] });
  };

  const askMutation = (
    type: "soft-delete" | "restore" | "hard-delete",
    invoice: PurchaseRecord,
  ) => {
    setConfirmAction({
      title:
        type === "restore"
          ? "Pulihkan invoice?"
          : type === "hard-delete"
            ? "Hapus invoice permanen?"
            : "Batalkan dan arsipkan invoice?",
      description:
        type === "restore"
          ? "Invoice akan kembali berstatus tercatat dan kembali masuk ke laporan actual."
          : type === "hard-delete"
            ? "Invoice beserta baris pembeliannya akan dihapus permanen. Tindakan ini hanya tersedia untuk Super Admin dan tidak dapat dibatalkan."
            : "Invoice ditandai voided dan soft-deleted. Riwayat tetap ada, tidak masuk perhitungan laporan, dan tabel expenses lama tidak disentuh.",
      confirmLabel:
        type === "restore"
          ? "Pulihkan"
          : type === "hard-delete"
            ? "Hapus Permanen"
            : "Batalkan Invoice",
      destructive: type !== "restore",
      onConfirm: () => mutation.mutate({ type, invoice }),
    });
  };

  const pageCount = Math.max(1, Math.ceil((purchasesQuery.data?.total ?? 0) / PAGE_SIZE));

  if (authLoading) {
    return <ModuleInitialLoading label="Memeriksa akses modul pembelian" />;
  }

  if (!isAdmin) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Akses ditolak</AlertTitle>
        <AlertDescription>
          Data pembelian hanya tersedia untuk Admin dan Super Admin. Akses tetap diverifikasi oleh
          RLS database.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Data Pembelian"
        description="Invoice dan item pembelian aktual. Modul ini tidak membaca atau menulis tabel expenses lama."
        actions={
          <Button type="button" onClick={openCreate}>
            <Plus aria-hidden="true" className="mr-2 h-4 w-4" />
            Tambah Invoice
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryCard
          label="Invoice hasil filter"
          value={formatNumber(purchasesQuery.data?.total ?? 0)}
        />
        <SummaryCard
          label="Nilai pada halaman"
          value={formatRupiah(purchasesQuery.data?.value ?? 0)}
        />
        <SummaryCard label="Halaman" value={`${filters.page} / ${pageCount}`} />
      </div>

      <PurchaseFilters
        filters={filters}
        suppliers={suppliersQuery.data ?? []}
        backgroundFetching={purchasesQuery.isFetching && !purchasesQuery.isPending}
        onChange={updateFilters}
      />

      {purchasesQuery.isPending ? (
        <ModuleInitialLoading label="Memuat invoice pembelian" />
      ) : purchasesQuery.isError ? (
        <ModuleError
          title="Invoice pembelian gagal dimuat"
          error={purchasesQuery.error}
          onRetry={() => void purchasesQuery.refetch()}
        />
      ) : purchasesQuery.data?.rows.length ? (
        <>
          <PurchaseResults
            invoices={purchasesQuery.data.rows}
            isSuperAdmin={isSuperAdmin}
            onDetail={setDetail}
            onEdit={openEdit}
            onAction={askMutation}
          />
          <Pagination
            page={filters.page}
            pages={pageCount}
            total={purchasesQuery.data.total}
            onPage={(page) => updateFilters({ page })}
          />
        </>
      ) : (
        <EmptyState
          icon={FileText}
          title="Invoice tidak ditemukan"
          description="Ubah filter pencarian. Tidak ada data dummy atau fallback dari pengeluaran lama."
        />
      )}

      <PurchaseFormDialog
        open={formOpen}
        editing={editing}
        form={form}
        suppliers={suppliersQuery.data ?? []}
        batches={batchesQuery.data ?? []}
        loadingBatches={batchesQuery.isPending}
        pending={mutation.isPending}
        onOpenChange={(open) => {
          if (!open && !mutation.isPending) closeForm();
        }}
        onChange={setForm}
        onSave={() => mutation.mutate({ type: "save" })}
      />

      <PurchaseDetailDialog
        invoice={detail}
        onClose={() => setDetail(null)}
        onEdit={(invoice) => {
          setDetail(null);
          openEdit(invoice);
        }}
      />

      <ConfirmActionDialog
        action={confirmAction}
        pending={mutation.isPending}
        onClose={() => setConfirmAction(null)}
      />
    </div>
  );
}

function PurchaseFilters({
  filters,
  suppliers,
  backgroundFetching,
  onChange,
}: {
  filters: {
    q: string;
    from: string;
    to: string;
    supplier: string;
    financialClass: PurchaseClassFilter;
    state: PurchaseStateFilter;
  };
  suppliers: SupplierOption[];
  backgroundFetching: boolean;
  onChange: (patch: Partial<PurchaseSearch>) => void;
}) {
  return (
    <Card>
      <CardContent className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-6 xl:items-end">
        <FormField id="purchase-search" label="Cari">
          <div className="relative">
            <Search
              aria-hidden="true"
              className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              id="purchase-search"
              className="pl-9"
              value={filters.q}
              placeholder="Invoice, supplier, item…"
              onChange={(event) => onChange({ q: event.target.value || undefined })}
            />
          </div>
        </FormField>
        <FormField id="purchase-from" label="Dari tanggal">
          <Input
            id="purchase-from"
            type="date"
            value={filters.from}
            max={filters.to || undefined}
            onChange={(event) => onChange({ from: event.target.value || undefined })}
          />
        </FormField>
        <FormField id="purchase-to" label="Sampai tanggal">
          <Input
            id="purchase-to"
            type="date"
            value={filters.to}
            min={filters.from || undefined}
            onChange={(event) => onChange({ to: event.target.value || undefined })}
          />
        </FormField>
        <FormField id="purchase-supplier" label="Supplier">
          <Select
            value={filters.supplier}
            onValueChange={(value) => onChange({ supplier: value === "all" ? undefined : value })}
          >
            <SelectTrigger id="purchase-supplier">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua supplier</SelectItem>
              {suppliers.map((supplier) => (
                <SelectItem key={supplier.id} value={supplier.id}>
                  {supplier.supplier_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
        <FormField id="purchase-class" label="Klasifikasi">
          <Select
            value={filters.financialClass}
            onValueChange={(value) => onChange({ class: parseClassFilter(value) })}
          >
            <SelectTrigger id="purchase-class">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua kelas</SelectItem>
              <SelectItem value="hpp">HPP</SelectItem>
              <SelectItem value="operating_expense">Beban operasional</SelectItem>
              <SelectItem value="asset">Aset</SelectItem>
              <SelectItem value="other">Lainnya</SelectItem>
            </SelectContent>
          </Select>
        </FormField>
        <div className="space-y-1.5">
          <FormField id="purchase-state" label="Status">
            <Select
              value={filters.state}
              onValueChange={(value) => onChange({ state: parseStateFilter(value) })}
            >
              <SelectTrigger id="purchase-state">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="recorded">Tercatat</SelectItem>
                <SelectItem value="voided">Voided</SelectItem>
                <SelectItem value="deleted">Terhapus</SelectItem>
                <SelectItem value="all">Semua</SelectItem>
              </SelectContent>
            </Select>
          </FormField>
          <BackgroundRefresh active={backgroundFetching} />
        </div>
      </CardContent>
    </Card>
  );
}

function PurchaseResults({
  invoices,
  isSuperAdmin,
  onDetail,
  onEdit,
  onAction,
}: {
  invoices: PurchaseRecord[];
  isSuperAdmin: boolean;
  onDetail: (invoice: PurchaseRecord) => void;
  onEdit: (invoice: PurchaseRecord) => void;
  onAction: (type: "soft-delete" | "restore" | "hard-delete", invoice: PurchaseRecord) => void;
}) {
  return (
    <>
      <div className="grid gap-3 md:hidden">
        {invoices.map((invoice) => (
          <Card key={invoice.id}>
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <CardTitle className="text-base">{invoice.supplierLabel}</CardTitle>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatDate(invoice.purchase_date)} ·{" "}
                    {invoice.receipt_reference || invoice.invoice_source_key}
                  </p>
                </div>
                <InvoiceStatusBadge invoice={invoice} />
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Metric label="Item" value={formatNumber(invoice.itemCount)} />
                <Metric label="Total" value={formatRupiah(invoice.total)} />
              </div>
              <ClassBadges classes={invoice.classes} />
              <PurchaseActions
                invoice={invoice}
                isSuperAdmin={isSuperAdmin}
                onDetail={onDetail}
                onEdit={onEdit}
                onAction={onAction}
              />
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="hidden overflow-auto rounded-lg border md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tanggal / Invoice</TableHead>
              <TableHead>Supplier</TableHead>
              <TableHead className="text-right">Item</TableHead>
              <TableHead>Klasifikasi</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {invoices.map((invoice) => (
              <TableRow key={invoice.id}>
                <TableCell>
                  <p className="font-medium">{formatDate(invoice.purchase_date)}</p>
                  <p className="max-w-48 truncate text-xs text-muted-foreground">
                    {invoice.receipt_reference || invoice.invoice_source_key}
                  </p>
                </TableCell>
                <TableCell>{invoice.supplierLabel}</TableCell>
                <TableCell className="text-right tabular-nums">{invoice.itemCount}</TableCell>
                <TableCell>
                  <ClassBadges classes={invoice.classes} />
                </TableCell>
                <TableCell className="text-right font-medium tabular-nums">
                  {formatRupiah(invoice.total)}
                </TableCell>
                <TableCell>
                  <InvoiceStatusBadge invoice={invoice} />
                </TableCell>
                <TableCell>
                  <PurchaseActions
                    invoice={invoice}
                    isSuperAdmin={isSuperAdmin}
                    onDetail={onDetail}
                    onEdit={onEdit}
                    onAction={onAction}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}

function PurchaseActions({
  invoice,
  isSuperAdmin,
  onDetail,
  onEdit,
  onAction,
}: {
  invoice: PurchaseRecord;
  isSuperAdmin: boolean;
  onDetail: (invoice: PurchaseRecord) => void;
  onEdit: (invoice: PurchaseRecord) => void;
  onAction: (type: "soft-delete" | "restore" | "hard-delete", invoice: PurchaseRecord) => void;
}) {
  const deleted = Boolean(invoice.deleted_at);

  return (
    <div className="flex justify-end gap-1">
      <IconAction label="Lihat detail invoice" icon={Eye} onClick={() => onDetail(invoice)} />
      {deleted ? (
        <IconAction
          label="Pulihkan invoice"
          icon={RotateCcw}
          onClick={() => onAction("restore", invoice)}
        />
      ) : (
        <>
          <IconAction label="Edit invoice" icon={Pencil} onClick={() => onEdit(invoice)} />
          <IconAction
            label="Batalkan invoice"
            icon={Archive}
            onClick={() => onAction("soft-delete", invoice)}
          />
        </>
      )}
      {isSuperAdmin ? (
        <IconAction
          label="Hapus invoice permanen"
          icon={Trash2}
          variant="destructive"
          onClick={() => onAction("hard-delete", invoice)}
        />
      ) : null}
    </div>
  );
}

function PurchaseFormDialog({
  open,
  editing,
  form,
  suppliers,
  batches,
  loadingBatches,
  pending,
  onOpenChange,
  onChange,
  onSave,
}: {
  open: boolean;
  editing: PurchaseRecord | null;
  form: PurchaseFormValue;
  suppliers: SupplierOption[];
  batches: BatchOption[];
  loadingBatches: boolean;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onChange: (form: PurchaseFormValue) => void;
  onSave: () => void;
}) {
  const update = <Key extends keyof PurchaseFormValue>(key: Key, value: PurchaseFormValue[Key]) =>
    onChange({ ...form, [key]: value });

  const updateItem = (index: number, patch: Partial<PurchaseItemForm>) => {
    const items = form.items.map((item, itemIndex) => {
      if (itemIndex !== index) return item;
      const next = { ...item, ...patch };

      if ("quantity" in patch || "unitPrice" in patch) {
        next.amount = roundCurrency(next.quantity * next.unitPrice);
      }
      if ("financialClass" in patch && patch.financialClass !== "asset") {
        next.assetTracking = false;
      }

      return next;
    });
    update("items", items);
  };

  const formTotal = form.items.reduce((total, item) => total + item.amount, 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>
            {editing ? "Edit Invoice Pembelian" : "Tambah Invoice Pembelian"}
          </DialogTitle>
          <DialogDescription>
            Nilai sumber boleh berbeda dari quantity × harga satuan. Sistem menyimpan keduanya untuk
            audit dan tidak menulis tabel expenses lama.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <FormField
            id="purchase-batch"
            label="Paket data"
            hint={
              editing ? "Paket data tidak dapat dipindahkan setelah invoice tersimpan." : undefined
            }
          >
            <Select
              disabled={editing !== null || loadingBatches}
              value={form.importBatchId}
              onValueChange={(value) => update("importBatchId", value)}
            >
              <SelectTrigger id="purchase-batch">
                <SelectValue placeholder={loadingBatches ? "Memuat paket…" : "Pilih paket data"} />
              </SelectTrigger>
              <SelectContent>
                {editing && editing.import_batch ? (
                  <SelectItem value={editing.import_batch_id}>
                    {editing.import_batch.batch_key}
                  </SelectItem>
                ) : null}
                {batches.map((batch) => (
                  <SelectItem key={batch.id} value={batch.id}>
                    {batch.batch_key} · {batch.status}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          <FormField id="purchase-date" label="Tanggal pembelian">
            <Input
              id="purchase-date"
              type="date"
              value={form.purchaseDate}
              onChange={(event) => update("purchaseDate", event.target.value)}
            />
          </FormField>
          <FormField id="purchase-supplier-form" label="Supplier terdaftar (opsional)">
            <Select
              value={form.supplierId || "unlinked"}
              onValueChange={(value) => update("supplierId", value === "unlinked" ? "" : value)}
            >
              <SelectTrigger id="purchase-supplier-form">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unlinked">Tidak terhubung</SelectItem>
                {suppliers
                  .filter((supplier) => supplier.is_active && !supplier.deleted_at)
                  .map((supplier) => (
                    <SelectItem key={supplier.id} value={supplier.id}>
                      {supplier.supplier_name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </FormField>
          {!form.supplierId ? (
            <FormField id="purchase-supplier-raw" label="Nama supplier sumber (opsional)">
              <Input
                id="purchase-supplier-raw"
                value={form.supplierNameRaw}
                onChange={(event) => update("supplierNameRaw", event.target.value)}
              />
            </FormField>
          ) : null}
          <FormField id="purchase-receipt" label="Referensi nota (opsional)">
            <Input
              id="purchase-receipt"
              value={form.receiptReference}
              onChange={(event) => update("receiptReference", event.target.value)}
            />
          </FormField>
          <FormField id="purchase-notes" label="Catatan (opsional)">
            <Textarea
              id="purchase-notes"
              value={form.notes}
              onChange={(event) => update("notes", event.target.value)}
            />
          </FormField>
        </div>

        <section aria-labelledby="purchase-items-form-heading" className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 id="purchase-items-form-heading" className="font-semibold">
                Baris pembelian
              </h3>
              <p className="text-xs text-muted-foreground">
                Item yang dihapus saat edit akan di-soft-delete untuk menjaga audit trail.
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => update("items", [...form.items, { ...EMPTY_ITEM }])}
            >
              <Plus aria-hidden="true" className="mr-2 h-4 w-4" />
              Tambah Baris
            </Button>
          </div>

          {form.items.map((item, index) => (
            <Card key={item.id ?? `new-${index}`}>
              <CardContent className="space-y-3 p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold">Item {index + 1}</p>
                  <IconAction
                    label={`Hapus baris item ${index + 1}`}
                    icon={X}
                    disabled={form.items.length === 1}
                    onClick={() =>
                      update(
                        "items",
                        form.items.filter((_, itemIndex) => itemIndex !== index),
                      )
                    }
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <FormField id={`purchase-item-name-${index}`} label="Nama item">
                    <Input
                      id={`purchase-item-name-${index}`}
                      value={item.itemName}
                      onChange={(event) => updateItem(index, { itemName: event.target.value })}
                    />
                  </FormField>
                  <FormField id={`purchase-item-quantity-${index}`} label="Quantity">
                    <Input
                      id={`purchase-item-quantity-${index}`}
                      type="number"
                      min="0.001"
                      step="0.001"
                      value={item.quantity}
                      onChange={(event) =>
                        updateItem(index, { quantity: Number(event.target.value) })
                      }
                    />
                  </FormField>
                  <FormField id={`purchase-item-unit-${index}`} label="Satuan (opsional)">
                    <Input
                      id={`purchase-item-unit-${index}`}
                      value={item.unit}
                      onChange={(event) => updateItem(index, { unit: event.target.value })}
                    />
                  </FormField>
                  <FormField id={`purchase-item-unit-price-${index}`} label="Harga satuan">
                    <Input
                      id={`purchase-item-unit-price-${index}`}
                      type="number"
                      min="0"
                      step="0.01"
                      value={item.unitPrice}
                      onChange={(event) =>
                        updateItem(index, { unitPrice: Number(event.target.value) })
                      }
                    />
                  </FormField>
                  <FormField
                    id={`purchase-item-amount-${index}`}
                    label="Jumlah sumber"
                    hint={`Hitungan quantity × harga: ${formatRupiah(item.quantity * item.unitPrice)}`}
                  >
                    <Input
                      id={`purchase-item-amount-${index}`}
                      type="number"
                      min="0"
                      step="0.01"
                      value={item.amount}
                      onChange={(event) =>
                        updateItem(index, { amount: Number(event.target.value) })
                      }
                    />
                  </FormField>
                  <FormField id={`purchase-item-class-${index}`} label="Klasifikasi">
                    <Select
                      value={item.financialClass}
                      onValueChange={(value) =>
                        updateItem(index, { financialClass: parseFinancialClass(value) })
                      }
                    >
                      <SelectTrigger id={`purchase-item-class-${index}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="hpp">HPP</SelectItem>
                        <SelectItem value="operating_expense">Beban operasional</SelectItem>
                        <SelectItem value="asset">Aset</SelectItem>
                        <SelectItem value="other">Lainnya</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormField>
                  <FormField
                    id={`purchase-item-category-${index}`}
                    label="Kategori sumber (opsional)"
                  >
                    <Input
                      id={`purchase-item-category-${index}`}
                      value={item.sourceCategory}
                      onChange={(event) =>
                        updateItem(index, { sourceCategory: event.target.value })
                      }
                    />
                  </FormField>
                  <FormField id={`purchase-item-policy-${index}`} label="Kebijakan klasifikasi">
                    <Input
                      id={`purchase-item-policy-${index}`}
                      value={item.classificationPolicy}
                      onChange={(event) =>
                        updateItem(index, { classificationPolicy: event.target.value })
                      }
                    />
                  </FormField>
                </div>
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <Checkbox
                    checked={item.assetTracking}
                    disabled={item.financialClass !== "asset"}
                    onCheckedChange={(checked) =>
                      updateItem(index, { assetTracking: checked === true })
                    }
                  />
                  Lacak sebagai calon aset/peralatan (khusus klasifikasi aset)
                </label>
              </CardContent>
            </Card>
          ))}
        </section>

        <div className="rounded-lg bg-muted p-4 text-right">
          <p className="text-xs text-muted-foreground">Total invoice</p>
          <p className="text-xl font-semibold tabular-nums">{formatRupiah(formTotal)}</p>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => onOpenChange(false)}
          >
            Batal
          </Button>
          <Button type="button" disabled={pending || loadingBatches} onClick={onSave}>
            {pending ? <Loader2 aria-hidden="true" className="mr-2 h-4 w-4 animate-spin" /> : null}
            Simpan Invoice
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PurchaseDetailDialog({
  invoice,
  onClose,
  onEdit,
}: {
  invoice: PurchaseRecord | null;
  onClose: () => void;
  onEdit: (invoice: PurchaseRecord) => void;
}) {
  return (
    <Dialog
      open={Boolean(invoice)}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Detail Invoice Pembelian</DialogTitle>
          <DialogDescription>
            {invoice ? `${formatDate(invoice.purchase_date)} · ${invoice.supplierLabel}` : ""}
          </DialogDescription>
        </DialogHeader>
        {invoice ? (
          <div className="space-y-4">
            <div className="grid gap-3 rounded-lg border p-4 sm:grid-cols-2 lg:grid-cols-4">
              <Metric
                label="Referensi"
                value={invoice.receipt_reference || invoice.invoice_source_key}
              />
              <Metric
                label="Paket data"
                value={invoice.import_batch?.batch_key || invoice.import_batch_id}
              />
              <Metric label="Status" value={invoice.deleted_at ? "Terhapus" : invoice.status} />
              <Metric label="Total" value={formatRupiah(invoice.total)} />
              <Metric label="Asal data" value={invoice.data_origin} />
              <Metric label="Catatan" value={invoice.notes || "Belum tersedia"} />
            </div>
            <div className="overflow-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Harga satuan</TableHead>
                    <TableHead className="text-right">Jumlah sumber</TableHead>
                    <TableHead>Klasifikasi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoice.activeItems.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        <p className="font-medium">{item.item_name_raw}</p>
                        <p className="text-xs text-muted-foreground">
                          {item.unit || "Tanpa satuan"}
                          {toFiniteNumber(item.amount_difference)
                            ? ` · selisih ${formatRupiah(item.amount_difference)}`
                            : ""}
                        </p>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatNumber(item.quantity, 3)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatRupiah(item.unit_price)}
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {formatRupiah(item.amount)}
                      </TableCell>
                      <TableCell>{financialClassLabel(item.financial_class)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        ) : null}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Tutup
          </Button>
          {invoice && !invoice.deleted_at ? (
            <Button type="button" onClick={() => onEdit(invoice)}>
              <Pencil aria-hidden="true" className="mr-2 h-4 w-4" />
              Edit Invoice
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Pagination({
  page,
  pages,
  total,
  onPage,
}: {
  page: number;
  pages: number;
  total: number;
  onPage: (page: number) => void;
}) {
  return (
    <nav
      aria-label="Paginasi invoice pembelian"
      className="flex flex-col items-center justify-between gap-3 sm:flex-row"
    >
      <p className="text-sm text-muted-foreground">{formatNumber(total)} invoice ditemukan</p>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
        >
          Sebelumnya
        </Button>
        <span className="text-sm">
          {page} / {pages}
        </span>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={page >= pages}
          onClick={() => onPage(page + 1)}
        >
          Berikutnya
        </Button>
      </div>
    </nav>
  );
}

function validatePurchaseForm(form: PurchaseFormValue): PurchaseFormValue {
  if (!form.importBatchId) throw new Error("Pilih paket data.");
  if (!parseIsoDate(form.purchaseDate)) throw new Error("Tanggal pembelian tidak valid.");
  if (!form.items.length) throw new Error("Invoice minimal memiliki satu item.");

  for (const [index, item] of form.items.entries()) {
    if (item.itemName.trim().length < 2) {
      throw new Error(`Nama item ${index + 1} minimal 2 karakter.`);
    }
    if (!Number.isFinite(item.quantity) || item.quantity <= 0) {
      throw new Error(`Quantity item ${index + 1} harus lebih dari nol.`);
    }
    if (!Number.isFinite(item.unitPrice) || item.unitPrice < 0) {
      throw new Error(`Harga satuan item ${index + 1} tidak valid.`);
    }
    if (!Number.isFinite(item.amount) || item.amount < 0) {
      throw new Error(`Jumlah sumber item ${index + 1} tidak valid.`);
    }
    if (item.assetTracking && item.financialClass !== "asset") {
      throw new Error(`Item ${index + 1} hanya dapat dilacak jika diklasifikasikan sebagai aset.`);
    }
  }

  return form;
}

function normalizePurchase(row: PurchaseDatabaseRow): PurchaseRecord {
  const activeItems = (row.purchase_items ?? []).filter((item) => !item.deleted_at);
  const classes = [...new Set(activeItems.map((item) => item.financial_class))];

  return {
    ...row,
    activeItems,
    itemCount: activeItems.length,
    total: activeItems.reduce((total, item) => total + toFiniteNumber(item.amount), 0),
    classes,
    supplierLabel:
      row.supplier?.supplier_name || row.supplier_name_raw || "Supplier tidak tercatat",
  };
}

function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}

function InvoiceStatusBadge({ invoice }: { invoice: PurchaseRecord }) {
  if (invoice.deleted_at) return <Badge variant="destructive">Terhapus</Badge>;
  return invoice.status === "recorded" ? (
    <Badge variant="secondary">Tercatat</Badge>
  ) : (
    <Badge variant="outline">Voided</Badge>
  );
}

function ClassBadges({ classes }: { classes: FinancialClass[] }) {
  return (
    <div className="flex flex-wrap gap-1">
      {classes.length ? (
        classes.map((financialClass) => (
          <Badge key={financialClass} variant="outline">
            {financialClassLabel(financialClass)}
          </Badge>
        ))
      ) : (
        <span className="text-xs text-muted-foreground">Tanpa item aktif</span>
      )}
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
      </CardContent>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="break-words font-medium">{value}</p>
    </div>
  );
}

function parseClassFilter(value: unknown): PurchaseClassFilter | undefined {
  return value === "all" ||
    value === "hpp" ||
    value === "operating_expense" ||
    value === "asset" ||
    value === "other"
    ? value
    : undefined;
}

function parseFinancialClass(value: unknown): FinancialClass {
  const parsed = parseClassFilter(value);
  return parsed && parsed !== "all" ? parsed : "other";
}

function parseStateFilter(value: unknown): PurchaseStateFilter | undefined {
  return value === "recorded" || value === "voided" || value === "deleted" || value === "all"
    ? value
    : undefined;
}

function financialClassLabel(value: FinancialClass): string {
  if (value === "hpp") return "HPP";
  if (value === "operating_expense") return "Beban operasional";
  if (value === "asset") return "Aset";
  return "Lainnya";
}

function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
