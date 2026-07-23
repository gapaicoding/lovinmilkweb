import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
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
import { formatDateTime, formatRupiah } from "@/lib/format";

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
import { Switch } from "@/components/ui/switch";
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
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
const MAX_DEFAULT_PRICE = 999_999_999_999;

const expenseItemSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Nama item pengeluaran wajib diisi.")
    .max(150, "Nama item maksimal 150 karakter."),
  sku: z
    .string()
    .trim()
    .max(50, "SKU maksimal 50 karakter.")
    .optional(),
  expense_category_id: z
    .string()
    .uuid("Kategori pengeluaran wajib dipilih."),
  unit: z
    .string()
    .trim()
    .min(1, "Satuan wajib diisi.")
    .max(30, "Satuan maksimal 30 karakter."),
  default_price: z
    .number({
      message: "Harga default wajib diisi.",
    })
    .finite("Harga default tidak valid.")
    .min(0, "Harga default tidak boleh negatif.")
    .max(MAX_DEFAULT_PRICE, "Harga default terlalu besar."),
  notes: z
    .string()
    .trim()
    .max(500, "Catatan maksimal 500 karakter.")
    .optional(),
  is_active: z.boolean(),
});

type ExpenseItemFormValues = z.infer<typeof expenseItemSchema>;
type ExpenseItemRow = Tables<"expense_items">;
type ExpenseCategoryRow = Tables<"expense_categories">;

interface ExpenseItemListResult {
  rows: ExpenseItemRow[];
  count: number;
}

interface SaveExpenseItemVariables {
  values: ExpenseItemFormValues;
  expenseItemId: string | null;
}

interface ExpenseItemActionVariables {
  expenseItemId: string;
}

interface DatabaseError {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
}

