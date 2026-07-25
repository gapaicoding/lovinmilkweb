import { describe, expect, it } from "vitest";

import { canAccessAuthenticatedRoute, getRolePermissions, type AppRole } from "@/lib/permissions";

const FINANCIAL_ROUTES = ["/laporan-keuangan", "/supplier", "/data-pembelian", "/asset-peralatan"];

describe("role permissions", () => {
  it("memberi Staff akses dashboard agregat dan operasional saja", () => {
    const permissions = getRolePermissions("staff");

    expect(permissions.canAccessDashboard).toBe(true);
    expect(permissions.canViewOperationalData).toBe(true);
    expect(permissions.canManageVisitorVisits).toBe(true);
    expect(permissions.canAccessAnalytics).toBe(false);
    expect(permissions.canAccessMasterData).toBe(false);
    expect(permissions.canAccessFinancialData).toBe(false);
    expect(permissions.canManageSales).toBe(false);
    expect(permissions.canManageExpenses).toBe(false);
    expect(permissions.canHardDelete).toBe(false);
  });

  it("memberi Admin akses finance dan master tanpa hard delete", () => {
    const permissions = getRolePermissions("admin");

    expect(permissions.canAccessDashboard).toBe(true);
    expect(permissions.canAccessMasterData).toBe(true);
    expect(permissions.canAccessFinancialData).toBe(true);
    expect(permissions.canManageFinancialData).toBe(true);
    expect(permissions.canManageUsers).toBe(false);
    expect(permissions.canHardDelete).toBe(false);
  });

  it("membatasi administrasi pengguna dan hard delete ke Super Admin", () => {
    const permissions = getRolePermissions("super_admin");

    expect(permissions.canManageUsers).toBe(true);
    expect(permissions.canViewDeletedData).toBe(true);
    expect(permissions.canHardDelete).toBe(true);
  });

  it("gagal tertutup untuk role yang tidak tersedia", () => {
    expect(getRolePermissions(null)).toEqual(
      expect.objectContaining({
        canAccessDashboard: false,
        canViewOperationalData: false,
        canAccessFinancialData: false,
        canHardDelete: false,
      }),
    );

    expect(getRolePermissions("unknown" as AppRole).canAccessDashboard).toBe(false);
  });
});

describe("authenticated route permissions", () => {
  it("mengizinkan Staff membuka dashboard dan route operasional", () => {
    expect(canAccessAuthenticatedRoute("staff", "/dashboard")).toBe(true);
    expect(canAccessAuthenticatedRoute("staff", "/penjualan")).toBe(true);
    expect(canAccessAuthenticatedRoute("staff", "/pengeluaran")).toBe(true);
    expect(canAccessAuthenticatedRoute("staff", "/kunjungan")).toBe(true);
    expect(canAccessAuthenticatedRoute("staff", "/profil")).toBe(true);
  });

  it.each(FINANCIAL_ROUTES)("menolak Staff dari route sensitif %s", (pathname) => {
    expect(canAccessAuthenticatedRoute("staff", pathname)).toBe(false);
  });

  it.each(FINANCIAL_ROUTES)("mengizinkan Admin dan Super Admin membuka %s", (pathname) => {
    expect(canAccessAuthenticatedRoute("admin", pathname)).toBe(true);
    expect(canAccessAuthenticatedRoute("super_admin", pathname)).toBe(true);
  });

  it("menolak Staff dari tax, distribution, dan route yang tidak dikenal", () => {
    expect(canAccessAuthenticatedRoute("staff", "/tax")).toBe(false);
    expect(canAccessAuthenticatedRoute("staff", "/owner-distributions")).toBe(false);
    expect(canAccessAuthenticatedRoute("super_admin", "/tidak-dikenal")).toBe(false);
  });

  it("menerima trailing slash pada route yang terdaftar", () => {
    expect(canAccessAuthenticatedRoute("admin", "/supplier/")).toBe(true);
  });
});
