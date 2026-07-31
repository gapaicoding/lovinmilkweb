import { useMemo, useState } from "react";
import {
  BarChart3,
  Trophy,
} from "lucide-react";

import type { ProductRankingItem } from "@/lib/productAnalytics";
import {
  formatNumber,
  formatPercentage,
  formatRupiah,
} from "@/lib/format";

import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";

type RankingMetric =
  | "quantity"
  | "revenue";

interface BestSellingProductsProps {
  items: ProductRankingItem[];
  loading?: boolean;
  maxItems?: number;
  revenueAvailable?: boolean;
  title?: string;
  description?: string;
}

export function BestSellingProducts({
  items,
  loading = false,
  maxItems = 8,
  revenueAvailable = true,
  title = "Produk Terlaris",
  description,
}: BestSellingProductsProps) {
  const [metric, setMetric] =
    useState<RankingMetric>("quantity");

  const sortedItems = useMemo(
    () =>
      [...items]
        .sort((first, second) => {
          if (metric === "quantity") {
            return (
              second.quantity -
                first.quantity ||
              second.revenue -
                first.revenue
            );
          }

          return (
            second.revenue -
              first.revenue ||
            second.quantity -
              first.quantity
          );
        })
        .slice(0, maxItems),
    [items, maxItems, metric],
  );

  const totalMetric = useMemo(
    () =>
      items.reduce(
        (total, item) =>
          total +
          (metric === "quantity"
            ? item.quantity
            : item.revenue),
        0,
      ),
    [items, metric],
  );

  return (
    <section className="rounded-xl border bg-card shadow-sm">
      <div className="flex flex-col gap-3 border-b px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-700 dark:text-amber-400">
            <Trophy className="h-5 w-5" />
          </div>

          <div>
            <h2 className="text-base font-semibold">
              {title}
            </h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {description ?? (revenueAvailable
                ? "Ranking berdasarkan quantity atau omzet pada periode terpilih."
                : "Ranking berdasarkan quantity tercatat pada periode terpilih.")}
            </p>
          </div>
        </div>

        {revenueAvailable ? <Tabs
          value={metric}
          onValueChange={(value) =>
            setMetric(
              value as RankingMetric,
            )
          }
        >
          <TabsList>
            <TabsTrigger value="quantity">
              Quantity
            </TabsTrigger>
            <TabsTrigger value="revenue">
              Omzet
            </TabsTrigger>
          </TabsList>
        </Tabs> : null}
      </div>

      <div className="p-5">
        {loading ? (
          <BestSellingSkeleton />
        ) : sortedItems.length === 0 ? (
          <BestSellingEmptyState />
        ) : (
          <div className="space-y-5">
            {sortedItems.map(
              (item, index) => {
                const metricValue =
                  metric === "quantity"
                    ? item.quantity
                    : item.revenue;

                const percentage =
                  totalMetric > 0
                    ? (metricValue /
                        totalMetric) *
                      100
                    : 0;

                return (
                  <ProductRankingRow
                    key={item.productId}
                    item={item}
                    index={index}
                    percentage={percentage}
                    metric={metric}
                    revenueAvailable={revenueAvailable}
                  />
                );
              },
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function ProductRankingRow({
  item,
  index,
  percentage,
  metric,
  revenueAvailable,
}: {
  item: ProductRankingItem;
  index: number;
  percentage: number;
  metric: RankingMetric;
  revenueAvailable: boolean;
}) {
  const rank = index + 1;

  return (
    <div className="space-y-2.5">
      <div className="flex items-start gap-3">
        <div
          className={[
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold",
            rank === 1
              ? "bg-amber-500/15 text-amber-700 dark:text-amber-400"
              : "bg-muted text-muted-foreground",
          ].join(" ")}
        >
          {rank === 1 ? (
            <Trophy className="h-4 w-4" />
          ) : (
            rank
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p
                className="truncate text-sm font-medium"
                title={item.name}
              >
                {item.name}
              </p>

              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                {item.categoryName}
                {item.sku
                  ? ` · ${item.sku}`
                  : ""}
              </p>
            </div>

            <div className="shrink-0 sm:text-right">
              <p className="text-sm font-semibold">
                {metric === "quantity"
                  ? `${formatNumber(
                      item.quantity,
                      2,
                    )} ${item.unit}`
                  : formatRupiah(
                      item.revenue,
                    )}
              </p>

              <p className="mt-0.5 text-xs text-muted-foreground">
                {formatPercentage(
                  percentage,
                )}{" "}
                kontribusi
              </p>
            </div>
          </div>

          {(revenueAvailable || item.transactionCount > 0) ? <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {revenueAvailable ? <span>
              Omzet:{" "}
              <strong className="font-medium text-foreground">
                {formatRupiah(
                  item.revenue,
                )}
              </strong>
            </span> : null}
            {item.transactionCount > 0 ? <span>
              {formatNumber(
                item.transactionCount,
              )}{" "}
              transaksi
            </span> : null}
          </div> : null}

          <Progress
            value={Math.min(
              Math.max(percentage, 0),
              100,
            )}
            className="mt-2 h-2"
            aria-label={`${item.name}: ${formatPercentage(
              percentage,
            )}`}
          />
        </div>
      </div>
    </div>
  );
}

function BestSellingSkeleton() {
  return (
    <div className="space-y-5">
      {Array.from({ length: 5 }).map(
        (_, index) => (
          <div
            key={index}
            className="flex gap-3"
          >
            <Skeleton className="h-8 w-8 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-3 w-36" />
              <Skeleton className="h-2 w-full" />
            </div>
          </div>
        ),
      )}
    </div>
  );
}

function BestSellingEmptyState() {
  return (
    <div className="flex min-h-56 flex-col items-center justify-center rounded-lg border border-dashed text-center">
      <BarChart3 className="h-9 w-9 text-muted-foreground" />
      <h3 className="mt-3 text-sm font-semibold">
        Belum ada produk terlaris
      </h3>
      <p className="mt-1 max-w-md text-xs text-muted-foreground">
        Ranking akan muncul setelah terdapat transaksi penjualan
        pada periode terpilih.
      </p>
    </div>
  );
}
