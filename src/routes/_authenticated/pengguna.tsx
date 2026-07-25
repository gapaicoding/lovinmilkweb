import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Info, Loader2, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { useAuth, type AppRole } from "@/hooks/useAuth";
import { PageHeader } from "@/components/PageHeader";
import { formatDateTime } from "@/lib/format";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/pengguna")({
  component: UserManagementPage,
});

type UserProfile = Tables<"profiles">;

function UserManagementPage() {
  const { isSuperAdmin, loading: authLoading, user } = useAuth();

  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!authLoading && !isSuperAdmin) {
      void navigate({
        to: "/dashboard",
        replace: true,
      });
    }
  }, [authLoading, isSuperAdmin, navigate]);

  const usersQuery = useQuery({
    queryKey: ["profiles", search.trim()],
    enabled: !authLoading && isSuperAdmin,
    queryFn: async (): Promise<UserProfile[]> => {
      let query = supabase
        .from("profiles")
        .select(
          `
          id,
          full_name,
          role,
          is_active,
          avatar_url,
          created_at,
          updated_at
          `,
        )
        .order("created_at", {
          ascending: false,
        });

      const normalizedSearch = search.trim();

      if (normalizedSearch) {
        query = query.ilike("full_name", `%${normalizedSearch}%`);
      }

      const { data, error } = await query;

      if (error) {
        console.error("[UserManagement] Gagal mengambil daftar pengguna:", {
          message: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint,
        });

        throw error;
      }

      return (data ?? []) as UserProfile[];
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async (selectedProfile: UserProfile) => {
      if (selectedProfile.id === user?.id) {
        throw new Error("Anda tidak dapat menonaktifkan akun sendiri.");
      }

      const { error } = await supabase.rpc("admin_update_profile_authorization", {
        p_profile_id: selectedProfile.id,
        p_is_active: !selectedProfile.is_active,
      });

      if (error) {
        throw error;
      }
    },

    onSuccess: async () => {
      toast.success("Status pengguna berhasil diperbarui.");

      await queryClient.invalidateQueries({
        queryKey: ["profiles"],
        refetchType: "active",
      });
    },

    onError: (error: unknown) => {
      const message =
        error instanceof Error ? error.message : "Terjadi kesalahan yang tidak diketahui.";

      toast.error("Gagal memperbarui status pengguna.", {
        description: message,
      });
    },
  });

  const changeRoleMutation = useMutation({
    mutationFn: async ({
      selectedProfile,
      newRole,
    }: {
      selectedProfile: UserProfile;
      newRole: AppRole;
    }) => {
      if (selectedProfile.id === user?.id) {
        throw new Error("Anda tidak dapat mengubah peran akun sendiri.");
      }

      if (selectedProfile.role === newRole) {
        return;
      }

      const { error } = await supabase.rpc("admin_update_profile_authorization", {
        p_profile_id: selectedProfile.id,
        p_role: newRole,
      });

      if (error) {
        throw error;
      }
    },

    onSuccess: async () => {
      toast.success("Peran pengguna berhasil diperbarui.");

      await queryClient.invalidateQueries({
        queryKey: ["profiles"],
        refetchType: "active",
      });
    },

    onError: (error: unknown) => {
      const message =
        error instanceof Error ? error.message : "Terjadi kesalahan yang tidak diketahui.";

      toast.error("Gagal mengubah peran pengguna.", {
        description: message,
      });
    },
  });

  if (authLoading) {
    return <PageLoader />;
  }

  if (!isSuperAdmin) {
    return <UnauthorizedMessage />;
  }

  return (
    <div>
      <PageHeader
        title="Manajemen Pengguna"
        description="Kelola peran dan status akun pengguna Lovin Milk."
      />

      <Alert className="mb-4">
        <Info className="h-4 w-4" />

        <AlertTitle>Pembuatan akun baru</AlertTitle>

        <AlertDescription>
          Pengguna baru mendaftar melalui halaman autentikasi. Setelah akun dan profil dibuat, Super
          Admin dapat mengubah peran serta status pengguna melalui halaman ini. Pembuatan akun
          secara langsung oleh Super Admin membutuhkan backend aman atau Supabase Edge Function yang
          menggunakan secret key.
        </AlertDescription>
      </Alert>

      <Card className="rounded-xl">
        <CardContent className="space-y-4 p-4">
          <Input
            className="max-w-sm"
            placeholder="Cari nama pengguna..."
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
            }}
          />

          {usersQuery.isError ? (
            <UsersError
              onRetry={() => {
                void usersQuery.refetch();
              }}
            />
          ) : (
            <div className="overflow-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nama</TableHead>
                    <TableHead>Peran</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Dibuat</TableHead>
                    <TableHead className="text-right">Aktif</TableHead>
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {usersQuery.isLoading ? (
                    <UsersTableSkeleton />
                  ) : usersQuery.data?.length ? (
                    usersQuery.data.map((profile) => {
                      const isCurrentUser = profile.id === user?.id;

                      const isUpdatingRole =
                        changeRoleMutation.isPending &&
                        changeRoleMutation.variables?.selectedProfile.id === profile.id;

                      const isUpdatingStatus =
                        toggleActiveMutation.isPending &&
                        toggleActiveMutation.variables?.id === profile.id;

                      return (
                        <TableRow key={profile.id}>
                          <TableCell>
                            <div className="font-medium">{profile.full_name || "-"}</div>

                            {isCurrentUser && (
                              <div className="text-xs text-muted-foreground">Anda</div>
                            )}
                          </TableCell>

                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Select
                                value={profile.role}
                                disabled={isCurrentUser || changeRoleMutation.isPending}
                                onValueChange={(value) => {
                                  changeRoleMutation.mutate({
                                    selectedProfile: profile,
                                    newRole: value as AppRole,
                                  });
                                }}
                              >
                                <SelectTrigger className="w-[160px]">
                                  <SelectValue />
                                </SelectTrigger>

                                <SelectContent>
                                  <SelectItem value="staff">Staf</SelectItem>

                                  <SelectItem value="admin">Admin</SelectItem>

                                  <SelectItem value="super_admin">Super Admin</SelectItem>
                                </SelectContent>
                              </Select>

                              {isUpdatingRole && (
                                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                              )}
                            </div>
                          </TableCell>

                          <TableCell>
                            {profile.is_active ? (
                              <Badge className="bg-success/20 text-success hover:bg-success/20">
                                Aktif
                              </Badge>
                            ) : (
                              <Badge variant="secondary">Nonaktif</Badge>
                            )}
                          </TableCell>

                          <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                            {formatDateTime(profile.created_at)}
                          </TableCell>

                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              {isUpdatingStatus && (
                                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                              )}

                              <Switch
                                checked={profile.is_active}
                                disabled={isCurrentUser || toggleActiveMutation.isPending}
                                onCheckedChange={() => {
                                  toggleActiveMutation.mutate(profile);
                                }}
                                aria-label={`Ubah status ${profile.full_name}`}
                              />
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  ) : (
                    <TableRow>
                      <TableCell colSpan={5} className="h-28 text-center text-muted-foreground">
                        Tidak ada pengguna yang ditemukan.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function PageLoader() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="h-7 w-7 animate-spin text-primary" />

        <p className="text-sm text-muted-foreground">Memeriksa izin pengguna...</p>
      </div>
    </div>
  );
}

function UnauthorizedMessage() {
  const navigate = useNavigate();

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border bg-card p-8 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/15">
          <ShieldAlert className="h-6 w-6 text-destructive" />
        </div>

        <h1 className="text-lg font-semibold">Akses Ditolak</h1>

        <p className="mt-2 text-sm text-muted-foreground">
          Halaman manajemen pengguna hanya dapat diakses oleh Super Admin.
        </p>

        <Button
          className="mt-5"
          onClick={() => {
            void navigate({
              to: "/dashboard",
              replace: true,
            });
          }}
        >
          Kembali ke Dashboard
        </Button>
      </div>
    </div>
  );
}

function UsersTableSkeleton() {
  return (
    <>
      {Array.from({ length: 4 }).map((_, index) => (
        <TableRow key={index}>
          <TableCell colSpan={5}>
            <Skeleton className="h-8 w-full" />
          </TableCell>
        </TableRow>
      ))}
    </>
  );
}

function UsersError({ onRetry }: { onRetry: () => void }) {
  return (
    <Alert variant="destructive">
      <ShieldAlert className="h-4 w-4" />

      <AlertTitle>Daftar pengguna gagal dimuat</AlertTitle>

      <AlertDescription>
        <p>Periksa policy RLS tabel profiles dan pastikan akun Anda memiliki role Super Admin.</p>

        <Button className="mt-3" size="sm" variant="outline" onClick={onRetry}>
          Coba Lagi
        </Button>
      </AlertDescription>
    </Alert>
  );
}
