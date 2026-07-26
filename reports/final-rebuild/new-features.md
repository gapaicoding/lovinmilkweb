# Preserved New Features

The Finance (`/laporan-keuangan`), Supplier (`/supplier`), Purchases
(`/data-pembelian`), and Assets (`/asset-peralatan`) routes remain independent
of the restored Dashboard. Their migrations, RLS helpers, reconciliation SQL,
generated Supabase types, permissions, tests, and UI components were not
restored from old Git history.
