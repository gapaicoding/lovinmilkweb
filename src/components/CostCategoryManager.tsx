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
  Archive,
  Loader2,
  Pencil,
  Plus,
  RotateCcw,
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

type CostCategoryRow =
  Tables<"cost_categories">;

const schema = z
  .object({
    name: z
      .string()
      .trim()
      .min(
        2,
        "Nama kategori minimal 2 karakter.",
      )
      .max(
        100,
        "Nama kategori maksimal 100 karakter.",
      ),

    scope: z.enum([
      "outlet",
      "subunit",
    ]),

    subunit_id:
      z.string().optional(),

    description:
      z
        .string()
        .trim()
        .max(
          500,
          "Deskripsi maksimal 500 karakter.",
        )
        .optional(),

    is_active:
      z.boolean(),
  })
  .superRefine(
    (values, context) => {
      if (
        values.scope ===
          "subunit" &&
        !values.subunit_id
      ) {
        context.addIssue({
          code:
            z.ZodIssueCode
              .custom,
          path: [
            "subunit_id",
          ],
          message:
            "Subunit wajib dipilih untuk kategori biaya Subunit.",
        });
      }
    },
  );

type FormValues =
  z.infer<typeof schema>;

interface SaveVariables {
  values: FormValues;
  categoryId: string | null;
}

