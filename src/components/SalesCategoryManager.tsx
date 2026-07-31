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
  Loader2,
  Pencil,
  Plus,
  Search,
} from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import type {
  Tables,
  TablesInsert,
  TablesUpdate,
} from "@/integrations/supabase/types";

import { useAuth } from "@/hooks/useAuth";
import { useBusinessStructure } from "@/hooks/useBusinessStructure";

import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
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

type CategoryRow =
  Tables<"sales_categories">;

const schema = z.object({
  subunit_id: z
    .string()
    .uuid(
      "Subunit wajib dipilih.",
    ),

  name: z
    .string()
    .trim()
    .min(
      2,
      "Nama kategori minimal 2 karakter.",
    )
    .max(
      60,
      "Nama kategori maksimal 60 karakter.",
    ),

  description: z
    .string()
    .trim()
    .max(
      200,
      "Deskripsi maksimal 200 karakter.",
    )
    .optional(),

  is_active: z.boolean(),
});

type FormValues =
  z.infer<typeof schema>;

interface SaveVariables {
  values: FormValues;
  categoryId: string | null;
}

export function SalesCategoryManager() {
  const {
    user,
    isAdmin,
    loading: authLoading,
  } = useAuth();

  const queryClient =
    useQueryClient();

  const {
    activeSubunits,
    isLoading:
      structureLoading,
    error:
      structureError,
  } = useBusinessStructure();

  const canManage = isAdmin;

  const [search, setSearch] =
    useState("");

  const [
    subunitFilter,
    setSubunitFilter,
  ] = useState("all");

  const [
    statusFilter,
    setStatusFilter,
  ] = useState("all");

  const [
    dialogOpen,
    setDialogOpen,
  ] = useState(false);

  const [
    editing,
    setEditing,
  ] = useState<CategoryRow | null>(
    null,
  );

  const form =
    useForm<FormValues>({
      resolver:
        zodResolver(schema),

      defaultValues: {
        subunit_id: "",
        name: "",
        description: "",
        is_active: true,
      },
    });

  const categoriesQuery =
    useQuery({
      queryKey: [
        "sales-categories",
        "manage",
      ],

      enabled:
        !authLoading &&
        canManage,

      queryFn: async (): Promise<
        CategoryRow[]
      > => {
        const {
          data,
          error,
        } = await supabase
          .from(
            "sales_categories",
          )
          .select("*")
          .order("name", {
            ascending: true,
          });

        if (error) {
          throw error;
        }

        return data ?? [];
      },
    });

  const subunitMap =
    useMemo(
      () =>
        new Map(
          activeSubunits.map(
            (row) => [
              row.id,
              row.name,
            ],
          ),
        ),
      [activeSubunits],
    );

  const normalizedSearch =
    search
      .trim()
      .toLocaleLowerCase(
        "id-ID",
      );

  const rows = useMemo(
    () =>
      (
        categoriesQuery.data ??
        []
      ).filter((row) => {
        if (
          subunitFilter !==
            "all" &&
          row.subunit_id !==
            subunitFilter
        ) {
          return false;
        }

        if (
          statusFilter ===
            "active" &&
          !row.is_active
        ) {
          return false;
        }

        if (
          statusFilter ===
            "inactive" &&
          row.is_active
        ) {
          return false;
        }

        if (
          !normalizedSearch
        ) {
          return true;
        }

        return [
          row.name,
          row.description ?? "",
          subunitMap.get(
            row.subunit_id,
          ) ?? "",
        ]
          .join(" ")
          .toLocaleLowerCase(
            "id-ID",
          )
          .includes(
            normalizedSearch,
          );
      }),
    [
      categoriesQuery.data,
      normalizedSearch,
      statusFilter,
      subunitFilter,
      subunitMap,
    ],
  );

  const invalidate =
    async () => {
      await Promise.all([
        queryClient.invalidateQueries(
          {
            queryKey: [
              "sales-categories",
            ],
          },
        ),

        queryClient.invalidateQueries(
          {
            queryKey: [
              "sales_categories",
            ],
          },
        ),
      ]);
    };

  const saveMutation =
    useMutation({
      mutationFn: async ({
        values,
        categoryId,
      }: SaveVariables) => {
        if (
          !user ||
          !canManage
        ) {
          throw new Error(
            "Anda tidak memiliki izin mengelola kategori penjualan.",
          );
        }

        if (categoryId) {
          const payload: TablesUpdate<"sales_categories"> =
            {
              name: values.name.trim(),

              description:
                values.description?.trim() ||
                null,

              is_active:
                values.is_active,

              updated_by:
                user.id,
            };

          const {
            data,
            error,
          } = await supabase
            .from(
              "sales_categories",
            )
            .update(payload)
            .eq(
              "id",
              categoryId,
            )
            .select("id")
            .maybeSingle();

          if (error) {
            throw error;
          }

          if (!data) {
            throw new Error(
              "Kategori tidak ditemukan.",
            );
          }

          return "update" as const;
        }

        const payload: TablesInsert<"sales_categories"> =
          {
            subunit_id:
              values.subunit_id,

            name:
              values.name.trim(),

            description:
              values.description?.trim() ||
              null,

            is_active:
              values.is_active,

            created_by:
              user.id,

            updated_by:
              user.id,
          };

        const {
          data,
          error,
        } = await supabase
          .from(
            "sales_categories",
          )
          .insert(payload)
          .select("id")
          .single();

        if (error) {
          throw error;
        }

        if (!data) {
          throw new Error(
            "Kategori gagal ditambahkan.",
          );
        }

        return "create" as const;
      },

      onSuccess:
        async (mode) => {
          await invalidate();

          toast.success(
            mode === "create"
              ? "Kategori berhasil ditambahkan."
              : "Kategori berhasil diperbarui.",
          );

          closeDialog();
        },

      onError: (
        error: unknown,
      ) => {
        toast.error(
          "Gagal menyimpan kategori.",
          {
            description:
              getErrorMessage(
                error,
              ),
          },
        );
      },
    });

  const toggleMutation =
    useMutation({
      mutationFn: async (
        row: CategoryRow,
      ) => {
        if (
          !user ||
          !canManage
        ) {
          throw new Error(
            "Anda tidak memiliki izin mengubah kategori.",
          );
        }

        const {
          data,
          error,
        } = await supabase
          .from(
            "sales_categories",
          )
          .update({
            is_active:
              !row.is_active,
            updated_by:
              user.id,
          })
          .eq("id", row.id)
          .select("id")
          .maybeSingle();

        if (error) {
          throw error;
        }

        if (!data) {
          throw new Error(
            "Kategori tidak ditemukan.",
          );
        }
      },

      onSuccess:
        async () => {
          await invalidate();

          toast.success(
            "Status kategori berhasil diperbarui.",
          );
        },

      onError: (
        error: unknown,
      ) => {
        toast.error(
          "Gagal memperbarui status kategori.",
          {
            description:
              getErrorMessage(
                error,
              ),
          },
        );
      },
    });

  const openCreate =
    () => {
      setEditing(null);

      form.reset({
        subunit_id: "",
        name: "",
        description: "",
        is_active: true,
      });

      setDialogOpen(true);
    };

  const openEdit = (
    row: CategoryRow,
  ) => {
    setEditing(row);

    form.reset({
      subunit_id:
        row.subunit_id,

      name: row.name,

      description:
        row.description ?? "",

      is_active:
        row.is_active,
    });

    setDialogOpen(true);
  };

  const closeDialog =
    () => {
      if (
        saveMutation.isPending
      ) {
        return;
      }

      setDialogOpen(false);
      setEditing(null);
    };

  if (
    !authLoading &&
    !canManage
  ) {
    return (
      <div>
        <PageHeader
          title="Kategori Penjualan"
          description="Kelola kategori produk berdasarkan Subunit Bisnis."
        />

        <EmptyState
          title="Akses tidak tersedia"
          description="Anda tidak memiliki izin mengelola kategori penjualan."
        />
      </div>
    );
  }

  const loading =
    authLoading ||
    structureLoading ||
    categoriesQuery.isLoading;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Kategori Penjualan"
        description="Setiap kategori hanya dimiliki oleh satu Subunit Bisnis."
        actions={
          <Button
            onClick={openCreate}
            disabled={
              loading ||
              activeSubunits.length ===
                0
            }
          >
            <Plus className="mr-2 h-4 w-4" />
            Tambah Kategori
          </Button>
        }
      />

      {structureError ||
      categoriesQuery.error ? (
        <EmptyState
          title="Kategori belum dapat dimuat"
          description={getErrorMessage(
            structureError ??
              categoriesQuery.error,
          )}
        />
      ) : (
        <>
          <Card>
            <CardContent className="grid gap-3 p-4 md:grid-cols-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />

                <Input
                  className="pl-9"
                  placeholder="Cari kategori..."
                  value={search}
                  onChange={(
                    event,
                  ) =>
                    setSearch(
                      event
                        .target
                        .value,
                    )
                  }
                />
              </div>

              <Select
                value={
                  subunitFilter
                }
                onValueChange={
                  setSubunitFilter
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Semua Subunit" />
                </SelectTrigger>

                <SelectContent>
                  <SelectItem value="all">
                    Semua Subunit
                  </SelectItem>

                  {activeSubunits.map(
                    (subunit) => (
                      <SelectItem
                        key={
                          subunit.id
                        }
                        value={
                          subunit.id
                        }
                      >
                        {
                          subunit.name
                        }
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>

              <Select
                value={
                  statusFilter
                }
                onValueChange={
                  setStatusFilter
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Semua Status" />
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
            </CardContent>
          </Card>

          {loading ? (
            <div className="flex min-h-48 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : rows.length ===
            0 ? (
            <EmptyState
              title="Belum ada kategori"
              description={
                subunitFilter ===
                "all"
                  ? "Tambahkan kategori produk untuk mulai mengelompokkan produk."
                  : `Belum ada kategori pada Subunit ${
                      subunitMap.get(
                        subunitFilter,
                      ) ??
                      "yang dipilih"
                    }.`
              }
            />
          ) : (
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>
                        Kategori
                      </TableHead>

                      <TableHead>
                        Subunit
                      </TableHead>

                      <TableHead>
                        Status
                      </TableHead>

                      <TableHead className="text-right">
                        Aksi
                      </TableHead>
                    </TableRow>
                  </TableHeader>

                  <TableBody>
                    {rows.map(
                      (row) => (
                        <TableRow
                          key={
                            row.id
                          }
                        >
                          <TableCell>
                            <div>
                              <p className="font-medium">
                                {
                                  row.name
                                }
                              </p>

                              {row.description ? (
                                <p className="text-sm text-muted-foreground">
                                  {
                                    row.description
                                  }
                                </p>
                              ) : null}
                            </div>
                          </TableCell>

                          <TableCell>
                            {subunitMap.get(
                              row.subunit_id,
                            ) ??
                              "Tidak tersedia"}
                          </TableCell>

                          <TableCell>
                            <Badge
                              variant={
                                row.is_active
                                  ? "default"
                                  : "secondary"
                              }
                            >
                              {row.is_active
                                ? "Aktif"
                                : "Nonaktif"}
                            </Badge>
                          </TableCell>

                          <TableCell>
                            <div className="flex justify-end gap-2">
                              <Button
                                size="icon"
                                variant="outline"
                                onClick={() =>
                                  openEdit(
                                    row,
                                  )
                                }
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>

                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  toggleMutation.mutate(
                                    row,
                                  )
                                }
                              >
                                {row.is_active
                                  ? "Nonaktifkan"
                                  : "Aktifkan"}
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ),
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </>
      )}

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            closeDialog();
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editing
                ? "Edit Kategori"
                : "Tambah Kategori"}
            </DialogTitle>

            <DialogDescription>
              Kategori penjualan
              harus dimiliki oleh
              satu Subunit Bisnis.
            </DialogDescription>
          </DialogHeader>

          <form
            className="space-y-4"
            onSubmit={form.handleSubmit(
              (values) =>
                saveMutation.mutate({
                  values,
                  categoryId:
                    editing?.id ??
                    null,
                }),
            )}
          >
            <div className="space-y-2">
              <Label>
                Subunit
              </Label>

              <Select
                disabled={
                  Boolean(editing)
                }
                value={form.watch(
                  "subunit_id",
                )}
                onValueChange={(
                  value,
                ) =>
                  form.setValue(
                    "subunit_id",
                    value,
                    {
                      shouldValidate:
                        true,
                      shouldDirty:
                        true,
                    },
                  )
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Pilih Subunit" />
                </SelectTrigger>

                <SelectContent>
                  {activeSubunits.map(
                    (subunit) => (
                      <SelectItem
                        key={
                          subunit.id
                        }
                        value={
                          subunit.id
                        }
                      >
                        {
                          subunit.name
                        }
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>

              {editing ? (
                <p className="text-xs text-muted-foreground">
                  Subunit kategori
                  tidak diubah melalui
                  form edit.
                </p>
              ) : null}

              {form.formState.errors
                .subunit_id ? (
                <p className="text-sm text-destructive">
                  {
                    form.formState
                      .errors
                      .subunit_id
                      .message
                  }
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label>
                Nama Kategori
              </Label>

              <Input
                {...form.register(
                  "name",
                )}
              />
            </div>

            <div className="space-y-2">
              <Label>
                Deskripsi
              </Label>

              <Textarea
                {...form.register(
                  "description",
                )}
              />
            </div>

            <div className="flex items-center justify-between rounded-lg border p-3">
              <Label>
                Aktif
              </Label>

              <Switch
                checked={form.watch(
                  "is_active",
                )}
                onCheckedChange={(
                  checked,
                ) =>
                  form.setValue(
                    "is_active",
                    checked,
                  )
                }
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={closeDialog}
              >
                Batal
              </Button>

              <Button
                type="submit"
                disabled={
                  saveMutation.isPending
                }
              >
                {saveMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}

                Simpan
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function getErrorMessage(
  error: unknown,
): string {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string })
      .code === "23505"
  ) {
    return "Kategori dengan nama tersebut sudah tersedia pada Subunit yang dipilih.";
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Terjadi kesalahan saat memproses kategori.";
}