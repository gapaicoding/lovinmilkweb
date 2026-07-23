import {
  ArrowDownRight,
  ArrowUpRight,
  PackageOpen,
  Sparkles,
} from "lucide-react";

import type { ProductMovementItem } from "@/lib/productAnalytics";
import {
  formatGrowth,
  formatNumber,
  formatRupiah,
} from "@/lib/format";

import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

interface ProductMovementProps {
  trendingItems: ProductMovementItem[];
  decliningItems: ProductMovementItem[];
  currentPeriodLabel: string;
  previousPeriodLabel: string;
  loading?: boolean;
  maxItems?: number;
}

export function ProductMovement({
  trendingItems,
  decliningItems,
  currentPeriodLabel,
  previousPeriodLabel,
  loading = false,
  maxItems = 6,
}: ProductMovementProps) {
  return (
    <section className="grid gap-4 xl:grid-cols-2">
      <MovementCard
        type="trending"
        title="Produk Trending"
        description="Produk dengan quantity meningkat dibanding periode sebelumnya."
        items={trendingItems.slice(
          0,
          maxItems,
        )}
        currentPeriodLabel={
          currentPeriodLabel
        }
        previousPeriodLabel={
          previousPeriodLabel
        }
        loading={loading}
      />

      <MovementCard
        type="declining"
        title="Produk Menurun"
        description="Produk dengan quantity menurun dibanding periode sebelumnya."
        items={decliningItems.slice(
          0,
          maxItems,
        )}
        currentPeriodLabel={
          currentPeriodLabel
        }
        previousPeriodLabel={
          previousPeriodLabel
        }
        loading={loading}
      />
    </section>
  );
}

function MovementCard({
  type,
  title,
  description,
  items,
  currentPeriodLabel,
  previousPeriodLabel,
  loading,
}: {
  type: "trending" | "declining";
  title: string;
  description: string;
  items: ProductMovementItem[];
  currentPeriodLabel: string;
  previousPeriodLabel: string;
  loading: boolean;
}) {
  const isTrending =
    type === "trending";
  const Icon = isTrending
    ? ArrowUpRight
    : ArrowDownRight;

  return (
    <section className="rounded-xl border bg-card shadow-sm">
      <div className="flex items-start gap-3 border-b px-5 py-4">
        <div
          className={[
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
            isTrending
              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
              : "bg-destructive/10 text-destructive",
          ].join(" ")}
        >
          <Icon className="h-5 w-5" />
        </div>

        <div>
          <h2 className="text-base font-semibold">
            {title}
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {description}
          </p>
        </div>
      </div>

      <div className="p-5">
        {loading ? (
          <MovementSkeleton />
        ) : items.length === 0 ? (
          <MovementEmptyState
            type={type}
          />
        ) : (
          <div className="divide-y">
            {items.map((item) => (
              <MovementRow
                key={item.productId}
                item={item}
                type={type}
                currentPeriodLabel={
                  currentPeriodLabel
                }
                previousPeriodLabel={
                  previousPeriodLabel
                }
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function MovementRow({
  item,
  type,
  currentPeriodLabel,
  previousPeriodLabel,
}: {
  item: ProductMovementItem;
  type: "trending" | "declining";
  currentPeriodLabel: string;
  previousPeriodLabel: string;
}) {
  const isTrending =
    type === "trending";

  return (
    <div className="py-4 first:pt-0 last:pb-0">
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

        <MovementBadge item={item} />
      </div>

      <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
        <PeriodValue
          label={previousPeriodLabel}
          quantity={item.previousQuantity}
          revenue={item.previousRevenue}
          unit={item.unit}
        />

        <PeriodValue
          label={currentPeriodLabel}
          quantity={item.currentQuantity}
          revenue={item.currentRevenue}
          unit={item.unit}
        />
      </div>

      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
        <span
          className={
            isTrending
              ? "text-emerald-600 dark:text-emerald-400"
              : "text-destructive"
          }
        >
          Quantity{" "}
          {formatSignedNumber(
            item.quantityChange,
          )}{" "}
          {item.unit}
        </span>

        <span
          className={
            isTrending
              ? "text-emerald-600 dark:text-emerald-400"
              : "text-destructive"
          }
        >
          Omzet{" "}
          {formatSignedRupiah(
            item.revenueChange,
          )}
        </span>
      </div>
    </div>
  );
}

function MovementBadge({
  item,
}: {
  item: ProductMovementItem;
}) {
  if (item.status === "new") {
    return (
      <Badge className="w-fit bg-blue-500/10 text-blue-700 hover:bg-blue-500/10 dark:text-blue-400">
        <Sparkles className="mr-1 h-3 w-3" />
        Baru Terjual
      </Badge>
    );
  }

  if (
    item.status ===
    "not_sold_current"
  ) {
    return (
      <Badge
        variant="destructive"
        className="w-fit"
      >
        Tidak Terjual Periode Ini
      </Badge>
    );
  }

  const growth =
    item.quantityGrowth ?? 0;

  return (
    <Badge
      variant={
        growth >= 0
          ? "default"
          : "destructive"
      }
      className="w-fit"
    >
      {formatGrowth(growth)}
    </Badge>
  );
}

function PeriodValue({
  label,
  quantity,
  revenue,
  unit,
}: {
  label: string;
  quantity: number;
  revenue: number;
  unit: string;
}) {
  return (
    <div className="rounded-lg bg-muted/40 p-2.5">
      <p
        className="truncate text-muted-foreground"
        title={label}
      >
        {label}
      </p>
      <p className="mt-1 font-medium text-foreground">
        {formatNumber(
          quantity,
          2,
        )}{" "}
        {unit}
      </p>
      <p className="mt-0.5 text-muted-foreground">
        {formatRupiah(revenue)}
      </p>
    </div>
  );
}

function MovementSkeleton() {
  return (
    <div className="space-y-4">
      {Array.from({ length: 4 }).map(
        (_, index) => (
          <div
            key={index}
            className="space-y-2 border-b pb-4 last:border-0"
          >
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-3 w-32" />
            <div className="grid gap-2 sm:grid-cols-2">
              <Skeleton className="h-14" />
              <Skeleton className="h-14" />
            </div>
          </div>
        ),
      )}
    </div>
  );
}

function MovementEmptyState({
  type,
}: {
  type: "trending" | "declining";
}) {
  const isTrending =
    type === "trending";
  const Icon = isTrending
    ? Sparkles
    : PackageOpen;

  return (
    <div className="flex min-h-56 flex-col items-center justify-center rounded-lg border border-dashed text-center">
      <Icon className="h-9 w-9 text-muted-foreground" />
      <h3 className="mt-3 text-sm font-semibold">
        {isTrending
          ? "Belum ada produk trending"
          : "Belum ada produk menurun"}
      </h3>
      <p className="mt-1 max-w-sm text-xs text-muted-foreground">
        {isTrending
          ? "Belum terdapat peningkatan quantity dibanding periode sebelumnya."
          : "Belum terdapat penurunan quantity dibanding periode sebelumnya."}
      </p>
    </div>
  );
}

function formatSignedNumber(
  value: number,
): string {
  const formatted = formatNumber(
    Math.abs(value),
    2,
  );

  if (value > 0) {
    return `+${formatted}`;
  }

  if (value < 0) {
    return `-${formatted}`;
  }

  return formatted;
}

function formatSignedRupiah(
  value: number,
): string {
  const formatted = formatRupiah(
    Math.abs(value),
  );

  if (value > 0) {
    return `+${formatted}`;
  }

  if (value < 0) {
    return `-${formatted}`;
  }

  return formatted;
}
