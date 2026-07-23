import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import {
  AlertCircle,
  Loader2,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  X,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import type {
  Tables,
  TablesInsert,
  TablesUpdate,
} from "@/integrations/supabase/types";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { CurrencyInput } from "@/components/CurrencyInput";
import {
  formatDate,
  formatDateTime,
  formatRupiah,
  toDateInput,
} from "@/lib/format";

import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

const PAGE_SIZE = 10;
const HARD_DELETE_CONFIRMATION = "HAPUS";
const MAX_QUANTITY = 999_999_999.99;
const MAX_UNIT_PRICE = 999_999_999_999.99;

const transactionSchema = z.object({
  transaction_date: z.string().min(1, "Tanggal wajib diisi."),
  item_id: z.string().uuid("Produk atau item wajib dipilih."),
  quantity: z
    .number({
      message: "Jumlah wajib diisi.",
    })
    .finite("Jumlah tidak valid.")
    .positive("Jumlah harus lebih dari 0.")
    .max(MAX_QUANTITY, "Jumlah terlalu besar."),
  unit_price: z
    .number({
      message: "Harga satuan wajib diisi.",
    })
    .finite("Harga satuan tidak valid.")
    .positive("Harga satuan harus lebih dari 0.")
    .max(MAX_UNIT_PRICE, "Harga satuan terlalu besar."),
  notes: z
    .string()
    .trim()
    .max(500, "Catatan maksimal 500 karakter.")
    .optional(),
});

type TransactionFormValues = z.infer<typeof transactionSchema>;

export type EntityKind = "sales" | "expenses";

interface TransactionManagerProps {
  kind: EntityKind;
}

type SalesRow = Tables<"sales">;
type ExpenseRow = Tables<"expenses">;
type ProductRow = Tables<"products">;
type ExpenseItemRow = Tables<"expense_items">;
type SalesCategoryRow = Tables<"sales_categories">;
type ExpenseCategoryRow = Tables<"expense_categories">;

interface TransactionCategory {
  id: string;
  name: string;
  is_active: boolean;
}

interface TransactionItem {
  id: string;
  category_id: string;
  name: string;
  code: string | null;
  unit: string;
  default_price: number;
  is_active: boolean;
  deleted_at: string | null;
}

interface TransactionRow {
  id: string;
  transaction_date: string;
  category_id: string;
  item_id: string;
  quantity: number;
  unit_price: number;
  amount: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
  deleted_at: string | null;
  deleted_by: string | null;
}

interface TransactionListResult {
  rows: TransactionRow[];
  count: number;
}

interface SaveTransactionVariables {
  values: TransactionFormValues;
  transactionId: string | null;
}

interface RowActionVariables {
  transactionId: string;
}

interface DatabaseError {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
}

export function TransactionManager({
  kind,
}: TransactionManagerProps) {
  const isSales = kind === "sales";
  const label = isSales ? "Penjualan" : "Pengeluaran";
  const labelLower = label.toLocaleLowerCase("id-ID");
  const itemLabel = isSales ? "Produk" : "Item Pengeluaran";
  const itemLabelLower = itemLabel.toLocaleLowerCase("id-ID");

  const {
    user,
    isAdmin,
    isSuperAdmin,
    loading: authLoading,
  } = useAuth();

  const queryClient = useQueryClient();

  const [tab, setTab] = useState<"active" | "deleted">("active");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] =
    useState<TransactionRow | null>(null);

  const [deleteTransactionId, setDeleteTransactionId] =
    useState<string | null>(null);

  const [hardDeleteTransactionId, setHardDeleteTransactionId] =
    useState<string | null>(null);

  const [hardConfirmText, setHardConfirmText] = useState("");

  const hasManagementAccess = isAdmin || isSuperAdmin;
  const normalizedSearch = search.trim();

  const invalidDateRange =
    Boolean(dateFrom) && Boolean(dateTo) && dateFrom > dateTo;

  const form = useForm<TransactionFormValues>({
    resolver: zodResolver(transactionSchema),
    defaultValues: createDefaultFormValues(),
  });

  const categoriesQuery = useQuery({
    queryKey: [
      isSales ? "sales_categories" : "expense_categories",
      "transaction-options",
    ],
    enabled: !authLoading && hasManagementAccess,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<TransactionCategory[]> => {
      if (isSales) {
        const { data, error } = await supabase
          .from("sales_categories")
          .select("id, name, is_active")
          .order("name", { ascending: true });

        if (error) throw error;

        return (data ?? []).map(normalizeSalesCategory);
      }

      const { data, error } = await supabase
        .from("expense_categories")
        .select("id, name, is_active")
        .order("name", { ascending: true });

      if (error) throw error;

      return (data ?? []).map(normalizeExpenseCategory);
    },
  });

  const itemsQuery = useQuery({
    queryKey: [
      isSales ? "products" : "expense_items",
      "transaction-options",
    ],
    enabled: !authLoading && hasManagementAccess,
    staleTime: 60_000,
    queryFn: async (): Promise<TransactionItem[]> => {
      if (isSales) {
        const { data, error } = await supabase
          .from("products")
          .select(
            "id, sales_category_id, name, sku, unit, selling_price, is_active, deleted_at",
          )
          .order("name", { ascending: true });

        if (error) throw error;

        return (data ?? []).map(normalizeProduct);
      }

      const { data, error } = await supabase
        .from("expense_items")
        .select(
          "id, expense_category_id, name, sku, unit, default_price, is_active, deleted_at",
        )
        .order("name", { ascending: true });

      if (error) throw error;

      return (data ?? []).map(normalizeExpenseItem);
    },
  });

  const categories = categoriesQuery.data ?? [];
  const items = itemsQuery.data ?? [];

  const categoryMap = useMemo(
    () =>
      new Map(
        categories.map((category) => [category.id, category.name]),
      ),
    [categories],
  );

  const itemMap = useMemo(
    () => new Map(items.map((item) => [item.id, item])),
    [items],
  );

  const activeItems = useMemo(
    () =>
      items.filter(
        (item) => item.is_active && item.deleted_at === null,
      ),
    [items],
  );

  const selectableItems = useMemo(() => {
    if (!editingTransaction) return activeItems;

    const currentItem = itemMap.get(editingTransaction.item_id);

    if (currentItem) {
      return [
        currentItem,
        ...activeItems.filter((item) => item.id !== currentItem.id),
      ];
    }

    return [
      createFallbackItem(editingTransaction),
      ...activeItems,
    ];
  }, [activeItems, editingTransaction, itemMap]);

  const matchingCategoryIds = useMemo(() => {
    if (!normalizedSearch) return [];

    const term = normalizedSearch.toLocaleLowerCase("id-ID");

    return categories
      .filter((category) =>
        category.name.toLocaleLowerCase("id-ID").includes(term),
      )
      .map((category) => category.id);
  }, [categories, normalizedSearch]);

  const matchingItemIds = useMemo(() => {
    if (!normalizedSearch) return [];

    const term = normalizedSearch.toLocaleLowerCase("id-ID");

    return items
      .filter((item) => {
        const searchable = [
          item.name,
          item.code ?? "",
          item.unit,
        ]
          .join(" ")
          .toLocaleLowerCase("id-ID");

        return searchable.includes(term);
      })
      .map((item) => item.id);
  }, [items, normalizedSearch]);

  const listQuery = useQuery({
    queryKey: [
      isSales ? "sales" : "expenses",
      "list",
      {
        tab,
        normalizedSearch,
        categoryFilter,
        dateFrom,
        dateTo,
        page,
        matchingCategoryIds,
        matchingItemIds,
      },
    ],
    enabled:
      !authLoading &&
      hasManagementAccess &&
      !invalidDateRange &&
      !categoriesQuery.isLoading &&
      !itemsQuery.isLoading &&
      !categoriesQuery.isError &&
      !itemsQuery.isError,
    queryFn: async (): Promise<TransactionListResult> => {
      const params: FetchTransactionParams = {
        tab,
        categoryFilter,
        dateFrom,
        dateTo,
        page,
        normalizedSearch,
        matchingCategoryIds,
        matchingItemIds,
      };

      return isSales
        ? fetchSales(params)
        : fetchExpenses(params);
    },
  });

  const selectedItemId = form.watch("item_id");
  const selectedQuantity = form.watch("quantity");
  const selectedUnitPrice = form.watch("unit_price");

  const selectedItem = useMemo(
    () =>
      selectableItems.find((item) => item.id === selectedItemId) ??
      null,
    [selectableItems, selectedItemId],
  );

  const selectedCategoryId =
    selectedItem?.category_id ??
    (editingTransaction?.item_id === selectedItemId
      ? editingTransaction.category_id
      : "");

  const selectedCategoryName = selectedCategoryId
    ? categoryMap.get(selectedCategoryId) ?? "Kategori tidak tersedia"
    : "-";

  const calculatedAmount = calculateAmount(
    selectedQuantity,
    selectedUnitPrice,
  );

  const invalidateTransactionQueries = async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: [isSales ? "sales" : "expenses"],
      }),
      queryClient.invalidateQueries({
        predicate: (query) => {
          const rootKey = query.queryKey[0];

          return (
            typeof rootKey === "string" &&
            rootKey.startsWith("dashboard-")
          );
        },
      }),
    ]);
  };

  const saveMutation = useMutation({
    mutationFn: async ({
      values,
      transactionId,
    }: SaveTransactionVariables) => {
      ensureTransactionAccess(user?.id, hasManagementAccess);

      const resolvedItem =
        items.find((item) => item.id === values.item_id) ??
        (editingTransaction?.item_id === values.item_id
          ? createFallbackItem(editingTransaction)
          : null);

      if (!resolvedItem) {
        throw new Error(
          `${itemLabel} tidak ditemukan. Muat ulang halaman lalu coba kembali.`,
        );
      }

      const notes = values.notes?.trim() || null;
      const amount = calculateAmount(
        values.quantity,
        values.unit_price,
      );

      if (amount <= 0) {
        throw new Error(
          "Total transaksi harus lebih dari Rp0.",
        );
      }

      if (isSales) {
        if (transactionId) {
          const payload: TablesUpdate<"sales"> = {
            transaction_date: values.transaction_date,
            sales_category_id: resolvedItem.category_id,
            product_id: values.item_id,
            quantity: values.quantity,
            unit_price: values.unit_price,
            amount,
            notes,
            updated_by: user!.id,
          };

          const { data, error } = await supabase
            .from("sales")
            .update(payload)
            .eq("id", transactionId)
            .is("deleted_at", null)
            .select("id")
            .maybeSingle();

          if (error) throw error;
          if (!data) throw new Error("Data penjualan tidak ditemukan.");

          return "update" as const;
        }

        const payload: TablesInsert<"sales"> = {
          transaction_date: values.transaction_date,
          sales_category_id: resolvedItem.category_id,
          product_id: values.item_id,
          quantity: values.quantity,
          unit_price: values.unit_price,
          amount,
          notes,
          created_by: user!.id,
          updated_by: user!.id,
        };

        const { data, error } = await supabase
          .from("sales")
          .insert(payload)
          .select("id")
          .single();

        if (error) throw error;
        if (!data) throw new Error("Penjualan gagal ditambahkan.");

        return "create" as const;
      }

      if (transactionId) {
        const payload: TablesUpdate<"expenses"> = {
          transaction_date: values.transaction_date,
          expense_category_id: resolvedItem.category_id,
          expense_item_id: values.item_id,
          quantity: values.quantity,
          unit_price: values.unit_price,
          amount,
          notes,
          updated_by: user!.id,
        };

        const { data, error } = await supabase
          .from("expenses")
          .update(payload)
          .eq("id", transactionId)
          .is("deleted_at", null)
          .select("id")
          .maybeSingle();

        if (error) throw error;
        if (!data) throw new Error("Data pengeluaran tidak ditemukan.");

        return "update" as const;
      }

      const payload: TablesInsert<"expenses"> = {
        transaction_date: values.transaction_date,
        expense_category_id: resolvedItem.category_id,
        expense_item_id: values.item_id,
        quantity: values.quantity,
        unit_price: values.unit_price,
        amount,
        notes,
        created_by: user!.id,
        updated_by: user!.id,
      };

      const { data, error } = await supabase
        .from("expenses")
        .insert(payload)
        .select("id")
        .single();

      if (error) throw error;
      if (!data) throw new Error("Pengeluaran gagal ditambahkan.");

      return "create" as const;
    },
    onSuccess: async (mode) => {
      await invalidateTransactionQueries();

      toast.success(
        mode === "update"
          ? `${label} berhasil diperbarui.`
          : `${label} berhasil ditambahkan.`,
      );

      closeFormDialog();
    },
    onError: (error: unknown) => {
      toast.error(`Gagal menyimpan ${labelLower}.`, {
        description: getTransactionErrorMessage(
          error,
          labelLower,
          itemLabelLower,
        ),
      });
    },
  });

  const softDeleteMutation = useMutation({
    mutationFn: async ({ transactionId }: RowActionVariables) => {
      ensureTransactionAccess(user?.id, hasManagementAccess);

      if (isSales) {
        const payload: TablesUpdate<"sales"> = {
          deleted_at: new Date().toISOString(),
          deleted_by: user!.id,
          updated_by: user!.id,
        };

        const { error } = await supabase
          .from("sales")
          .update(payload)
          .eq("id", transactionId)
          .is("deleted_at", null);

        if (error) throw error;
        return;
      }

      const payload: TablesUpdate<"expenses"> = {
        deleted_at: new Date().toISOString(),
        deleted_by: user!.id,
        updated_by: user!.id,
      };

      const { error } = await supabase
        .from("expenses")
        .update(payload)
        .eq("id", transactionId)
        .is("deleted_at", null);

      if (error) throw error;
    },
    onSuccess: async () => {
      await invalidateTransactionQueries();

      toast.success(`${label} berhasil dihapus.`, {
        description: "Data dapat dipulihkan oleh Super Admin.",
      });

      setDeleteTransactionId(null);
    },
    onError: (error: unknown) => {
      toast.error(`Gagal menghapus ${labelLower}.`, {
        description: getTransactionErrorMessage(
          error,
          labelLower,
          itemLabelLower,
        ),
      });
    },
  });

  const restoreMutation = useMutation({
    mutationFn: async ({ transactionId }: RowActionVariables) => {
      ensureSuperAdminAccess(user?.id, isSuperAdmin);

      if (isSales) {
        const payload: TablesUpdate<"sales"> = {
          deleted_at: null,
          deleted_by: null,
          updated_by: user!.id,
        };

        const { data, error } = await supabase
          .from("sales")
          .update(payload)
          .eq("id", transactionId)
          .not("deleted_at", "is", null)
          .select("id")
          .maybeSingle();

        if (error) throw error;
        if (!data) throw new Error("Data penjualan tidak ditemukan.");
        return;
      }

      const payload: TablesUpdate<"expenses"> = {
        deleted_at: null,
        deleted_by: null,
        updated_by: user!.id,
      };

      const { data, error } = await supabase
        .from("expenses")
        .update(payload)
        .eq("id", transactionId)
        .not("deleted_at", "is", null)
        .select("id")
        .maybeSingle();

      if (error) throw error;
      if (!data) throw new Error("Data pengeluaran tidak ditemukan.");
    },
    onSuccess: async () => {
      await invalidateTransactionQueries();
      toast.success(`${label} berhasil dipulihkan.`);
    },
    onError: (error: unknown) => {
      toast.error(`Gagal memulihkan ${labelLower}.`, {
        description: getTransactionErrorMessage(
          error,
          labelLower,
          itemLabelLower,
        ),
      });
    },
  });

  const hardDeleteMutation = useMutation({
    mutationFn: async ({ transactionId }: RowActionVariables) => {
      ensureSuperAdminAccess(user?.id, isSuperAdmin);

      if (isSales) {
        const { data, error } = await supabase
          .from("sales")
          .delete()
          .eq("id", transactionId)
          .not("deleted_at", "is", null)
          .select("id")
          .maybeSingle();

        if (error) throw error;
        if (!data) throw new Error("Data penjualan tidak ditemukan.");
        return;
      }

      const { data, error } = await supabase
        .from("expenses")
        .delete()
        .eq("id", transactionId)
        .not("deleted_at", "is", null)
        .select("id")
        .maybeSingle();

      if (error) throw error;
      if (!data) throw new Error("Data pengeluaran tidak ditemukan.");
    },
    onSuccess: async () => {
      await invalidateTransactionQueries();

      toast.success(`${label} berhasil dihapus permanen.`);
      setHardDeleteTransactionId(null);
      setHardConfirmText("");
    },
    onError: (error: unknown) => {
      toast.error(`Gagal menghapus permanen ${labelLower}.`, {
        description: getTransactionErrorMessage(
          error,
          labelLower,
          itemLabelLower,
        ),
      });
    },
  });

  const totalPages = Math.max(
    1,
    Math.ceil((listQuery.data?.count ?? 0) / PAGE_SIZE),
  );

  useEffect(() => {
    if (!isSuperAdmin && tab === "deleted") {
      setTab("active");
      setPage(1);
    }
  }, [isSuperAdmin, tab]);

  useEffect(() => {
    if (!listQuery.isLoading && page > totalPages) {
      setPage(totalPages);
    }
  }, [listQuery.isLoading, page, totalPages]);

  const openCreateDialog = () => {
    setEditingTransaction(null);
    form.reset(createDefaultFormValues());
    setDialogOpen(true);
  };

  const openEditDialog = (transaction: TransactionRow) => {
    if (transaction.deleted_at) {
      toast.error("Data yang telah dihapus tidak dapat diedit.");
      return;
    }

    setEditingTransaction(transaction);

    form.reset({
      transaction_date: transaction.transaction_date,
      item_id: transaction.item_id,
      quantity: transaction.quantity,
      unit_price: transaction.unit_price,
      notes: transaction.notes ?? "",
    });

    setDialogOpen(true);
  };

  const closeFormDialog = () => {
    if (saveMutation.isPending) return;

    setDialogOpen(false);
    setEditingTransaction(null);
    form.reset(createDefaultFormValues());
  };

  const handleItemChange = (itemId: string) => {
    const item = selectableItems.find(
      (candidate) => candidate.id === itemId,
    );

    form.setValue("item_id", itemId, {
      shouldDirty: true,
      shouldValidate: true,
    });

    form.setValue(
      "unit_price",
      item && item.default_price > 0
        ? item.default_price
        : 0,
      {
        shouldDirty: true,
        shouldValidate: true,
      },
    );
  };

  const resetFilters = () => {
    setSearch("");
    setCategoryFilter("all");
    setDateFrom("");
    setDateTo("");
    setPage(1);
  };

  const hasActiveFilters =
    Boolean(normalizedSearch) ||
    categoryFilter !== "all" ||
    Boolean(dateFrom) ||
    Boolean(dateTo);

  const optionsError =
    categoriesQuery.isError || itemsQuery.isError;

  if (!authLoading && !hasManagementAccess) {
    return (
      <div>
        <PageHeader
          title={`Data ${label}`}
          description={`Catat ${labelLower} berdasarkan ${itemLabelLower}.`}
        />

        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Akses ditolak</AlertTitle>
          <AlertDescription>
            Anda tidak memiliki izin mengakses data operasional.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={`Data ${label}`}
        description={
          isSales
            ? "Catat penjualan berdasarkan produk, jumlah, dan harga satuan."
            : "Catat pengeluaran berdasarkan item, jumlah, dan harga satuan."
        }
        actions={
          <Button
            type="button"
            onClick={openCreateDialog}
            disabled={
              authLoading ||
              categoriesQuery.isLoading ||
              itemsQuery.isLoading ||
              optionsError
            }
          >
            <Plus className="mr-2 h-4 w-4" />
            Tambah {label}
          </Button>
        }
      />

      <Tabs
        value={tab}
        onValueChange={(value) => {
          setTab(value as "active" | "deleted");
          setPage(1);
        }}
      >
        {isSuperAdmin && (
          <TabsList className="mb-4">
            <TabsTrigger value="active">Data Aktif</TabsTrigger>
            <TabsTrigger value="deleted">Data Terhapus</TabsTrigger>
          </TabsList>
        )}
      </Tabs>

      <Card className="rounded-xl">
        <CardContent className="space-y-4 p-4">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <div className="relative sm:col-span-2">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder={`Cari ${itemLabelLower}, kategori, SKU, atau catatan...`}
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
              />
            </div>

            <Select
              value={categoryFilter}
              onValueChange={(value) => {
                setCategoryFilter(value);
                setPage(1);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Semua kategori" />
              </SelectTrigger>

              <SelectContent>
                <SelectItem value="all">Semua Kategori</SelectItem>

                {categories.map((category) => (
                  <SelectItem key={category.id} value={category.id}>
                    {category.name}
                    {!category.is_active ? " (Nonaktif)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="grid grid-cols-2 gap-2">
              <Input
                type="date"
                aria-label="Tanggal mulai"
                value={dateFrom}
                onChange={(event) => {
                  setDateFrom(event.target.value);
                  setPage(1);
                }}
              />

              <Input
                type="date"
                aria-label="Tanggal akhir"
                value={dateTo}
                onChange={(event) => {
                  setDateTo(event.target.value);
                  setPage(1);
                }}
              />
            </div>
          </div>

          {hasActiveFilters && (
            <div className="flex justify-end">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={resetFilters}
              >
                <X className="mr-2 h-4 w-4" />
                Reset Filter
              </Button>
            </div>
          )}

          {invalidDateRange && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Rentang tanggal tidak valid</AlertTitle>
              <AlertDescription>
                Tanggal mulai tidak boleh melewati tanggal akhir.
              </AlertDescription>
            </Alert>
          )}

          {optionsError ? (
            <QueryErrorState
              title="Master data transaksi gagal dimuat"
              description={`Periksa koneksi Supabase serta policy RLS kategori dan ${itemLabelLower}.`}
              onRetry={() => {
                void Promise.all([
                  categoriesQuery.refetch(),
                  itemsQuery.refetch(),
                ]);
              }}
            />
          ) : listQuery.isError ? (
            <QueryErrorState
              title={`Data ${labelLower} gagal dimuat`}
              description="Periksa koneksi Supabase dan policy RLS transaksi."
              onRetry={() => void listQuery.refetch()}
            />
          ) : (
            <>
              <div className="overflow-auto rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tanggal</TableHead>
                      <TableHead>{itemLabel}</TableHead>
                      <TableHead>Kategori</TableHead>
                      <TableHead className="text-right">Jumlah</TableHead>
                      <TableHead>Satuan</TableHead>
                      <TableHead className="text-right">
                        Harga Satuan
                      </TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead>Catatan</TableHead>
                      <TableHead>Diperbarui</TableHead>
                      <TableHead className="text-right">Aksi</TableHead>
                    </TableRow>
                  </TableHeader>

                  <TableBody>
                    {listQuery.isLoading ||
                    categoriesQuery.isLoading ||
                    itemsQuery.isLoading ? (
                      <TransactionTableSkeleton />
                    ) : listQuery.data?.rows.length ? (
                      listQuery.data.rows.map((transaction) => {
                        const transactionItem = itemMap.get(
                          transaction.item_id,
                        );

                        const isRestoring =
                          restoreMutation.isPending &&
                          restoreMutation.variables?.transactionId ===
                            transaction.id;

                        const isDeleting =
                          softDeleteMutation.isPending &&
                          softDeleteMutation.variables?.transactionId ===
                            transaction.id;

                        const isHardDeleting =
                          hardDeleteMutation.isPending &&
                          hardDeleteMutation.variables?.transactionId ===
                            transaction.id;

                        const isRowBusy =
                          isRestoring || isDeleting || isHardDeleting;

                        return (
                          <TableRow key={transaction.id}>
                            <TableCell className="whitespace-nowrap">
                              {formatDate(transaction.transaction_date)}
                            </TableCell>

                            <TableCell className="min-w-[180px]">
                              <div className="font-medium">
                                {transactionItem?.name ??
                                  `${itemLabel} tidak tersedia`}
                              </div>

                              {transactionItem?.code && (
                                <div className="text-xs text-muted-foreground">
                                  {transactionItem.code}
                                </div>
                              )}
                            </TableCell>

                            <TableCell className="whitespace-nowrap">
                              {categoryMap.get(transaction.category_id) ??
                                "-"}
                            </TableCell>

                            <TableCell className="text-right font-medium">
                              {formatQuantity(transaction.quantity)}
                            </TableCell>

                            <TableCell>
                              {transactionItem?.unit ?? "-"}
                            </TableCell>

                            <TableCell className="whitespace-nowrap text-right">
                              {formatRupiah(transaction.unit_price)}
                            </TableCell>

                            <TableCell className="whitespace-nowrap text-right font-semibold">
                              {formatRupiah(transaction.amount)}
                            </TableCell>

                            <TableCell
                              className="max-w-[220px] truncate text-muted-foreground"
                              title={transaction.notes ?? undefined}
                            >
                              {transaction.notes || "-"}
                            </TableCell>

                            <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                              {formatDateTime(transaction.updated_at)}
                            </TableCell>

                            <TableCell className="text-right">
                              <div className="flex justify-end gap-1">
                                {isRowBusy && (
                                  <Loader2 className="my-auto mr-1 h-4 w-4 animate-spin text-muted-foreground" />
                                )}

                                {tab === "active" ? (
                                  <>
                                    <Button
                                      type="button"
                                      size="icon"
                                      variant="ghost"
                                      disabled={isRowBusy}
                                      onClick={() =>
                                        openEditDialog(transaction)
                                      }
                                      aria-label={`Edit ${labelLower}`}
                                    >
                                      <Pencil className="h-4 w-4" />
                                    </Button>

                                    <Button
                                      type="button"
                                      size="icon"
                                      variant="ghost"
                                      className="text-destructive hover:text-destructive"
                                      disabled={isRowBusy}
                                      onClick={() =>
                                        setDeleteTransactionId(transaction.id)
                                      }
                                      aria-label={`Hapus ${labelLower}`}
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </>
                                ) : (
                                  <>
                                    <Button
                                      type="button"
                                      size="icon"
                                      variant="ghost"
                                      disabled={isRowBusy}
                                      onClick={() =>
                                        restoreMutation.mutate({
                                          transactionId: transaction.id,
                                        })
                                      }
                                      aria-label={`Pulihkan ${labelLower}`}
                                    >
                                      <RotateCcw className="h-4 w-4" />
                                    </Button>

                                    <Button
                                      type="button"
                                      size="icon"
                                      variant="ghost"
                                      className="text-destructive hover:text-destructive"
                                      disabled={isRowBusy}
                                      onClick={() => {
                                        setHardDeleteTransactionId(
                                          transaction.id,
                                        );
                                        setHardConfirmText("");
                                      }}
                                      aria-label={`Hapus permanen ${labelLower}`}
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    ) : (
                      <TableRow>
                        <TableCell colSpan={10} className="p-0">
                          <EmptyState
                            title={
                              hasActiveFilters
                                ? `${label} tidak ditemukan`
                                : tab === "deleted"
                                  ? `Belum ada ${labelLower} terhapus`
                                  : `Belum ada data ${labelLower}`
                            }
                            description={
                              hasActiveFilters
                                ? "Tidak ada data yang cocok dengan filter."
                                : tab === "deleted"
                                  ? "Data yang dihapus sementara muncul di sini."
                                  : `Tambahkan ${labelLower} berdasarkan ${itemLabelLower}.`
                            }
                          />
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>

              <div className="flex flex-col gap-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                <div className="text-muted-foreground">
                  Total {listQuery.data?.count ?? 0} data
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={page <= 1 || listQuery.isFetching}
                    onClick={() =>
                      setPage((current) => Math.max(1, current - 1))
                    }
                  >
                    Sebelumnya
                  </Button>

                  <span className="whitespace-nowrap">
                    Halaman {page} / {totalPages}
                  </span>

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={
                      page >= totalPages || listQuery.isFetching
                    }
                    onClick={() =>
                      setPage((current) =>
                        Math.min(totalPages, current + 1),
                      )
                    }
                  >
                    Berikutnya
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (open) {
            setDialogOpen(true);
          } else {
            closeFormDialog();
          }
        }}
      >
        <DialogContent
          className="sm:max-w-xl"
          onInteractOutside={(event) => {
            if (saveMutation.isPending) event.preventDefault();
          }}
          onEscapeKeyDown={(event) => {
            if (saveMutation.isPending) event.preventDefault();
          }}
        >
          <DialogHeader>
            <DialogTitle>
              {editingTransaction ? `Edit ${label}` : `Tambah ${label}`}
            </DialogTitle>
            <DialogDescription>
              Pilih {itemLabelLower}, isi jumlah dan harga satuan.
              Kategori serta total dihitung otomatis.
            </DialogDescription>
          </DialogHeader>

          <form
            className="space-y-4"
            onSubmit={form.handleSubmit((values) =>
              saveMutation.mutate({
                values,
                transactionId: editingTransaction?.id ?? null,
              }),
            )}
          >
            <div className="space-y-2">
              <Label htmlFor={`${kind}-date`}>Tanggal {label}</Label>
              <Input
                id={`${kind}-date`}
                type="date"
                disabled={saveMutation.isPending}
                {...form.register("transaction_date")}
              />

              {form.formState.errors.transaction_date && (
                <p className="text-xs text-destructive">
                  {form.formState.errors.transaction_date.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label>{itemLabel}</Label>

              <Select
                value={selectedItemId}
                disabled={
                  saveMutation.isPending || itemsQuery.isLoading
                }
                onValueChange={handleItemChange}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={`Pilih ${itemLabelLower}`}
                  />
                </SelectTrigger>

                <SelectContent>
                  {selectableItems.length === 0 ? (
                    <div className="p-3 text-xs text-muted-foreground">
                      Belum ada {itemLabelLower} aktif.
                    </div>
                  ) : (
                    selectableItems.map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.name}
                        {item.code ? ` · ${item.code}` : ""}
                        {!item.is_active || item.deleted_at
                          ? " (Nonaktif)"
                          : ""}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>

              {form.formState.errors.item_id && (
                <p className="text-xs text-destructive">
                  {form.formState.errors.item_id.message}
                </p>
              )}
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor={`${kind}-category`}>Kategori</Label>
                <Input
                  id={`${kind}-category`}
                  value={selectedCategoryName}
                  readOnly
                  disabled
                />
                <p className="text-xs text-muted-foreground">
                  Mengikuti {itemLabelLower} yang dipilih.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor={`${kind}-unit`}>Satuan</Label>
                <Input
                  id={`${kind}-unit`}
                  value={selectedItem?.unit ?? "-"}
                  readOnly
                  disabled
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor={`${kind}-quantity`}>Jumlah</Label>
                <Input
                  id={`${kind}-quantity`}
                  type="number"
                  min="0.01"
                  max={MAX_QUANTITY}
                  step="0.01"
                  inputMode="decimal"
                  disabled={saveMutation.isPending}
                  value={Number.isFinite(selectedQuantity)
                    ? selectedQuantity
                    : 0}
                  onChange={(event) => {
                    const value =
                      event.target.value === ""
                        ? 0
                        : Number(event.target.value);

                    form.setValue("quantity", value, {
                      shouldDirty: true,
                      shouldValidate: true,
                    });
                  }}
                />

                {form.formState.errors.quantity && (
                  <p className="text-xs text-destructive">
                    {form.formState.errors.quantity.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor={`${kind}-unit-price`}>
                  Harga Satuan
                </Label>
                <CurrencyInput
                  id={`${kind}-unit-price`}
                  value={selectedUnitPrice}
                  onChange={(value) =>
                    form.setValue("unit_price", value, {
                      shouldDirty: true,
                      shouldValidate: true,
                    })
                  }
                />

                {selectedItem && selectedItem.default_price <= 0 && (
                  <p className="text-xs text-muted-foreground">
                    Harga master belum ditentukan. Isi harga transaksi
                    secara manual.
                  </p>
                )}

                {form.formState.errors.unit_price && (
                  <p className="text-xs text-destructive">
                    {form.formState.errors.unit_price.message}
                  </p>
                )}
              </div>
            </div>

            <div className="rounded-xl border bg-muted/40 p-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">
                    Total {label}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatQuantity(
                      Number.isFinite(selectedQuantity)
                        ? selectedQuantity
                        : 0,
                    )}{" "}
                    × {formatRupiah(
                      Number.isFinite(selectedUnitPrice)
                        ? selectedUnitPrice
                        : 0,
                    )}
                  </p>
                </div>

                <p className="text-lg font-semibold">
                  {formatRupiah(calculatedAmount)}
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor={`${kind}-notes`}>Catatan</Label>
              <Textarea
                id={`${kind}-notes`}
                rows={3}
                maxLength={500}
                placeholder="Opsional"
                disabled={saveMutation.isPending}
                {...form.register("notes")}
              />

              <div className="flex justify-between gap-4">
                <div>
                  {form.formState.errors.notes && (
                    <p className="text-xs text-destructive">
                      {form.formState.errors.notes.message}
                    </p>
                  )}
                </div>

                <p className="text-xs text-muted-foreground">
                  {(form.watch("notes") ?? "").length}/500
                </p>
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={saveMutation.isPending}
                onClick={closeFormDialog}
              >
                Batal
              </Button>

              <Button
                type="submit"
                disabled={
                  saveMutation.isPending ||
                  selectableItems.length === 0
                }
              >
                {saveMutation.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}

                {editingTransaction
                  ? "Simpan Perubahan"
                  : `Tambah ${label}`}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={Boolean(deleteTransactionId)}
        onOpenChange={(open) => {
          if (!open && !softDeleteMutation.isPending) {
            setDeleteTransactionId(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Hapus data {labelLower}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Data dipindahkan ke{" "}
              <Badge variant="secondary">Data Terhapus</Badge> dan tidak
              muncul pada dashboard.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={softDeleteMutation.isPending}>
              Batal
            </AlertDialogCancel>

            <Button
              type="button"
              variant="destructive"
              disabled={softDeleteMutation.isPending}
              onClick={() => {
                if (deleteTransactionId) {
                  softDeleteMutation.mutate({
                    transactionId: deleteTransactionId,
                  });
                }
              }}
            >
              {softDeleteMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Hapus
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={Boolean(hardDeleteTransactionId)}
        onOpenChange={(open) => {
          if (!open && !hardDeleteMutation.isPending) {
            setHardDeleteTransactionId(null);
            setHardConfirmText("");
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus permanen?</AlertDialogTitle>
            <AlertDialogDescription>
              Tindakan ini <strong>tidak dapat dibatalkan</strong>. Ketik{" "}
              <strong>{HARD_DELETE_CONFIRMATION}</strong> untuk
              melanjutkan.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <Input
            value={hardConfirmText}
            disabled={hardDeleteMutation.isPending}
            onChange={(event) => setHardConfirmText(event.target.value)}
            placeholder={`Ketik "${HARD_DELETE_CONFIRMATION}"`}
          />

          <AlertDialogFooter>
            <AlertDialogCancel disabled={hardDeleteMutation.isPending}>
              Batal
            </AlertDialogCancel>

            <Button
              type="button"
              variant="destructive"
              disabled={
                hardConfirmText !== HARD_DELETE_CONFIRMATION ||
                hardDeleteMutation.isPending
              }
              onClick={() => {
                if (hardDeleteTransactionId) {
                  hardDeleteMutation.mutate({
                    transactionId: hardDeleteTransactionId,
                  });
                }
              }}
            >
              {hardDeleteMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Hapus Permanen
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

interface FetchTransactionParams {
  tab: "active" | "deleted";
  categoryFilter: string;
  dateFrom: string;
  dateTo: string;
  page: number;
  normalizedSearch: string;
  matchingCategoryIds: string[];
  matchingItemIds: string[];
}

async function fetchSales({
  tab,
  categoryFilter,
  dateFrom,
  dateTo,
  page,
  normalizedSearch,
  matchingCategoryIds,
  matchingItemIds,
}: FetchTransactionParams): Promise<TransactionListResult> {
  let query = supabase.from("sales").select("*", { count: "exact" });

  query =
    tab === "active"
      ? query.is("deleted_at", null)
      : query.not("deleted_at", "is", null);

  if (categoryFilter !== "all") {
    query = query.eq("sales_category_id", categoryFilter);
  }

  if (dateFrom) {
    query = query.gte("transaction_date", dateFrom);
  }

  if (dateTo) {
    query = query.lte("transaction_date", dateTo);
  }

  if (normalizedSearch) {
    const safeSearch = sanitizeSearchTerm(normalizedSearch);
    const filters: string[] = [];

    if (safeSearch) {
      filters.push(`notes.ilike.%${safeSearch}%`);
    }

    if (matchingCategoryIds.length > 0) {
      filters.push(
        `sales_category_id.in.(${matchingCategoryIds.join(",")})`,
      );
    }

    if (matchingItemIds.length > 0) {
      filters.push(
        `product_id.in.(${matchingItemIds.join(",")})`,
      );
    }

    if (filters.length > 0) {
      query = query.or(filters.join(","));
    }
  }

  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const { data, error, count } = await query
    .order("transaction_date", { ascending: false })
    .order("created_at", { ascending: false })
    .range(from, to);

  if (error) throw error;

  return {
    rows: (data ?? []).map(normalizeSalesRow),
    count: count ?? 0,
  };
}

async function fetchExpenses({
  tab,
  categoryFilter,
  dateFrom,
  dateTo,
  page,
  normalizedSearch,
  matchingCategoryIds,
  matchingItemIds,
}: FetchTransactionParams): Promise<TransactionListResult> {
  let query = supabase
    .from("expenses")
    .select("*", { count: "exact" });

  query =
    tab === "active"
      ? query.is("deleted_at", null)
      : query.not("deleted_at", "is", null);

  if (categoryFilter !== "all") {
    query = query.eq("expense_category_id", categoryFilter);
  }

  if (dateFrom) {
    query = query.gte("transaction_date", dateFrom);
  }

  if (dateTo) {
    query = query.lte("transaction_date", dateTo);
  }

  if (normalizedSearch) {
    const safeSearch = sanitizeSearchTerm(normalizedSearch);
    const filters: string[] = [];

    if (safeSearch) {
      filters.push(`notes.ilike.%${safeSearch}%`);
    }

    if (matchingCategoryIds.length > 0) {
      filters.push(
        `expense_category_id.in.(${matchingCategoryIds.join(",")})`,
      );
    }

    if (matchingItemIds.length > 0) {
      filters.push(
        `expense_item_id.in.(${matchingItemIds.join(",")})`,
      );
    }

    if (filters.length > 0) {
      query = query.or(filters.join(","));
    }
  }

  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const { data, error, count } = await query
    .order("transaction_date", { ascending: false })
    .order("created_at", { ascending: false })
    .range(from, to);

  if (error) throw error;

  return {
    rows: (data ?? []).map(normalizeExpenseRow),
    count: count ?? 0,
  };
}

function normalizeSalesRow(row: SalesRow): TransactionRow {
  return {
    id: row.id,
    transaction_date: row.transaction_date,
    category_id: row.sales_category_id,
    item_id: row.product_id,
    quantity: Number(row.quantity),
    unit_price: Number(row.unit_price),
    amount: Number(row.amount),
    notes: row.notes,
    created_at: row.created_at,
    updated_at: row.updated_at,
    created_by: row.created_by,
    updated_by: row.updated_by,
    deleted_at: row.deleted_at,
    deleted_by: row.deleted_by,
  };
}

function normalizeExpenseRow(row: ExpenseRow): TransactionRow {
  return {
    id: row.id,
    transaction_date: row.transaction_date,
    category_id: row.expense_category_id,
    item_id: row.expense_item_id,
    quantity: Number(row.quantity),
    unit_price: Number(row.unit_price),
    amount: Number(row.amount),
    notes: row.notes,
    created_at: row.created_at,
    updated_at: row.updated_at,
    created_by: row.created_by,
    updated_by: row.updated_by,
    deleted_at: row.deleted_at,
    deleted_by: row.deleted_by,
  };
}

function normalizeProduct(
  product: Pick<
    ProductRow,
    | "id"
    | "sales_category_id"
    | "name"
    | "sku"
    | "unit"
    | "selling_price"
    | "is_active"
    | "deleted_at"
  >,
): TransactionItem {
  return {
    id: product.id,
    category_id: product.sales_category_id,
    name: product.name,
    code: product.sku,
    unit: product.unit,
    default_price: Number(product.selling_price),
    is_active: product.is_active,
    deleted_at: product.deleted_at,
  };
}

function normalizeExpenseItem(
  item: Pick<
    ExpenseItemRow,
    | "id"
    | "expense_category_id"
    | "name"
    | "sku"
    | "unit"
    | "default_price"
    | "is_active"
    | "deleted_at"
  >,
): TransactionItem {
  return {
    id: item.id,
    category_id: item.expense_category_id,
    name: item.name,
    code: item.sku,
    unit: item.unit,
    default_price: Number(item.default_price),
    is_active: item.is_active,
    deleted_at: item.deleted_at,
  };
}

function normalizeSalesCategory(
  category: Pick<
    SalesCategoryRow,
    "id" | "name" | "is_active"
  >,
): TransactionCategory {
  return category;
}

function normalizeExpenseCategory(
  category: Pick<
    ExpenseCategoryRow,
    "id" | "name" | "is_active"
  >,
): TransactionCategory {
  return category;
}

function createFallbackItem(
  transaction: TransactionRow,
): TransactionItem {
  return {
    id: transaction.item_id,
    category_id: transaction.category_id,
    name: "Item transaksi saat ini",
    code: null,
    unit: "unit",
    default_price: transaction.unit_price,
    is_active: false,
    deleted_at: null,
  };
}

function createDefaultFormValues(): TransactionFormValues {
  return {
    transaction_date: toDateInput(new Date()),
    item_id: "",
    quantity: 1,
    unit_price: 0,
    notes: "",
  };
}

function calculateAmount(
  quantity: number,
  unitPrice: number,
): number {
  if (
    !Number.isFinite(quantity) ||
    !Number.isFinite(unitPrice)
  ) {
    return 0;
  }

  return Math.round((quantity * unitPrice + Number.EPSILON) * 100) / 100;
}

function formatQuantity(value: number): string {
  return new Intl.NumberFormat("id-ID", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
}

function sanitizeSearchTerm(value: string): string {
  return value
    .replaceAll(",", " ")
    .replaceAll("(", " ")
    .replaceAll(")", " ")
    .replaceAll("%", "")
    .replaceAll("*", "")
    .trim();
}

function TransactionTableSkeleton() {
  return (
    <>
      {Array.from({ length: 5 }).map((_, index) => (
        <TableRow key={index}>
          <TableCell colSpan={10}>
            <Skeleton className="h-8 w-full" />
          </TableCell>
        </TableRow>
      ))}
    </>
  );
}

function QueryErrorState({
  title,
  description,
  onRetry,
}: {
  title: string;
  description: string;
  onRetry: () => void;
}) {
  return (
    <Alert variant="destructive">
      <AlertCircle className="h-4 w-4" />
      <AlertTitle>{title}</AlertTitle>

      <AlertDescription>
        <p>{description}</p>

        <Button
          type="button"
          className="mt-3"
          size="sm"
          variant="outline"
          onClick={onRetry}
        >
          Coba Lagi
        </Button>
      </AlertDescription>
    </Alert>
  );
}

function ensureTransactionAccess(
  userId: string | undefined,
  hasManagementAccess: boolean,
) {
  if (!userId) {
    throw new Error(
      "Sesi pengguna tidak ditemukan. Silakan login kembali.",
    );
  }

  if (!hasManagementAccess) {
    throw new Error(
      "Anda tidak memiliki izin mengelola transaksi.",
    );
  }
}

function ensureSuperAdminAccess(
  userId: string | undefined,
  isSuperAdmin: boolean,
) {
  if (!userId) {
    throw new Error(
      "Sesi pengguna tidak ditemukan. Silakan login kembali.",
    );
  }

  if (!isSuperAdmin) {
    throw new Error(
      "Hanya Super Admin yang dapat melakukan tindakan ini.",
    );
  }
}

function getTransactionErrorMessage(
  error: unknown,
  transactionLabel: string,
  itemLabel: string,
): string {
  if (typeof error === "object" && error !== null) {
    const databaseError = error as DatabaseError;

    if (databaseError.code === "23505") {
      return `Data ${transactionLabel} untuk ${itemLabel} dan tanggal tersebut sudah tersedia. Silakan edit data yang sudah ada.`;
    }

    if (databaseError.code === "23503") {
      return `${capitalize(itemLabel)} atau kategorinya tidak ditemukan.`;
    }

    if (databaseError.code === "23514") {
      return "Jumlah, harga satuan, atau total transaksi tidak valid.";
    }

    if (databaseError.code === "42501") {
      return "Anda tidak memiliki izin melakukan perubahan ini.";
    }

    if (databaseError.code === "P0001") {
      return (
        databaseError.message ??
        "Perubahan ditolak oleh aturan database."
      );
    }

    if (databaseError.message) {
      return databaseError.message;
    }

    if (databaseError.details) {
      return databaseError.details;
    }
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Terjadi kesalahan yang tidak diketahui.";
}

function capitalize(value: string): string {
  if (!value) return value;

  return `${value.charAt(0).toLocaleUpperCase("id-ID")}${value.slice(1)}`;
}