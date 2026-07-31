import type { LucideIcon } from "lucide-react";

import { DashboardKpiCard } from "@/components/dashboard/DashboardKpiCard";

export interface ProductSummaryCard {
  title: string;
  value: string;
  helper?: string;
  icon: LucideIcon;
  iconBackground?: string;
}

interface ProductAnalyticsSummaryProps {
  items: ProductSummaryCard[];
  loading?: boolean;
  periodLabel: string;
}

export function ProductAnalyticsSummary({
  items,
  loading = false,
  periodLabel,
}: ProductAnalyticsSummaryProps) {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">
          Ringkasan Performa
        </h2>
        <p className="text-sm text-muted-foreground">
          Performa produk pada periode {periodLabel}.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {items.map((item) => <DashboardKpiCard key={item.title} {...item} loading={loading} />)}
      </div>
    </section>
  );
}
