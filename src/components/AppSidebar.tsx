import { Link, useRouterState } from "@tanstack/react-router";
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
  ContactRound,
  UserRoundCheck,
  FileText,
  Building2,
  ShoppingCart,
  Wrench,
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
    canAccessAnalytics,
    canAccessFinancialData,
    canAccessMasterData,
    canManageUsers,
    signOut,
  } = useAuth();

  const currentPath = useRouterState({
    select: (routerState) => routerState.location.pathname,
  });

  const active = (path: string) => currentPath === path;

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b p-2 group-data-[collapsible=icon]:items-center">
        <div className="flex min-w-0 items-center gap-2.5 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:gap-0">
          <img
            src="/branding/lovin-milk-logo.jpg"
            alt="Logo Lovin Milk"
            className="aspect-square h-10 w-10 min-h-10 min-w-10 shrink-0 rounded-xl border border-primary/15 object-cover shadow-sm transition-[width,height,border-radius] duration-200 group-data-[collapsible=icon]:h-9 group-data-[collapsible=icon]:w-9 group-data-[collapsible=icon]:min-h-9 group-data-[collapsible=icon]:min-w-9 group-data-[collapsible=icon]:rounded-lg"
          />

          <div className="flex min-w-0 flex-col leading-tight transition-opacity duration-200 group-data-[collapsible=icon]:hidden">
            <span className="text-sm font-semibold">Lovin Milk</span>

            <span className="text-[11px] text-muted-foreground">Dashboard</span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        {canAccessDashboard ? (
          <SidebarGroup>
            <SidebarGroupLabel>Ringkasan</SidebarGroupLabel>

            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={active("/dashboard")}>
                    <Link to="/dashboard">
                      <LayoutDashboard />
                      <span>Dashboard</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>

                {canAccessAnalytics ? (
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={active("/analitik-produk")}>
                      <Link to="/analitik-produk">
                        <BarChart3 />
                        <span>Analitik Produk</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ) : null}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ) : null}

        <SidebarGroup>
          <SidebarGroupLabel>Data Operasional</SidebarGroupLabel>

          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={active("/penjualan")}>
                  <Link to="/penjualan">
                    <TrendingUp />
                    <span>Data Penjualan</span>
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
                <SidebarMenuButton asChild isActive={active("/pengeluaran")}>
                  <Link to="/pengeluaran">
                    <Wallet />
                    <span>Data Pengeluaran</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {canAccessFinancialData ? (
          <SidebarGroup>
            <SidebarGroupLabel>Keuangan Aktual</SidebarGroupLabel>

            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={active("/laporan-keuangan")}>
                    <Link to="/laporan-keuangan">
                      <FileText />
                      <span>Laporan Keuangan</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>

                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={active("/supplier")}>
                    <Link to="/supplier">
                      <Building2 />
                      <span>Supplier</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>

                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={active("/data-pembelian")}>
                    <Link to="/data-pembelian">
                      <ShoppingCart />
                      <span>Data Pembelian</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>

                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={active("/asset-peralatan")}>
                    <Link to="/asset-peralatan">
                      <Wrench />
                      <span>Asset/Peralatan</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ) : null}

        {canAccessMasterData ? (
          <SidebarGroup>
            <SidebarGroupLabel>Master Data</SidebarGroupLabel>

            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={active("/kategori-penjualan")}>
                    <Link to="/kategori-penjualan">
                      <Tag />
                      <span>Kategori Penjualan</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>

                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={active("/kategori-pengeluaran")}>
                    <Link to="/kategori-pengeluaran">
                      <Receipt />
                      <span>Kategori Pengeluaran</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>

                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={active("/item-pengeluaran")}>
                    <Link to="/item-pengeluaran">
                      <ClipboardList />
                      <span>Item Pengeluaran</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>

                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={active("/produk")}>
                    <Link to="/produk">
                      <Package />
                      <span>Produk</span>
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
                    <SidebarMenuButton asChild isActive={active("/pengguna")}>
                      <Link to="/pengguna">
                        <Users />
                        <span>Manajemen Pengguna</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ) : null}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ) : null}

        <SidebarGroup>
          <SidebarGroupLabel>Akun</SidebarGroupLabel>

          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={active("/profil")}>
                  <Link to="/profil">
                    <UserCircle />
                    <span>Profil</span>
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
                  <span>Keluar</span>
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
