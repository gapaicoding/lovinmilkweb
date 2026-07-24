import {
  Link,
  useRouterState,
} from "@tanstack/react-router";
import {
  LayoutDashboard,
  BarChart3,
  TrendingUp,
  Wallet,
  Tag,
  Receipt,
  ClipboardList,
  Package,
  Users,
  UserCircle,
  LogOut,
  Milk,
  ContactRound,
  UserRoundCheck,
} from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useAuth } from "@/hooks/useAuth";

export function AppSidebar() {
  const {
    canAccessDashboard,
    canAccessMasterData,
    canManageUsers,
    signOut,
  } = useAuth();

  const currentPath =
    useRouterState({
      select: (routerState) =>
        routerState.location.pathname,
    });

  const active = (
    path: string,
  ) => currentPath === path;

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b">
        <div className="flex items-center gap-2 px-2 py-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/25">
            <Milk className="h-5 w-5 text-primary-foreground" />
          </div>

          <div className="flex flex-col leading-tight">
            <span className="text-sm font-semibold">
              Lovin Milk
            </span>

            <span className="text-[11px] text-muted-foreground">
              Dashboard
            </span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        {canAccessDashboard ? <SidebarGroup>
          <SidebarGroupLabel>
            Ringkasan
          </SidebarGroupLabel>

          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={active(
                    "/dashboard",
                  )}
                >
                  <Link to="/dashboard">
                    <LayoutDashboard />
                    <span>
                      Dashboard
                    </span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>

              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={active(
                    "/analitik-produk",
                  )}
                >
                  <Link to="/analitik-produk">
                    <BarChart3 />
                    <span>
                      Analitik Produk
                    </span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup> : null}

        <SidebarGroup>
          <SidebarGroupLabel>
            Data Operasional
          </SidebarGroupLabel>

          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={active(
                    "/penjualan",
                  )}
                >
                  <Link to="/penjualan">
                    <TrendingUp />
                    <span>
                      Data Penjualan
                    </span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>

              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={active("/kunjungan")}>
                  <Link to="/kunjungan">
                    <UserRoundCheck />
                    <span>Kunjungan Pengunjung</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>

              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={active(
                    "/pengeluaran",
                  )}
                >
                  <Link to="/pengeluaran">
                    <Wallet />
                    <span>
                      Data Pengeluaran
                    </span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {canAccessMasterData ? <SidebarGroup>
          <SidebarGroupLabel>
            Master Data
          </SidebarGroupLabel>

          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={active(
                    "/kategori-penjualan",
                  )}
                >
                  <Link to="/kategori-penjualan">
                    <Tag />
                    <span>
                      Kategori Penjualan
                    </span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>

              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={active(
                    "/kategori-pengeluaran",
                  )}
                >
                  <Link to="/kategori-pengeluaran">
                    <Receipt />
                    <span>
                      Kategori Pengeluaran
                    </span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>

              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={active(
                    "/item-pengeluaran",
                  )}
                >
                  <Link to="/item-pengeluaran">
                    <ClipboardList />
                    <span>
                      Item Pengeluaran
                    </span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>

              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={active(
                    "/produk",
                  )}
                >
                  <Link to="/produk">
                    <Package />
                    <span>
                      Produk
                    </span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>

              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={active("/pengunjung")}>
                  <Link to="/pengunjung">
                    <ContactRound />
                    <span>Pengunjung</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>

              {canManageUsers ? (
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={active(
                      "/pengguna",
                    )}
                  >
                    <Link to="/pengguna">
                      <Users />
                      <span>
                        Manajemen Pengguna
                      </span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ) : null}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup> : null}

        <SidebarGroup>
          <SidebarGroupLabel>
            Akun
          </SidebarGroupLabel>

          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={active(
                    "/profil",
                  )}
                >
                  <Link to="/profil">
                    <UserCircle />
                    <span>
                      Profil
                    </span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>

              <SidebarMenuItem>
                <ThemeToggle />
              </SidebarMenuItem>

              <SidebarMenuItem>
                <SidebarMenuButton
                  type="button"
                  onClick={() => {
                    void signOut();
                  }}
                >
                  <LogOut />
                  <span>
                    Keluar
                  </span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter />
    </Sidebar>
  );
}