export function CostCategoryManager() {
  const {
    user,
    isAdmin,
    loading: authLoading,
  } = useAuth();

  const canManage = isAdmin;

  const queryClient =
    useQueryClient();

  const {
    outlet,
    activeSubunits,
    isLoading:
      structureLoading,
    error:
      structureError,
  } = useBusinessStructure();

  const [search, setSearch] =
    useState("");

  const [
    scopeFilter,
    setScopeFilter,
  ] = useState("all");

  const [
    subunitFilter,
    setSubunitFilter,
  ] = useState("all");

  const [
    includeArchived,
    setIncludeArchived,
  ] = useState(false);

  const [
    dialogOpen,
    setDialogOpen,
  ] = useState(false);

  const [
    editing,
    setEditing,
  ] =
    useState<CostCategoryRow | null>(
      null,
    );

  const form =
    useForm<FormValues>({
      resolver:
        zodResolver(schema),

      defaultValues: {
        name: "",
        scope: "subunit",
        subunit_id: "",
        description: "",
        is_active: true,
      },
    });

  const listQuery =
    useQuery({
      queryKey: [
        "cost-categories",
        outlet?.id,
      ],

      enabled:
        !authLoading &&
        canManage &&
        Boolean(outlet?.id),

      queryFn: async (): Promise<
        CostCategoryRow[]
      > => {
        if (!outlet) {
          return [];
        }

        const {
          data,
          error,
        } = await supabase
          .from(
            "cost_categories",
          )
          .select("*")
          .eq(
            "outlet_id",
            outlet.id,
          )
          .order("name");

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

  const rows =
    useMemo(
      () =>
        (
          listQuery.data ?? []
        ).filter((row) => {
          if (
            !includeArchived &&
            row.deleted_at
          ) {
            return false;
          }

          if (
            scopeFilter !==
              "all" &&
            row.scope !==
              scopeFilter
          ) {
            return false;
          }

          if (
            subunitFilter !==
              "all" &&
            row.subunit_id !==
              subunitFilter
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
            row.scope,
            row.subunit_id
              ? subunitMap.get(
                  row.subunit_id,
                ) ?? ""
              : "Outlet",
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
        includeArchived,
        listQuery.data,
        normalizedSearch,
        scopeFilter,
        subunitFilter,
        subunitMap,
      ],
    );

  const invalidate =
    async () => {
      await queryClient.invalidateQueries(
        {
          queryKey: [
            "cost-categories",
          ],
        },
      );
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
            "Anda tidak memiliki izin mengelola kategori biaya.",
          );
        }

        if (!outlet) {
          throw new Error(
            "Outlet aktif tidak tersedia.",
          );
        }

        const subunitId =
          values.scope ===
          "subunit"
            ? values.subunit_id ||
              null
            : null;

        const payload = {
          outlet_id:
            outlet.id,

          subunit_id:
            subunitId,

          scope:
            values.scope,

          name:
            values.name.trim(),

          description:
            values.description?.trim() ||
            null,

          is_active:
            values.is_active,

          updated_by:
            user.id,
        };

        if (categoryId) {
          const {
            data,
            error,
          } = await supabase
            .from(
              "cost_categories",
            )
            .update(
              payload as TablesUpdate<"cost_categories">,
            )
            .eq(
              "id",
              categoryId,
            )
            .is(
              "deleted_at",
              null,
            )
            .select("id")
            .maybeSingle();

          if (error) {
            throw error;
          }

          if (!data) {
            throw new Error(
              "Kategori biaya tidak ditemukan.",
            );
          }

          return "update" as const;
        }

        const {
          data,
          error,
        } = await supabase
          .from(
            "cost_categories",
          )
          .insert({
            ...payload,
            created_by:
              user.id,
          } as TablesInsert<"cost_categories">)
          .select("id")
          .single();

        if (error) {
          throw error;
        }

        if (!data) {
          throw new Error(
            "Kategori biaya gagal dibuat.",
          );
        }

        return "create" as const;
      },

      onSuccess:
        async (mode) => {
          await invalidate();

          toast.success(
            mode === "create"
              ? "Kategori biaya berhasil ditambahkan."
              : "Kategori biaya berhasil diperbarui.",
          );

          closeDialog();
        },

      onError: (
        error: unknown,
      ) => {
        toast.error(
          "Gagal menyimpan kategori biaya.",
          {
            description:
              getErrorMessage(
                error,
              ),
          },
        );
      },
    });

  const archiveMutation =
    useMutation({
      mutationFn: async (
        row: CostCategoryRow,
      ) => {
        if (
          !user ||
          !canManage
        ) {
          throw new Error(
            "Anda tidak memiliki izin mengarsipkan kategori.",
          );
        }

        const {
          data,
          error,
        } = await supabase
          .from(
            "cost_categories",
          )
          .update({
            is_active: false,

            deleted_at:
              new Date().toISOString(),

            deleted_by:
              user.id,

            updated_by:
              user.id,
          })
          .eq("id", row.id)
          .is(
            "deleted_at",
            null,
          )
          .select("id")
          .maybeSingle();

        if (error) {
          throw error;
        }

        if (!data) {
          throw new Error(
            "Kategori biaya tidak ditemukan.",
          );
        }
      },

      onSuccess:
        async () => {
          await invalidate();

          toast.success(
            "Kategori biaya berhasil diarsipkan.",
          );
        },

      onError: (
        error: unknown,
      ) => {
        toast.error(
          "Gagal mengarsipkan kategori biaya.",
          {
            description:
              getErrorMessage(
                error,
              ),
          },
        );
      },
    });

  const restoreMutation =
    useMutation({
      mutationFn: async (
        row: CostCategoryRow,
      ) => {
        if (
          !user ||
          !canManage
        ) {
          throw new Error(
            "Anda tidak memiliki izin memulihkan kategori.",
          );
        }

        const {
          data,
          error,
        } = await supabase
          .from(
            "cost_categories",
          )
          .update({
            deleted_at: null,
            deleted_by: null,
            is_active: true,
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
            "Kategori biaya tidak ditemukan.",
          );
        }
      },

      onSuccess:
        async () => {
          await invalidate();

          toast.success(
            "Kategori biaya berhasil dipulihkan.",
          );
        },

      onError: (
        error: unknown,
      ) => {
        toast.error(
          "Gagal memulihkan kategori biaya.",
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
        name: "",
        scope: "subunit",
        subunit_id: "",
        description: "",
        is_active: true,
      });

      setDialogOpen(true);
    };

  const openEdit = (
    row: CostCategoryRow,
  ) => {
    setEditing(row);

    form.reset({
      name: row.name,

      scope:
        row.scope as
          | "outlet"
          | "subunit",

      subunit_id:
        row.subunit_id ?? "",

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

  const currentScope =
    form.watch("scope");

  if (
    !authLoading &&
    !canManage
  ) {
    return (
      <div>
        <PageHeader
          title="Kategori Biaya"
          description="Kelola kategori biaya Outlet dan Subunit."
        />

        <EmptyState
          title="Akses tidak tersedia"
          description="Anda tidak memiliki izin mengelola kategori biaya."
        />
      </div>
    );
  }

  const loading =
    authLoading ||
    structureLoading ||
    listQuery.isLoading;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Kategori Biaya"
        description="Kelola klasifikasi biaya berdasarkan scope Outlet atau Subunit."
        actions={
          <Button
            onClick={openCreate}
            disabled={
              loading ||
              !outlet
            }
          >
            <Plus className="mr-2 h-4 w-4" />
            Tambah Kategori
          </Button>
        }
      />

      {structureError ||
      listQuery.error ? (
        <EmptyState
          title="Kategori biaya belum dapat dimuat"
          description={getErrorMessage(
            structureError ??
              listQuery.error,
          )}
        />
      ) : (
        <>
          <Card>
            <CardContent className="grid gap-3 p-4 lg:grid-cols-4">
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
                  scopeFilter
                }
                onValueChange={
                  setScopeFilter
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>

                <SelectContent>
                  <SelectItem value="all">
                    Semua Scope
                  </SelectItem>

                  <SelectItem value="outlet">
                    Outlet
                  </SelectItem>

                  <SelectItem value="subunit">
                    Subunit
                  </SelectItem>
                </SelectContent>
              </Select>

              <Select
                value={
                  subunitFilter
                }
                onValueChange={
                  setSubunitFilter
                }
              >
                <SelectTrigger>
                  <SelectValue />
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

              <Button
                type="button"
                variant={
                  includeArchived
                    ? "default"
                    : "outline"
                }
                onClick={() =>
                  setIncludeArchived(
                    (current) =>
                      !current,
                  )
                }
              >
                {includeArchived
                  ? "Sembunyikan Arsip"
                  : "Lihat Arsip"}
              </Button>
            </CardContent>
          </Card>

          {loading ? (
            <div className="flex min-h-48 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : rows.length ===
            0 ? (
            <EmptyState
              title="Belum ada kategori biaya"
              description="Tambahkan kategori biaya untuk mulai mengelompokkan pembelian dan biaya bisnis."
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
                        Scope
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
                            {row.scope ===
                            "outlet"
                              ? "Outlet"
                              : "Subunit"}
                          </TableCell>

                          <TableCell>
                            {row.subunit_id
                              ? subunitMap.get(
                                  row.subunit_id,
                                ) ??
                                "Tidak tersedia"
                              : "-"}
                          </TableCell>

                          <TableCell>
                            <Badge
                              variant={
                                row.deleted_at
                                  ? "secondary"
                                  : row.is_active
                                    ? "default"
                                    : "secondary"
                              }
                            >
                              {row.deleted_at
                                ? "Diarsipkan"
                                : row.is_active
                                  ? "Aktif"
                                  : "Nonaktif"}
                            </Badge>
                          </TableCell>

                          <TableCell>
                            <div className="flex justify-end gap-2">
                              {!row.deleted_at ? (
                                <>
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
                                    size="icon"
                                    variant="outline"
                                    onClick={() =>
                                      archiveMutation.mutate(
                                        row,
                                      )
                                    }
                                  >
                                    <Archive className="h-4 w-4" />
                                  </Button>
                                </>
                              ) : (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() =>
                                    restoreMutation.mutate(
                                      row,
                                    )
                                  }
                                >
                                  <RotateCcw className="mr-2 h-4 w-4" />
                                  Pulihkan
                                </Button>
                              )}
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
                ? "Edit Kategori Biaya"
                : "Tambah Kategori Biaya"}
            </DialogTitle>

            <DialogDescription>
              Tentukan apakah
              kategori berlaku pada
              Outlet atau Subunit.
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
                Scope
              </Label>

              <Select
                value={
                  currentScope
                }
                onValueChange={(
                  value,
                ) => {
                  const scope =
                    value as
                      | "outlet"
                      | "subunit";

                  form.setValue(
                    "scope",
                    scope,
                    {
                      shouldDirty:
                        true,
                      shouldValidate:
                        true,
                    },
                  );

                  if (
                    scope ===
                    "outlet"
                  ) {
                    form.setValue(
                      "subunit_id",
                      "",
                    );
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>

                <SelectContent>
                  <SelectItem value="subunit">
                    Subunit
                  </SelectItem>

                  <SelectItem value="outlet">
                    Outlet
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {currentScope ===
            "subunit" ? (
              <div className="space-y-2">
                <Label>
                  Subunit
                </Label>

                <Select
                  value={
                    form.watch(
                      "subunit_id",
                    ) || ""
                  }
                  onValueChange={(
                    value,
                  ) =>
                    form.setValue(
                      "subunit_id",
                      value,
                      {
                        shouldDirty:
                          true,
                        shouldValidate:
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
                      (
                        subunit,
                      ) => (
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

                {form.formState
                  .errors
                  .subunit_id ? (
                  <p className="text-sm text-destructive">
                    {
                      form
                        .formState
                        .errors
                        .subunit_id
                        .message
                    }
                  </p>
                ) : null}
              </div>
            ) : (
              <div className="rounded-lg border p-3 text-sm text-muted-foreground">
                Kategori akan
                berlaku untuk Outlet{" "}
                <strong>
                  {outlet?.name ??
                    "Kadirojo"}
                </strong>
                .
              </div>
            )}

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
    return "Kategori biaya dengan nama tersebut sudah tersedia pada scope yang dipilih.";
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Terjadi kesalahan saat memproses kategori biaya.";
}