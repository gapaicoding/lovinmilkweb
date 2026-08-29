import { describe, expect, it } from "vitest";

import { canAccessAuthenticatedRoute, getRolePermissions, type AppRole } from "@/lib/permissions";

const FINANCIAL_ROUTES = ["/laporan-keuangan"];

describe("role permissions", () => {
  it("memberi Staff akses operasional Supplier tanpa membuka finance atau lifecycle destruktif", () => {
    const permissions = getRolePermissions("staff");

    expect(permissions.canAccessDashboard).toBe(true);
    expect(permissions.canViewOperationalData).toBe(true);
    expect(permissions.canManageVisitorVisits).toBe(true);
    expect(permissions.canAccessAnalytics).toBe(false);
    expect(permissions.canAccessMasterData).toBe(false);
    expect(permissions.canAccessFinancialData).toBe(false);
    expect(permissions.canManageSales).toBe(false);
    expect(permissions.canManageExpenses).toBe(false);
    expect(permissions.canCreateSales).toBe(true);
    expect(permissions.canEditSales).toBe(true);
    expect(permissions.canArchiveSales).toBe(false);
    expect(permissions.canCreateExpenses).toBe(true);
    expect(permissions.canEditExpenses).toBe(true);
    expect(permissions.canArchiveExpenses).toBe(false);

    expect(permissions.canAccessSuppliers).toBe(true);
    expect(permissions.canCreateSuppliers).toBe(true);
    expect(permissions.canEditSuppliers).toBe(true);
    expect(permissions.canExportSuppliers).toBe(true);
    expect(permissions.canManageSupplierInputter).toBe(true);
    expect(permissions.canArchiveSuppliers).toBe(false);

    expect(permissions.canHardDelete).toBe(false);
  });

  it("memberi Admin akses finance, master, dan lifecycle Supplier tanpa hard delete", () => {
    const permissions = getRolePermissions("admin");

    expect(permissions.canAccessDashboard).toBe(true);
    expect(permissions.canAccessMasterData).toBe(true);
    expect(permissions.canAccessFinancialData).toBe(true);
    expect(permissions.canManageFinancialData).toBe(true);
    expect(permissions.canManageUsers).toBe(false);
    expect(permissions.canCreateSales).toBe(true);
    expect(permissions.canEditSales).toBe(true);
    expect(permissions.canArchiveSales).toBe(true);
    expect(permissions.canCreateExpenses).toBe(true);
    expect(permissions.canEditExpenses).toBe(true);
    expect(permissions.canArchiveExpenses).toBe(true);

    expect(permissions.canAccessSuppliers).toBe(true);
    expect(permissions.canCreateSuppliers).toBe(true);
    expect(permissions.canEditSuppliers).toBe(true);
    expect(permissions.canExportSuppliers).toBe(true);
    expect(permissions.canManageSupplierInputter).toBe(true);
    expect(permissions.canArchiveSuppliers).toBe(true);

    expect(permissions.canHardDelete).toBe(false);
  });

  it("membatasi administrasi pengguna dan hard delete ke Super Admin", () => {
    const permissions = getRolePermissions("super_admin");

    expect(permissions.canManageUsers).toBe(true);
    expect(permissions.canViewDeletedData).toBe(true);
    expect(permissions.canHardDelete).toBe(true);
    expect(permissions.canCreateSales).toBe(true);
    expect(permissions.canEditSales).toBe(true);
    expect(permissions.canArchiveSales).toBe(true);
    expect(permissions.canCreateExpenses).toBe(true);
    expect(permissions.canEditExpenses).toBe(true);
    expect(permissions.canArchiveExpenses).toBe(true);

    expect(permissions.canAccessSuppliers).toBe(true);
    expect(permissions.canCreateSuppliers).toBe(true);
    expect(permissions.canEditSuppliers).toBe(true);
    expect(permissions.canExportSuppliers).toBe(true);
    expect(permissions.canManageSupplierInputter).toBe(true);
    expect(permissions.canArchiveSuppliers).toBe(true);
  });

  it("gagal tertutup untuk role yang tidak tersedia", () => {
    expect(getRolePermissions(null)).toEqual(
      expect.objectContaining({
        canAccessDashboard: false,
        canViewOperationalData: false,
        canAccessFinancialData: false,
        canCreateSales: false,
        canEditSales: false,
        canArchiveSales: false,
        canCreateExpenses: false,
        canEditExpenses: false,
        canArchiveExpenses: false,
        canAccessSuppliers: false,
        canCreateSuppliers: false,
        canEditSuppliers: false,
        canExportSuppliers: false,
        canArchiveSuppliers: false,
        canManageSupplierInputter: false,
        canHardDelete: false,
      }),
    );

    expect(getRolePermissions("unknown" as AppRole).canAccessDashboard).toBe(false);
  });
});

describe("authenticated route permissions", () => {
  it("mengizinkan Staff membuka dashboard, route operasional, dan Supplier", () => {
    expect(canAccessAuthenticatedRoute("staff", "/dashboard")).toBe(true);
    expect(canAccessAuthenticatedRoute("staff", "/penjualan")).toBe(true);
    expect(canAccessAuthenticatedRoute("staff", "/data-pembelian")).toBe(true);
    expect(canAccessAuthenticatedRoute("staff", "/asset-peralatan")).toBe(true);
    expect(canAccessAuthenticatedRoute("staff", "/pengeluaran")).toBe(true);
    expect(canAccessAuthenticatedRoute("staff", "/kunjungan")).toBe(true);
    expect(canAccessAuthenticatedRoute("staff", "/supplier")).toBe(true);
    expect(canAccessAuthenticatedRoute("staff", "/profil")).toBe(true);
  });

  it.each(FINANCIAL_ROUTES)("menolak Staff dari route sensitif %s", (pathname) => {
    expect(canAccessAuthenticatedRoute("staff", pathname)).toBe(false);
  });

  it.each(FINANCIAL_ROUTES)("mengizinkan Admin dan Super Admin membuka %s", (pathname) => {
    expect(canAccessAuthenticatedRoute("admin", pathname)).toBe(true);
    expect(canAccessAuthenticatedRoute("super_admin", pathname)).toBe(true);
  });

  it("mengizinkan Admin dan Super Admin membuka Supplier", () => {
    expect(canAccessAuthenticatedRoute("admin", "/supplier")).toBe(true);
    expect(canAccessAuthenticatedRoute("super_admin", "/supplier")).toBe(true);
  });

  it("menolak Staff dari tax, distribution, dan route yang tidak dikenal", () => {
    expect(canAccessAuthenticatedRoute("staff", "/tax")).toBe(false);
    expect(canAccessAuthenticatedRoute("staff", "/owner-distributions")).toBe(false);
    expect(canAccessAuthenticatedRoute("super_admin", "/tidak-dikenal")).toBe(false);
  });

  it("menerima trailing slash pada route Supplier", () => {
    expect(canAccessAuthenticatedRoute("staff", "/supplier/")).toBe(true);
    expect(canAccessAuthenticatedRoute("admin", "/supplier/")).toBe(true);
  });
});
