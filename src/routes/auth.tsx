import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Eye, EyeOff, Loader2, Milk } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/auth")({
  component: AuthPage,
});

const loginSchema = z.object({
  email: z.string().trim().min(1, "Email wajib diisi").email("Format email tidak valid"),
  password: z.string().min(6, "Kata sandi minimal 6 karakter"),
  remember: z.boolean().optional(),
});
type LoginValues = z.infer<typeof loginSchema>;

const signupSchema = z.object({
  full_name: z.string().trim().min(2, "Nama lengkap minimal 2 karakter").max(80),
  email: z.string().trim().email("Format email tidak valid"),
  password: z.string().min(6, "Kata sandi minimal 6 karakter").max(72),
});
type SignupValues = z.infer<typeof signupSchema>;

function AuthPage() {
  const { session, role, loading } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && session && role) {
      navigate({ to: role === "staff" ? "/kunjungan" : "/dashboard", replace: true });
    }
  }, [loading, session, role, navigate]);

  const loginForm = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "", remember: true },
  });
  const signupForm = useForm<SignupValues>({
    resolver: zodResolver(signupSchema),
    defaultValues: { full_name: "", email: "", password: "" },
  });

  const onLogin = async (values: LoginValues) => {
    setSubmitting(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: values.email,
      password: values.password,
    });
    setSubmitting(false);
    if (error) {
      toast.error("Gagal masuk", { description: error.message });
      return;
    }
    toast.success("Berhasil masuk");
    // AuthProvider memuat role dan effect di atas mengarahkan ke halaman yang tepat.
  };

  const onSignup = async (values: SignupValues) => {
    setSubmitting(true);
    const redirectUrl = `${window.location.origin}/`;
    const { error } = await supabase.auth.signUp({
      email: values.email,
      password: values.password,
      options: {
        emailRedirectTo: redirectUrl,
        data: { full_name: values.full_name },
      },
    });
    setSubmitting(false);
    if (error) {
      toast.error("Gagal mendaftar", { description: error.message });
      return;
    }
    toast.success("Akun berhasil dibuat", {
      description: "Silakan masuk menggunakan email dan kata sandi Anda.",
    });
    setMode("login");
    loginForm.setValue("email", values.email);
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 bg-gradient-to-br from-primary/20 via-background to-secondary/30">
      <Card className="w-full max-w-md shadow-xl rounded-2xl border-primary/20">
        <CardHeader className="text-center space-y-3">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/20">
            <Milk className="h-7 w-7 text-primary-foreground" />
          </div>
          <CardTitle className="text-2xl">Lovin Milk Dashboard</CardTitle>
          <CardDescription>
            {mode === "login" ? "Masuk untuk mengelola penjualan & keuangan" : "Daftarkan akun baru"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {mode === "login" ? (
            <form onSubmit={loginForm.handleSubmit(onLogin)} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" placeholder="nama@lovinmilk.com" autoComplete="email"
                  {...loginForm.register("email")} />
                {loginForm.formState.errors.email && (
                  <p className="text-xs text-destructive">{loginForm.formState.errors.email.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Kata Sandi</Label>
                <div className="relative">
                  <Input id="password" type={showPassword ? "text" : "password"} autoComplete="current-password"
                    {...loginForm.register("password")} />
                  <button type="button" onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    aria-label="Tampilkan kata sandi">
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {loginForm.formState.errors.password && (
                  <p className="text-xs text-destructive">{loginForm.formState.errors.password.message}</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Checkbox id="remember" defaultChecked
                  onCheckedChange={(v) => loginForm.setValue("remember", Boolean(v))} />
                <Label htmlFor="remember" className="text-sm font-normal">Ingat saya</Label>
              </div>
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Masuk
              </Button>
              <p className="text-center text-sm text-muted-foreground">
                Belum punya akun?{" "}
                <button type="button" onClick={() => setMode("signup")}
                  className="font-medium text-primary-foreground underline underline-offset-2">
                  Daftar
                </button>
              </p>
            </form>
          ) : (
            <form onSubmit={signupForm.handleSubmit(onSignup)} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="full_name">Nama Lengkap</Label>
                <Input id="full_name" {...signupForm.register("full_name")} />
                {signupForm.formState.errors.full_name && (
                  <p className="text-xs text-destructive">{signupForm.formState.errors.full_name.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="s_email">Email</Label>
                <Input id="s_email" type="email" autoComplete="email" {...signupForm.register("email")} />
                {signupForm.formState.errors.email && (
                  <p className="text-xs text-destructive">{signupForm.formState.errors.email.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="s_password">Kata Sandi</Label>
                <Input id="s_password" type="password" autoComplete="new-password" {...signupForm.register("password")} />
                {signupForm.formState.errors.password && (
                  <p className="text-xs text-destructive">{signupForm.formState.errors.password.message}</p>
                )}
              </div>
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Daftar
              </Button>
              <p className="text-center text-sm text-muted-foreground">
                Sudah punya akun?{" "}
                <button type="button" onClick={() => setMode("login")}
                  className="font-medium text-primary-foreground underline underline-offset-2">
                  Masuk
                </button>
              </p>
              <p className="text-center text-xs text-muted-foreground">
                Akun pertama akan otomatis menjadi Super Admin.
              </p>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
