import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  Building2,
  Eye,
  Loader2,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Trash2,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/PageHeader";
import { ExportExcelDialog } from "@/components/reports/ExportExcelDialog";
import { OperationalInputterCard } from "@/components/OperationalInputterCard";
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
import { useBusinessStructure } from "@/hooks/useBusinessStructure";
import { useOperationalInputter } from "@/hooks/useOperationalInputter";
import { displayOperationalInputter } from "@/lib/operationalInputter";
import {
  actualClient,
  getActualDataErrorMessage,
  normalizedName,
  toFiniteNumber,
  toNullableText,
} from "@/lib/actualData";
import { formatRupiah } from "@/lib/format";

type SupplierStatusFilter = "active" | "archived" | "all";

interface SupplierSearch {
  q?: string;
  status?: SupplierStatusFilter;
}

interface SupplierItemRow {
  id: string;
  supplier_item_key: string;
  catalog_no: string | null;
  item_name_raw: string;
  brand_raw: string | null;
  size_raw: string | null;
  price_raw: string | null;
  inputter_name: string | null;
  reference_price?: number | string | null;
  financial_class?: string | null;
  is_active: boolean;
  deleted_at: string | null;
}

interface SupplierInvoiceRow {
  id: string;
  status: string;
  deleted_at: string | null;
  purchase_items: Array<{
    amount: number | string;
    deleted_at: string | null;
  }> | null;
}

interface SupplierDatabaseRow {
  id: string;
  supplier_key: string;
  supplier_name: string;
  normalized_name: string;
  phone: string | null;
  address: string | null;
  link: string | null;
  contact_person: string | null;
  source_type: string | null;
  source_references: string | null;
  is_active: boolean;
  deleted_at: string | null;
  inputter_name: string | null;
  updated_at: string;
  supplier_items: SupplierItemRow[] | null;
  purchase_invoices?: SupplierInvoiceRow[] | null;
}

interface SupplierRecord extends SupplierDatabaseRow {
  itemCount: number;
  invoiceCount: number;
  invoiceValue: number;
}

interface SupplierFormValue {
  supplierName: string;
  phone: string;
  address: string;
  link: string;
  contactPerson: string;
  items: Array<{
    id?: string;
    productName: string;
    brandName: string;
    productSize: string;
    unitPriceText: string;
    inputterName?: string | null;
  }>;
}

const EMPTY_SUPPLIER_FORM: SupplierFormValue = {
  supplierName: "",
  phone: "",
  address: "",
  link: "",
  contactPerson: "",
  items: [{ productName: "", brandName: "", productSize: "", unitPriceText: "" }],
};

export const Route = createFileRoute("/_authenticated/supplier")({
  validateSearch: (search: Record<string, unknown>): SupplierSearch => ({
    q: typeof search.q === "string" && search.q.trim() ? search.q : undefined,
    status: parseSupplierStatus(search.status),
  }),
  component: SupplierPage,
});

