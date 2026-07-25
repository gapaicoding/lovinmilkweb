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
import {
  actualClient,
  getActualDataErrorMessage,
  manualSourceKey,
  normalizedName,
  toFiniteNumber,
  toNullableText,
} from "@/lib/actualData";
import { formatRupiah } from "@/lib/format";

type SupplierStatusFilter = "active" | "inactive" | "deleted" | "all";

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
  reference_price: number | string | null;
  financial_class: string | null;
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
  supplier_items: SupplierItemRow[] | null;
  purchase_invoices: SupplierInvoiceRow[] | null;
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
  sourceType: string;
  sourceReferences: string;
  isActive: boolean;
}

const EMPTY_SUPPLIER_FORM: SupplierFormValue = {
  supplierName: "",
  phone: "",
  address: "",
  link: "",
  contactPerson: "",
  sourceType: "manual_web_entry",
  sourceReferences: "",
  isActive: true,
};

export const Route = createFileRoute("/_authenticated/supplier")({
  validateSearch: (search: Record<string, unknown>): SupplierSearch => ({
    q: typeof search.q === "string" && search.q.trim() ? search.q : undefined,
    status: parseSupplierStatus(search.status),
  }),
  component: SupplierPage,
});

function SupplierPage() {
  const { isAdmin, isSuperAdmin, loading: authLoading, user } = useAuth();
  const queryClient = useQueryClient();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const query = search.q ?? "";
  const status = search.status ?? "active";
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<SupplierRecord | null>(null);
  const [detail, setDetail] = useState<SupplierRecord | null>(null);
  const [form, setForm] = useState<SupplierFormValue>(EMPTY_SUPPLIER_FORM);
  const [confirmAction, setConfirmAction] = useState<ConfirmActionState | null>(null);

  const suppliersQuery = useQuery({
    queryKey: ["actual-suppliers", { q: query.trim(), status }],
    enabled: isAdmin,
    staleTime: 30_000,
    queryFn: async (): Promise<SupplierRecord[]> => {
      const { data, error } = await actualClient
        .from<SupplierDatabaseRow>("suppliers")
        .select(
          [
            "id,supplier_key,supplier_name,normalized_name,phone,address,link,",
            "contact_person,source_type,source_references,is_active,deleted_at,",
            "supplier_items(id,supplier_item_key,catalog_no,item_name_raw,brand_raw,",
            "size_raw,reference_price,financial_class,is_active,deleted_at),",
            "purchase_invoices(id,status,deleted_at,purchase_items(amount,deleted_at))",
          ].join(""),
        )
        .order("supplier_name", { ascending: true });

      if (error) throw error;

      const normalizedQuery = query.trim().toLocaleLowerCase("id-ID");

      return (data ?? [])
        .filter((row) => matchesSupplierStatus(row, status))
        .filter((row) => {
          if (!normalizedQuery) return true;
          return [row.supplier_name, row.contact_person ?? "", row.phone ?? "", row.address ?? ""]
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
        const supplierName = form.supplierName.trim().replace(/\s+/g, " ");

        if (supplierName.length < 2) {
          throw new Error("Nama supplier minimal 2 karakter.");
        }

        const payload: Record<string, unknown> = {
          supplier_name: supplierName,
          normalized_name: normalizedName(supplierName),
          phone: toNullableText(form.phone),
          address: toNullableText(form.address),
          link: toNullableText(form.link),
          contact_person: toNullableText(form.contactPerson),
          source_type: toNullableText(form.sourceType),
          source_references: toNullableText(form.sourceReferences),
          is_active: form.isActive,
          updated_by: user?.id ?? null,
        };

        if (editing) {
          const { error } = await actualClient
            .from("suppliers")
            .update(payload)
            .eq("id", editing.id);
          if (error) throw error;
          return;
        }

        const { error } = await actualClient.from("suppliers").insert({
          ...payload,
          supplier_key: manualSourceKey("SUP-MANUAL"),
          created_by: user?.id ?? null,
        });
        if (error) throw error;
        return;
      }

      if (!supplier) throw new Error("Supplier tidak ditemukan.");

      if (type === "soft-delete") {
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
    setEditing(null);
    setForm(EMPTY_SUPPLIER_FORM);
    setFormOpen(true);
  };

  const openEdit = (supplier: SupplierRecord) => {
    setEditing(supplier);
    setForm({
      supplierName: supplier.supplier_name,
      phone: supplier.phone ?? "",
      address: supplier.address ?? "",
      link: supplier.link ?? "",
      contactPerson: supplier.contact_person ?? "",
      sourceType: supplier.source_type ?? "",
      sourceReferences: supplier.source_references ?? "",
      isActive: supplier.is_active,
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

  if (!isAdmin) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Akses ditolak</AlertTitle>
        <AlertDescription>
          Modul supplier hanya tersedia untuk Admin dan Super Admin. Kebijakan RLS tetap menjadi
          sumber otorisasi utama.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Supplier"
        description="Direktori supplier aktual, katalog item, dan nilai pembelian terkait."
        actions={
          <Button type="button" onClick={openCreate}>
            <Plus aria-hidden="true" className="mr-2 h-4 w-4" />
            Tambah Supplier
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Hasil filter" value={String(summary.suppliers)} />
        <SummaryCard label="Supplier aktif" value={String(summary.active)} />
        <SummaryCard label="Invoice tercatat" value={String(summary.invoices)} />
        <SummaryCard label="Nilai invoice" value={formatRupiah(summary.value)} />
      </div>

      <Card>
        <CardContent className="grid gap-3 p-4 md:grid-cols-[minmax(0,1fr)_14rem_auto] md:items-end">
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
                <SelectItem value="inactive">Nonaktif</SelectItem>
                <SelectItem value="deleted">Terhapus</SelectItem>
                <SelectItem value="all">Semua</SelectItem>
              </SelectContent>
            </Select>
          </FormField>
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
      />

      <SupplierDetailDialog
        supplier={detail}
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
  isSuperAdmin,
  onDetail,
  onEdit,
  onAction,
}: {
  suppliers: SupplierRecord[];
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
              <div className="grid grid-cols-2 gap-3 text-sm">
                <Metric label="Item" value={String(supplier.itemCount)} />
                <Metric label="Invoice" value={String(supplier.invoiceCount)} />
                <Metric
                  className="col-span-2"
                  label="Nilai pembelian"
                  value={formatRupiah(supplier.invoiceValue)}
                />
              </div>
              <SupplierActions
                supplier={supplier}
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
              <TableHead>Kontak</TableHead>
              <TableHead className="text-right">Item</TableHead>
              <TableHead className="text-right">Invoice</TableHead>
              <TableHead className="text-right">Nilai</TableHead>
              <TableHead>Status</TableHead>
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
                <TableCell>
                  <p>{supplier.contact_person || "—"}</p>
                  <p className="text-xs text-muted-foreground">
                    {supplier.phone || "Tanpa telepon"}
                  </p>
                </TableCell>
                <TableCell className="text-right tabular-nums">{supplier.itemCount}</TableCell>
                <TableCell className="text-right tabular-nums">{supplier.invoiceCount}</TableCell>
                <TableCell className="text-right font-medium tabular-nums">
                  {formatRupiah(supplier.invoiceValue)}
                </TableCell>
                <TableCell>
                  <SupplierStatusBadge supplier={supplier} />
                </TableCell>
                <TableCell>
                  <SupplierActions
                    supplier={supplier}
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
  isSuperAdmin,
  onDetail,
  onEdit,
  onAction,
}: {
  supplier: SupplierRecord;
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
        <IconAction
          label={`Pulihkan ${supplier.supplier_name}`}
          icon={RotateCcw}
          onClick={() => onAction("restore", supplier)}
        />
      ) : (
        <>
          <IconAction
            label={`Edit ${supplier.supplier_name}`}
            icon={Pencil}
            onClick={() => onEdit(supplier)}
          />
          <IconAction
            label={`Arsipkan ${supplier.supplier_name}`}
            icon={Archive}
            onClick={() => onAction("soft-delete", supplier)}
          />
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
}: {
  open: boolean;
  editing: SupplierRecord | null;
  form: SupplierFormValue;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onChange: (form: SupplierFormValue) => void;
  onSave: () => void;
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
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="supplier-name" label="Nama supplier">
            <Input
              id="supplier-name"
              value={form.supplierName}
              autoFocus
              onChange={(event) => update("supplierName", event.target.value)}
            />
          </FormField>
          <FormField id="supplier-contact" label="Nama kontak (opsional)">
            <Input
              id="supplier-contact"
              value={form.contactPerson}
              onChange={(event) => update("contactPerson", event.target.value)}
            />
          </FormField>
          <FormField id="supplier-phone" label="Telepon (opsional)">
            <Input
              id="supplier-phone"
              type="tel"
              value={form.phone}
              onChange={(event) => update("phone", event.target.value)}
            />
          </FormField>
          <FormField id="supplier-link" label="Tautan (opsional)">
            <Input
              id="supplier-link"
              type="url"
              value={form.link}
              onChange={(event) => update("link", event.target.value)}
            />
          </FormField>
          <FormField id="supplier-source-type" label="Jenis sumber">
            <Input
              id="supplier-source-type"
              value={form.sourceType}
              onChange={(event) => update("sourceType", event.target.value)}
            />
          </FormField>
          <FormField id="supplier-source-ref" label="Referensi sumber (opsional)">
            <Input
              id="supplier-source-ref"
              value={form.sourceReferences}
              onChange={(event) => update("sourceReferences", event.target.value)}
            />
          </FormField>
          <FormField id="supplier-address" label="Alamat (opsional)">
            <Textarea
              id="supplier-address"
              value={form.address}
              onChange={(event) => update("address", event.target.value)}
            />
          </FormField>
          <FormField id="supplier-active" label="Status">
            <Select
              value={form.isActive ? "active" : "inactive"}
              onValueChange={(value) => update("isActive", value === "active")}
            >
              <SelectTrigger id="supplier-active">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Aktif</SelectItem>
                <SelectItem value="inactive">Nonaktif</SelectItem>
              </SelectContent>
            </Select>
          </FormField>
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
  onClose,
  onEdit,
}: {
  supplier: SupplierRecord | null;
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
            {supplier?.supplier_key} · {supplier?.invoiceCount ?? 0} invoice ·{" "}
            {formatRupiah(supplier?.invoiceValue ?? 0)}
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
                        <TableHead>Klasifikasi</TableHead>
                        <TableHead className="text-right">Harga referensi</TableHead>
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
                          <TableCell>{financialClassLabel(item.financial_class)}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            {item.reference_price === null
                              ? "Belum tersedia"
                              : formatRupiah(item.reference_price)}
                          </TableCell>
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
          {supplier && !supplier.deleted_at ? (
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
  if (supplier.deleted_at) return <Badge variant="destructive">Terhapus</Badge>;
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
  if (status === "deleted") return Boolean(row.deleted_at);
  if (row.deleted_at) return false;
  return status === "active" ? row.is_active : !row.is_active;
}

function parseSupplierStatus(value: unknown): SupplierStatusFilter | undefined {
  return value === "active" || value === "inactive" || value === "deleted" || value === "all"
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
