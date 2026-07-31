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

import {
  generateBusinessCode,
  getInventoryStatusLabel,
} from "@/lib/businessStructure";

type SubunitRow = Tables<"business_subunits">;

const subunitSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Nama Subunit minimal 2 karakter.")
    .max(100, "Nama Subunit maksimal 100 karakter."),

  description: z
    .string()
    .trim()
    .max(500, "Deskripsi maksimal 500 karakter.")
    .optional(),

  inventory_enabled: z.boolean(),

  is_active: z.boolean(),
});

type SubunitFormValues = z.infer<typeof subunitSchema>;

interface SaveVariables {
  values: SubunitFormValues;
  subunitId: string | null;
}

export function SubunitManager() {
  const {
    user,
    isAdmin,
    loading: authLoading,
  } = useAuth();

  const queryClient = useQueryClient();

  const {
    outlet,
    isLoading: structureLoading,
    error: structureError,
  } = useBusinessStructure();

  const canManage = isAdmin;

  const [tab, setTab] =
    useState<"active" | "archived">("active");

  const [search, setSearch] = useState("");

  const [dialogOpen, setDialogOpen] =
    useState(false);

  const [editing, setEditing] =
    useState<SubunitRow | null>(null);

  const normalizedSearch = search
    .trim()
    .toLocaleLowerCase("id-ID");

  const form = useForm<SubunitFormValues>({
    resolver: zodResolver(subunitSchema),

    defaultValues: {
      name: "",
      description: "",
      inventory_enabled: false,
      is_active: true,
    },
  });

  const listQuery = useQuery({
    queryKey: [
      "business-subunits",
      "manage",
      outlet?.id,
    ],

    enabled:
      !authLoading &&
      canManage &&
      Boolean(outlet?.id),

    queryFn: async (): Promise<SubunitRow[]> => {
      if (!outlet) {
        return [];
      }

      const { data, error } = await supabase
        .from("business_subunits")
        .select("*")
        .eq("outlet_id", outlet.id)
        .order("name", {
          ascending: true,
        });

      if (error) {
        throw error;
      }

      return data ?? [];
    },
  });

  const rows = useMemo(() => {
    return (listQuery.data ?? []).filter(
      (row) => {
        const archived =
          row.deleted_at !== null;

        if (
          tab === "active" &&
          archived
        ) {
          return false;
        }

        if (
          tab === "archived" &&
          !archived
        ) {
          return false;
        }

        if (!normalizedSearch) {
          return true;
        }

        return [
          row.name,
          row.code,
          row.description ?? "",
        ]
          .join(" ")
          .toLocaleLowerCase("id-ID")
          .includes(normalizedSearch);
      },
    );
  }, [
    listQuery.data,
    normalizedSearch,
    tab,
  ]);

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: [
          "business-subunits",
        ],
      }),

      queryClient.invalidateQueries({
        queryKey: [
          "business-subunits",
          "manage",
        ],
      }),
    ]);
  };

  const saveMutation = useMutation({
    mutationFn: async ({
      values,
      subunitId,
    }: SaveVariables) => {
      if (!user || !canManage) {
        throw new Error(
          "Anda tidak memiliki izin mengelola Subunit Bisnis.",
        );
      }

      if (!outlet) {
        throw new Error(
          "Outlet aktif tidak ditemukan.",
        );
      }

      const basePayload = {
        name: values.name.trim(),

        description:
          values.description?.trim() ||
          null,

        inventory_enabled:
          values.inventory_enabled,

        is_active:
          values.is_active,

        updated_by: user.id,
      };

      if (subunitId) {
        const payload: TablesUpdate<"business_subunits"> =
          basePayload;

        const { data, error } =
          await supabase
            .from("business_subunits")
            .update(payload)
            .eq("id", subunitId)
            .is("deleted_at", null)
            .select("id")
            .maybeSingle();

        if (error) {
          throw error;
        }

        if (!data) {
          throw new Error(
            "Subunit tidak ditemukan.",
          );
        }

        return "update" as const;
      }

      const code = generateBusinessCode(
        values.name,
      );

      if (!code) {
        throw new Error(
          "Nama Subunit tidak dapat menghasilkan kode yang valid.",
        );
      }

      const payload: TablesInsert<"business_subunits"> =
        {
          outlet_id: outlet.id,
          code,
          name: values.name.trim(),

          description:
            values.description?.trim() ||
            null,

          inventory_enabled:
            values.inventory_enabled,

          is_active:
            values.is_active,

          created_by: user.id,
          updated_by: user.id,
        };

      const { data, error } =
        await supabase
          .from("business_subunits")
          .insert(payload)
          .select("id")
          .single();

      if (error) {
        throw error;
      }

      if (!data) {
        throw new Error(
          "Subunit gagal dibuat.",
        );
      }

      return "create" as const;
    },

    onSuccess: async (mode) => {
      await invalidate();

      toast.success(
        mode === "create"
          ? "Subunit berhasil ditambahkan."
          : "Subunit berhasil diperbarui.",
      );

      closeDialog();
    },

    onError: (error: unknown) => {
      toast.error(
        "Gagal menyimpan Subunit.",
        {
          description:
            getErrorMessage(error),
        },
      );
    },
  });

  const archiveMutation =
    useMutation({
      mutationFn: async (
        row: SubunitRow,
      ) => {
        if (!user || !canManage) {
          throw new Error(
            "Anda tidak memiliki izin mengarsipkan Subunit.",
          );
        }

        const { data, error } =
          await supabase
            .from("business_subunits")
            .update({
              is_active: false,
              deleted_at:
                new Date().toISOString(),
              deleted_by: user.id,
              updated_by: user.id,
            })
            .eq("id", row.id)
            .is("deleted_at", null)
            .select("id")
            .maybeSingle();

        if (error) {
          throw error;
        }

        if (!data) {
          throw new Error(
            "Subunit tidak ditemukan.",
          );
        }
      },

      onSuccess: async () => {
        await invalidate();

        toast.success(
          "Subunit berhasil diarsipkan.",
        );
      },

      onError: (error: unknown) => {
        toast.error(
          "Gagal mengarsipkan Subunit.",
          {
            description:
              getErrorMessage(error),
          },
        );
      },
    });

  const restoreMutation =
    useMutation({
      mutationFn: async (
        row: SubunitRow,
      ) => {
        if (!user || !canManage) {
          throw new Error(
            "Anda tidak memiliki izin memulihkan Subunit.",
          );
        }

        const { data, error } =
          await supabase
            .from("business_subunits")
            .update({
              deleted_at: null,
              deleted_by: null,
              is_active: true,
              updated_by: user.id,
            })
            .eq("id", row.id)
            .not(
              "deleted_at",
              "is",
              null,
            )
            .select("id")
            .maybeSingle();

        if (error) {
          throw error;
        }

        if (!data) {
          throw new Error(
            "Subunit tidak ditemukan.",
          );
        }
      },

      onSuccess: async () => {
        await invalidate();

        toast.success(
          "Subunit berhasil dipulihkan.",
        );
      },

      onError: (error: unknown) => {
        toast.error(
          "Gagal memulihkan Subunit.",
          {
            description:
              getErrorMessage(error),
          },
        );
      },
    });

  const openCreate = () => {
    setEditing(null);

    form.reset({
      name: "",
      description: "",
      inventory_enabled: false,
      is_active: true,
    });

    setDialogOpen(true);
  };

  const openEdit = (
    row: SubunitRow,
  ) => {
    setEditing(row);

    form.reset({
      name: row.name,

      description:
        row.description ?? "",

      inventory_enabled:
        row.inventory_enabled,

      is_active:
        row.is_active,
    });

    setDialogOpen(true);
  };

  const closeDialog = () => {
    if (saveMutation.isPending) {
      return;
    }

    setDialogOpen(false);
    setEditing(null);

    form.reset({
      name: "",
      description: "",
      inventory_enabled: false,
      is_active: true,
    });
  };

  if (
    !authLoading &&
    !canManage
  ) {
    return (
      <div>
        <PageHeader
          title="Subunit Bisnis"
          description="Kelola Subunit Bisnis yang berada di dalam Outlet."
        />

        <EmptyState
          title="Akses tidak tersedia"
          description="Anda tidak memiliki izin untuk mengelola Subunit Bisnis."
        />
      </div>
    );
  }

  const loading =
    authLoading ||
    structureLoading ||
    listQuery.isLoading;

  const error =
    structureError ??
    listQuery.error;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Subunit Bisnis"
        description={`Kelola Subunit Bisnis yang beroperasi di Outlet ${
          outlet?.name ?? "Kadirojo"
        }.`}
        actions={
          <Button
            onClick={openCreate}
            disabled={
              loading ||
              !outlet
            }
          >
            <Plus className="mr-2 h-4 w-4" />
            Tambah Subunit
          </Button>
        }
      />

      {error ? (
        <EmptyState
          title="Data Subunit belum dapat dimuat"
          description={getErrorMessage(
            error,
          )}
        />
      ) : (
        <>
          <Card>
            <CardContent className="p-4">
              <div className="grid gap-4 md:grid-cols-3">
                <div>
                  <p className="text-sm text-muted-foreground">
                    Outlet
                  </p>

                  <p className="font-medium">
                    {outlet?.name ??
                      "Memuat..."}
                  </p>
                </div>

                <div>
                  <p className="text-sm text-muted-foreground">
                    Subunit Aktif
                  </p>

                  <p className="font-medium">
                    {
                      (listQuery.data ??
                        []).filter(
                        (row) =>
                          row.deleted_at ===
                            null &&
                          row.is_active,
                      ).length
                    }
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <Tabs
              value={tab}
              onValueChange={(value) =>
                setTab(
                  value as
                    | "active"
                    | "archived",
                )
              }
            >
              <TabsList>
                <TabsTrigger value="active">
                  Aktif
                </TabsTrigger>

                <TabsTrigger value="archived">
                  Diarsipkan
                </TabsTrigger>
              </TabsList>
            </Tabs>

            <div className="relative w-full md:max-w-sm">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />

              <Input
                className="pl-9"
                value={search}
                onChange={(event) =>
                  setSearch(
                    event.target.value,
                  )
                }
                placeholder="Cari Subunit..."
              />
            </div>
          </div>

          {loading ? (
            <div className="flex min-h-48 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : rows.length === 0 ? (
            <EmptyState
              title={
                tab === "active"
                  ? "Belum ada Subunit"
                  : "Tidak ada Subunit yang diarsipkan"
              }
              description={
                tab === "active"
                  ? "Tambahkan Subunit Bisnis untuk mengelompokkan operasional Outlet."
                  : "Subunit yang diarsipkan akan muncul di sini."
              }
            />
          ) : (
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>
                        Nama
                      </TableHead>

                      <TableHead>
                        Kode
                      </TableHead>

                      <TableHead>
                        Manajemen Stok
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
                    {rows.map((row) => (
                      <TableRow
                        key={row.id}
                      >
                        <TableCell>
                          <div>
                            <p className="font-medium">
                              {row.name}
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

                        <TableCell className="font-mono text-xs">
                          {row.code}
                        </TableCell>

                        <TableCell>
                          <Badge
                            variant={
                              row.inventory_enabled
                                ? "default"
                                : "secondary"
                            }
                          >
                            {getInventoryStatusLabel(
                              row.inventory_enabled,
                            )}
                          </Badge>
                        </TableCell>

                        <TableCell>
                          <Badge
                            variant={
                              row.is_active &&
                              !row.deleted_at
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
                                  disabled={
                                    archiveMutation.isPending
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
                                disabled={
                                  restoreMutation.isPending
                                }
                              >
                                <RotateCcw className="mr-2 h-4 w-4" />
                                Pulihkan
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
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
                ? "Edit Subunit"
                : "Tambah Subunit"}
            </DialogTitle>

            <DialogDescription>
              Subunit berada di bawah
              Outlet{" "}
              {outlet?.name ??
                "Kadirojo"}.
            </DialogDescription>
          </DialogHeader>

          <form
            className="space-y-4"
            onSubmit={form.handleSubmit(
              (values) =>
                saveMutation.mutate({
                  values,
                  subunitId:
                    editing?.id ??
                    null,
                }),
            )}
          >
            <div className="space-y-2">
              <Label htmlFor="subunit-name">
                Nama Subunit
              </Label>

              <Input
                id="subunit-name"
                {...form.register(
                  "name",
                )}
              />

              {form.formState.errors
                .name ? (
                <p className="text-sm text-destructive">
                  {
                    form.formState
                      .errors.name
                      .message
                  }
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="subunit-description">
                Deskripsi
              </Label>

              <Textarea
                id="subunit-description"
                {...form.register(
                  "description",
                )}
              />
            </div>

            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <Label>
                  Manajemen Stok
                </Label>

                <p className="text-sm text-muted-foreground">
                  Menentukan apakah
                  Subunit dapat
                  menggunakan fitur
                  Inventory.
                </p>
              </div>

              <Switch
                checked={form.watch(
                  "inventory_enabled",
                )}
                onCheckedChange={(
                  checked,
                ) =>
                  form.setValue(
                    "inventory_enabled",
                    checked,
                    {
                      shouldDirty: true,
                    },
                  )
                }
              />
            </div>

            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <Label>
                  Status Aktif
                </Label>

                <p className="text-sm text-muted-foreground">
                  Subunit nonaktif tidak
                  digunakan untuk input
                  data baru.
                </p>
              </div>

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
                    {
                      shouldDirty: true,
                    },
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
    return "Subunit dengan nama atau kode tersebut sudah tersedia pada Outlet ini.";
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Terjadi kesalahan saat memproses data Subunit.";
}