function SupplierPage() {
  const {
    isAdmin,
    isSuperAdmin,
    canAccessSuppliers,
    canCreateSuppliers,
    canEditSuppliers,
    canExportSuppliers,
    canArchiveSuppliers,
    canManageSupplierInputter,
    loading: authLoading,
    user,
  } = useAuth();
  const queryClient = useQueryClient();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const query = search.q ?? "";
  const status = isAdmin ? (search.status ?? "active") : "active";
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<SupplierRecord | null>(null);
  const [detail, setDetail] = useState<SupplierRecord | null>(null);
  const [form, setForm] = useState<SupplierFormValue>(EMPTY_SUPPLIER_FORM);
  const [confirmAction, setConfirmAction] = useState<ConfirmActionState | null>(null);
  const { outlet } = useBusinessStructure();
  const supplierInputter = useOperationalInputter(outlet?.id ?? null, "suppliers");

  const suppliersQuery = useQuery({
    queryKey: ["actual-suppliers", { q: query.trim(), status, includeFinancial: isAdmin }],
    enabled: canAccessSuppliers,
    staleTime: 30_000,
    queryFn: async (): Promise<SupplierRecord[]> => {
      const supplierItemsSelect = isAdmin
        ? "supplier_items(id,supplier_item_key,catalog_no,item_name_raw,brand_raw,size_raw,price_raw,reference_price,financial_class,is_active,deleted_at,inputter_name)"
        : "supplier_items(id,supplier_item_key,catalog_no,item_name_raw,brand_raw,size_raw,price_raw,is_active,deleted_at,inputter_name)";
      const supplierSelect = [
        "id,supplier_key,supplier_name,normalized_name,phone,address,link,",
        "contact_person,source_type,source_references,is_active,deleted_at,inputter_name,updated_at,",
        supplierItemsSelect,
        isAdmin ? ",purchase_invoices(id,status,deleted_at,purchase_items(amount,deleted_at))" : "",
      ].join("");

      const { data, error } = await actualClient
        .from<SupplierDatabaseRow>("suppliers")
        .select(supplierSelect)
        .order("supplier_name", { ascending: true });

      if (error) throw error;

      const normalizedQuery = query.trim().toLocaleLowerCase("id-ID");

      return (data ?? [])
        .filter((row) => matchesSupplierStatus(row, status))
        .filter((row) => {
          if (!normalizedQuery) return true;
          return [row.supplier_name, row.contact_person ?? "", row.phone ?? "", row.address ?? "", ...(row.supplier_items ?? []).flatMap((item) => [item.item_name_raw, item.brand_raw ?? ""])]
            .join(" ")
            .toLocaleLowerCase("id-ID")
            .includes(normalizedQuery);
        })
        .map(normalizeSupplier);
    },
  });

  const mutation = useMutation({
    mutationFn: async ({
      type,
      supplier,
    }: {
      type: "save" | "soft-delete" | "restore" | "hard-delete";
      supplier?: SupplierRecord;
    }) => {
      if (type === "save") {
        if (editing ? !canEditSuppliers : !canCreateSuppliers) {
          throw new Error("Anda tidak memiliki izin untuk menyimpan Supplier.");
        }
        const existingItemIds = new Set((editing?.supplier_items ?? []).filter((item) => !item.deleted_at).map((item) => item.id));
        const createsOperationalData = !editing || form.items.some((item) => !item.id || !existingItemIds.has(item.id));
        const inputterSession = createsOperationalData ? await supplierInputter.ensureValidSession() : null;

        const supplierName = form.supplierName.trim().replace(/\s+/g, " ");

        if (supplierName.length < 2) {
          throw new Error("Nama supplier minimal 2 karakter.");
        }

        const items = form.items.map((item) => ({ id: item.id, product_name: item.productName.trim(), brand_name: item.brandName.trim() || null, product_size: item.productSize.trim() || null, unit_price_text: item.unitPriceText.trim() || null }));
        if (items.some((item) => !item.product_name)) throw new Error("Nama Produk wajib diisi.");
        const payload: Record<string, unknown> = {
          supplier_name: supplierName,
          normalized_name: normalizedName(supplierName),
          phone: toNullableText(form.phone),
          address: toNullableText(form.address),
          link: toNullableText(form.link),
          contact_person: toNullableText(form.contactPerson),
          source_type: editing?.source_type ?? "manual_web_entry",
          source_references: editing?.source_references ?? null,
          is_active: editing?.is_active ?? true,
          updated_by: user?.id ?? null,
        };

        const client = actualClient as unknown as { rpc(name: string, args: Record<string, unknown>): PromiseLike<{ error: unknown }> };
        const { error } = await client.rpc("save_supplier_with_items", { p_supplier: payload, p_items: items, p_supplier_id: editing?.id ?? null, p_outlet_id: outlet?.id ?? null, p_inputter_session_id: inputterSession?.sessionId ?? null });
        if (error) throw error;
        return;
      }

      if (!supplier) throw new Error("Supplier tidak ditemukan.");

      if (type === "soft-delete") {
        if (!canArchiveSuppliers) {
          throw new Error("Hanya Admin atau Super Admin yang dapat mengarsipkan Supplier.");
        }

        const { error } = await actualClient
          .from("suppliers")
          .update({
            deleted_at: new Date().toISOString(),
            deleted_by: user?.id ?? null,
            is_active: false,
            updated_by: user?.id ?? null,
          })
          .eq("id", supplier.id);
        if (error) throw error;
        return;
      }

      if (type === "restore") {
        if (!canArchiveSuppliers) {
          throw new Error("Hanya Admin atau Super Admin yang dapat memulihkan Supplier.");
        }

        const { error } = await actualClient
          .from("suppliers")
          .update({
            deleted_at: null,
            deleted_by: null,
            is_active: true,
            updated_by: user?.id ?? null,
          })
          .eq("id", supplier.id);
        if (error) throw error;
        return;
      }

      if (!isSuperAdmin) {
        throw new Error("Hanya Super Admin yang dapat menghapus permanen.");
      }
      if (supplier.invoiceCount > 0) {
        throw new Error(
          "Supplier memiliki riwayat transaksi dan tidak dapat dihapus permanen.",
        );
      }

      const { error } = await actualClient.from("suppliers").delete().eq("id", supplier.id);
      if (error) throw error;
    },
    onSuccess: async (_, variables) => {
      toast.success(
        variables.type === "save"
          ? editing
            ? "Supplier berhasil diperbarui."
            : "Supplier berhasil ditambahkan."
          : variables.type === "restore"
            ? "Supplier berhasil dipulihkan."
            : variables.type === "soft-delete"
              ? "Supplier dipindahkan ke data terhapus."
              : "Supplier berhasil dihapus permanen.",
      );
      closeForm();
      setConfirmAction(null);
      setDetail(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["actual-suppliers"] }),
        queryClient.invalidateQueries({ queryKey: ["actual-purchase-options"] }),
        queryClient.invalidateQueries({ queryKey: ["actual-purchases"] }),
        queryClient.invalidateQueries({ queryKey: ["actual-finance"] }),
        queryClient.invalidateQueries({ queryKey: ["operational-dashboard"] }),
      ]);
    },
    onError: (error: unknown) => {
      toast.error("Supplier gagal diproses.", {
        description: getActualDataErrorMessage(error),
      });
    },
  });

  const summary = useMemo(() => {
    const rows = suppliersQuery.data ?? [];
    return {
      suppliers: rows.length,
      active: rows.filter((row) => row.is_active && !row.deleted_at).length,
      items: rows.reduce((total, row) => total + row.itemCount, 0),
      invoices: rows.reduce((total, row) => total + row.invoiceCount, 0),
      value: rows.reduce((total, row) => total + row.invoiceValue, 0),
    };
  }, [suppliersQuery.data]);

  const updateSearch = (patch: Partial<SupplierSearch>) => {
    void navigate({
      search: {
        q: "q" in patch ? patch.q : search.q,
        status: "status" in patch ? (patch.status ?? "active") : (search.status ?? "active"),
      },
      replace: true,
    });
  };

  const openCreate = () => {
    if (!canCreateSuppliers) {
      toast.error("Anda tidak memiliki izin untuk menambah Supplier.");
      return;
    }

    if (!supplierInputter.name) {
      toast.error("Nama penginput Supplier belum diatur.");
      return;
    }
    setEditing(null);
    setForm(EMPTY_SUPPLIER_FORM);
    setFormOpen(true);
  };

  const openEdit = (supplier: SupplierRecord) => {
    if (!canEditSuppliers) {
      toast.error("Anda tidak memiliki izin untuk mengedit Supplier.");
      return;
    }

    setEditing(supplier);
    setForm({
      supplierName: supplier.supplier_name,
      phone: supplier.phone ?? "",
      address: supplier.address ?? "",
      link: supplier.link ?? "",
      contactPerson: supplier.contact_person ?? "",
      items: (supplier.supplier_items ?? []).filter((item) => !item.deleted_at).map((item) => ({ id: item.id, productName: item.item_name_raw, brandName: item.brand_raw ?? "", productSize: item.size_raw ?? "", unitPriceText: item.price_raw ?? "", inputterName: item.inputter_name })),
    });
    setFormOpen(true);
  };

  const closeForm = () => {
    setFormOpen(false);
    setEditing(null);
    setForm(EMPTY_SUPPLIER_FORM);
  };

  const askMutation = (
    type: "soft-delete" | "restore" | "hard-delete",
    supplier: SupplierRecord,
  ) => {
    const hardDelete = type === "hard-delete";
    setConfirmAction({
      title:
        type === "restore"
          ? "Pulihkan supplier?"
          : hardDelete
            ? "Hapus supplier secara permanen?"
            : "Arsipkan supplier?",
      description:
        type === "restore"
          ? `${supplier.supplier_name} akan kembali aktif dan dapat dipilih pada transaksi baru.`
          : hardDelete
            ? supplier.invoiceCount || supplier.itemCount
              ? `${supplier.supplier_name} masih memiliki ${supplier.itemCount} item dan ${supplier.invoiceCount} invoice. Database akan menolak penghapusan jika referensi tersebut masih ada.`
              : `${supplier.supplier_name} akan dihapus permanen dan tindakan ini tidak dapat dibatalkan.`
            : `${supplier.supplier_name} tidak akan muncul pada filter supplier aktif. Riwayat invoice tetap dipertahankan.`,
      confirmLabel: type === "restore" ? "Pulihkan" : hardDelete ? "Hapus Permanen" : "Arsipkan",
      destructive: type !== "restore",
      onConfirm: () => mutation.mutate({ type, supplier }),
    });
  };

  if (authLoading) {
    return <ModuleInitialLoading label="Memeriksa akses modul supplier" />;
  }

  if (!canAccessSuppliers) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Akses ditolak</AlertTitle>
        <AlertDescription>
          Anda tidak memiliki izin untuk mengakses Supplier. Kebijakan RLS tetap menjadi sumber
          otorisasi utama.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Supplier"
        description={
          isAdmin
            ? "Direktori supplier aktual, katalog item, dan nilai pembelian terkait."
            : "Direktori supplier aktual dan katalog barang untuk kebutuhan operasional."
        }
        actions={
          <div className="flex flex-wrap gap-2">
            {canExportSuppliers ? (
              <ExportExcelDialog reportType="suppliers" filters={{ status }} />
            ) : null}
            {canCreateSuppliers ? (
              <Button type="button" onClick={openCreate}>
                <Plus aria-hidden="true" className="mr-2 h-4 w-4" />
                Tambah Supplier
              </Button>
            ) : null}
          </div>
        }
      />
      {canManageSupplierInputter ? (
        <OperationalInputterCard outletId={outlet?.id ?? null} section="suppliers" />
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Hasil filter" value={String(summary.suppliers)} />
        <SummaryCard label="Supplier aktif" value={String(summary.active)} />
        {isAdmin ? (
          <>
            <SummaryCard label="Invoice tercatat" value={String(summary.invoices)} />
            <SummaryCard label="Nilai invoice" value={formatRupiah(summary.value)} />
          </>
        ) : (
          <SummaryCard label="Total item aktif" value={String(summary.items)} />
        )}
      </div>

      <Card>
        <CardContent
          className={
            isAdmin
              ? "grid gap-3 p-4 md:grid-cols-[minmax(0,1fr)_14rem_auto] md:items-end"
              : "grid gap-3 p-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-end"
          }
        >
          <FormField id="supplier-search" label="Cari supplier">
            <div className="relative">
              <Search
                aria-hidden="true"
                className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                id="supplier-search"
                className="pl-9"
                value={query}
                placeholder="Nama, kontak, telepon, alamat…"
                onChange={(event) => updateSearch({ q: event.target.value || undefined })}
              />
            </div>
          </FormField>
          {isAdmin ? (
            <FormField id="supplier-status" label="Status">
              <Select
                value={status}
                onValueChange={(value) => updateSearch({ status: parseSupplierStatus(value) })}
              >
                <SelectTrigger id="supplier-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Aktif</SelectItem>
                  <SelectItem value="archived">Diarsipkan</SelectItem>
                  <SelectItem value="all">Semua</SelectItem>
                </SelectContent>
              </Select>
            </FormField>
          ) : null}
          <BackgroundRefresh active={suppliersQuery.isFetching && !suppliersQuery.isPending} />
        </CardContent>
      </Card>

      {suppliersQuery.isPending ? (
        <ModuleInitialLoading label="Memuat daftar supplier" />
      ) : suppliersQuery.isError ? (
        <ModuleError
          title="Daftar supplier gagal dimuat"
          error={suppliersQuery.error}
          onRetry={() => void suppliersQuery.refetch()}
        />
      ) : suppliersQuery.data?.length ? (
        <SupplierResults
          suppliers={suppliersQuery.data}
          showFinancial={isAdmin}
          canEdit={canEditSuppliers}
          canArchive={canArchiveSuppliers}
          isSuperAdmin={isSuperAdmin}
          onDetail={setDetail}
          onEdit={openEdit}
          onAction={askMutation}
        />
      ) : (
        <EmptyState
          icon={Building2}
          title="Supplier tidak ditemukan"
          description="Ubah kata pencarian atau filter status. Sistem tidak menampilkan data dummy."
        />
      )}

      <SupplierFormDialog
        open={formOpen}
        editing={editing}
        form={form}
        pending={mutation.isPending}
        onOpenChange={(open) => {
          if (!open && !mutation.isPending) closeForm();
        }}
        onChange={setForm}
        onSave={() => mutation.mutate({ type: "save" })}
        inputterName={editing?.inputter_name ?? supplierInputter.name}
      />

      <SupplierDetailDialog
        supplier={detail}
        showFinancial={isAdmin}
        canEdit={canEditSuppliers}
        onClose={() => setDetail(null)}
        onEdit={(supplier) => {
          setDetail(null);
          openEdit(supplier);
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

function SupplierResults({
  suppliers,
  showFinancial,
  canEdit,
  canArchive,
  isSuperAdmin,
  onDetail,
  onEdit,
  onAction,
}: {
  suppliers: SupplierRecord[];
  showFinancial: boolean;
  canEdit: boolean;
  canArchive: boolean;
  isSuperAdmin: boolean;
  onDetail: (supplier: SupplierRecord) => void;
  onEdit: (supplier: SupplierRecord) => void;
  onAction: (type: "soft-delete" | "restore" | "hard-delete", supplier: SupplierRecord) => void;
}) {
  return (
    <>
      <div className="grid gap-3 md:hidden">
        {suppliers.map((supplier) => (
          <Card key={supplier.id}>
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between gap-2">
                <CardTitle className="text-base">{supplier.supplier_name}</CardTitle>
                <SupplierStatusBadge supplier={supplier} />
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-lg border bg-muted/20 p-3">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Katalog produk
                </p>
                <div className="mt-2 space-y-2">
                  {renderSupplierItemSummaries(supplier).map((line) => (
                    <div key={line.key} className="space-y-0.5">
                      <p className="font-medium leading-snug">{line.title}</p>
                      <p className="text-xs text-muted-foreground">{line.subtitle}</p>
                      <p className="text-sm font-semibold">{line.price}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <Metric label="Item" value={String(supplier.itemCount)} />
                {showFinancial ? (
                  <>
                    <Metric label="Invoice" value={String(supplier.invoiceCount)} />
                    <Metric
                      className="col-span-2"
                      label="Nilai pembelian"
                      value={formatRupiah(supplier.invoiceValue)}
                    />
                  </>
                ) : null}
              </div>
              <SupplierActions
                supplier={supplier}
                canEdit={canEdit}
                canArchive={canArchive}
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
              <TableHead>Supplier</TableHead>
              <TableHead>Katalog produk</TableHead>
              <TableHead>Harga Produk</TableHead>
              <TableHead>Kontak</TableHead>
              <TableHead>Alamat / Platform</TableHead>
              <TableHead className="text-right">Item</TableHead>
              {showFinancial ? (
                <>
                  <TableHead className="text-right">Invoice</TableHead>
                  <TableHead className="text-right">Nilai</TableHead>
                </>
              ) : null}
              <TableHead>Status</TableHead>
              <TableHead>Penginput</TableHead>
              <TableHead>Update</TableHead>
              <TableHead className="text-right">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {suppliers.map((supplier) => (
              <TableRow key={supplier.id}>
                <TableCell>
                  <p className="font-medium">{supplier.supplier_name}</p>
                  <p className="text-xs text-muted-foreground">{supplier.supplier_key}</p>
                </TableCell>
                <TableCell className="max-w-[26rem] align-top">
                  <div className="space-y-2">
                    {renderSupplierItemSummaries(supplier).map((line) => (
                      <div key={line.key} className="space-y-0.5">
                        <p className="font-medium leading-snug">{line.title}</p>
                        <p className="text-xs text-muted-foreground">{line.subtitle}</p>
                      </div>
                    ))}
                  </div>
                </TableCell>
                <TableCell className="max-w-[18rem] align-top">
                  <div className="space-y-2">
                    {renderSupplierItemSummaries(supplier).map((line) => (
                      <p key={line.key} className="font-medium leading-snug">{line.price}</p>
                    ))}
                  </div>
                </TableCell>
                <TableCell>
                  <p>{supplier.contact_person || "—"}</p>
                  <p className="text-xs text-muted-foreground">
                    {supplier.phone || "Tanpa telepon"}
                  </p>
                </TableCell>
                <TableCell className="max-w-56 truncate">{supplier.address || "—"}</TableCell>
                <TableCell className="text-right tabular-nums">{supplier.itemCount}</TableCell>
                {showFinancial ? (
                  <>
                    <TableCell className="text-right tabular-nums">{supplier.invoiceCount}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {formatRupiah(supplier.invoiceValue)}
                    </TableCell>
                  </>
                ) : null}
                <TableCell>
                  <SupplierStatusBadge supplier={supplier} />
                </TableCell>
                <TableCell>{displayOperationalInputter(supplier.inputter_name)}</TableCell>
                <TableCell>
                  {new Intl.DateTimeFormat("id-ID", { dateStyle: "medium" }).format(
                    new Date(supplier.updated_at),
                  )}
                </TableCell>
                <TableCell>
                  <SupplierActions
                    supplier={supplier}
                    canEdit={canEdit}
                    canArchive={canArchive}
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

function SupplierActions({
  supplier,
  canEdit,
  canArchive,
  isSuperAdmin,
  onDetail,
  onEdit,
  onAction,
}: {
  supplier: SupplierRecord;
  canEdit: boolean;
  canArchive: boolean;
  isSuperAdmin: boolean;
  onDetail: (supplier: SupplierRecord) => void;
  onEdit: (supplier: SupplierRecord) => void;
  onAction: (type: "soft-delete" | "restore" | "hard-delete", supplier: SupplierRecord) => void;
}) {
  return (
    <div className="flex justify-end gap-1">
      <IconAction
        label={`Lihat detail ${supplier.supplier_name}`}
        icon={Eye}
        onClick={() => onDetail(supplier)}
      />
      {supplier.deleted_at ? (
        canArchive ? (
          <IconAction
            label={`Pulihkan ${supplier.supplier_name}`}
            icon={RotateCcw}
            onClick={() => onAction("restore", supplier)}
          />
        ) : null
      ) : (
        <>
          {canEdit ? (
            <IconAction
              label={`Edit ${supplier.supplier_name}`}
              icon={Pencil}
              onClick={() => onEdit(supplier)}
            />
          ) : null}
          {canArchive ? (
            <IconAction
              label={`Arsipkan ${supplier.supplier_name}`}
              icon={Archive}
              onClick={() => onAction("soft-delete", supplier)}
            />
          ) : null}
        </>
      )}
      {isSuperAdmin ? (
        <IconAction
          label={`Hapus permanen ${supplier.supplier_name}`}
          icon={Trash2}
          variant="destructive"
          onClick={() => onAction("hard-delete", supplier)}
        />
      ) : null}
    </div>
  );
}

function SupplierFormDialog({
  open,
  editing,
  form,
  pending,
  onOpenChange,
  onChange,
  onSave,
  inputterName,
}: {
  open: boolean;
  editing: SupplierRecord | null;
  form: SupplierFormValue;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onChange: (form: SupplierFormValue) => void;
  onSave: () => void;
  inputterName: string | null;
}) {
  const update = <Key extends keyof SupplierFormValue>(key: Key, value: SupplierFormValue[Key]) =>
    onChange({ ...form, [key]: value });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit Supplier" : "Tambah Supplier"}</DialogTitle>
          <DialogDescription>
            Isi data yang benar-benar diketahui. Kolom opsional boleh dibiarkan kosong.
          </DialogDescription>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">{editing ? "Penginput saat dibuat" : "Penginput"}: <span className="font-medium text-foreground">{displayOperationalInputter(inputterName)}</span></p>
        <section className="space-y-3">
          <h3 className="font-semibold">KATALOG PRODUK</h3>
          <div className="space-y-3">
            {form.items.map((item, index) => (
              <Card key={item.id ?? index}>
                <CardContent className="grid gap-3 p-4 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      No. {index + 1}
                    </p>
                  </div>
                  <FormField id={`supplier-item-${index}-name`} label="Nama produk *">
                    <Input
                      id={`supplier-item-${index}-name`}
                      maxLength={300}
                      value={item.productName}
                      onChange={(event) =>
                        update(
                          "items",
                          form.items.map((row, rowIndex) =>
                            rowIndex === index ? { ...row, productName: event.target.value } : row,
                          ),
                        )
                      }
                    />
                  </FormField>
                  <FormField id={`supplier-item-${index}-brand`} label="Merk produk">
                    <Input
                      id={`supplier-item-${index}-brand`}
                      value={item.brandName}
                      onChange={(event) =>
                        update(
                          "items",
                          form.items.map((row, rowIndex) =>
                            rowIndex === index ? { ...row, brandName: event.target.value } : row,
                          ),
                        )
                      }
                    />
                  </FormField>
                  <FormField id={`supplier-item-${index}-size`} label="Ukuran produk">
                    <Input
                      id={`supplier-item-${index}-size`}
                      value={item.productSize}
                      onChange={(event) =>
                        update(
                          "items",
                          form.items.map((row, rowIndex) =>
                            rowIndex === index ? { ...row, productSize: event.target.value } : row,
                          ),
                        )
                      }
                    />
                  </FormField>
                  <FormField id={`supplier-item-${index}-price`} label="Harga satuan">
                    <Input
                      id={`supplier-item-${index}-price`}
                      maxLength={500}
                      value={item.unitPriceText}
                      onChange={(event) =>
                        update(
                          "items",
                          form.items.map((row, rowIndex) =>
                            rowIndex === index ? { ...row, unitPriceText: event.target.value } : row,
                          ),
                        )
                      }
                    />
                  </FormField>
                  <div className="flex justify-end sm:col-span-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="destructive"
                      disabled={form.items.length === 1}
                      onClick={() =>
                        update(
                          "items",
                          form.items.filter((_, rowIndex) => rowIndex !== index),
                        )
                      }
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Hapus
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() =>
              update("items", [
                ...form.items,
                { productName: "", brandName: "", productSize: "", unitPriceText: "" },
              ])
            }
          >
            <Plus className="mr-2 h-4 w-4" />
            Tambah Produk
          </Button>
        </section>
        <section className="space-y-3">
          <h3 className="font-semibold">INFORMASI TOKO</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField id="supplier-name" label="Nama Toko *">
              <Input
                id="supplier-name"
                value={form.supplierName}
                autoFocus
                onChange={(event) => update("supplierName", event.target.value)}
              />
            </FormField>
            <FormField id="supplier-address" label="Alamat Toko / Platform Online">
              <Textarea
                id="supplier-address"
                value={form.address}
                onChange={(event) => update("address", event.target.value)}
              />
            </FormField>
            <FormField id="supplier-link" label="Link Google Maps / Checkout">
              <Input
                id="supplier-link"
                type="url"
                value={form.link}
                onChange={(event) => update("link", event.target.value)}
              />
            </FormField>
            <FormField id="supplier-contact" label="Nama Pelayan / Pemilik">
              <Input
                id="supplier-contact"
                value={form.contactPerson}
                onChange={(event) => update("contactPerson", event.target.value)}
              />
            </FormField>
            <FormField id="supplier-phone" label="No. WhatsApp / Telepon">
              <Input
                id="supplier-phone"
                type="tel"
                value={form.phone}
                onChange={(event) => update("phone", event.target.value)}
              />
            </FormField>
          </div>
        </section>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => onOpenChange(false)}
          >
            Batal
          </Button>
          <Button type="button" disabled={pending} onClick={onSave}>
            {pending ? <Loader2 aria-hidden="true" className="mr-2 h-4 w-4 animate-spin" /> : null}
            Simpan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SupplierDetailDialog({
  supplier,
  showFinancial,
  canEdit,
  onClose,
  onEdit,
}: {
  supplier: SupplierRecord | null;
  showFinancial: boolean;
  canEdit: boolean;
  onClose: () => void;
  onEdit: (supplier: SupplierRecord) => void;
}) {
  const activeItems =
    supplier?.supplier_items?.filter((item) => item.is_active && !item.deleted_at) ?? [];

  return (
    <Dialog
      open={Boolean(supplier)}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{supplier?.supplier_name}</DialogTitle>
          <DialogDescription>
            {supplier
              ? showFinancial
                ? `${supplier.supplier_key} · ${supplier.invoiceCount} invoice · ${formatRupiah(
                    supplier.invoiceValue,
                  )}`
                : supplier.supplier_key
              : ""}
          </DialogDescription>
        </DialogHeader>

        {supplier ? (
          <div className="space-y-5">
            <div className="grid gap-3 rounded-lg border p-4 sm:grid-cols-2">
              <Metric label="Kontak" value={supplier.contact_person || "Belum tersedia"} />
              <Metric label="Telepon" value={supplier.phone || "Belum tersedia"} />
              <Metric label="Alamat" value={supplier.address || "Belum tersedia"} />
              <Metric label="Tautan" value={supplier.link || "Belum tersedia"} />
              <Metric label="Jenis sumber" value={supplier.source_type || "Belum tersedia"} />
              <Metric
                label="Referensi sumber"
                value={supplier.source_references || "Belum tersedia"}
              />
            </div>

            <section aria-labelledby="supplier-items-heading" className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <h3 id="supplier-items-heading" className="font-semibold">
                  Item supplier
                </h3>
                <Badge variant="secondary">{activeItems.length} item aktif</Badge>
              </div>
              {activeItems.length ? (
                <div className="overflow-auto rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Item</TableHead>
                        <TableHead>Brand / Ukuran</TableHead>
                        {showFinancial ? <TableHead>Klasifikasi</TableHead> : null}
                        <TableHead>Harga satuan</TableHead>
                        <TableHead>Penginput item</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {activeItems.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell>
                            <p className="font-medium">{item.item_name_raw}</p>
                            <p className="text-xs text-muted-foreground">
                              {item.catalog_no || item.supplier_item_key}
                            </p>
                          </TableCell>
                          <TableCell>
                            {[item.brand_raw, item.size_raw].filter(Boolean).join(" · ") || "—"}
                          </TableCell>
                          {showFinancial ? (
                            <TableCell>{financialClassLabel(item.financial_class ?? null)}</TableCell>
                          ) : null}
                          <TableCell>{item.price_raw || "—"}</TableCell>
                          <TableCell>{displayOperationalInputter(item.inputter_name)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <EmptyState
                  title="Belum ada item supplier"
                  description="Tidak ada item aktual yang terhubung ke supplier ini."
                />
              )}
            </section>
          </div>
        ) : null}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Tutup
          </Button>
          {supplier && !supplier.deleted_at && canEdit ? (
            <Button type="button" onClick={() => onEdit(supplier)}>
              <Pencil aria-hidden="true" className="mr-2 h-4 w-4" />
              Edit Supplier
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
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

function Metric({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className={className}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="break-words font-medium">{value}</p>
    </div>
  );
}

function SupplierStatusBadge({ supplier }: { supplier: SupplierRecord }) {
  if (supplier.deleted_at) return <Badge variant="outline">Diarsipkan</Badge>;
  return supplier.is_active ? (
    <Badge variant="secondary">Aktif</Badge>
  ) : (
    <Badge variant="outline">Nonaktif</Badge>
  );
}

function normalizeSupplier(row: SupplierDatabaseRow): SupplierRecord {
  const invoices = (row.purchase_invoices ?? []).filter(
    (invoice) => invoice.status === "recorded" && !invoice.deleted_at,
  );

  return {
    ...row,
    itemCount: (row.supplier_items ?? []).filter((item) => item.is_active && !item.deleted_at)
      .length,
    invoiceCount: invoices.length,
    invoiceValue: invoices.reduce(
      (total, invoice) =>
        total +
        (invoice.purchase_items ?? [])
          .filter((item) => !item.deleted_at)
          .reduce((invoiceTotal, item) => invoiceTotal + toFiniteNumber(item.amount), 0),
      0,
    ),
  };
}

function matchesSupplierStatus(row: SupplierDatabaseRow, status: SupplierStatusFilter): boolean {
  if (status === "all") return true;
  if (status === "archived") return Boolean(row.deleted_at);
  if (row.deleted_at) return false;
  return row.is_active;
}

function parseSupplierStatus(value: unknown): SupplierStatusFilter | undefined {
  return value === "active" || value === "archived" || value === "all"
    ? value
    : undefined;
}

function financialClassLabel(value: string | null): string {
  if (value === "hpp") return "HPP";
  if (value === "operating_expense") return "Beban operasional";
  if (value === "asset") return "Aset";
  if (value === "other") return "Lainnya";
  return "Belum diklasifikasi";
}

function renderSupplierItemSummaries(supplier: SupplierRecord): Array<{
  key: string;
  title: string;
  subtitle: string;
  price: string;
}> {
  const activeItems = (supplier.supplier_items ?? []).filter((item) => item.is_active && !item.deleted_at);

  if (activeItems.length === 0) {
    return [
      {
        key: `${supplier.id}-empty`,
        title: "Belum ada item aktif",
        subtitle: "Tidak ada katalog aktif yang terhubung ke supplier ini.",
        price: "—",
      },
    ];
  }

  return activeItems.map((item) => {
    return {
      key: item.id,
      title: item.item_name_raw,
      subtitle: [item.brand_raw, item.size_raw].filter(Boolean).join(" · ") || "Belum ada merk / ukuran",
      price: item.price_raw || "—",
    };
  });
}
