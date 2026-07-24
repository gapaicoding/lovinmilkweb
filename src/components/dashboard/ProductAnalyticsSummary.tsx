import {
  BadgeDollarSign,
  Boxes,
  PackageCheck,
  PackageX,
} from "lucide-react";

import { DashboardKpiCard } from "@/components/dashboard/DashboardKpiCard";
import type { ProductAnalyticsSummaryData } from "@/lib/productAnalytics";
import {
  formatNumber,
  formatRupiah,
} from "@/lib/format";

interface ProductAnalyticsSummaryProps {
  data: ProductAnalyticsSummaryData;
  loading?: boolean;
  periodLabel: string;
}

export function ProductAnalyticsSummary({
  data,
  loading = false,
  periodLabel,
}: ProductAnalyticsSummaryProps) {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">
          Analitik Produk
        </h2>
        <p className="text-sm text-muted-foreground">
          Performa produk pada periode {periodLabel}.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <DashboardKpiCard
          title="Quantity Terjual"
          value={formatNumber(
            data.totalQuantity,
            2,
          )}
          helper={`${data.salesTransactionCount} transaksi penjualan`}
          icon={PackageCheck}
          loading={loading}
          iconBackground="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
        />

        <DashboardKpiCard
          title="Produk Terjual"
          value={formatNumber(
            data.productsSold,
          )}
          helper={`${formatNumber(
            data.activeProductCount,
          )} produk aktif tersedia`}
          icon={Boxes}
          loading={loading}
          iconBackground="bg-blue-500/10 text-blue-600 dark:text-blue-400"
        />

        <DashboardKpiCard
          title="Rata-rata Harga"
          value={formatRupiah(
            data.averageUnitPrice,
          )}
          helper="Omzet dibagi total quantity"
          icon={BadgeDollarSign}
          loading={loading}
          iconBackground="bg-primary/10 text-primary"
        />

        <DashboardKpiCard
          title="Tanpa Penjualan"
          value={formatNumber(
            data.productsWithoutSales,
          )}
          helper="Produk aktif tanpa transaksi pada periode ini"
          icon={PackageX}
          loading={loading}
          iconBackground="bg-amber-500/10 text-amber-700 dark:text-amber-400"
        />
      </div>
    </section>
  );
}
