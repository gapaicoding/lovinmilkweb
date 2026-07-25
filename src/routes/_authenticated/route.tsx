import { createFileRoute, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { Loader2, ShieldAlert } from "lucide-react";

import { useAuth } from "@/hooks/useAuth";
import { canAccessAuthenticatedRoute } from "@/lib/permissions";
import { AppSidebar } from "@/components/AppSidebar";
import { TopNavbar } from "@/components/TopNavbar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated")({
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const { session, profile, loading, role, canViewOperationalData, signOut } = useAuth();

  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  const routeAllowed = canAccessAuthenticatedRoute(role, pathname);

  useEffect(() => {
    if (!loading && !session) {
      void navigate({
        to: "/auth",
        replace: true,
      });
    }
  }, [loading, session, navigate]);

  useEffect(() => {
    if (!loading && session && profile && canViewOperationalData && !routeAllowed) {
      void navigate({ to: "/dashboard", replace: true });
    }
  }, [loading, session, profile, canViewOperationalData, routeAllowed, navigate]);

  const handleSignOut = async () => {
    try {
      await signOut();

      await navigate({
        to: "/auth",
        replace: true,
      });
    } catch (error) {
      console.error("[AuthenticatedLayout] Gagal logout:", error);
    }
  };

  /*
   * Jangan tampilkan isi halaman selama proses pemeriksaan session
   * dan profile masih berlangsung.
   */
  if (loading) {
    return <PageLoader />;
  }

  /*
   * Saat session tidak tersedia, useEffect akan mengarahkan user
   * menuju halaman /auth.
   */
  if (!session) {
    return <PageLoader />;
  }

  /*
   * Session tersedia tetapi profile tidak ditemukan.
   *
   * Kondisi ini dapat terjadi jika:
   * - trigger pembuatan profile belum berjalan;
   * - row profile terhapus;
   * - RLS profile bermasalah;
   * - profile gagal dibaca.
   */
  if (!profile) {
    return (
      <AccessMessage
        title="Profil Tidak Ditemukan"
        description="Akun berhasil masuk, tetapi data profil tidak dapat ditemukan atau dibaca. Silakan hubungi Super Admin."
        onSignOut={handleSignOut}
      />
    );
  }

  /*
   * Perlindungan tambahan untuk akun tidak aktif.
   *
   * useAuth juga sudah menangani akun tidak aktif, tetapi pengecekan
   * di layout tetap berguna sebagai lapisan pengamanan tambahan.
   */
  if (!profile.is_active) {
    return (
      <AccessMessage
        title="Akun Dinonaktifkan"
        description="Akun Anda saat ini tidak aktif. Silakan hubungi Super Admin untuk mengaktifkannya kembali."
        onSignOut={handleSignOut}
      />
    );
  }

  /*
   * Hanya role aplikasi yang dikenal dan aktif yang boleh mengakses
   * kelompok route _authenticated.
   */
  if (!canViewOperationalData) {
    return (
      <AccessMessage
        title="Akses Ditolak"
        description="Akun Anda tidak memiliki role yang diizinkan untuk mengakses aplikasi ini."
        onSignOut={handleSignOut}
      />
    );
  }

  if (!routeAllowed) {
    return <PageLoader />;
  }

  return (
    <SidebarProvider>
      <AppSidebar />

      <SidebarInset>
        <TopNavbar />

        <main className="flex-1 bg-background p-4 md:p-6">
          <Outlet />
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}

function PageLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="h-7 w-7 animate-spin text-primary" />

        <p className="text-sm text-muted-foreground">Memeriksa akses pengguna...</p>
      </div>
    </div>
  );
}

interface AccessMessageProps {
  title: string;
  description: string;
  onSignOut: () => Promise<void>;
}

function AccessMessage({ title, description, onSignOut }: AccessMessageProps) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-md rounded-2xl border bg-card p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/15">
          <ShieldAlert className="h-6 w-6 text-destructive" />
        </div>

        <h1 className="text-lg font-semibold">{title}</h1>

        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{description}</p>

        <Button
          className="mt-5"
          variant="outline"
          onClick={() => {
            void onSignOut();
          }}
        >
          Keluar
        </Button>
      </div>
    </div>
  );
}
