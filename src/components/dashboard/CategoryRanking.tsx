import { BarChart3, Trophy } from "lucide-react";

import { formatNumber, formatPercentage, formatRupiah } from "@/lib/format";

import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";

export interface CategoryRankingItem {
  id: string;
  name: string;
  amount: number;
  transactionCount: number;
}

interface CategoryRankingProps {
  title: string;
  description?: string;
  items: CategoryRankingItem[];
  totalAmount: number;
  loading?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  maxItems?: number;
  valueLabel?: string;
  metric?: "quantity" | "currency";
}

export function CategoryRanking({
  title,
  description,
  items,
  totalAmount,
  loading = false,
  emptyTitle = "Belum ada data kategori",
  emptyDescription = "Data kategori akan muncul setelah transaksi dicatat pada periode terpilih.",
  maxItems = 6,
  valueLabel = "pencatatan",
  metric = "currency",
}: CategoryRankingProps) {
  const normalizedItems = [...items]
    .map((item) => ({
      ...item,
      amount: Number.isFinite(item.amount)
        ? item.amount
        : 0,
      transactionCount: Number.isFinite(
        item.transactionCount,
      )
        ? item.transactionCount
        : 0,
    }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, maxItems);

  const safeTotalAmount =
    totalAmount > 0
      ? totalAmount
      : normalizedItems.reduce(
          (total, item) => total + item.amount,
          0,
        );

  return (
    <section className="rounded-xl border bg-card shadow-sm">
      <div className="flex items-start justify-between gap-4 border-b px-5 py-4">
        <div>
          <h2 className="text-base font-semibold">
            {title}
          </h2>

          {description ? (
            <p className="mt-1 text-sm text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>

        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <BarChart3 className="h-5 w-5" />
        </div>
      </div>

      <div className="p-5">
        {loading ? (
          <CategoryRankingSkeleton />
        ) : normalizedItems.length === 0 ? (
          <CategoryRankingEmptyState
            title={emptyTitle}
            description={emptyDescription}
          />
        ) : (
          <div className="space-y-4">
            {normalizedItems.map(
              (item, index) => {
                const percentage =
                  safeTotalAmount > 0
                    ? (item.amount /
                        safeTotalAmount) *
                      100
                    : 0;

                return (
                  <CategoryRankingRow
                    key={item.id}
                    item={item}
                    index={index}
                    percentage={percentage}
                    valueLabel={valueLabel}
                    metric={metric}
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

interface CategoryRankingRowProps {
  item: CategoryRankingItem;
  index: number;
  percentage: number;
  valueLabel: string;
  metric: "quantity" | "currency";
}

function CategoryRankingRow({
  item,
  index,
  percentage,
  valueLabel,
  metric,
}: CategoryRankingRowProps) {
  const rank = index + 1;
  const isTopRank = rank === 1;

  return (
    <div className="space-y-2">
      <div className="flex items-start gap-3">
        <div
          className={[
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold",
            isTopRank
              ? "bg-amber-500/15 text-amber-700 dark:text-amber-400"
              : "bg-muted text-muted-foreground",
          ].join(" ")}
        >
          {isTopRank ? (
            <Trophy className="h-4 w-4" />
          ) : (
            rank
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">
                {item.name}
              </p>

              <p className="mt-0.5 text-xs text-muted-foreground">
                {item.transactionCount}{" "}
                {valueLabel}
              </p>
            </div>

            <div className="shrink-0 sm:text-right">
              <p className="text-sm font-semibold">
                {metric === "quantity" ? `${formatNumber(item.amount, 2)} qty` : formatRupiah(item.amount)}
              </p>

              <p className="mt-0.5 text-xs text-muted-foreground">
                {formatPercentage(
                  percentage,
                )}
              </p>
            </div>
          </div>

          <div className="mt-2.5">
            <Progress
              value={Math.min(
                Math.max(percentage, 0),
                100,
              )}
              className="h-2"
              aria-label={`${item.name}: ${formatPercentage(
                percentage,
              )}`}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

interface CategoryRankingEmptyStateProps {
  title: string;
  description: string;
}

function CategoryRankingEmptyState({
  title,
  description,
}: CategoryRankingEmptyStateProps) {
  return (
    <div className="flex min-h-64 flex-col items-center justify-center rounded-lg border border-dashed px-6 py-10 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
        <BarChart3 className="h-6 w-6 text-muted-foreground" />
      </div>

      <h3 className="mt-4 text-sm font-semibold">
        {title}
      </h3>

      <p className="mt-1 max-w-sm text-sm text-muted-foreground">
        {description}
      </p>
    </div>
  );
}

function CategoryRankingSkeleton() {
  return (
    <div className="space-y-5">
      {Array.from({ length: 5 }).map(
        (_, index) => (
          <div
            key={index}
            className="flex items-start gap-3"
          >
            <Skeleton className="h-8 w-8 shrink-0 rounded-full" />

            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-20" />
                </div>

                <div className="space-y-2">
                  <Skeleton className="ml-auto h-4 w-24" />
                  <Skeleton className="ml-auto h-3 w-12" />
                </div>
              </div>

              <Skeleton className="h-2 w-full rounded-full" />
            </div>
          </div>
        ),
      )}
    </div>
  );
}
