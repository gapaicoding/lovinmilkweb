import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/PageHeader";

import {
  Avatar,
  AvatarFallback,
} from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_authenticated/profil")({
  component: ProfilePage,
});

const nameSchema = z.object({
  full_name: z
    .string()
    .trim()
    .min(2, "Nama minimal 2 karakter.")
    .max(80, "Nama maksimal 80 karakter."),
});

const passwordSchema = z
  .object({
    password: z
      .string()
      .min(6, "Kata sandi minimal 6 karakter.")
      .max(72, "Kata sandi maksimal 72 karakter."),
    confirm: z.string(),
  })
  .refine(
    (values) => values.password === values.confirm,
    {
      path: ["confirm"],
      message: "Konfirmasi kata sandi tidak cocok.",
    },
  );

type NameFormValues = z.infer<typeof nameSchema>;
type PasswordFormValues = z.infer<typeof passwordSchema>;

function ProfilePage() {
  const {
    user,
    profile,
    role,
    refreshProfile,
  } = useAuth();

  const [savingName, setSavingName] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  const nameForm = useForm<NameFormValues>({
    resolver: zodResolver(nameSchema),
    values: {
      full_name: profile?.full_name ?? "",
    },
  });

  const passwordForm = useForm<PasswordFormValues>({
    resolver: zodResolver(passwordSchema),
    defaultValues: {
      password: "",
      confirm: "",
    },
  });

  const initials = (
    profile?.full_name ||
    user?.email ||
    "?"
  )
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const onSaveName = async (
    values: NameFormValues,
  ) => {
    if (!user) {
      toast.error("Sesi pengguna tidak ditemukan.");
      return;
    }

    try {
      setSavingName(true);

      const fullName = values.full_name.trim();

      const { data, error } = await supabase
        .from("profiles")
        .update({
          full_name: fullName,
        })
        .eq("id", user.id)
        .select("id, full_name")
        .single();

      if (error) {
        throw error;
      }

      if (!data) {
        throw new Error(
          "Profil tidak ditemukan atau Anda tidak memiliki izin untuk memperbaruinya.",
        );
      }

      await refreshProfile();

      toast.success("Profil berhasil diperbarui.");
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Terjadi kesalahan yang tidak diketahui.";

      console.error(
        "[ProfilePage] Gagal memperbarui profil:",
        error,
      );

      toast.error("Gagal menyimpan profil.", {
        description: message,
      });
    } finally {
      setSavingName(false);
    }
  };

  const onChangePassword = async (
    values: PasswordFormValues,
  ) => {
    try {
      setSavingPassword(true);

      const { error } = await supabase.auth.updateUser({
        password: values.password,
      });

      if (error) {
        throw error;
      }

      passwordForm.reset();

      toast.success("Kata sandi berhasil diperbarui.");
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Terjadi kesalahan yang tidak diketahui.";

      console.error(
        "[ProfilePage] Gagal memperbarui kata sandi:",
        error,
      );

      toast.error("Gagal mengubah kata sandi.", {
        description: message,
      });
    } finally {
      setSavingPassword(false);
    }
  };

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Profil"
        description="Kelola informasi akun dan keamanan Anda."
      />

      <div className="grid grid-cols-1 gap-4">
        <Card className="rounded-xl">
          <CardHeader>
            <CardTitle className="text-base">
              Informasi Akun
            </CardTitle>
          </CardHeader>

          <CardContent className="flex items-start gap-4">
            <Avatar className="h-16 w-16">
              <AvatarFallback className="bg-primary/30 text-base text-primary-foreground">
                {initials}
              </AvatarFallback>
            </Avatar>

            <div className="space-y-2 text-sm">
              <div>
                <span className="text-muted-foreground">
                  Nama:
                </span>{" "}
                <span className="font-medium">
                  {profile?.full_name || "-"}
                </span>
              </div>

              <div>
                <span className="text-muted-foreground">
                  Email:
                </span>{" "}
                <span className="font-medium">
                  {user?.email || "-"}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">
                  Peran:
                </span>

                <Badge variant="secondary">
                  {role === "super_admin"
                    ? "Super Admin"
                    : role === "admin"
                      ? "Admin"
                      : "-"}
                </Badge>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">
                  Status:
                </span>

                {profile?.is_active ? (
                  <Badge className="bg-success/20 text-success hover:bg-success/20">
                    Aktif
                  </Badge>
                ) : (
                  <Badge variant="destructive">
                    Nonaktif
                  </Badge>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-xl">
          <CardHeader>
            <CardTitle className="text-base">
              Perbarui Nama
            </CardTitle>
          </CardHeader>

          <CardContent>
            <form
              className="max-w-md space-y-3"
              onSubmit={nameForm.handleSubmit(onSaveName)}
            >
              <div className="space-y-2">
                <Label htmlFor="full_name">
                  Nama Lengkap
                </Label>

                <Input
                  id="full_name"
                  autoComplete="name"
                  disabled={savingName}
                  {...nameForm.register("full_name")}
                />

                {nameForm.formState.errors.full_name && (
                  <p className="text-xs text-destructive">
                    {
                      nameForm.formState.errors.full_name
                        .message
                    }
                  </p>
                )}
              </div>

              <Button
                type="submit"
                disabled={
                  savingName ||
                  !nameForm.formState.isDirty
                }
              >
                {savingName && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}

                Simpan Perubahan
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card className="rounded-xl">
          <CardHeader>
            <CardTitle className="text-base">
              Ubah Kata Sandi
            </CardTitle>
          </CardHeader>

          <CardContent>
            <form
              className="max-w-md space-y-3"
              onSubmit={passwordForm.handleSubmit(
                onChangePassword,
              )}
            >
              <div className="space-y-2">
                <Label htmlFor="password">
                  Kata Sandi Baru
                </Label>

                <Input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  disabled={savingPassword}
                  {...passwordForm.register("password")}
                />

                {passwordForm.formState.errors.password && (
                  <p className="text-xs text-destructive">
                    {
                      passwordForm.formState.errors.password
                        .message
                    }
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirm-password">
                  Konfirmasi Kata Sandi
                </Label>

                <Input
                  id="confirm-password"
                  type="password"
                  autoComplete="new-password"
                  disabled={savingPassword}
                  {...passwordForm.register("confirm")}
                />

                {passwordForm.formState.errors.confirm && (
                  <p className="text-xs text-destructive">
                    {
                      passwordForm.formState.errors.confirm
                        .message
                    }
                  </p>
                )}
              </div>

              <Button
                type="submit"
                disabled={savingPassword}
              >
                {savingPassword && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}

                Perbarui Kata Sandi
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}