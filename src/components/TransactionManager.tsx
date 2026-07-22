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

const transactionSchema = z.object({
  transaction_date: z.string().min(1, "Tanggal wajib diisi."),
  category_id: z.string().uuid("Kategori wajib dipilih."),
  amount: z
    .number({
      message: "Nominal wajib diisi.",
    })
    .finite("Nominal tidak valid.")
    .positive("Nominal harus lebih dari 0.")
    .max(999_999_999_999, "Nominal terlalu besar."),
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
type SalesCategoryRow = Tables<"sales_categories">;
type ExpenseCategoryRow = Tables<"expense_categories">;

type CategoryRow = SalesCategoryRow | ExpenseCategoryRow;

interface TransactionRow {
  id: string;
  transaction_date: string;
  category_id: string;
  amount: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
  created_by: string;
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
  const labelLower = label.toLowerCase();

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
    defaultValues: {
      transaction_date: toDateInput(new Date()),
      category_id: "",
      amount: 0,
      notes: "",
    },
  });

  const categoriesQuery = useQuery({
    queryKey: [
      isSales ? "sales_categories" : "expense_categories",
      "transaction-options",
    ],
    enabled: !authLoading && hasManagementAccess,
    queryFn: async (): Promise<CategoryRow[]> => {
      if (isSales) {
        const { data, error } = await supabase
          .from("sales_categories")
          .select("*")
          .order("name", { ascending: true });

        if (error) throw error;
        return data ?? [];
      }

      const { data, error } = await supabase
        .from("expense_categories")
        .select("*")
        .order("name", { ascending: true });

      if (error) throw error;
      return data ?? [];
    },
  });

  const categories = categoriesQuery.data ?? [];

  const activeCategories = useMemo(
    () => categories.filter((category) => category.is_active),
    [categories],
  );

  const selectableCategories = useMemo(() => {
    if (!editingTransaction) return activeCategories;

    const currentCategory = categories.find(
      (category) => category.id === editingTransaction.category_id,
    );

    if (currentCategory && !currentCategory.is_active) {
      return [
        currentCategory,
        ...activeCategories.filter(
          (category) => category.id !== currentCategory.id,
        ),
      ];
    }

    return activeCategories;
  }, [activeCategories, categories, editingTransaction]);

  const categoryMap = useMemo(
    () =>
      new Map(
        categories.map((category) => [category.id, category.name]),
      ),
    [categories],
  );

  const matchingCategoryIds = useMemo(() => {
    if (!normalizedSearch) return [];

    const term = normalizedSearch.toLocaleLowerCase("id-ID");

    return categories
      .filter((category) =>
        category.name.toLocaleLowerCase("id-ID").includes(term),
      )
      .map((category) => category.id);
  }, [categories, normalizedSearch]);

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
      },
    ],
    enabled:
      !authLoading &&
      hasManagementAccess &&
      !invalidDateRange &&
      !categoriesQuery.isLoading,
    queryFn: async (): Promise<TransactionListResult> => {
      if (isSales) {
        return fetchSales({
          tab,
          categoryFilter,
          dateFrom,
          dateTo,
          page,
          normalizedSearch,
          matchingCategoryIds,
        });
      }

      return fetchExpenses({
        tab,
        categoryFilter,
        dateFrom,
        dateTo,
        page,
        normalizedSearch,
        matchingCategoryIds,
      });
    },
  });

  const invalidateTransactionQueries = async () => {
  const transactionQueryKey = isSales
    ? "sales"
    : "expenses";

  const dashboardQueryKey = isSales
    ? "dashboard-sales"
    : "dashboard-expenses";

  await Promise.all([
    queryClient.invalidateQueries({
      queryKey: [transactionQueryKey],
    }),

    queryClient.invalidateQueries({
      queryKey: [dashboardQueryKey],
    }),
  ]);
};

  const saveMutation = useMutation({
    mutationFn: async ({
      values,
      transactionId,
    }: SaveTransactionVariables) => {
      ensureTransactionAccess(user?.id, hasManagementAccess);

      const notes = values.notes?.trim() || null;

      if (isSales) {
        if (transactionId) {
          const payload: TablesUpdate<"sales"> = {
            transaction_date: values.transaction_date,
            sales_category_id: values.category_id,
            amount: values.amount,
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
          sales_category_id: values.category_id,
          amount: values.amount,
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
          expense_category_id: values.category_id,
          amount: values.amount,
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
        expense_category_id: values.category_id,
        amount: values.amount,
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
        description: getTransactionErrorMessage(error, labelLower),
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

        const { data, error } = await supabase
          .from("sales")
          .update(payload)
          .eq("id", transactionId)
          .is("deleted_at", null)
          .select("id")
          .maybeSingle();

        if (error) throw error;
        if (!data) throw new Error("Data penjualan tidak ditemukan.");
        return;
      }

      const payload: TablesUpdate<"expenses"> = {
        deleted_at: new Date().toISOString(),
        deleted_by: user!.id,
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
        description: getTransactionErrorMessage(error, labelLower),
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
        description: getTransactionErrorMessage(error, labelLower),
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
        description: getTransactionErrorMessage(error, labelLower),
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

    form.reset({
      transaction_date: toDateInput(new Date()),
      category_id: "",
      amount: 0,
      notes: "",
    });

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
      category_id: transaction.category_id,
      amount: transaction.amount,
      notes: transaction.notes ?? "",
    });

    setDialogOpen(true);
  };

  const closeFormDialog = () => {
    if (saveMutation.isPending) return;

    setDialogOpen(false);
    setEditingTransaction(null);

    form.reset({
      transaction_date: toDateInput(new Date()),
      category_id: "",
      amount: 0,
      notes: "",
    });
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

  if (!authLoading && !hasManagementAccess) {
    return (
      <div>
        <PageHeader
          title={`Data ${label}`}
          description={`Catat ${labelLower} harian per kategori.`}
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
        description={`Catat ${labelLower} harian per kategori. Nominal dicatat sebagai total per kategori, bukan per produk.`}
        actions={
          <Button
            type="button"
            onClick={openCreateDialog}
            disabled={authLoading || categoriesQuery.isLoading}
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
                placeholder="Cari kategori atau catatan..."
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

          {categoriesQuery.isError ? (
            <QueryErrorState
              title="Kategori gagal dimuat"
              description="Periksa koneksi Supabase dan policy RLS kategori."
              onRetry={() => void categoriesQuery.refetch()}
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
                      <TableHead>Kategori</TableHead>
                      <TableHead>Nominal</TableHead>
                      <TableHead>Catatan</TableHead>
                      <TableHead>Diperbarui</TableHead>
                      <TableHead className="text-right">Aksi</TableHead>
                    </TableRow>
                  </TableHeader>

                  <TableBody>
                    {listQuery.isLoading || categoriesQuery.isLoading ? (
                      <TransactionTableSkeleton />
                    ) : listQuery.data?.rows.length ? (
                      listQuery.data.rows.map((transaction) => {
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

                            <TableCell>
                              {categoryMap.get(transaction.category_id) ?? "-"}
                            </TableCell>

                            <TableCell className="font-medium">
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
                        <TableCell colSpan={6} className="p-0">
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
                                  : "Tambahkan data pertama melalui tombol di atas."
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
              Isi total nominal harian untuk kategori yang dipilih.
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
              <Label>Kategori {label}</Label>

              <Select
                value={form.watch("category_id")}
                disabled={
                  saveMutation.isPending || categoriesQuery.isLoading
                }
                onValueChange={(value) =>
                  form.setValue("category_id", value, {
                    shouldDirty: true,
                    shouldValidate: true,
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Pilih kategori" />
                </SelectTrigger>

                <SelectContent>
                  {selectableCategories.length === 0 ? (
                    <div className="p-3 text-xs text-muted-foreground">
                      Belum ada kategori aktif.
                    </div>
                  ) : (
                    selectableCategories.map((category) => (
                      <SelectItem key={category.id} value={category.id}>
                        {category.name}
                        {!category.is_active ? " (Nonaktif)" : ""}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>

              {form.formState.errors.category_id && (
                <p className="text-xs text-destructive">
                  {form.formState.errors.category_id.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor={`${kind}-amount`}>Nominal {label}</Label>
              <CurrencyInput
                id={`${kind}-amount`}
                value={form.watch("amount")}
                onChange={(value) =>
                  form.setValue("amount", value, {
                    shouldDirty: true,
                    shouldValidate: true,
                  })
                }
              />

              {form.formState.errors.amount && (
                <p className="text-xs text-destructive">
                  {form.formState.errors.amount.message}
                </p>
              )}
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
                  selectableCategories.length === 0
                }
              >
                {saveMutation.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}

                {editingTransaction ? "Simpan Perubahan" : `Tambah ${label}`}
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
}

async function fetchSales({
  tab,
  categoryFilter,
  dateFrom,
  dateTo,
  page,
  normalizedSearch,
  matchingCategoryIds,
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

    if (matchingCategoryIds.length > 0) {
      query = query.or(
        `notes.ilike.%${safeSearch}%,sales_category_id.in.(${matchingCategoryIds.join(",")})`,
      );
    } else {
      query = query.ilike("notes", `%${safeSearch}%`);
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
}: FetchTransactionParams): Promise<TransactionListResult> {
  let query = supabase.from("expenses").select("*", { count: "exact" });

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

    if (matchingCategoryIds.length > 0) {
      query = query.or(
        `notes.ilike.%${safeSearch}%,expense_category_id.in.(${matchingCategoryIds.join(",")})`,
      );
    } else {
      query = query.ilike("notes", `%${safeSearch}%`);
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
          <TableCell colSpan={6}>
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
): string {
  if (typeof error === "object" && error !== null) {
    const databaseError = error as DatabaseError;

    if (databaseError.code === "23505") {
      return `Data ${transactionLabel} untuk kategori dan tanggal tersebut sudah tersedia. Silakan edit data yang sudah ada.`;
    }

    if (databaseError.code === "23503") {
      return "Kategori tidak ditemukan atau tidak valid.";
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