export function ExpenseItemManager() {
  const {
    user,
    isAdmin,
    isSuperAdmin,
    loading: authLoading,
  } = useAuth();

  const queryClient = useQueryClient();
  const canManage = isAdmin || isSuperAdmin;

  const [tab, setTab] = useState<"active" | "deleted">("active");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] =
    useState<ExpenseItemRow | null>(null);

  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [hardDeleteId, setHardDeleteId] =
    useState<string | null>(null);
  const [hardConfirmText, setHardConfirmText] = useState("");

  const normalizedSearch = search.trim();

  const form = useForm<ExpenseItemFormValues>({
    resolver: zodResolver(expenseItemSchema),
    defaultValues: createDefaultFormValues(),
  });

  const categoriesQuery = useQuery({
    queryKey: ["expense_categories", "all"],
    enabled: !authLoading && canManage,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<ExpenseCategoryRow[]> => {
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
    if (!editingItem) return activeCategories;

    const currentCategory = categories.find(
      (category) =>
        category.id === editingItem.expense_category_id,
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
  }, [activeCategories, categories, editingItem]);

  const categoryMap = useMemo(
    () =>
      new Map(
        categories.map((category) => [
          category.id,
          category.name,
        ]),
      ),
    [categories],
  );

  const listQuery = useQuery({
    queryKey: [
      "expense_items",
      "list",
      {
        tab,
        normalizedSearch,
        categoryFilter,
        statusFilter,
        page,
      },
    ],
    enabled:
      !authLoading &&
      canManage &&
      !categoriesQuery.isLoading &&
      !categoriesQuery.isError,
    queryFn: async (): Promise<ExpenseItemListResult> => {
      let query = supabase
        .from("expense_items")
        .select("*", { count: "exact" });

      query =
        tab === "active"
          ? query.is("deleted_at", null)
          : query.not("deleted_at", "is", null);

      if (categoryFilter !== "all") {
        query = query.eq(
          "expense_category_id",
          categoryFilter,
        );
      }

      if (statusFilter === "active") {
        query = query.eq("is_active", true);
      }

      if (statusFilter === "inactive") {
        query = query.eq("is_active", false);
      }

      if (normalizedSearch) {
        const term = sanitizeSearchTerm(normalizedSearch);

        if (term) {
          query = query.or(
            `name.ilike.%${term}%,sku.ilike.%${term}%,notes.ilike.%${term}%`,
          );
        }
      }

      const from = (page - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      const { data, error, count } = await query
        .order("name", { ascending: true })
        .range(from, to);

      if (error) throw error;

      return {
        rows: data ?? [],
        count: count ?? 0,
      };
    },
  });

  const invalidateExpenseItemQueries = async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: ["expense_items"],
      }),
      queryClient.invalidateQueries({
        queryKey: ["expenses"],
      }),
    ]);
  };

  const saveMutation = useMutation({
    mutationFn: async ({
      values,
      expenseItemId,
    }: SaveExpenseItemVariables) => {
      ensureAccess(user?.id, canManage);

      const commonPayload = {
        name: values.name.trim(),
        sku: values.sku?.trim() || null,
        expense_category_id: values.expense_category_id,
        unit: values.unit.trim(),
        default_price: values.default_price,
        notes: values.notes?.trim() || null,
        is_active: values.is_active,
        updated_by: user!.id,
      };

      if (expenseItemId) {
        const payload: TablesUpdate<"expense_items"> =
          commonPayload;

        const { data, error } = await supabase
          .from("expense_items")
          .update(payload)
          .eq("id", expenseItemId)
          .is("deleted_at", null)
          .select("id")
          .maybeSingle();

        if (error) throw error;
        if (!data) {
          throw new Error(
            "Item pengeluaran tidak ditemukan.",
          );
        }

        return "update" as const;
      }

      const payload: TablesInsert<"expense_items"> = {
        ...commonPayload,
        created_by: user!.id,
      };

      const { data, error } = await supabase
        .from("expense_items")
        .insert(payload)
        .select("id")
        .single();

      if (error) throw error;
      if (!data) {
        throw new Error(
          "Item pengeluaran gagal ditambahkan.",
        );
      }

      return "create" as const;
    },
    onSuccess: async (mode) => {
      await invalidateExpenseItemQueries();

      toast.success(
        mode === "update"
          ? "Item pengeluaran berhasil diperbarui."
          : "Item pengeluaran berhasil ditambahkan.",
      );

      closeDialog();
    },
    onError: (error: unknown) => {
      toast.error("Gagal menyimpan item pengeluaran.", {
        description: getErrorMessage(error),
      });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async (item: ExpenseItemRow) => {
      ensureAccess(user?.id, canManage);

      const payload: TablesUpdate<"expense_items"> = {
        is_active: !item.is_active,
        updated_by: user!.id,
      };

      const { data, error } = await supabase
        .from("expense_items")
        .update(payload)
        .eq("id", item.id)
        .is("deleted_at", null)
        .select("id, name, is_active")
        .maybeSingle();

      if (error) throw error;
      if (!data) {
        throw new Error(
          "Item pengeluaran tidak ditemukan.",
        );
      }

      return data;
    },
    onSuccess: async (data) => {
      await invalidateExpenseItemQueries();

      toast.success(
        data.is_active
          ? "Item pengeluaran berhasil diaktifkan."
          : "Item pengeluaran berhasil dinonaktifkan.",
        {
          description: data.name,
        },
      );
    },
    onError: (error: unknown) => {
      toast.error(
        "Gagal memperbarui status item pengeluaran.",
        {
          description: getErrorMessage(error),
        },
      );
    },
  });

  const softDeleteMutation = useMutation({
    mutationFn: async ({
      expenseItemId,
    }: ExpenseItemActionVariables) => {
      ensureAccess(user?.id, canManage);

      const payload: TablesUpdate<"expense_items"> = {
        is_active: false,
        deleted_at: new Date().toISOString(),
        deleted_by: user!.id,
        updated_by: user!.id,
      };

      const { data, error } = await supabase
        .from("expense_items")
        .update(payload)
        .eq("id", expenseItemId)
        .is("deleted_at", null)
        .select("id")
        .maybeSingle();

      if (error) throw error;
      if (!data) {
        throw new Error(
          "Item pengeluaran tidak ditemukan.",
        );
      }
    },
    onSuccess: async () => {
      await invalidateExpenseItemQueries();

      toast.success("Item pengeluaran berhasil dihapus.", {
        description:
          "Data dapat dipulihkan oleh Super Admin.",
      });

      setDeleteId(null);
    },
    onError: (error: unknown) => {
      toast.error("Gagal menghapus item pengeluaran.", {
        description: getErrorMessage(error),
      });
    },
  });

  const restoreMutation = useMutation({
    mutationFn: async ({
      expenseItemId,
    }: ExpenseItemActionVariables) => {
      ensureSuperAdmin(user?.id, isSuperAdmin);

      const payload: TablesUpdate<"expense_items"> = {
        deleted_at: null,
        deleted_by: null,
        updated_by: user!.id,
      };

      const { data, error } = await supabase
        .from("expense_items")
        .update(payload)
        .eq("id", expenseItemId)
        .not("deleted_at", "is", null)
        .select("id")
        .maybeSingle();

      if (error) throw error;
      if (!data) {
        throw new Error(
          "Item pengeluaran tidak ditemukan.",
        );
      }
    },
    onSuccess: async () => {
      await invalidateExpenseItemQueries();

      toast.success(
        "Item pengeluaran berhasil dipulihkan.",
        {
          description:
            "Item tetap berstatus nonaktif sampai diaktifkan kembali.",
        },
      );
    },
    onError: (error: unknown) => {
      toast.error(
        "Gagal memulihkan item pengeluaran.",
        {
          description: getErrorMessage(error),
        },
      );
    },
  });

  const hardDeleteMutation = useMutation({
    mutationFn: async ({
      expenseItemId,
    }: ExpenseItemActionVariables) => {
      ensureSuperAdmin(user?.id, isSuperAdmin);

      const { data, error } = await supabase
        .from("expense_items")
        .delete()
        .eq("id", expenseItemId)
        .not("deleted_at", "is", null)
        .select("id")
        .maybeSingle();

      if (error) throw error;
      if (!data) {
        throw new Error(
          "Item pengeluaran tidak ditemukan.",
        );
      }
    },
    onSuccess: async () => {
      await invalidateExpenseItemQueries();

      toast.success(
        "Item pengeluaran berhasil dihapus permanen.",
      );

      setHardDeleteId(null);
      setHardConfirmText("");
    },
    onError: (error: unknown) => {
      toast.error(
        "Gagal menghapus permanen item pengeluaran.",
        {
          description: getErrorMessage(error),
        },
      );
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

  const resetForm = () => {
    form.reset(createDefaultFormValues());
  };

  const closeDialog = () => {
    if (saveMutation.isPending) return;

    setDialogOpen(false);
    setEditingItem(null);
    resetForm();
  };

  const openCreateDialog = () => {
    setEditingItem(null);
    resetForm();
    setDialogOpen(true);
  };

  const openEditDialog = (item: ExpenseItemRow) => {
    if (item.deleted_at) {
      toast.error(
        "Item pengeluaran yang telah dihapus tidak dapat diedit.",
      );
      return;
    }

    setEditingItem(item);

    form.reset({
      name: item.name,
      sku: item.sku ?? "",
      expense_category_id: item.expense_category_id,
      unit: item.unit,
      default_price: Number(item.default_price),
      notes: item.notes ?? "",
      is_active: item.is_active,
    });

    setDialogOpen(true);
  };

  const resetFilters = () => {
    setSearch("");
    setCategoryFilter("all");
    setStatusFilter("all");
    setPage(1);
  };

  const hasActiveFilters =
    Boolean(normalizedSearch) ||
    categoryFilter !== "all" ||
    statusFilter !== "all";

  if (!authLoading && !canManage) {
    return <ExpenseItemAccessDenied />;
  }

  return (
    <div>
      <PageHeader
        title="Master Item Pengeluaran"
        description="Kelola item pengeluaran, kategori, SKU, satuan, harga default, dan status aktif."
        actions={
          <Button
            type="button"
            onClick={openCreateDialog}
            disabled={
              authLoading ||
              categoriesQuery.isLoading ||
              categoriesQuery.isError
            }
          >
            <Plus className="mr-2 h-4 w-4" />
            Tambah Item Pengeluaran
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
            <TabsTrigger value="active">
              Data Aktif
            </TabsTrigger>
            <TabsTrigger value="deleted">
              Data Terhapus
            </TabsTrigger>
          </TabsList>
        )}
      </Tabs>

      <Card className="rounded-xl">
        <CardContent className="space-y-4 p-4">
          <div className="grid gap-2 md:grid-cols-4">
            <div className="relative md:col-span-2">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />

              <Input
                className="pl-9"
                placeholder="Cari nama, SKU, atau catatan..."
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
                <SelectItem value="all">
                  Semua Kategori
                </SelectItem>

                {categories.map((category) => (
                  <SelectItem
                    key={category.id}
                    value={category.id}
                  >
                    {category.name}
                    {!category.is_active
                      ? " (Nonaktif)"
                      : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={statusFilter}
              onValueChange={(value) => {
                setStatusFilter(value);
                setPage(1);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Semua status" />
              </SelectTrigger>

              <SelectContent>
                <SelectItem value="all">
                  Semua Status
                </SelectItem>
                <SelectItem value="active">
                  Aktif
                </SelectItem>
                <SelectItem value="inactive">
                  Nonaktif
                </SelectItem>
              </SelectContent>
            </Select>
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

          {categoriesQuery.isError || listQuery.isError ? (
            <ExpenseItemErrorState
              onRetry={() => {
                void Promise.all([
                  categoriesQuery.refetch(),
                  listQuery.refetch(),
                ]);
              }}
            />
          ) : (
            <>
              <div className="overflow-auto rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Item Pengeluaran</TableHead>
                      <TableHead>SKU</TableHead>
                      <TableHead>Kategori</TableHead>
                      <TableHead>Satuan</TableHead>
                      <TableHead className="text-right">
                        Harga Default
                      </TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Diperbarui</TableHead>
                      <TableHead className="text-right">
                        Aksi
                      </TableHead>
                    </TableRow>
                  </TableHeader>

                  <TableBody>
                    {listQuery.isLoading ||
                    categoriesQuery.isLoading ? (
                      <ExpenseItemSkeletonRows />
                    ) : listQuery.data?.rows.length ? (
                      listQuery.data.rows.map((item) => {
                        const isBusy =
                          (toggleMutation.isPending &&
                            toggleMutation.variables?.id ===
                              item.id) ||
                          (softDeleteMutation.isPending &&
                            softDeleteMutation.variables
                              ?.expenseItemId === item.id) ||
                          (restoreMutation.isPending &&
                            restoreMutation.variables
                              ?.expenseItemId === item.id) ||
                          (hardDeleteMutation.isPending &&
                            hardDeleteMutation.variables
                              ?.expenseItemId === item.id);

                        return (
                          <TableRow key={item.id}>
                            <TableCell>
                              <div className="font-medium">
                                {item.name}
                              </div>

                              <div
                                className="max-w-[240px] truncate text-xs text-muted-foreground"
                                title={item.notes ?? undefined}
                              >
                                {item.notes || "-"}
                              </div>
                            </TableCell>

                            <TableCell className="font-mono text-xs">
                              {item.sku || "-"}
                            </TableCell>

                            <TableCell>
                              {categoryMap.get(
                                item.expense_category_id,
                              ) ?? "-"}
                            </TableCell>

                            <TableCell>{item.unit}</TableCell>

                            <TableCell className="whitespace-nowrap text-right">
                              {formatRupiah(
                                Number(item.default_price),
                              )}
                            </TableCell>

                            <TableCell>
                              {tab === "active" ? (
                                <div className="flex items-center gap-2">
                                  <Switch
                                    checked={item.is_active}
                                    disabled={isBusy}
                                    onCheckedChange={() =>
                                      toggleMutation.mutate(item)
                                    }
                                  />

                                  <Badge
                                    variant={
                                      item.is_active
                                        ? "default"
                                        : "secondary"
                                    }
                                  >
                                    {item.is_active
                                      ? "Aktif"
                                      : "Nonaktif"}
                                  </Badge>
                                </div>
                              ) : (
                                <Badge variant="destructive">
                                  Terhapus
                                </Badge>
                              )}
                            </TableCell>

                            <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                              {formatDateTime(item.updated_at)}
                            </TableCell>

                            <TableCell className="text-right">
                              <div className="flex justify-end gap-1">
                                {isBusy && (
                                  <Loader2 className="my-auto h-4 w-4 animate-spin" />
                                )}

                                {tab === "active" ? (
                                  <>
                                    <Button
                                      type="button"
                                      size="icon"
                                      variant="ghost"
                                      disabled={isBusy}
                                      onClick={() =>
                                        openEditDialog(item)
                                      }
                                      aria-label="Edit item pengeluaran"
                                    >
                                      <Pencil className="h-4 w-4" />
                                    </Button>

                                    <Button
                                      type="button"
                                      size="icon"
                                      variant="ghost"
                                      className="text-destructive hover:text-destructive"
                                      disabled={isBusy}
                                      onClick={() =>
                                        setDeleteId(item.id)
                                      }
                                      aria-label="Hapus item pengeluaran"
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
                                      disabled={isBusy}
                                      onClick={() =>
                                        restoreMutation.mutate({
                                          expenseItemId: item.id,
                                        })
                                      }
                                      aria-label="Pulihkan item pengeluaran"
                                    >
                                      <RotateCcw className="h-4 w-4" />
                                    </Button>

                                    <Button
                                      type="button"
                                      size="icon"
                                      variant="ghost"
                                      className="text-destructive hover:text-destructive"
                                      disabled={isBusy}
                                      onClick={() => {
                                        setHardDeleteId(item.id);
                                        setHardConfirmText("");
                                      }}
                                      aria-label="Hapus permanen item pengeluaran"
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
                        <TableCell colSpan={8} className="p-0">
                          <EmptyState
                            title={
                              hasActiveFilters
                                ? "Item pengeluaran tidak ditemukan"
                                : tab === "deleted"
                                  ? "Belum ada item pengeluaran terhapus"
                                  : "Belum ada item pengeluaran"
                            }
                            description={
                              hasActiveFilters
                                ? "Tidak ada item pengeluaran yang cocok dengan filter."
                                : tab === "deleted"
                                  ? "Item yang dihapus sementara akan muncul di sini."
                                  : "Tambahkan item pengeluaran pertama melalui tombol di atas."
                            }
                          />
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>

              <div className="flex flex-col gap-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                <span className="text-muted-foreground">
                  Total {listQuery.data?.count ?? 0} item pengeluaran
                </span>

                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={page <= 1 || listQuery.isFetching}
                    onClick={() =>
                      setPage((current) =>
                        Math.max(1, current - 1),
                      )
                    }
                  >
                    Sebelumnya
                  </Button>

                  <span className="whitespace-nowrap">
                    Halaman {page} / {totalPages}
                  </span>

                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={
                      page >= totalPages ||
                      listQuery.isFetching
                    }
                    onClick={() =>
                      setPage((current) =>
                        Math.min(
                          totalPages,
                          current + 1,
                        ),
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
            closeDialog();
          }
        }}
      >
        <DialogContent
          className="max-h-[90vh] overflow-y-auto sm:max-w-2xl"
          onInteractOutside={(event) => {
            if (saveMutation.isPending) {
              event.preventDefault();
            }
          }}
          onEscapeKeyDown={(event) => {
            if (saveMutation.isPending) {
              event.preventDefault();
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>
              {editingItem
                ? "Edit Item Pengeluaran"
                : "Tambah Item Pengeluaran"}
            </DialogTitle>

            <DialogDescription>
              Isi data master item yang akan dipilih pada form
              pengeluaran.
            </DialogDescription>
          </DialogHeader>

          <form
            className="space-y-4"
            onSubmit={form.handleSubmit((values) =>
              saveMutation.mutate({
                values,
                expenseItemId: editingItem?.id ?? null,
              }),
            )}
          >
            <FormField
              label="Nama Item Pengeluaran"
              error={form.formState.errors.name?.message}
            >
              <Input
                placeholder="Contoh: Belanja Bahan Baku Harian"
                disabled={saveMutation.isPending}
                {...form.register("name")}
              />
            </FormField>

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                label="SKU"
                error={form.formState.errors.sku?.message}
              >
                <Input
                  placeholder="Contoh: EXP-BAHAN-BAKU-HARIAN"
                  disabled={saveMutation.isPending}
                  {...form.register("sku")}
                />
              </FormField>

              <FormField
                label="Kategori Pengeluaran"
                error={
                  form.formState.errors
                    .expense_category_id?.message
                }
              >
                <Select
                  value={form.watch(
                    "expense_category_id",
                  )}
                  disabled={saveMutation.isPending}
                  onValueChange={(value) =>
                    form.setValue(
                      "expense_category_id",
                      value,
                      {
                        shouldDirty: true,
                        shouldValidate: true,
                      },
                    )
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih kategori" />
                  </SelectTrigger>

                  <SelectContent>
                    {selectableCategories.map((category) => (
                      <SelectItem
                        key={category.id}
                        value={category.id}
                      >
                        {category.name}
                        {!category.is_active
                          ? " (Nonaktif)"
                          : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                label="Satuan"
                error={form.formState.errors.unit?.message}
              >
                <Input
                  placeholder="Contoh: transaksi, bulan, layanan"
                  disabled={saveMutation.isPending}
                  {...form.register("unit")}
                />
              </FormField>

              <FormField
                label="Harga Default"
                error={
                  form.formState.errors.default_price
                    ?.message
                }
              >
                <CurrencyInput
                  value={form.watch("default_price")}
                  onChange={(value) =>
                    form.setValue(
                      "default_price",
                      value,
                      {
                        shouldDirty: true,
                        shouldValidate: true,
                      },
                    )
                  }
                />

                <p className="text-xs text-muted-foreground">
                  Boleh Rp0. Harga tetap dapat diubah pada setiap
                  transaksi.
                </p>
              </FormField>
            </div>

            <FormField
              label="Catatan"
              error={form.formState.errors.notes?.message}
            >
              <Textarea
                rows={3}
                maxLength={500}
                placeholder="Opsional"
                disabled={saveMutation.isPending}
                {...form.register("notes")}
              />
            </FormField>

            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <Label>Status Aktif</Label>
                <p className="text-xs text-muted-foreground">
                  Item nonaktif tidak dapat dipilih pada transaksi
                  pengeluaran baru.
                </p>
              </div>

              <Switch
                checked={form.watch("is_active")}
                disabled={saveMutation.isPending}
                onCheckedChange={(value) =>
                  form.setValue("is_active", value, {
                    shouldDirty: true,
                  })
                }
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={saveMutation.isPending}
                onClick={closeDialog}
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

                {editingItem
                  ? "Simpan Perubahan"
                  : "Tambah Item Pengeluaran"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={Boolean(deleteId)}
        onOpenChange={(open) => {
          if (!open && !softDeleteMutation.isPending) {
            setDeleteId(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Hapus item pengeluaran?
            </AlertDialogTitle>

            <AlertDialogDescription>
              Item akan dinonaktifkan dan dipindahkan ke{" "}
              <Badge variant="secondary">
                Data Terhapus
              </Badge>
              . Transaksi lama tetap tersimpan.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={softDeleteMutation.isPending}
            >
              Batal
            </AlertDialogCancel>

            <Button
              type="button"
              variant="destructive"
              disabled={softDeleteMutation.isPending}
              onClick={() => {
                if (deleteId) {
                  softDeleteMutation.mutate({
                    expenseItemId: deleteId,
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
        open={Boolean(hardDeleteId)}
        onOpenChange={(open) => {
          if (!open && !hardDeleteMutation.isPending) {
            setHardDeleteId(null);
            setHardConfirmText("");
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Hapus permanen?
            </AlertDialogTitle>

            <AlertDialogDescription>
              Tindakan ini tidak dapat dibatalkan. Item yang masih
              digunakan transaksi tidak dapat dihapus permanen. Ketik{" "}
              <strong>{HARD_DELETE_CONFIRMATION}</strong> untuk
              melanjutkan.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <Input
            value={hardConfirmText}
            disabled={hardDeleteMutation.isPending}
            onChange={(event) =>
              setHardConfirmText(event.target.value)
            }
            placeholder={`Ketik "${HARD_DELETE_CONFIRMATION}"`}
          />

          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={hardDeleteMutation.isPending}
            >
              Batal
            </AlertDialogCancel>

            <Button
              type="button"
              variant="destructive"
              disabled={
                hardConfirmText !==
                  HARD_DELETE_CONFIRMATION ||
                hardDeleteMutation.isPending
              }
              onClick={() => {
                if (hardDeleteId) {
                  hardDeleteMutation.mutate({
                    expenseItemId: hardDeleteId,
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

function createDefaultFormValues(): ExpenseItemFormValues {
  return {
    name: "",
    sku: "",
    expense_category_id: "",
    unit: "unit",
    default_price: 0,
    notes: "",
    is_active: true,
  };
}

function FormField({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
      {error && (
        <p className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

function ExpenseItemSkeletonRows() {
  return (
    <>
      {Array.from({ length: 5 }).map((_, index) => (
        <TableRow key={index}>
          <TableCell colSpan={8}>
            <Skeleton className="h-8 w-full" />
          </TableCell>
        </TableRow>
      ))}
    </>
  );
}

function ExpenseItemErrorState({
  onRetry,
}: {
  onRetry: () => void;
}) {
  return (
    <Alert variant="destructive">
      <AlertCircle className="h-4 w-4" />
      <AlertTitle>
        Data item pengeluaran gagal dimuat
      </AlertTitle>

      <AlertDescription>
        <p>
          Periksa koneksi Supabase serta policy RLS item dan
          kategori pengeluaran.
        </p>

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

function ExpenseItemAccessDenied() {
  return (
    <div>
      <PageHeader
        title="Master Item Pengeluaran"
        description="Kelola master item pengeluaran."
      />

      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Akses ditolak</AlertTitle>
        <AlertDescription>
          Anda tidak memiliki izin mengakses master item
          pengeluaran.
        </AlertDescription>
      </Alert>
    </div>
  );
}

function ensureAccess(
  userId: string | undefined,
  allowed: boolean,
) {
  if (!userId) {
    throw new Error(
      "Sesi pengguna tidak ditemukan. Silakan login kembali.",
    );
  }

  if (!allowed) {
    throw new Error(
      "Anda tidak memiliki izin mengelola item pengeluaran.",
    );
  }
}

function ensureSuperAdmin(
  userId: string | undefined,
  allowed: boolean,
) {
  if (!userId) {
    throw new Error(
      "Sesi pengguna tidak ditemukan. Silakan login kembali.",
    );
  }

  if (!allowed) {
    throw new Error(
      "Hanya Super Admin yang dapat melakukan tindakan ini.",
    );
  }
}

function sanitizeSearchTerm(value: string) {
  return value
    .replaceAll(",", " ")
    .replaceAll("(", " ")
    .replaceAll(")", " ")
    .replaceAll("%", "")
    .replaceAll("*", "")
    .trim();
}

function getErrorMessage(error: unknown): string {
  if (typeof error === "object" && error !== null) {
    const databaseError = error as DatabaseError;

    if (databaseError.code === "23505") {
      return "Nama item pada kategori tersebut atau SKU sudah digunakan.";
    }

    if (databaseError.code === "23503") {
      return "Kategori atau pengguna audit tidak ditemukan, atau item masih digunakan oleh transaksi pengeluaran.";
    }

    if (databaseError.code === "23514") {
      return "Data item pengeluaran tidak memenuhi aturan validasi database.";
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
