export type AppRole = "staff" | "admin" | "super_admin";

export interface AppPermissions {
  isSuperAdmin: boolean;
  isAdmin: boolean;
  isStaff: boolean;

  canAccessDashboard: boolean;
  canAccessAnalytics: boolean;

  canViewOperationalData: boolean;
  canManageSales: boolean;
  canManageExpenses: boolean;
  canManageVisitorVisits: boolean;

  canAccessMasterData: boolean;
  canManageVisitors: boolean;

  canManageUsers: boolean;
  canViewDeletedData: boolean;

  canAccessFinancialData: boolean;
  canManageFinancialData: boolean;

  canHardDelete: boolean;
}

const NO_PERMISSIONS: AppPermissions = {
  isSuperAdmin: false,
  isAdmin: false,
  isStaff: false,

  canAccessDashboard: false,
  canAccessAnalytics: false,

  canViewOperationalData: false,
  canManageSales: false,
  canManageExpenses: false,
  canManageVisitorVisits: false,

  canAccessMasterData: false,
  canManageVisitors: false,

  canManageUsers: false,
  canViewDeletedData: false,

  canAccessFinancialData: false,
  canManageFinancialData: false,

  canHardDelete: false,
};

/**
 * Setiap authenticated route harus didaftarkan di sini.
 *
 * Catatan:
 * - Tidak ada permission berdasarkan Subunit Bisnis.
 * - Staff dapat melihat seluruh Subunit melalui fitur operasional
 *   yang memang diperbolehkan untuk Staff.
 * - Master Data tetap Admin/Super Admin.
 * - Kontrol Data / Rekonsiliasi hanya Admin/Super Admin.
 */
const ROUTE_CAPABILITIES = {
  "/dashboard": "canAccessDashboard",

  "/analitik-produk": "canAccessAnalytics",
  "/kontrol-data": "canAccessFinancialData",

  "/penjualan": "canViewOperationalData",
  "/inventory": "canViewOperationalData",
  "/data-pembelian": "canViewOperationalData",
  "/asset-peralatan": "canViewOperationalData",
  "/pengeluaran": "canViewOperationalData",
  "/kunjungan": "canViewOperationalData",

  "/pengunjung": "canManageVisitors",

  "/subunit-bisnis": "canAccessMasterData",
  "/kategori-penjualan": "canAccessMasterData",
  "/kategori-biaya": "canAccessMasterData",
  "/kategori-pengeluaran": "canAccessMasterData",
  "/item-pengeluaran": "canAccessMasterData",
  "/produk": "canAccessMasterData",

  "/laporan-keuangan": "canAccessFinancialData",
  "/supplier": "canAccessFinancialData",

  "/pengguna": "canManageUsers",

  "/profil": "canViewOperationalData",
} as const satisfies Record<string, keyof AppPermissions>;

export function isAppRole(role: unknown): role is AppRole {
  return role === "staff" || role === "admin" || role === "super_admin";
}

export function getRolePermissions(
  role: AppRole | null | undefined,
): AppPermissions {
  if (!isAppRole(role)) {
    return NO_PERMISSIONS;
  }

  const isSuperAdmin = role === "super_admin";
  const isStaff = role === "staff";

  /**
   * Super Admin mewarisi hak Admin.
   */
  const isAdmin = role === "admin" || isSuperAdmin;

  return {
    isSuperAdmin,
    isAdmin,
    isStaff,

    canAccessDashboard: true,

    canAccessAnalytics: isAdmin,

    canViewOperationalData: true,

    canManageSales: isAdmin,
    canManageExpenses: isAdmin,

    canManageVisitorVisits: true,

    canAccessMasterData: isAdmin,
    canManageVisitors: isAdmin,

    canManageUsers: isSuperAdmin,

    canViewDeletedData: isSuperAdmin,

    canAccessFinancialData: isAdmin,
    canManageFinancialData: isAdmin,

    canHardDelete: isSuperAdmin,
  };
}

export function canAccessAuthenticatedRoute(
  role: AppRole | null | undefined,
  pathname: string,
): boolean {
  const normalizedPath =
    pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;

  const capability =
    ROUTE_CAPABILITIES[
      normalizedPath as keyof typeof ROUTE_CAPABILITIES
    ];

  if (!capability) {
    return false;
  }

  return getRolePermissions(role)[capability];
}
