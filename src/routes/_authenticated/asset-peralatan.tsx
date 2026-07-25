import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  Calculator,
  Eye,
  HardHat,
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
  DEFAULT_CAPITALIZATION_THRESHOLD,
  buildStraightLineSchedule,
  calculateMonthlyDepreciation,
  matchesAssetFilters,
  type AssetStatus,
  type CapitalizationStatus,
  type DepreciationScheduleRow,
} from "@/lib/actualAssets";
import {
  actualClient,
  getActualDataErrorMessage,
  manualSourceKey,
  normalizedName,
  parseIsoDate,
  toFiniteNumber,
  toNullableText,
} from "@/lib/actualData";
import { formatDate, formatMonthYear, formatNumber, formatRupiah } from "@/lib/format";

type DeletedFilter = "active" | "deleted" | "all";

interface AssetSearch {
  q?: string;
  from?: string;
  to?: string;
  category?: string;
  status?: AssetStatus | "all";
  capitalization?: CapitalizationStatus | "all";
  deleted?: DeletedFilter;
}

interface AssetCategoryRow {
  id: string;
  name: string;
  default_useful_life_months: number | null;
  description: string | null;
  is_active: boolean;
  deleted_at: string | null;
}

interface DepreciationEntryRow {
  id: string;
  period_month: string;
  depreciation_amount: number | string;
  accumulated_depreciation: number | string;
  ending_book_value: number | string;
  status: "draft" | "posted" | "reversed";
  posted_at: string | null;
  notes: string | null;
}

interface AssetDatabaseRow {
  id: string;
  import_batch_id: string | null;
  asset_source_key: string | null;
  asset_code: string;
  asset_name: string;
  asset_name_normalized: string;
  asset_category_id: string;
  acquisition_date: string;
  acquisition_cost: number | string;
  original_source_cost: string | null;
  capitalization_threshold: number | string;
  capitalization_status: CapitalizationStatus;
  useful_life_months: number;
  residual_value: number | string;
  depreciation_method: "straight_line";
  monthly_depreciation: number | string;
  depreciation_start_date: string | null;
  asset_status: AssetStatus;
  brand: string | null;
  size: string | null;
  supplier_name_raw: string | null;
  location: string | null;
  notes: string | null;
  source_file: string | null;
  source_sheet: string | null;
  source_row: number | null;
  adjustment_note: string | null;
  data_origin: "actual" | "adjusted" | "estimated";
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  asset_category: AssetCategoryRow | null;
  asset_depreciation_entries: DepreciationEntryRow[] | null;
}

interface AssetRecord extends AssetDatabaseRow {
  cost: number;
  threshold: number;
  residual: number;
  monthly: number;
  categoryName: string;
  postedDepreciation: number;
  currentBookValue: number;
}

interface AssetFormValue {
  categoryId: string;
  assetCode: string;
  assetName: string;
  acquisitionDate: string;
  acquisitionCost: number;
  originalSourceCost: string;
  capitalizationThreshold: number;
  capitalizationStatus: CapitalizationStatus;
  usefulLifeMonths: number;
  residualValue: number;
  depreciationStartDate: string;
  assetStatus: AssetStatus;
  brand: string;
  size: string;
  supplierNameRaw: string;
  location: string;
  notes: string;
  sourceFile: string;
  sourceSheet: string;
  sourceRow: number | "";
  adjustmentNote: string;
  dataOrigin: "actual" | "adjusted" | "estimated";
}

const EMPTY_ASSET_FORM: AssetFormValue = {
  categoryId: "",
  assetCode: "",
  assetName: "",
  acquisitionDate: "",
  acquisitionCost: 0,
  originalSourceCost: "",
  capitalizationThreshold: DEFAULT_CAPITALIZATION_THRESHOLD,
  capitalizationStatus: "tracking_only_expensed",
  usefulLifeMonths: 36,
  residualValue: 0,
  depreciationStartDate: "",
  assetStatus: "active",
  brand: "",
  size: "",
  supplierNameRaw: "",
  location: "",
  notes: "",
  sourceFile: "manual_web_entry",
  sourceSheet: "asset_peralatan",
  sourceRow: "",
  adjustmentNote: "",
  dataOrigin: "actual",
};

export const Route = createFileRoute("/_authenticated/asset-peralatan")({
  validateSearch: (search: Record<string, unknown>): AssetSearch => ({
    q: typeof search.q === "string" && search.q.trim() ? search.q : undefined,
    from: parseIsoDate(search.from),
    to: parseIsoDate(search.to),
    category:
      typeof search.category === "string" && search.category.trim() ? search.category : undefined,
    status: parseAssetStatusFilter(search.status),
    capitalization: parseCapitalizationFilter(search.capitalization),
    deleted: parseDeletedFilter(search.deleted),
  }),
  component: AssetPage,
});

