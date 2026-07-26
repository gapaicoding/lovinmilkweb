# Feature Inventory

| Feature | Baseline | Current before fix | Target | Data source | Role | Action |
|---|---|---|---|---|---|---|
| Dashboard | Full operational experience | Finance-only | Restored + actual summary | historical aggregates + live operations | Staff+ | Restore selectively |
| Penjualan | CRUD/filter/search | Preserved | Preserved | `sales` | Staff+ | Keep |
| Pengeluaran | CRUD/filter/search | Preserved | Preserved | `expenses` | Staff+ | Keep |
| Pelanggan/Kunjungan | CRUD/filter | Preserved | Preserved | visitors/visits | Staff+ | Keep |
| Produk/categories | CRUD/master | Preserved | Preserved | master tables | Admin+ | Keep |
| User/profile/role | Present | Hardened | Preserved | profiles/RPC | Admin/Super Admin | Keep |
| Date filters | Dynamic URL presets | Replaced by fixed month default | Restored | Router search params | Staff+ | Restore |
| Laporan Keuangan | Absent | Added | Separate route | finance view | Admin+ | Keep |
| Supplier | Absent | Added | Preserve | suppliers | Admin+ | Keep |
| Data Pembelian | Absent | Added | Preserve | purchase tables | Admin+ | Keep |
| Asset/Peralatan | Absent | Added | Preserve | assets | Admin+ | Keep |
