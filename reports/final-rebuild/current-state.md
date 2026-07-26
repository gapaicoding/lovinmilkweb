# Current State

- Repository/package root: `E:\lovin-milk-insights-main\lovin-milk-insights-main`
- Starting branch: `feat/june-2026-actual-finance-assets`
- Starting HEAD: `84be207`
- Work branch: `fix/restore-dashboard-and-live-actual-data`
- Safety branch: `backup/finance-dashboard-before-restoration` at `84be207`
- Remote: `origin` → `https://github.com/gapaicoding/lovinmilkweb.git`
- Default remote branch: `origin/main` at `b6e9982`
- Supabase project ref: `baukcqccetzzwzgpbnoj` (verified by config and authenticated CLI)
- Deployment runtime: TanStack Start/Vite with Nitro and Cloudflare dependencies; no `.openai/hosting.json`
- Initial working tree: clean

## Active routes

Dashboard, Penjualan, Pengeluaran, Kunjungan, Pengunjung, Produk, Analitik
Produk, Kategori Penjualan, Kategori Pengeluaran, Item Pengeluaran, Profil,
Pengguna, Laporan Keuangan, Supplier, Data Pembelian, dan Asset/Peralatan.

## Data sources

- Legacy/live operations: `sales`, `expenses`, `visitors`, `visitor_visits`,
  current product/category masters.
- Historical actual: daily sales summaries, historical product quantities,
  customer traffic, purchase invoices/items, suppliers, and asset register.
- Finance: `v_financial_statement_monthly` and reconciled import governance.

## Migrations

Authenticated `supabase migration list` on 2026-07-26 shows local and remote
matched through `20260725003000`. Migrations 020, 025, and 030 are applied.
