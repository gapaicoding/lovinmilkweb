import { useRouterState } from "@tanstack/react-router";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/hooks/useAuth";
import { formatDate } from "@/lib/format";
import { LogOut, UserCircle } from "lucide-react";
import { Link } from "@tanstack/react-router";

const BREADCRUMBS: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/penjualan": "Data Penjualan",
  "/pengeluaran": "Data Pengeluaran",
  "/kunjungan": "Kunjungan Pengunjung",
  "/pengunjung": "Master Pengunjung",
  "/kategori-penjualan": "Kategori Penjualan",
  "/kategori-pengeluaran": "Kategori Pengeluaran",
  "/pengguna": "Manajemen Pengguna",
  "/profil": "Profil",
};

export function TopNavbar() {
  const path = useRouterState({ select: (r) => r.location.pathname });
  const { profile, role, signOut, user } = useAuth();
  const initials = (profile?.full_name || user?.email || "?")
    .split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase();

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-background/80 backdrop-blur px-4">
      <SidebarTrigger />
      <div className="flex-1 min-w-0">
        <div className="text-xs text-muted-foreground">Lovin Milk Dashboard</div>
        <div className="text-sm font-medium truncate">{BREADCRUMBS[path] ?? "Halaman"}</div>
      </div>
      <div className="hidden md:block text-sm text-muted-foreground">{formatDate(new Date(), "EEEE, dd MMMM yyyy")}</div>
      <DropdownMenu>
        <DropdownMenuTrigger className="flex items-center gap-2 rounded-full p-1 hover:bg-muted transition">
          <Avatar className="h-8 w-8">
            <AvatarFallback className="bg-primary/30 text-primary-foreground text-xs">{initials}</AvatarFallback>
          </Avatar>
          <div className="hidden sm:flex flex-col items-start leading-tight pr-2">
            <span className="text-xs font-medium max-w-[140px] truncate">{profile?.full_name || user?.email}</span>
            <Badge variant="secondary" className="h-4 px-1.5 text-[10px] font-normal">
              {role === "super_admin" ? "Super Admin" : role === "admin" ? "Admin" : role === "staff" ? "Staf" : "-"}
            </Badge>
          </div>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>
            <div className="text-sm font-medium">{profile?.full_name || "-"}</div>
            <div className="text-xs text-muted-foreground truncate">{user?.email}</div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link to="/profil"><UserCircle className="mr-2 h-4 w-4" /> Profil</Link>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => signOut()}>
            <LogOut className="mr-2 h-4 w-4" /> Keluar
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
