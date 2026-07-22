import { useMemo, useState } from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  AlertCircle,
  Loader2,
  Pencil,
  Plus,
  Search,
} from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { formatDateTime } from "@/lib/format";

import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";

type CategoryTable =
  | "sales_categories"
  | "expense_categories";

interface CategoryManagerProps {
  table: CategoryTable;
  title: string;
}

interface CategoryRow {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

const categorySchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Nama kategori minimal 2 karakter.")
    .max(60, "Nama kategori maksimal 60 karakter."),

  description: z
    .string()
    .trim()
    .max(200, "Deskripsi maksimal 200 karakter.")
    .optional(),

  is_active: z.boolean(),
});

type CategoryFormValues = z.infer<typeof categorySchema>;

interface SaveCategoryVariables {
  values: CategoryFormValues;
  categoryId: string | null;
}

export function CategoryManager({
  table,
  title,
}: CategoryManagerProps) {
  const {
    user,
    isSuperAdmin,
    loading: authLoading,
  } = useAuth();

  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] =
    useState<CategoryRow | null>(null);

  const normalizedSearch = search.trim();

  const manageQueryKey = useMemo(
    () => [table, "manage", normalizedSearch, isSuperAdmin],
    [table, normalizedSearch, isSuperAdmin],
  );

  const allCategoriesQueryKey = useMemo(
    () => [table, "all"],
    [table],
  );

  const form = useForm<CategoryFormValues>({
    resolver: zodResolver(categorySchema),
    defaultValues: {
      name: "",
      description: "",
      is_active: true,
    },
  });

  const listQuery = useQuery({
    queryKey: manageQueryKey,

    enabled: !authLoading,

    queryFn: async (): Promise<CategoryRow[]> => {
      let query = supabase
        .from(table)
        .select(
          `
          id,
          name,
          description,
          is_active,
          created_at,
          updated_at,
          created_by,
          updated_by
          `,
        )
        .order("name", {
          ascending: true,
        });

      /*
       * Admin biasa hanya perlu melihat kategori aktif.
       * Super Admin melihat seluruh kategori agar dapat mengaktifkan
       * kembali kategori yang sudah dinonaktifkan.
       */
      if (!isSuperAdmin) {
        query = query.eq("is_active", true);
      }

      if (normalizedSearch) {
        query = query.ilike(
          "name",
          `%${normalizedSearch}%`,
        );
      }

      const { data, error } = await query;

      if (error) {
        console.error(
          `[CategoryManager:${table}] Gagal memuat kategori:`,
          error,
        );

        throw error;
      }

      return (data ?? []) as CategoryRow[];
    },
  });

  const invalidateCategoryQueries = async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: [table, "manage"],
      }),

      queryClient.invalidateQueries({
        queryKey: allCategoriesQueryKey,
      }),
    ]);
  };

  const closeDialog = () => {
    if (saveMutation.isPending) {
      return;
    }

    setDialogOpen(false);
    setEditingCategory(null);

    form.reset({
      name: "",
      description: "",
      is_active: true,
    });
  };

  const openCreateDialog = () => {
    if (!isSuperAdmin) {
      toast.error(
        "Hanya Super Admin yang dapat menambah kategori.",
      );
      return;
    }

    setEditingCategory(null);

    form.reset({
      name: "",
      description: "",
      is_active: true,
    });

    setDialogOpen(true);
  };

  const openEditDialog = (category: CategoryRow) => {
    if (!isSuperAdmin) {
      toast.error(
        "Hanya Super Admin yang dapat mengubah kategori.",
      );
      return;
    }

    setEditingCategory(category);

    form.reset({
      name: category.name,
      description: category.description ?? "",
      is_active: category.is_active,
    });

    setDialogOpen(true);
  };

  const saveMutation = useMutation({
    mutationFn: async ({
      values,
      categoryId,
    }: SaveCategoryVariables) => {
      if (!isSuperAdmin) {
        throw new Error(
          "Anda tidak memiliki izin untuk mengelola kategori.",
        );
      }

      if (!user) {
        throw new Error(
          "Sesi pengguna tidak ditemukan. Silakan login kembali.",
        );
      }

      const payload = {
        name: values.name.trim(),
        description:
          values.description?.trim() || null,
        is_active: values.is_active,
        updated_by: user.id,
      };

      if (categoryId) {
        const { data, error } = await supabase
          .from(table)
          .update(payload)
          .eq("id", categoryId)
          .select(
            `
            id,
            name,
            description,
            is_active,
            created_at,
            updated_at,
            created_by,
            updated_by
            `,
          )
          .single();

        if (error) {
          throw error;
        }

        if (!data) {
          throw new Error(
            "Kategori tidak ditemukan atau tidak dapat diperbarui.",
          );
        }

        return {
          mode: "update" as const,
          category: data as CategoryRow,
        };
      }

      const { data, error } = await supabase
        .from(table)
        .insert({
          ...payload,
          created_by: user.id,
        })
        .select(
          `
          id,
          name,
          description,
          is_active,
          created_at,
          updated_at,
          created_by,
          updated_by
          `,
        )
        .single();

      if (error) {
        throw error;
      }

      if (!data) {
        throw new Error(
          "Kategori gagal dibuat atau tidak dapat dibaca.",
        );
      }

      return {
        mode: "create" as const,
        category: data as CategoryRow,
      };
    },

    onSuccess: async (result) => {
      await invalidateCategoryQueries();

      toast.success(
        result.mode === "update"
          ? "Kategori berhasil diperbarui."
          : "Kategori berhasil ditambahkan.",
      );

      setDialogOpen(false);
      setEditingCategory(null);

      form.reset({
        name: "",
        description: "",
        is_active: true,
      });
    },

    onError: (error: unknown) => {
      console.error(
        `[CategoryManager:${table}] Gagal menyimpan kategori:`,
        error,
      );

      toast.error("Gagal menyimpan kategori.", {
        description: getCategoryErrorMessage(error),
      });
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async (category: CategoryRow) => {
      if (!isSuperAdmin) {
        throw new Error(
          "Hanya Super Admin yang dapat mengubah status kategori.",
        );
      }

      if (!user) {
        throw new Error(
          "Sesi pengguna tidak ditemukan. Silakan login kembali.",
        );
      }

      const newStatus = !category.is_active;

      const { data, error } = await supabase
        .from(table)
        .update({
          is_active: newStatus,
          updated_by: user.id,
        })
        .eq("id", category.id)
        .select("id, name, is_active")
        .single();

      if (error) {
        throw error;
      }

      if (!data) {
        throw new Error(
          "Kategori tidak ditemukan atau status gagal diperbarui.",
        );
      }

      return {
        categoryName: category.name,
        isActive: newStatus,
      };
    },

    onSuccess: async (result) => {
      await invalidateCategoryQueries();

      toast.success(
        result.isActive
          ? "Kategori berhasil diaktifkan."
          : "Kategori berhasil dinonaktifkan.",
        {
          description: result.categoryName,
        },
      );
    },

    onError: (error: unknown) => {
      console.error(
        `[CategoryManager:${table}] Gagal mengubah status kategori:`,
        error,
      );

      toast.error("Gagal memperbarui status kategori.", {
        description: getCategoryErrorMessage(error),
      });
    },
  });

  const handleSubmit = (
    values: CategoryFormValues,
  ) => {
    saveMutation.mutate({
      values,
      categoryId: editingCategory?.id ?? null,
    });
  };

  const handleDialogOpenChange = (open: boolean) => {
    if (open) {
      setDialogOpen(true);
      return;
    }

    closeDialog();
  };

  const isInitialLoading =
    authLoading || listQuery.isLoading;

  return (
    <div>
      <PageHeader
        title={title}
        description={
          isSuperAdmin
            ? "Kelola kategori sebagai master data. Nonaktifkan kategori yang sudah tidak digunakan."
            : "Lihat daftar kategori aktif yang tersedia untuk transaksi."
        }
        actions={
          isSuperAdmin ? (
            <Button onClick={openCreateDialog}>
              <Plus className="mr-2 h-4 w-4" />
              Tambah Kategori
            </Button>
          ) : undefined
        }
      />

      <Card className="rounded-xl">
        <CardContent className="space-y-4 p-4">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />

            <Input
              className="pl-9"
              placeholder="Cari nama kategori..."
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
              }}
            />
          </div>

          {listQuery.isError ? (
            <CategoryErrorState
              onRetry={() => {
                void listQuery.refetch();
              }}
            />
          ) : (
            <div className="overflow-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nama</TableHead>
                    <TableHead>Deskripsi</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Dibuat</TableHead>
                    <TableHead>Diperbarui</TableHead>

                    {isSuperAdmin && (
                      <TableHead className="text-right">
                        Aksi
                      </TableHead>
                    )}
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {isInitialLoading ? (
                    <CategoryTableSkeleton
                      columnCount={
                        isSuperAdmin ? 6 : 5
                      }
                    />
                  ) : listQuery.data?.length ? (
                    listQuery.data.map((category) => {
                      const isUpdatingStatus =
                        toggleActiveMutation.isPending &&
                        toggleActiveMutation.variables?.id ===
                          category.id;

                      return (
                        <TableRow key={category.id}>
                          <TableCell className="font-medium">
                            {category.name}
                          </TableCell>

                          <TableCell
                            className="max-w-[280px] truncate text-muted-foreground"
                            title={
                              category.description ?? undefined
                            }
                          >
                            {category.description || "-"}
                          </TableCell>

                          <TableCell>
                            {category.is_active ? (
                              <Badge className="bg-success/20 text-success hover:bg-success/20">
                                Aktif
                              </Badge>
                            ) : (
                              <Badge variant="secondary">
                                Nonaktif
                              </Badge>
                            )}
                          </TableCell>

                          <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                            {formatDateTime(
                              category.created_at,
                            )}
                          </TableCell>

                          <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                            {formatDateTime(
                              category.updated_at,
                            )}
                          </TableCell>

                          {isSuperAdmin && (
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-2">
                                {isUpdatingStatus && (
                                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                                )}

                                <Switch
                                  checked={
                                    category.is_active
                                  }
                                  disabled={
                                    toggleActiveMutation.isPending ||
                                    saveMutation.isPending
                                  }
                                  onCheckedChange={() => {
                                    toggleActiveMutation.mutate(
                                      category,
                                    );
                                  }}
                                  aria-label={`Ubah status kategori ${category.name}`}
                                />

                                <Button
                                  type="button"
                                  size="icon"
                                  variant="ghost"
                                  disabled={
                                    toggleActiveMutation.isPending ||
                                    saveMutation.isPending
                                  }
                                  onClick={() => {
                                    openEditDialog(category);
                                  }}
                                  aria-label={`Edit kategori ${category.name}`}
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                              </div>
                            </TableCell>
                          )}
                        </TableRow>
                      );
                    })
                  ) : (
                    <TableRow>
                      <TableCell
                        colSpan={isSuperAdmin ? 6 : 5}
                        className="p-0"
                      >
                        <EmptyState
                          title={
                            normalizedSearch
                              ? "Kategori tidak ditemukan"
                              : "Belum ada kategori"
                          }
                          description={
                            normalizedSearch
                              ? `Tidak ada kategori yang cocok dengan pencarian “${normalizedSearch}”.`
                              : isSuperAdmin
                                ? "Tambahkan kategori pertama untuk mulai mengelola master data."
                                : "Belum ada kategori aktif yang tersedia."
                          }
                        />
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={dialogOpen}
        onOpenChange={handleDialogOpenChange}
      >
        <DialogContent
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
              {editingCategory
                ? "Edit Kategori"
                : "Tambah Kategori"}
            </DialogTitle>
          </DialogHeader>

          <form
            className="space-y-4"
            onSubmit={form.handleSubmit(handleSubmit)}
          >
            <div className="space-y-2">
              <Label htmlFor={`${table}-category-name`}>
                Nama Kategori
              </Label>

              <Input
                id={`${table}-category-name`}
                autoComplete="off"
                placeholder="Masukkan nama kategori"
                disabled={saveMutation.isPending}
                {...form.register("name")}
              />

              {form.formState.errors.name && (
                <p className="text-xs text-destructive">
                  {form.formState.errors.name.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label
                htmlFor={`${table}-category-description`}
              >
                Deskripsi
              </Label>

              <Textarea
                id={`${table}-category-description`}
                rows={3}
                placeholder="Masukkan deskripsi kategori (opsional)"
                disabled={saveMutation.isPending}
                {...form.register("description")}
              />

              <div className="flex justify-between gap-4">
                <div>
                  {form.formState.errors.description && (
                    <p className="text-xs text-destructive">
                      {
                        form.formState.errors.description
                          .message
                      }
                    </p>
                  )}
                </div>

                <p className="text-xs text-muted-foreground">
                  {(form.watch("description") ?? "").length}
                  /200
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
              <div>
                <Label
                  htmlFor={`${table}-category-status`}
                >
                  Status Aktif
                </Label>

                <p className="mt-1 text-xs text-muted-foreground">
                  Kategori nonaktif tidak akan muncul saat
                  membuat transaksi baru.
                </p>
              </div>

              <Switch
                id={`${table}-category-status`}
                checked={form.watch("is_active")}
                disabled={saveMutation.isPending}
                onCheckedChange={(checked) => {
                  form.setValue("is_active", checked, {
                    shouldDirty: true,
                    shouldValidate: true,
                  });
                }}
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
                disabled={saveMutation.isPending}
              >
                {saveMutation.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}

                {editingCategory
                  ? "Simpan Perubahan"
                  : "Tambah Kategori"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CategoryTableSkeleton({
  columnCount,
}: {
  columnCount: number;
}) {
  return (
    <>
      {Array.from({ length: 4 }).map((_, index) => (
        <TableRow key={index}>
          <TableCell colSpan={columnCount}>
            <Skeleton className="h-8 w-full" />
          </TableCell>
        </TableRow>
      ))}
    </>
  );
}

function CategoryErrorState({
  onRetry,
}: {
  onRetry: () => void;
}) {
  return (
    <Alert variant="destructive">
      <AlertCircle className="h-4 w-4" />

      <AlertTitle>Data kategori gagal dimuat</AlertTitle>

      <AlertDescription>
        <p>
          Periksa koneksi Supabase dan policy RLS tabel
          kategori.
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

function getCategoryErrorMessage(
  error: unknown,
): string {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error
  ) {
    const databaseError = error as {
      code?: string;
      message?: string;
      details?: string;
    };

    if (databaseError.code === "23505") {
      return "Nama kategori tersebut sudah digunakan.";
    }

    if (databaseError.code === "42501") {
      return "Anda tidak memiliki izin untuk melakukan perubahan ini.";
    }

    return (
      databaseError.message ||
      databaseError.details ||
      "Terjadi kesalahan pada database."
    );
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Terjadi kesalahan yang tidak diketahui.";
}