function AssetPage() {
  const { isAdmin, isSuperAdmin, loading: authLoading, user } = useAuth();
  const queryClient = useQueryClient();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const filters = {
    query: search.q ?? "",
    from: search.from ?? "",
    to: search.to ?? "",
    categoryId: search.category ?? "all",
    status: search.status ?? "all",
    capitalization: search.capitalization ?? "all",
    deleted: search.deleted ?? "active",
  };
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<AssetRecord | null>(null);
  const [detail, setDetail] = useState<AssetRecord | null>(null);
  const [form, setForm] = useState<AssetFormValue>(EMPTY_ASSET_FORM);
  const [confirmAction, setConfirmAction] = useState<ConfirmActionState | null>(null);

  const categoriesQuery = useQuery({
    queryKey: ["actual-assets", "categories"],
    enabled: isAdmin,
    staleTime: 60_000,
    queryFn: async (): Promise<AssetCategoryRow[]> => {
      const { data, error } = await actualClient
        .from<AssetCategoryRow>("asset_categories")
        .select("id,name,default_useful_life_months,description,is_active,deleted_at")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const assetsQuery = useQuery({
    queryKey: [
      "actual-assets",
      "list",
      {
        q: filters.query.trim(),
        from: filters.from,
        to: filters.to,
        category: filters.categoryId,
        status: filters.status,
        capitalization: filters.capitalization,
        deleted: filters.deleted,
      },
    ],
    enabled: isAdmin,
    staleTime: 30_000,
    queryFn: async (): Promise<AssetRecord[]> => {
      const { data, error } = await actualClient
        .from<AssetDatabaseRow>("assets")
        .select(
          [
            "id,import_batch_id,asset_source_key,asset_code,asset_name,asset_name_normalized,",
            "asset_category_id,acquisition_date,acquisition_cost,original_source_cost,",
            "capitalization_threshold,capitalization_status,useful_life_months,residual_value,",
            "depreciation_method,monthly_depreciation,depreciation_start_date,asset_status,",
            "brand,size,supplier_name_raw,location,notes,source_file,source_sheet,source_row,",
            "adjustment_note,data_origin,created_at,updated_at,deleted_at,",
            "asset_category:asset_categories(id,name,default_useful_life_months,description,is_active,deleted_at),",
            "asset_depreciation_entries(id,period_month,depreciation_amount,",
            "accumulated_depreciation,ending_book_value,status,posted_at,notes)",
          ].join(""),
        )
        .order("acquisition_date", { ascending: false })
        .order("asset_code", { ascending: true });

      if (error) throw error;

      return (data ?? []).map(normalizeAsset).filter((asset) =>
        matchesAssetFilters(
          {
            assetName: asset.asset_name,
            assetCode: asset.asset_code,
            brand: asset.brand,
            categoryId: asset.asset_category_id,
            assetStatus: asset.asset_status,
            capitalizationStatus: asset.capitalization_status,
            acquisitionDate: asset.acquisition_date,
            deletedAt: asset.deleted_at,
          },
          filters,
        ),
      );
    },
  });

  const fullRegisterQuery = useQuery({
    queryKey: ["actual-assets", "full-register-summary"],
    enabled: isAdmin,
    staleTime: 60_000,
    queryFn: async (): Promise<{ active: number; trackingOnly: number; total: number }> => {
      const { data, error } = await actualClient
        .from<AssetDatabaseRow>("assets")
        .select("id,capitalization_status,acquisition_cost,deleted_at");
      if (error) throw error;
      const activeRows = (data ?? []).filter((asset) => !asset.deleted_at);
      return {
        active: activeRows.length,
        trackingOnly: activeRows.filter(
          (asset) => asset.capitalization_status === "tracking_only_expensed",
        ).length,
        total: activeRows.reduce(
          (total, asset) => total + toFiniteNumber(asset.acquisition_cost),
          0,
        ),
      };
    },
  });

  const juneDepreciationQuery = useQuery({
    queryKey: ["actual-assets", "depreciation", "2026-06-01", "posted"],
    enabled: isAdmin,
    staleTime: 60_000,
    queryFn: async (): Promise<number> => {
      const { data, error } = await actualClient
        .from<DepreciationEntryRow>("asset_depreciation_entries")
        .select("depreciation_amount")
        .eq("period_month", "2026-06-01")
        .eq("status", "posted");
      if (error) throw error;
      return (data ?? []).reduce(
        (total, entry) => total + toFiniteNumber(entry.depreciation_amount),
        0,
      );
    },
  });

  const mutation = useMutation({
    mutationFn: async ({
      type,
      asset,
    }: {
      type: "save" | "soft-delete" | "restore" | "hard-delete";
      asset?: AssetRecord;
    }) => {
      if (type === "save") {
        const validated = validateAssetForm(form);
        const payload: Record<string, unknown> = {
          asset_category_id: validated.categoryId,
          asset_code: validated.assetCode.trim().toLocaleUpperCase("id-ID"),
          asset_name: validated.assetName.trim().replace(/\s+/g, " "),
          asset_name_normalized: normalizedName(validated.assetName),
          acquisition_date: validated.acquisitionDate,
          acquisition_cost: validated.acquisitionCost,
          original_source_cost: toNullableText(validated.originalSourceCost),
          capitalization_threshold: validated.capitalizationThreshold,
          capitalization_status: validated.capitalizationStatus,
          useful_life_months: validated.usefulLifeMonths,
          residual_value: validated.residualValue,
          depreciation_method: "straight_line",
          depreciation_start_date:
            validated.capitalizationStatus === "capitalized"
              ? toNullableText(validated.depreciationStartDate)
              : null,
          asset_status: validated.assetStatus,
          brand: toNullableText(validated.brand),
          size: toNullableText(validated.size),
          supplier_name_raw: toNullableText(validated.supplierNameRaw),
          location: toNullableText(validated.location),
          notes: toNullableText(validated.notes),
          source_file: toNullableText(validated.sourceFile),
          source_sheet: toNullableText(validated.sourceSheet),
          source_row: validated.sourceRow === "" ? null : validated.sourceRow,
          adjustment_note: toNullableText(validated.adjustmentNote),
          data_origin: validated.dataOrigin,
          updated_by: user?.id ?? null,
        };

        if (editing) {
          const { error } = await actualClient.from("assets").update(payload).eq("id", editing.id);
          if (error) throw error;
          return;
        }

        const { error } = await actualClient.from("assets").insert({
          ...payload,
          asset_source_key: manualSourceKey("ASSET-MANUAL"),
          created_by: user?.id ?? null,
        });
        if (error) throw error;
        return;
      }

      if (!asset) throw new Error("Aset tidak ditemukan.");

      if (type === "soft-delete" || type === "restore") {
        const restoring = type === "restore";
        const { error } = await actualClient
          .from("assets")
          .update({
            deleted_at: restoring ? null : new Date().toISOString(),
            deleted_by: restoring ? null : (user?.id ?? null),
            updated_by: user?.id ?? null,
          })
          .eq("id", asset.id);
        if (error) throw error;
        return;
      }

      if (!isSuperAdmin) {
        throw new Error("Hanya Super Admin yang dapat menghapus permanen.");
      }

      const { error } = await actualClient.from("assets").delete().eq("id", asset.id);
      if (error) throw error;
    },
    onSuccess: async (_, variables) => {
      toast.success(
        variables.type === "save"
          ? editing
            ? "Aset berhasil diperbarui."
            : "Aset berhasil ditambahkan."
          : variables.type === "restore"
            ? "Aset berhasil dipulihkan."
            : variables.type === "soft-delete"
              ? "Aset dipindahkan ke data terhapus."
              : "Aset berhasil dihapus permanen.",
      );
      closeForm();
      setDetail(null);
      setConfirmAction(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["actual-assets"] }),
        queryClient.invalidateQueries({ queryKey: ["actual-finance"] }),
        queryClient.invalidateQueries({ queryKey: ["operational-dashboard"] }),
      ]);
    },
    onError: (error: unknown) => {
      toast.error("Aset gagal diproses.", {
        description: getActualDataErrorMessage(error),
      });
    },
  });

  const filteredSummary = useMemo(() => {
    const rows = assetsQuery.data ?? [];
    return {
      count: rows.length,
      cost: rows.reduce((total, asset) => total + asset.cost, 0),
      trackingOnly: rows.filter((asset) => asset.capitalization_status === "tracking_only_expensed")
        .length,
      capitalized: rows.filter((asset) => asset.capitalization_status === "capitalized").length,
    };
  }, [assetsQuery.data]);

  const updateFilters = (patch: Partial<AssetSearch>) => {
    void navigate({
      search: {
        q: "q" in patch ? patch.q : search.q,
        from: "from" in patch ? patch.from : search.from,
        to: "to" in patch ? patch.to : search.to,
        category: "category" in patch ? patch.category : search.category,
        status: "status" in patch ? patch.status : search.status,
        capitalization: "capitalization" in patch ? patch.capitalization : search.capitalization,
        deleted: "deleted" in patch ? patch.deleted : search.deleted,
      },
      replace: true,
    });
  };

  const openCreate = () => {
    const firstCategory = (categoriesQuery.data ?? []).find(
      (category) => category.is_active && !category.deleted_at,
    );
    setEditing(null);
    setForm({
      ...EMPTY_ASSET_FORM,
      categoryId: firstCategory?.id ?? "",
      usefulLifeMonths: firstCategory?.default_useful_life_months ?? 36,
    });
    setFormOpen(true);
  };

  const openEdit = (asset: AssetRecord) => {
    setEditing(asset);
    setForm({
      categoryId: asset.asset_category_id,
      assetCode: asset.asset_code,
      assetName: asset.asset_name,
      acquisitionDate: asset.acquisition_date,
      acquisitionCost: asset.cost,
      originalSourceCost: asset.original_source_cost ?? "",
      capitalizationThreshold: asset.threshold,
      capitalizationStatus: asset.capitalization_status,
      usefulLifeMonths: asset.useful_life_months,
      residualValue: asset.residual,
      depreciationStartDate: asset.depreciation_start_date ?? "",
      assetStatus: asset.asset_status,
      brand: asset.brand ?? "",
      size: asset.size ?? "",
      supplierNameRaw: asset.supplier_name_raw ?? "",
      location: asset.location ?? "",
      notes: asset.notes ?? "",
      sourceFile: asset.source_file ?? "",
      sourceSheet: asset.source_sheet ?? "",
      sourceRow: asset.source_row ?? "",
      adjustmentNote: asset.adjustment_note ?? "",
      dataOrigin: asset.data_origin,
    });
    setFormOpen(true);
  };

  const closeForm = () => {
    setFormOpen(false);
    setEditing(null);
    setForm(EMPTY_ASSET_FORM);
  };

  const askMutation = (type: "soft-delete" | "restore" | "hard-delete", asset: AssetRecord) => {
    setConfirmAction({
      title:
        type === "restore"
          ? "Pulihkan aset?"
          : type === "hard-delete"
            ? "Hapus aset permanen?"
            : "Arsipkan aset?",
      description:
        type === "restore"
          ? `${asset.asset_code} · ${asset.asset_name} akan kembali ke register aktif.`
          : type === "hard-delete"
            ? "Aset dan jadwal penyusutan terkait akan dihapus permanen. Tindakan ini hanya tersedia untuk Super Admin dan tidak dapat dibatalkan."
            : "Aset akan di-soft-delete sehingga audit trail tetap dipertahankan dan dapat dipulihkan.",
      confirmLabel:
        type === "restore" ? "Pulihkan" : type === "hard-delete" ? "Hapus Permanen" : "Arsipkan",
      destructive: type !== "restore",
      onConfirm: () => mutation.mutate({ type, asset }),
    });
  };

  if (authLoading) {
    return <ModuleInitialLoading label="Memeriksa akses register aset" />;
  }

  if (!isAdmin) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Akses ditolak</AlertTitle>
        <AlertDescription>
          Register aset hanya tersedia untuk Admin dan Super Admin. RLS database tetap menjadi
          sumber otorisasi utama.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Aset & Peralatan"
        description="Register lengkap aset aktual, status kapitalisasi, dan penyusutan garis lurus."
        actions={
          <Button type="button" onClick={openCreate}>
            <Plus aria-hidden="true" className="mr-2 h-4 w-4" />
            Tambah Aset
          </Button>
        }
      />

      <CapitalizationNotice
        fullRegister={fullRegisterQuery.data}
        loading={fullRegisterQuery.isPending}
        juneDepreciation={juneDepreciationQuery.data}
        depreciationLoading={juneDepreciationQuery.isPending}
        depreciationError={juneDepreciationQuery.isError}
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Aset hasil filter" value={formatNumber(filteredSummary.count)} />
        <SummaryCard label="Nilai perolehan" value={formatRupiah(filteredSummary.cost)} />
        <SummaryCard label="Tracking-only" value={formatNumber(filteredSummary.trackingOnly)} />
        <SummaryCard label="Dikapitalisasi" value={formatNumber(filteredSummary.capitalized)} />
      </div>

      <AssetFilters
        filters={filters}
        categories={categoriesQuery.data ?? []}
        backgroundFetching={assetsQuery.isFetching && !assetsQuery.isPending}
        onChange={updateFilters}
      />

      {assetsQuery.isPending ? (
        <ModuleInitialLoading label="Memuat register aset" />
      ) : assetsQuery.isError ? (
        <ModuleError
          title="Register aset gagal dimuat"
          error={assetsQuery.error}
          onRetry={() => void assetsQuery.refetch()}
        />
      ) : assetsQuery.data?.length ? (
        <AssetResults
          assets={assetsQuery.data}
          isSuperAdmin={isSuperAdmin}
          onDetail={setDetail}
          onEdit={openEdit}
          onAction={askMutation}
        />
      ) : (
        <EmptyState
          icon={HardHat}
          title="Aset tidak ditemukan"
          description="Ubah filter register. Sistem tidak menambahkan aset dummy."
        />
      )}

      <AssetFormDialog
        open={formOpen}
        editing={editing}
        form={form}
        categories={categoriesQuery.data ?? []}
        pending={mutation.isPending}
        onOpenChange={(open) => {
          if (!open && !mutation.isPending) closeForm();
        }}
        onChange={setForm}
        onSave={() => mutation.mutate({ type: "save" })}
      />

      <AssetDetailDialog
        asset={detail}
        onClose={() => setDetail(null)}
        onEdit={(asset) => {
          setDetail(null);
          openEdit(asset);
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

function CapitalizationNotice({
  fullRegister,
  loading,
  juneDepreciation,
  depreciationLoading,
  depreciationError,
}: {
  fullRegister?: { active: number; trackingOnly: number; total: number };
  loading: boolean;
  juneDepreciation?: number;
  depreciationLoading: boolean;
  depreciationError: boolean;
}) {
  return (
    <Alert>
      <Calculator aria-hidden="true" className="h-4 w-4" />
      <AlertTitle>Perlakuan aset aktual Juni 2026</AlertTitle>
      <AlertDescription>
        <p>
          Ambang kapitalisasi default adalah {formatRupiah(DEFAULT_CAPITALIZATION_THRESHOLD)}. Item
          di bawah ambang tetap tampil penuh sebagai tracking-only, tetapi biaya perolehannya sudah
          dibebankan sehingga tidak menghasilkan penyusutan.
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <NoticeMetric
            label="Register aktif lengkap"
            value={loading ? "Memuat…" : `${formatNumber(fullRegister?.active ?? 0)} aset`}
          />
          <NoticeMetric
            label="Tracking-only"
            value={
              loading
                ? "Memuat…"
                : `${formatNumber(fullRegister?.trackingOnly ?? 0)} dari ${formatNumber(
                    fullRegister?.active ?? 0,
                  )} aset`
            }
          />
          <NoticeMetric
            label="Penyusutan Juni 2026"
            value={
              depreciationLoading
                ? "Memuat…"
                : depreciationError
                  ? "Belum dapat dimuat"
                  : formatRupiah(juneDepreciation ?? 0)
            }
          />
        </div>
      </AlertDescription>
    </Alert>
  );
}

function AssetFilters({
  filters,
  categories,
  backgroundFetching,
  onChange,
}: {
  filters: {
    query: string;
    from: string;
    to: string;
    categoryId: string;
    status: AssetStatus | "all";
    capitalization: CapitalizationStatus | "all";
    deleted: DeletedFilter;
  };
  categories: AssetCategoryRow[];
  backgroundFetching: boolean;
  onChange: (patch: Partial<AssetSearch>) => void;
}) {
  return (
    <Card>
      <CardContent className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 xl:items-end">
        <FormField id="asset-search" label="Cari aset">
          <div className="relative">
            <Search
              aria-hidden="true"
              className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              id="asset-search"
              className="pl-9"
              value={filters.query}
              placeholder="Kode, nama, brand…"
              onChange={(event) => onChange({ q: event.target.value || undefined })}
            />
          </div>
        </FormField>
        <FormField id="asset-from" label="Diperoleh dari">
          <Input
            id="asset-from"
            type="date"
            value={filters.from}
            max={filters.to || undefined}
            onChange={(event) => onChange({ from: event.target.value || undefined })}
          />
        </FormField>
        <FormField id="asset-to" label="Diperoleh sampai">
          <Input
            id="asset-to"
            type="date"
            value={filters.to}
            min={filters.from || undefined}
            onChange={(event) => onChange({ to: event.target.value || undefined })}
          />
        </FormField>
        <FormField id="asset-category-filter" label="Kategori">
          <Select
            value={filters.categoryId}
            onValueChange={(value) => onChange({ category: value === "all" ? undefined : value })}
          >
            <SelectTrigger id="asset-category-filter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua kategori</SelectItem>
              {categories.map((category) => (
                <SelectItem key={category.id} value={category.id}>
                  {category.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
        <FormField id="asset-status-filter" label="Status aset">
          <Select
            value={filters.status}
            onValueChange={(value) => onChange({ status: parseAssetStatusFilter(value) })}
          >
            <SelectTrigger id="asset-status-filter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua status</SelectItem>
              <SelectItem value="active">Aktif</SelectItem>
              <SelectItem value="under_repair">Dalam perbaikan</SelectItem>
              <SelectItem value="fully_depreciated">Disusutkan penuh</SelectItem>
              <SelectItem value="disposed">Dilepas</SelectItem>
              <SelectItem value="lost">Hilang</SelectItem>
            </SelectContent>
          </Select>
        </FormField>
        <FormField id="asset-capitalization-filter" label="Kapitalisasi">
          <Select
            value={filters.capitalization}
            onValueChange={(value) =>
              onChange({ capitalization: parseCapitalizationFilter(value) })
            }
          >
            <SelectTrigger id="asset-capitalization-filter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua perlakuan</SelectItem>
              <SelectItem value="tracking_only_expensed">Tracking-only</SelectItem>
              <SelectItem value="capitalized">Dikapitalisasi</SelectItem>
            </SelectContent>
          </Select>
        </FormField>
        <div className="space-y-1.5">
          <FormField id="asset-deleted-filter" label="Data">
            <Select
              value={filters.deleted}
              onValueChange={(value) => onChange({ deleted: parseDeletedFilter(value) })}
            >
              <SelectTrigger id="asset-deleted-filter">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Aktif</SelectItem>
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

function AssetResults({
  assets,
  isSuperAdmin,
  onDetail,
  onEdit,
  onAction,
}: {
  assets: AssetRecord[];
  isSuperAdmin: boolean;
  onDetail: (asset: AssetRecord) => void;
  onEdit: (asset: AssetRecord) => void;
  onAction: (type: "soft-delete" | "restore" | "hard-delete", asset: AssetRecord) => void;
}) {
  return (
    <>
      <div className="grid gap-3 md:hidden">
        {assets.map((asset) => (
          <Card key={asset.id}>
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <CardTitle className="text-base">{asset.asset_name}</CardTitle>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {asset.asset_code} · {asset.categoryName}
                  </p>
                </div>
                <AssetStatusBadge asset={asset} />
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Metric label="Perolehan" value={formatRupiah(asset.cost)} />
                <Metric label="Tanggal" value={formatDate(asset.acquisition_date)} />
                <Metric
                  label="Perlakuan"
                  value={capitalizationLabel(asset.capitalization_status)}
                />
                <Metric label="Masa manfaat" value={`${asset.useful_life_months} bulan`} />
                <Metric label="Penyusutan / bulan" value={formatRupiah(asset.monthly)} />
                <Metric
                  label="Akumulasi penyusutan"
                  value={formatRupiah(asset.postedDepreciation)}
                />
                <Metric label="Nilai buku" value={formatRupiah(asset.currentBookValue)} />
              </div>
              <AssetActions
                asset={asset}
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
              <TableHead>Kode / Aset</TableHead>
              <TableHead>Kategori</TableHead>
              <TableHead>Tanggal Perolehan</TableHead>
              <TableHead className="text-right">Nilai Perolehan</TableHead>
              <TableHead>Perlakuan</TableHead>
              <TableHead className="text-right">Masa Manfaat</TableHead>
              <TableHead className="text-right">Penyusutan / Bulan</TableHead>
              <TableHead className="text-right">Akumulasi Penyusutan</TableHead>
              <TableHead className="text-right">Nilai Buku</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {assets.map((asset) => (
              <TableRow key={asset.id}>
                <TableCell>
                  <p className="font-medium">{asset.asset_name}</p>
                  <p className="text-xs text-muted-foreground">{asset.asset_code}</p>
                </TableCell>
                <TableCell>{asset.categoryName}</TableCell>
                <TableCell>{formatDate(asset.acquisition_date)}</TableCell>
                <TableCell className="text-right font-medium tabular-nums">
                  {formatRupiah(asset.cost)}
                </TableCell>
                <TableCell>
                  <CapitalizationBadge status={asset.capitalization_status} />
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {asset.useful_life_months} bulan
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatRupiah(asset.monthly)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatRupiah(asset.postedDepreciation)}
                </TableCell>
                <TableCell className="text-right font-medium tabular-nums">
                  {formatRupiah(asset.currentBookValue)}
                </TableCell>
                <TableCell>
                  <AssetStatusBadge asset={asset} />
                </TableCell>
                <TableCell>
                  <AssetActions
                    asset={asset}
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

function AssetActions({
  asset,
  isSuperAdmin,
  onDetail,
  onEdit,
  onAction,
}: {
  asset: AssetRecord;
  isSuperAdmin: boolean;
  onDetail: (asset: AssetRecord) => void;
  onEdit: (asset: AssetRecord) => void;
  onAction: (type: "soft-delete" | "restore" | "hard-delete", asset: AssetRecord) => void;
}) {
  return (
    <div className="flex justify-end gap-1">
      <IconAction
        label={`Lihat detail ${asset.asset_name}`}
        icon={Eye}
        onClick={() => onDetail(asset)}
      />
      {asset.deleted_at ? (
        <IconAction
          label={`Pulihkan ${asset.asset_name}`}
          icon={RotateCcw}
          onClick={() => onAction("restore", asset)}
        />
      ) : (
        <>
          <IconAction
            label={`Edit ${asset.asset_name}`}
            icon={Pencil}
            onClick={() => onEdit(asset)}
          />
          <IconAction
            label={`Arsipkan ${asset.asset_name}`}
            icon={Archive}
            onClick={() => onAction("soft-delete", asset)}
          />
        </>
      )}
      {isSuperAdmin ? (
        <IconAction
          label={`Hapus permanen ${asset.asset_name}`}
          icon={Trash2}
          variant="destructive"
          onClick={() => onAction("hard-delete", asset)}
        />
      ) : null}
    </div>
  );
}

function AssetFormDialog({
  open,
  editing,
  form,
  categories,
  pending,
  onOpenChange,
  onChange,
  onSave,
}: {
  open: boolean;
  editing: AssetRecord | null;
  form: AssetFormValue;
  categories: AssetCategoryRow[];
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onChange: (form: AssetFormValue) => void;
  onSave: () => void;
}) {
  const update = <Key extends keyof AssetFormValue>(key: Key, value: AssetFormValue[Key]) =>
    onChange({ ...form, [key]: value });
  const monthly = calculateMonthlyDepreciation({
    acquisitionDate: form.acquisitionDate,
    acquisitionCost: form.acquisitionCost,
    residualValue: form.residualValue,
    usefulLifeMonths: form.usefulLifeMonths,
    capitalizationStatus: form.capitalizationStatus,
    depreciationStartDate: form.depreciationStartDate,
  });

  const updateCost = (cost: number) => {
    const shouldTrackOnly = cost < form.capitalizationThreshold;
    onChange({
      ...form,
      acquisitionCost: cost,
      capitalizationStatus: shouldTrackOnly ? "tracking_only_expensed" : form.capitalizationStatus,
      depreciationStartDate: shouldTrackOnly ? "" : form.depreciationStartDate,
    });
  };

  const updateThreshold = (threshold: number) => {
    const shouldTrackOnly = form.acquisitionCost < threshold;
    onChange({
      ...form,
      capitalizationThreshold: threshold,
      capitalizationStatus: shouldTrackOnly ? "tracking_only_expensed" : form.capitalizationStatus,
      depreciationStartDate: shouldTrackOnly ? "" : form.depreciationStartDate,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit Aset & Peralatan" : "Tambah Aset & Peralatan"}</DialogTitle>
          <DialogDescription>
            Seluruh field register tersedia. Penyusutan dihitung database dengan metode garis lurus.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <FormField id="asset-code-form" label="Kode aset">
            <Input
              id="asset-code-form"
              value={form.assetCode}
              onChange={(event) => update("assetCode", event.target.value)}
            />
          </FormField>
          <FormField id="asset-name-form" label="Nama aset">
            <Input
              id="asset-name-form"
              value={form.assetName}
              onChange={(event) => update("assetName", event.target.value)}
            />
          </FormField>
          <FormField id="asset-category-form" label="Kategori">
            <Select
              value={form.categoryId}
              onValueChange={(value) => {
                const category = categories.find((item) => item.id === value);
                onChange({
                  ...form,
                  categoryId: value,
                  usefulLifeMonths: category?.default_useful_life_months ?? form.usefulLifeMonths,
                });
              }}
            >
              <SelectTrigger id="asset-category-form">
                <SelectValue placeholder="Pilih kategori" />
              </SelectTrigger>
              <SelectContent>
                {categories
                  .filter((category) => category.is_active && !category.deleted_at)
                  .map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </FormField>
          <FormField id="asset-acquisition-date" label="Tanggal perolehan">
            <Input
              id="asset-acquisition-date"
              type="date"
              value={form.acquisitionDate}
              onChange={(event) => update("acquisitionDate", event.target.value)}
            />
          </FormField>
          <FormField id="asset-acquisition-cost" label="Nilai perolehan">
            <Input
              id="asset-acquisition-cost"
              type="number"
              min="0"
              step="0.01"
              value={form.acquisitionCost}
              onChange={(event) => updateCost(Number(event.target.value))}
            />
          </FormField>
          <FormField
            id="asset-original-cost"
            label="Nilai sumber asli (opsional)"
            hint="Teks asli dipertahankan untuk lineage, termasuk satuan atau format sumber."
          >
            <Input
              id="asset-original-cost"
              value={form.originalSourceCost}
              onChange={(event) => update("originalSourceCost", event.target.value)}
            />
          </FormField>
          <FormField id="asset-threshold" label="Ambang kapitalisasi">
            <Input
              id="asset-threshold"
              type="number"
              min="0"
              step="0.01"
              value={form.capitalizationThreshold}
              onChange={(event) => updateThreshold(Number(event.target.value))}
            />
          </FormField>
          <FormField
            id="asset-capitalization-form"
            label="Perlakuan kapitalisasi"
            hint={
              form.acquisitionCost < form.capitalizationThreshold
                ? "Nilai di bawah ambang wajib tracking-only."
                : undefined
            }
          >
            <Select
              value={form.capitalizationStatus}
              onValueChange={(value) => update("capitalizationStatus", parseCapitalization(value))}
            >
              <SelectTrigger id="asset-capitalization-form">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="tracking_only_expensed">
                  Tracking-only, sudah dibebankan
                </SelectItem>
                <SelectItem
                  value="capitalized"
                  disabled={form.acquisitionCost < form.capitalizationThreshold}
                >
                  Dikapitalisasi
                </SelectItem>
              </SelectContent>
            </Select>
          </FormField>
          <FormField id="asset-useful-life" label="Masa manfaat (bulan)">
            <Input
              id="asset-useful-life"
              type="number"
              min="1"
              step="1"
              value={form.usefulLifeMonths}
              onChange={(event) => update("usefulLifeMonths", Number(event.target.value))}
            />
          </FormField>
          <FormField id="asset-residual" label="Nilai residu">
            <Input
              id="asset-residual"
              type="number"
              min="0"
              max={form.acquisitionCost}
              step="0.01"
              value={form.residualValue}
              onChange={(event) => update("residualValue", Number(event.target.value))}
            />
          </FormField>
          <FormField
            id="asset-depreciation-start"
            label="Mulai penyusutan"
            hint={
              form.capitalizationStatus === "tracking_only_expensed"
                ? "Tidak berlaku untuk tracking-only."
                : "Jadwal dimulai pada awal bulan tanggal ini."
            }
          >
            <Input
              id="asset-depreciation-start"
              type="date"
              disabled={form.capitalizationStatus === "tracking_only_expensed"}
              value={form.depreciationStartDate}
              onChange={(event) => update("depreciationStartDate", event.target.value)}
            />
          </FormField>
          <FormField id="asset-status-form" label="Status aset">
            <Select
              value={form.assetStatus}
              onValueChange={(value) => update("assetStatus", parseAssetStatus(value))}
            >
              <SelectTrigger id="asset-status-form">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Aktif</SelectItem>
                <SelectItem value="under_repair">Dalam perbaikan</SelectItem>
                <SelectItem value="fully_depreciated">Disusutkan penuh</SelectItem>
                <SelectItem value="disposed">Dilepas</SelectItem>
                <SelectItem value="lost">Hilang</SelectItem>
              </SelectContent>
            </Select>
          </FormField>
          <FormField id="asset-brand" label="Brand (opsional)">
            <Input
              id="asset-brand"
              value={form.brand}
              onChange={(event) => update("brand", event.target.value)}
            />
          </FormField>
          <FormField id="asset-size" label="Ukuran (opsional)">
            <Input
              id="asset-size"
              value={form.size}
              onChange={(event) => update("size", event.target.value)}
            />
          </FormField>
          <FormField id="asset-supplier-raw" label="Supplier sumber (opsional)">
            <Input
              id="asset-supplier-raw"
              value={form.supplierNameRaw}
              onChange={(event) => update("supplierNameRaw", event.target.value)}
            />
          </FormField>
          <FormField id="asset-location" label="Lokasi (opsional)">
            <Input
              id="asset-location"
              value={form.location}
              onChange={(event) => update("location", event.target.value)}
            />
          </FormField>
          <FormField id="asset-data-origin" label="Asal data">
            <Select
              value={form.dataOrigin}
              onValueChange={(value) =>
                update(
                  "dataOrigin",
                  value === "adjusted" || value === "estimated" ? value : "actual",
                )
              }
            >
              <SelectTrigger id="asset-data-origin">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="actual">Actual</SelectItem>
                <SelectItem value="adjusted">Adjusted</SelectItem>
                <SelectItem value="estimated">Estimated</SelectItem>
              </SelectContent>
            </Select>
          </FormField>
          <FormField id="asset-source-file" label="File sumber (opsional)">
            <Input
              id="asset-source-file"
              value={form.sourceFile}
              onChange={(event) => update("sourceFile", event.target.value)}
            />
          </FormField>
          <FormField id="asset-source-sheet" label="Sheet sumber (opsional)">
            <Input
              id="asset-source-sheet"
              value={form.sourceSheet}
              onChange={(event) => update("sourceSheet", event.target.value)}
            />
          </FormField>
          <FormField id="asset-source-row" label="Baris sumber (opsional)">
            <Input
              id="asset-source-row"
              type="number"
              min="1"
              step="1"
              value={form.sourceRow}
              onChange={(event) =>
                update("sourceRow", event.target.value ? Number(event.target.value) : "")
              }
            />
          </FormField>
          <FormField id="asset-adjustment" label="Catatan penyesuaian (opsional)">
            <Textarea
              id="asset-adjustment"
              value={form.adjustmentNote}
              onChange={(event) => update("adjustmentNote", event.target.value)}
            />
          </FormField>
          <FormField id="asset-notes" label="Catatan aset (opsional)">
            <Textarea
              id="asset-notes"
              value={form.notes}
              onChange={(event) => update("notes", event.target.value)}
            />
          </FormField>
        </div>

        <Card>
          <CardContent className="grid gap-3 p-4 sm:grid-cols-3">
            <Metric label="Metode" value="Garis lurus" />
            <Metric label="Penyusutan per bulan" value={formatRupiah(monthly)} />
            <Metric
              label="Jadwal"
              value={
                form.capitalizationStatus === "capitalized"
                  ? `${formatNumber(form.usefulLifeMonths)} bulan`
                  : "Tidak dibuat (tracking-only)"
              }
            />
          </CardContent>
        </Card>

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
            Simpan Aset
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AssetDetailDialog({
  asset,
  onClose,
  onEdit,
}: {
  asset: AssetRecord | null;
  onClose: () => void;
  onEdit: (asset: AssetRecord) => void;
}) {
  const schedule = asset
    ? buildStraightLineSchedule({
        acquisitionDate: asset.acquisition_date,
        acquisitionCost: asset.cost,
        residualValue: asset.residual,
        usefulLifeMonths: asset.useful_life_months,
        capitalizationStatus: asset.capitalization_status,
        depreciationStartDate: asset.depreciation_start_date,
      })
    : [];

  return (
    <Dialog
      open={Boolean(asset)}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>{asset?.asset_name}</DialogTitle>
          <DialogDescription>
            {asset?.asset_code} · {asset?.categoryName}
          </DialogDescription>
        </DialogHeader>
        {asset ? (
          <div className="space-y-5">
            <div className="grid gap-3 rounded-lg border p-4 sm:grid-cols-2 lg:grid-cols-4">
              <Metric label="Tanggal perolehan" value={formatDate(asset.acquisition_date)} />
              <Metric label="Nilai perolehan" value={formatRupiah(asset.cost)} />
              <Metric
                label="Nilai sumber asli"
                value={asset.original_source_cost || "Belum tersedia"}
              />
              <Metric label="Ambang kapitalisasi" value={formatRupiah(asset.threshold)} />
              <Metric label="Perlakuan" value={capitalizationLabel(asset.capitalization_status)} />
              <Metric
                label="Masa manfaat"
                value={`${formatNumber(asset.useful_life_months)} bulan`}
              />
              <Metric label="Nilai residu" value={formatRupiah(asset.residual)} />
              <Metric label="Penyusutan bulanan" value={formatRupiah(asset.monthly)} />
              <Metric
                label="Mulai penyusutan"
                value={
                  asset.depreciation_start_date
                    ? formatDate(asset.depreciation_start_date)
                    : "Tidak berlaku"
                }
              />
              <Metric label="Status aset" value={assetStatusLabel(asset.asset_status)} />
              <Metric label="Brand" value={asset.brand || "Belum tersedia"} />
              <Metric label="Ukuran" value={asset.size || "Belum tersedia"} />
              <Metric label="Supplier sumber" value={asset.supplier_name_raw || "Belum tersedia"} />
              <Metric label="Lokasi" value={asset.location || "Belum tersedia"} />
              <Metric label="Asal data" value={asset.data_origin} />
              <Metric label="Nilai buku saat ini" value={formatRupiah(asset.currentBookValue)} />
              <Metric label="File sumber" value={asset.source_file || "Belum tersedia"} />
              <Metric label="Sheet sumber" value={asset.source_sheet || "Belum tersedia"} />
              <Metric
                label="Baris sumber"
                value={asset.source_row ? formatNumber(asset.source_row) : "Belum tersedia"}
              />
              <Metric label="Kunci sumber" value={asset.asset_source_key || "Belum tersedia"} />
              <Metric label="Catatan aset" value={asset.notes || "Belum tersedia"} />
              <Metric
                label="Catatan penyesuaian"
                value={asset.adjustment_note || "Belum tersedia"}
              />
              <Metric label="Dibuat" value={formatDate(asset.created_at)} />
              <Metric label="Diperbarui" value={formatDate(asset.updated_at)} />
            </div>

            {asset.capitalization_status === "tracking_only_expensed" ? (
              <Alert>
                <AlertTitle>Tracking-only — tanpa jadwal penyusutan</AlertTitle>
                <AlertDescription>
                  Nilai {formatRupiah(asset.cost)} berada di bawah ambang{" "}
                  {formatRupiah(asset.threshold)}. Aset tetap tampil di register, tetapi nilai
                  penyusutan bulanannya {formatRupiah(0)} karena biaya telah dibebankan.
                </AlertDescription>
              </Alert>
            ) : (
              <DepreciationScheduleTable schedule={schedule} />
            )}

            {(asset.asset_depreciation_entries ?? []).length ? (
              <section aria-labelledby="posted-depreciation-heading" className="space-y-2">
                <h3 id="posted-depreciation-heading" className="font-semibold">
                  Entri penyusutan database
                </h3>
                <div className="overflow-auto rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Periode</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Penyusutan</TableHead>
                        <TableHead className="text-right">Akumulasi</TableHead>
                        <TableHead className="text-right">Nilai buku</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(asset.asset_depreciation_entries ?? []).map((entry) => (
                        <TableRow key={entry.id}>
                          <TableCell>{formatMonthYear(entry.period_month)}</TableCell>
                          <TableCell>{entry.status}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatRupiah(entry.depreciation_amount)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatRupiah(entry.accumulated_depreciation)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatRupiah(entry.ending_book_value)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </section>
            ) : null}
          </div>
        ) : null}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Tutup
          </Button>
          {asset && !asset.deleted_at ? (
            <Button type="button" onClick={() => onEdit(asset)}>
              <Pencil aria-hidden="true" className="mr-2 h-4 w-4" />
              Edit Aset
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DepreciationScheduleTable({ schedule }: { schedule: DepreciationScheduleRow[] }) {
  return (
    <section aria-labelledby="depreciation-schedule-heading" className="space-y-2">
      <div>
        <h3 id="depreciation-schedule-heading" className="font-semibold">
          Kalkulator jadwal garis lurus
        </h3>
        <p className="text-xs text-muted-foreground">
          Jadwal proyeksi ini tidak memposting jurnal. Entri actual tetap berasal dari tabel
          asset_depreciation_entries.
        </p>
      </div>
      <div className="max-h-96 overflow-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Periode</TableHead>
              <TableHead className="text-right">Penyusutan</TableHead>
              <TableHead className="text-right">Akumulasi</TableHead>
              <TableHead className="text-right">Nilai buku akhir</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {schedule.map((row) => (
              <TableRow key={row.periodMonth}>
                <TableCell>{formatMonthYear(row.periodMonth)}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatRupiah(row.depreciationAmount)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatRupiah(row.accumulatedDepreciation)}
                </TableCell>
                <TableCell className="text-right font-medium tabular-nums">
                  {formatRupiah(row.endingBookValue)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}

function normalizeAsset(row: AssetDatabaseRow): AssetRecord {
  const cost = toFiniteNumber(row.acquisition_cost);
  const residual = toFiniteNumber(row.residual_value);
  const postedDepreciation = (row.asset_depreciation_entries ?? [])
    .filter((entry) => entry.status === "posted")
    .reduce((total, entry) => total + toFiniteNumber(entry.depreciation_amount), 0);

  return {
    ...row,
    cost,
    threshold: toFiniteNumber(row.capitalization_threshold),
    residual,
    monthly: toFiniteNumber(row.monthly_depreciation),
    categoryName: row.asset_category?.name || "Kategori tidak tersedia",
    postedDepreciation,
    currentBookValue: Math.max(cost - postedDepreciation, residual),
  };
}

function validateAssetForm(form: AssetFormValue): AssetFormValue {
  if (!form.categoryId) throw new Error("Pilih kategori aset.");
  if (form.assetCode.trim().length < 2) throw new Error("Kode aset minimal 2 karakter.");
  if (form.assetName.trim().length < 2) throw new Error("Nama aset minimal 2 karakter.");
  if (!parseIsoDate(form.acquisitionDate)) throw new Error("Tanggal perolehan tidak valid.");
  if (!Number.isFinite(form.acquisitionCost) || form.acquisitionCost < 0) {
    throw new Error("Nilai perolehan tidak valid.");
  }
  if (!Number.isFinite(form.capitalizationThreshold) || form.capitalizationThreshold < 0) {
    throw new Error("Ambang kapitalisasi tidak valid.");
  }
  if (!Number.isInteger(form.usefulLifeMonths) || form.usefulLifeMonths <= 0) {
    throw new Error("Masa manfaat harus berupa jumlah bulan lebih dari nol.");
  }
  if (
    !Number.isFinite(form.residualValue) ||
    form.residualValue < 0 ||
    form.residualValue > form.acquisitionCost
  ) {
    throw new Error("Nilai residu harus berada di antara nol dan nilai perolehan.");
  }
  if (
    form.capitalizationStatus === "capitalized" &&
    form.acquisitionCost < form.capitalizationThreshold
  ) {
    throw new Error("Aset di bawah ambang tidak dapat dikapitalisasi.");
  }
  if (form.capitalizationStatus === "capitalized" && !parseIsoDate(form.depreciationStartDate)) {
    throw new Error("Tanggal mulai penyusutan wajib untuk aset yang dikapitalisasi.");
  }
  if (form.sourceRow !== "" && (!Number.isInteger(form.sourceRow) || form.sourceRow <= 0)) {
    throw new Error("Baris sumber harus berupa bilangan bulat positif.");
  }

  return form;
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

function NoticeMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-background/70 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-semibold">{value}</p>
    </div>
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

function AssetStatusBadge({ asset }: { asset: AssetRecord }) {
  if (asset.deleted_at) return <Badge variant="destructive">Terhapus</Badge>;
  return <Badge variant="outline">{assetStatusLabel(asset.asset_status)}</Badge>;
}

function CapitalizationBadge({ status }: { status: CapitalizationStatus }) {
  return status === "capitalized" ? (
    <Badge variant="secondary">Dikapitalisasi</Badge>
  ) : (
    <Badge variant="outline">Tracking-only</Badge>
  );
}

function capitalizationLabel(status: CapitalizationStatus): string {
  return status === "capitalized" ? "Dikapitalisasi" : "Tracking-only, sudah dibebankan";
}

function assetStatusLabel(status: AssetStatus): string {
  if (status === "active") return "Aktif";
  if (status === "under_repair") return "Dalam perbaikan";
  if (status === "fully_depreciated") return "Disusutkan penuh";
  if (status === "disposed") return "Dilepas";
  return "Hilang";
}

function parseAssetStatus(value: unknown): AssetStatus {
  const parsed = parseAssetStatusFilter(value);
  return parsed && parsed !== "all" ? parsed : "active";
}

function parseAssetStatusFilter(value: unknown): AssetStatus | "all" | undefined {
  return value === "all" ||
    value === "active" ||
    value === "under_repair" ||
    value === "fully_depreciated" ||
    value === "disposed" ||
    value === "lost"
    ? value
    : undefined;
}

function parseCapitalization(value: unknown): CapitalizationStatus {
  return value === "capitalized" ? "capitalized" : "tracking_only_expensed";
}

function parseCapitalizationFilter(value: unknown): CapitalizationStatus | "all" | undefined {
  return value === "all" || value === "capitalized" || value === "tracking_only_expensed"
    ? value
    : undefined;
}

function parseDeletedFilter(value: unknown): DeletedFilter | undefined {
  return value === "active" || value === "deleted" || value === "all" ? value : undefined;
}
